"use strict";

/**
 * Purchase Request (BRD §6.6): the bridge from a shortfall on the grid to draft
 * Purchase Orders in Books — one PO per vendor, every line tagged with the
 * originating Sales Order and delivered into the Reserve warehouse, so received
 * material lands already allocated to the project.
 */
const { zStr } = require("../store");
const { dsDate } = require("../zoho/auth");
const {
  createPurchaseOrder, getPurchaseOrder, updatePurchaseOrder,
  deletePurchaseOrder, setPurchaseOrderStatus,
} = require("../zoho/booksApi");
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
 * Pure: reduce shortfall rows by quantities already sitting on draft
 * (unconfirmed) purchase-request lines, so "Raise purchase request" never
 * duplicates a draft PR. Lines already pushed to a PO are excluded by the
 * caller — the grid's poSums counts those as on order. The pool is consumed
 * greedily so the same draft qty is not deducted twice across FGs.
 */
function applyDraftCoverage(lines, draftLines) {
  const pool = new Map(); // rmItemId -> { qty, prNumbers }
  for (const d of draftLines || []) {
    const key = String(d.rmItemId);
    const cur = pool.get(key) || { qty: 0, prNumbers: new Set() };
    cur.qty += n(d.purchaseQty);
    if (d.prNumber) cur.prNumbers.add(d.prNumber);
    pool.set(key, cur);
  }
  return lines
    .map((l) => {
      const c = pool.get(String(l.rmItemId));
      if (!c || c.qty <= 0) return l;
      const covered = Math.min(c.qty, l.purchaseQty);
      c.qty -= covered;
      return {
        ...l,
        purchaseQty: l.purchaseQty - covered,
        prHint: `${[...c.prNumbers].join(", ")} covers ${covered}`,
      };
    })
    .filter((l) => l.purchaseQty > 0);
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
// vendor by all selected line items"). Lines are never merged, even for the
// same item — they can trace to different Sales Orders.
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

// ---- PO detail & actions --------------------------------------------------

/**
 * Pure: the PUT body that keeps a PO's untouched fields intact. Books' PUT
 * replaces line items wholesale, so every kept line echoes back item_id, rate,
 * description and warehouse_id from the freshly fetched PO. `kept` is
 * [{ lineItemId, quantity }]; a fetched line absent from it is removed.
 * Returns { body, removedItemIds } — an item counts as removed only when it is
 * on none of the kept lines (same item can sit on several lines, one per SO).
 */
function poPutBody(po, kept) {
  const keptById = new Map(kept.map((k) => [String(k.lineItemId), k]));
  const lineItems = [];
  const keptItemIds = new Set();
  const allItemIds = new Set();
  for (const li of po.line_items || []) {
    allItemIds.add(String(li.item_id));
    const k = keptById.get(String(li.line_item_id));
    if (!k) continue;
    keptItemIds.add(String(li.item_id));
    lineItems.push({
      line_item_id: String(li.line_item_id),
      item_id: String(li.item_id),
      quantity: n(k.quantity),
      rate: li.rate,
      description: li.description || undefined,
      warehouse_id: li.warehouse_id ? String(li.warehouse_id) : undefined,
    });
  }
  const removedItemIds = new Set([...allItemIds].filter((id) => !keptItemIds.has(id)));
  return { body: { line_items: lineItems }, removedItemIds };
}

// Org-isolation gate: a PO is only visible if one of this org's PR lines
// created it. Cross-org probing gets the same 404 as a bogus id.
async function poLines(catalyst, orgId, poId) {
  const lines = await byOrg(catalyst, orgId, "PurchaseRequestLine", `zohoPoId = ${zStr(String(poId))}`);
  if (!lines.length) { const e = new Error("Purchase order not found"); e.status = 404; throw e; }
  return lines;
}

async function poDetail(catalyst, orgId, poId) {
  await poLines(catalyst, orgId, poId);
  const po = await getPurchaseOrder(catalyst, poId);
  return {
    id: String(po.purchaseorder_id),
    number: po.purchaseorder_number,
    status: po.status,
    vendorName: po.vendor_name,
    date: po.date,
    referenceNumber: po.reference_number || "",
    notes: po.notes || "",
    total: n(po.total),
    receivedStatus: po.received_status || "",
    billedStatus: po.billed_status || "",
    lineItems: (po.line_items || []).map((li) => ({
      lineItemId: String(li.line_item_id),
      itemId: String(li.item_id),
      name: li.name,
      description: li.description || "",
      quantity: n(li.quantity),
      rate: n(li.rate),
      amount: n(li.item_total),
      received: n(li.quantity_received),
      billed: n(li.quantity_billed),
    })),
  };
}

/**
 * Detach PR lines from a PO that no longer covers them (deleted, cancelled, or
 * the item was removed from it): the item returns to the shortfall and the
 * parent request drops back to Draft so it can be confirmed again.
 */
async function resetPoLines(catalyst, orgId, poId, itemFilter) {
  const lines = await byOrg(catalyst, orgId, "PurchaseRequestLine", `zohoPoId = ${zStr(String(poId))}`);
  const table = catalyst.datastore().table("PurchaseRequestLine");
  const prIds = new Set();
  for (const l of lines) {
    if (itemFilter && !itemFilter.has(String(l.rmItemId))) continue;
    await table.updateRow({
      ROWID: l.ROWID,
      zohoPoId: "", zohoPoNumber: "", poStatus: "",
      receivedQty: 0, billedQty: 0, lastPoSyncAt: null,
    });
    prIds.add(String(l.purchaseRequestId));
  }
  const prTable = catalyst.datastore().table("PurchaseRequest");
  for (const prId of prIds) {
    await prTable.updateRow({ ROWID: prId, status: "Draft", confirmedAt: null });
  }
  return prIds.size;
}

async function deletePo(catalyst, orgId, poId, userId) {
  const lines = await poLines(catalyst, orgId, poId);
  // Books first: if it refuses (billed PO), local rows stay untouched.
  await deletePurchaseOrder(catalyst, poId);
  await resetPoLines(catalyst, orgId, poId);
  await logActivity(catalyst, orgId, "PurchaseRequest", lines[0].purchaseRequestId, "po.delete", userId, {
    poNumber: lines[0].zohoPoNumber, lines: lines.length,
  });
  return { deleted: true };
}

async function setPoStatus(catalyst, orgId, poId, status, userId) {
  if (!["issued", "cancelled"].includes(status)) {
    const e = new Error("Status must be issued or cancelled"); e.status = 400; throw e;
  }
  const lines = await poLines(catalyst, orgId, poId);
  await setPurchaseOrderStatus(catalyst, poId, status);
  if (status === "cancelled") {
    await resetPoLines(catalyst, orgId, poId);
  } else {
    await refreshPurchaseOrders(catalyst, orgId, { poIds: [poId] });
  }
  await logActivity(catalyst, orgId, "PurchaseRequest", lines[0].purchaseRequestId, `po.${status}`, userId, {
    poNumber: lines[0].zohoPoNumber,
  });
  return { status };
}

/**
 * Edit a PO's lines: `kept` = [{ lineItemId, quantity }]; omitted lines are
 * removed and their items return to the shortfall. Quantity changes write back
 * to the local purchaseQty — the grid's on-order column sums it.
 */
async function updatePoLines(catalyst, orgId, poId, kept, userId) {
  const localLines = await poLines(catalyst, orgId, poId);
  if (!kept || !kept.length) {
    const e = new Error("A purchase order needs at least one line — delete the PO instead");
    e.status = 400; throw e;
  }
  const po = await getPurchaseOrder(catalyst, poId);
  const { body, removedItemIds } = poPutBody(po, kept);
  if (!body.line_items.length) {
    const e = new Error("None of the kept lines exist on this purchase order"); e.status = 400; throw e;
  }
  await updatePurchaseOrder(catalyst, poId, body);

  if (removedItemIds.size) await resetPoLines(catalyst, orgId, poId, removedItemIds);

  // ponytail: purchaseQty sync only when the item maps to exactly one PR line;
  // ambiguous multi-line matches are left to the PO refresh below.
  const table = catalyst.datastore().table("PurchaseRequestLine");
  for (const li of body.line_items) {
    const matches = localLines.filter((l) => String(l.rmItemId) === String(li.item_id));
    if (matches.length === 1 && n(matches[0].purchaseQty) !== li.quantity) {
      await table.updateRow({ ROWID: matches[0].ROWID, purchaseQty: li.quantity });
    }
  }
  await refreshPurchaseOrders(catalyst, orgId, { poIds: [poId] });
  await logActivity(catalyst, orgId, "PurchaseRequest", localLines[0].purchaseRequestId, "po.edit", userId, {
    poNumber: localLines[0].zohoPoNumber, kept: body.line_items.length, removedItems: removedItemIds.size,
  });
  return { kept: body.line_items.length, removedItems: removedItemIds.size };
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
      poId: l.zohoPoId ? String(l.zohoPoId) : null,
      poNumber: l.zohoPoNumber || null,
      poStatus: l.poStatus || null,
      receivedQty: n(l.receivedQty),
      billedQty: n(l.billedQty),
    })),
  }));
}

module.exports = {
  SETTLED_PO, shortfallLines, applyDraftCoverage, validatePR, groupByVendor,
  createPR, updatePRLine, confirmPR, refreshPurchaseOrders, listPRs,
  poPutBody, poDetail, deletePo, setPoStatus, updatePoLines,
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

  // Draft-PR coverage: a draft request hides its quantities from the shortfall.
  const short = [
    { rmItemId: "11", rmName: "Shaft", requiredQty: 8, purchaseQty: 8 },
    { rmItemId: "22", rmName: "Seal", requiredQty: 4, purchaseQty: 4 },
  ];
  const fully = applyDraftCoverage(short, [
    { rmItemId: "11", purchaseQty: 8, prNumber: "PR-0001" },
  ]);
  assert.strictEqual(fully.length, 1, "fully covered row disappears");
  assert.strictEqual(fully[0].rmItemId, "22", "uncovered row survives untouched");
  assert.strictEqual(fully[0].prHint, undefined);

  const partly2 = applyDraftCoverage(short, [
    { rmItemId: "22", purchaseQty: 3, prNumber: "PR-0002" },
  ]);
  const seal = partly2.find((l) => l.rmItemId === "22");
  assert.strictEqual(seal.purchaseQty, 1, "4 short − 3 on draft PR = 1");
  assert.strictEqual(seal.prHint, "PR-0002 covers 3");

  // Same item on two FG rows: the draft qty is consumed greedily, not doubled.
  const twoFgs = applyDraftCoverage(
    [
      { rmItemId: "11", purchaseQty: 5 },
      { rmItemId: "11", purchaseQty: 5 },
    ],
    [{ rmItemId: "11", purchaseQty: 6, prNumber: "PR-0003" }],
  );
  assert.strictEqual(twoFgs.length, 1, "first row fully covered, second partly");
  assert.strictEqual(twoFgs[0].purchaseQty, 4, "10 across FGs − 6 on draft = 4");

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

  // PO edit body: kept lines echo rate/description/warehouse, omitted = removed.
  const fetchedPo = {
    line_items: [
      { line_item_id: "L1", item_id: "11", quantity: 5, rate: 12.5, description: "SO SO-1", warehouse_id: "W1" },
      { line_item_id: "L2", item_id: "22", quantity: 3, rate: 7, description: "SO SO-1", warehouse_id: "W1" },
      { line_item_id: "L3", item_id: "11", quantity: 2, rate: 12.5, description: "SO SO-2", warehouse_id: "W1" },
    ],
  };
  const edit = poPutBody(fetchedPo, [{ lineItemId: "L1", quantity: 4 }, { lineItemId: "L3", quantity: 2 }]);
  assert.strictEqual(edit.body.line_items.length, 2, "omitted line L2 is dropped");
  assert.strictEqual(edit.body.line_items[0].quantity, 4, "kept line takes the edited quantity");
  assert.strictEqual(edit.body.line_items[0].rate, 12.5, "rate echoed from the fetched PO");
  assert.strictEqual(edit.body.line_items[0].warehouse_id, "W1", "warehouse routing preserved");
  assert.deepStrictEqual([...edit.removedItemIds], ["22"], "only item 22 counts as removed");

  // Same item on two lines: dropping one line does NOT mark the item removed.
  const halfDrop = poPutBody(fetchedPo, [{ lineItemId: "L1", quantity: 5 }, { lineItemId: "L2", quantity: 3 }]);
  assert.ok(!halfDrop.removedItemIds.has("11"), "item 11 still lives on L1");
  assert.strictEqual(halfDrop.removedItemIds.size, 0);

  // Nothing kept → empty body; updatePoLines 400s before Books is called.
  const none = poPutBody(fetchedPo, []);
  assert.strictEqual(none.body.line_items.length, 0);
  assert.strictEqual(none.removedItemIds.size, 3 - 1, "both distinct items removed");

  console.log("workorder/purchase.js self-check passed");
}
