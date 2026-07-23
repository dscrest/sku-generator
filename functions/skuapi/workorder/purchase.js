"use strict";

/**
 * Purchase Request (BRD §6.6): the bridge from a shortfall on the grid to draft
 * Purchase Orders in Books — one PO per vendor, every line tagged with the
 * originating Sales Order and delivered into the Reserve warehouse, so received
 * material lands already allocated to the project.
 */
const { zStr } = require("../store");
const { dsDate } = require("../zoho/auth");
const { createPurchaseOrder, getPurchaseOrder } = require("../zoho/booksApi");
const { warehouses, nextNumber, logActivity, byOrg, settings, inList } = require("./store");

const n = (v) => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);

// PO statuses that can no longer change — the reconcile stops refreshing these.
const SETTLED_PO = new Set(["closed", "cancelled", "billed"]);

/**
 * Pure: the shortfall rows of a grid, pre-filled as purchase-request lines.
 * `shortfallQty` already accounts for stock, existing reservations and what is
 * on order but not yet received — so the buyer is never asked to order twice.
 */
function shortfallLines(grid) {
  return (grid.rows || [])
    .filter((r) => r.short && r.shortfallQty > 0)
    .map((r) => ({
      rmItemId: String(r.itemId),
      rmName: r.name || "",
      requiredQty: r.shortfallQty,
      purchaseQty: r.shortfallQty,
      vendorId: null,
      vendorName: null,
    }));
}

/**
 * Pure: confirm-time validation (FR-PRQ-001) — a vendor on every line and a
 * quantity greater than zero. Returns every problem at once.
 */
function validatePR(lines) {
  const errors = [];
  if (!lines || !lines.length) errors.push("This purchase request has no lines");
  for (const l of lines || []) {
    const label = l.rmName || l.rmItemId;
    if (n(l.purchaseQty) <= 0) errors.push(`${label}: purchase quantity must be greater than zero`);
    if (!l.vendorId) errors.push(`${label}: pick a vendor before confirming`);
  }
  return errors;
}

// Pure: one PO per vendor (BRD §6.6.6 — "one Purchase Order is generated per
// vendor by all selected line items").
function groupByVendor(lines) {
  const groups = new Map();
  for (const l of lines) {
    const key = String(l.vendorId);
    if (!groups.has(key)) groups.set(key, { vendorId: key, vendorName: l.vendorName || "", lines: [] });
    groups.get(key).lines.push(l);
  }
  return [...groups.values()];
}

// ---- persistence ----------------------------------------------------------

async function createPR(catalyst, orgId, { workOrderId, lines }, userId) {
  const wos = await byOrg(catalyst, orgId, "WorkOrder", `ROWID = ${zStr(String(workOrderId))}`);
  if (!wos.length) { const e = new Error("Work order not found"); e.status = 404; throw e; }
  const wo = wos[0];
  if (!lines || !lines.length) { const e = new Error("Nothing to purchase"); e.status = 400; throw e; }

  const s = await settings(catalyst, orgId);
  const prNumber = await nextNumber(catalyst, orgId, "PurchaseRequest", "prNumber", s.prNumberPrefix);
  const pr = await catalyst.datastore().table("PurchaseRequest").insertRow({
    orgId: String(orgId),
    prNumber,
    workOrderId: String(wo.ROWID),
    salesOrderId: String(wo.salesOrderId || ""),
    status: "Draft",
    createdBy: userId ? String(userId) : "",
    confirmedAt: null,
  });

  const table = catalyst.datastore().table("PurchaseRequestLine");
  for (const l of lines) {
    await table.insertRow({
      orgId: String(orgId),
      purchaseRequestId: String(pr.ROWID),
      rmItemId: String(l.rmItemId),
      rmName: l.rmName || "",
      requiredQty: n(l.requiredQty),
      purchaseQty: n(l.purchaseQty) || n(l.requiredQty),
      vendorId: l.vendorId ? String(l.vendorId) : "",
      vendorName: l.vendorName || "",
      zohoPoId: "",
      zohoPoNumber: "",
      poStatus: "",
      receivedQty: 0,
      billedQty: 0,
      lastPoSyncAt: null,
    });
  }
  await logActivity(catalyst, orgId, "PurchaseRequest", pr.ROWID, "pr.create", userId, { prNumber, lines: lines.length });
  return { id: String(pr.ROWID), prNumber, status: "Draft" };
}

async function updatePRLine(catalyst, orgId, lineId, { purchaseQty, vendorId, vendorName }) {
  const rows = await byOrg(catalyst, orgId, "PurchaseRequestLine", `ROWID = ${zStr(String(lineId))}`);
  if (!rows.length) { const e = new Error("Purchase request line not found"); e.status = 404; throw e; }
  if (rows[0].zohoPoId) {
    const e = new Error("This line is already on a Purchase Order and can no longer be edited here");
    e.status = 409;
    throw e;
  }
  const fields = { ROWID: rows[0].ROWID };
  if (purchaseQty !== undefined) fields.purchaseQty = n(purchaseQty);
  if (vendorId !== undefined) fields.vendorId = vendorId ? String(vendorId) : "";
  if (vendorName !== undefined) fields.vendorName = vendorName || "";
  await catalyst.datastore().table("PurchaseRequestLine").updateRow(fields);
  return { id: String(lineId) };
}

/**
 * Confirm → one draft PO per vendor. If a later vendor's PO fails, the earlier
 * ones stay created and recorded: the request is left Draft so the buyer can
 * fix the failing vendor and confirm again, and the lines already ordered are
 * skipped on the retry.
 */
async function confirmPR(catalyst, orgId, prId, userId) {
  const prs = await byOrg(catalyst, orgId, "PurchaseRequest", `ROWID = ${zStr(String(prId))}`);
  if (!prs.length) { const e = new Error("Purchase request not found"); e.status = 404; throw e; }
  const pr = prs[0];
  if (pr.status === "Confirmed") { const e = new Error(`${pr.prNumber} is already confirmed`); e.status = 409; throw e; }

  const allLines = await byOrg(catalyst, orgId, "PurchaseRequestLine", `purchaseRequestId = ${zStr(String(prId))}`);
  const pending = allLines.filter((l) => !l.zohoPoId);
  const errors = validatePR(pending);
  if (errors.length) { const e = new Error(errors.join("\n")); e.status = 400; e.details = errors; throw e; }

  const wos = await byOrg(catalyst, orgId, "WorkOrder", `ROWID = ${zStr(String(pr.workOrderId))}`);
  const wo = wos[0] || {};
  const wh = await warehouses(catalyst, orgId);
  const table = catalyst.datastore().table("PurchaseRequestLine");
  const created = [];
  const failed = [];

  for (const group of groupByVendor(pending)) {
    try {
      const po = await createPurchaseOrder(catalyst, {
        vendorId: group.vendorId,
        date: today(),
        referenceNumber: wo.salesOrderNumber || "",
        warehouseId: wh.reserve,
        notes: `${pr.prNumber} · ${wo.woNumber || ""} · SO ${wo.salesOrderNumber || ""}`,
        lines: group.lines.map((l) => ({
          rmItemId: l.rmItemId,
          qty: n(l.purchaseQty),
          description: wo.salesOrderNumber ? `SO ${wo.salesOrderNumber}` : undefined,
        })),
      });
      for (const l of group.lines) {
        await table.updateRow({
          ROWID: l.ROWID,
          zohoPoId: String(po.purchaseorder_id || ""),
          zohoPoNumber: String(po.purchaseorder_number || ""),
          poStatus: String(po.status || "draft"),
          lastPoSyncAt: dsDate(Date.now()),
        });
      }
      created.push({ vendorName: group.vendorName, poNumber: po.purchaseorder_number, lines: group.lines.length });
    } catch (err) {
      failed.push(`${group.vendorName || group.vendorId}: ${err.message}`);
    }
  }

  if (!failed.length) {
    await catalyst.datastore().table("PurchaseRequest").updateRow({
      ROWID: String(pr.ROWID), status: "Confirmed", confirmedAt: dsDate(Date.now()),
    });
  }
  await logActivity(catalyst, orgId, "PurchaseRequest", pr.ROWID, "pr.confirm", userId, { created, failed });

  return {
    id: String(pr.ROWID),
    prNumber: pr.prNumber,
    status: failed.length ? "Draft" : "Confirmed",
    purchaseOrders: created,
    failed,
  };
}

// ---- PO status refresh ----------------------------------------------------

/**
 * Refresh the POs this org's purchase requests created — and only those. This
 * is what makes columns F / G cheap: no crawl of the org's purchase orders, one
 * call per live PO, none at all for settled ones.
 */
async function refreshPurchaseOrders(catalyst, orgId, { poIds } = {}) {
  const lines = await byOrg(catalyst, orgId, "PurchaseRequestLine", "zohoPoId != ''");
  const live = lines.filter((l) => !SETTLED_PO.has(String(l.poStatus || "").toLowerCase()));
  const wanted = poIds && poIds.length ? new Set(poIds.map(String)) : null;
  const byPo = new Map();
  for (const l of live) {
    if (wanted && !wanted.has(String(l.zohoPoId))) continue;
    if (!byPo.has(String(l.zohoPoId))) byPo.set(String(l.zohoPoId), []);
    byPo.get(String(l.zohoPoId)).push(l);
  }

  const table = catalyst.datastore().table("PurchaseRequestLine");
  let refreshed = 0;
  for (const [poId, poLines] of byPo) {
    let po;
    try {
      po = await getPurchaseOrder(catalyst, poId);
    } catch (err) {
      console.error(`PO ${poId} refresh failed:`, err && err.message);
      continue;
    }
    for (const l of poLines) {
      const match = (po.line_items || []).filter((li) => String(li.item_id) === String(l.rmItemId));
      const received = match.reduce((s, li) => s + n(li.quantity_received), 0);
      const billed = match.reduce((s, li) => s + n(li.quantity_billed), 0);
      await table.updateRow({
        ROWID: l.ROWID,
        poStatus: String(po.status || ""),
        receivedQty: received,
        billedQty: billed,
        lastPoSyncAt: dsDate(Date.now()),
      });
      refreshed++;
    }
  }
  return { purchaseOrders: byPo.size, lines: refreshed };
}

// The Purchase tab: requests of one work order with their lines.
async function listPRs(catalyst, orgId, workOrderId) {
  const prs = await byOrg(
    catalyst, orgId, "PurchaseRequest", `workOrderId = ${zStr(String(workOrderId))}`, "CREATEDTIME DESC",
  );
  const ids = inList(prs.map((p) => p.ROWID));
  const lines = ids
    ? await byOrg(catalyst, orgId, "PurchaseRequestLine", `purchaseRequestId IN (${ids})`)
    : [];
  return prs.map((p) => ({
    id: String(p.ROWID),
    prNumber: p.prNumber,
    status: p.status,
    createdAt: p.CREATEDTIME,
    confirmedAt: p.confirmedAt || null,
    lines: lines.filter((l) => String(l.purchaseRequestId) === String(p.ROWID)).map((l) => ({
      id: String(l.ROWID),
      rmItemId: String(l.rmItemId),
      rmName: l.rmName,
      requiredQty: n(l.requiredQty),
      purchaseQty: n(l.purchaseQty),
      vendorId: l.vendorId || null,
      vendorName: l.vendorName || null,
      poNumber: l.zohoPoNumber || null,
      poStatus: l.poStatus || null,
      receivedQty: n(l.receivedQty),
      billedQty: n(l.billedQty),
    })),
  }));
}

module.exports = {
  SETTLED_PO, shortfallLines, validatePR, groupByVendor,
  createPR, updatePRLine, confirmPR, refreshPurchaseOrders, listPRs,
};

// ponytail self-check: `node functions/skuapi/workorder/purchase.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const { gridRow } = require("./formulas");

  // Shortfall pre-fill: BOM 10, stock 2, nothing on order → order 8.
  const grid = {
    rows: [
      gridRow({ rmItemId: "11", rmName: "Shaft", requiredQty: 10 }, { stockOnHand: 2 }, {}, {}),
      gridRow({ rmItemId: "22", rmName: "Seal", requiredQty: 4 }, { stockOnHand: 50 }, {}, {}),
    ],
  };
  const sf = shortfallLines(grid);
  assert.strictEqual(sf.length, 1, "only short rows become purchase lines");
  assert.strictEqual(sf[0].rmItemId, "11");
  assert.strictEqual(sf[0].purchaseQty, 8, "10 needed − 2 reservable = 8 to buy");

  // Already on order but not received: do not ask the buyer to order it twice.
  const partly = {
    rows: [gridRow({ rmItemId: "11", rmName: "Shaft", requiredQty: 10 }, { stockOnHand: 2 }, {},
      { poQty: 5, receivedQty: 0, billedQty: 0 })],
  };
  assert.strictEqual(shortfallLines(partly)[0].purchaseQty, 3, "8 short − 5 already on order = 3");

  // Fully covered by an open PO → no purchase line at all.
  const covered = {
    rows: [gridRow({ rmItemId: "11", requiredQty: 10 }, { stockOnHand: 2 }, {},
      { poQty: 8, receivedQty: 0, billedQty: 0 })],
  };
  assert.strictEqual(shortfallLines(covered).length, 0, "nothing left to order");

  // Validation.
  assert.deepStrictEqual(
    validatePR([{ rmName: "Shaft", purchaseQty: 5, vendorId: "V1" }]), [], "a complete line passes",
  );
  assert.deepStrictEqual(validatePR([]), ["This purchase request has no lines"]);
  const bad = validatePR([{ rmName: "Shaft", purchaseQty: 0, vendorId: null }]);
  assert.strictEqual(bad.length, 2, "missing qty and missing vendor are both reported");
  assert.match(bad[0], /greater than zero/);
  assert.match(bad[1], /pick a vendor/);

  // One PO per vendor, lines kept together.
  const groups = groupByVendor([
    { rmItemId: "1", vendorId: "V1", vendorName: "Acme", purchaseQty: 2 },
    { rmItemId: "2", vendorId: "V2", vendorName: "Bolt Co", purchaseQty: 1 },
    { rmItemId: "3", vendorId: "V1", vendorName: "Acme", purchaseQty: 4 },
  ]);
  assert.strictEqual(groups.length, 2, "two vendors → two purchase orders");
  assert.strictEqual(groups.find((g) => g.vendorId === "V1").lines.length, 2, "same vendor's lines stay on one PO");
  assert.strictEqual(groups.find((g) => g.vendorId === "V2").vendorName, "Bolt Co");

  assert.ok(SETTLED_PO.has("billed") && !SETTLED_PO.has("open"), "settled POs stop being refreshed");

  console.log("workorder/purchase.js self-check passed");
}
