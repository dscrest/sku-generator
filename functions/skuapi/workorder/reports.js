"use strict";

/**
 * Reporting (BRD FR-ADO-009). Every number here comes from our own tables, so a
 * report costs **zero** Zoho API calls no matter how many projects it spans —
 * which is the whole reason the read model exists.
 */
const { zStr } = require("../store");
const { byOrg, byOrgAll, inList, settings } = require("./store");
const { buildGridsBulk } = require("./grid");

const n = (v) => Number(v) || 0;

/**
 * Pure: roll a work order's grid rows into the status line the report shows.
 * "Late ordering" is the BRD's ask to highlight items ordered after the
 * material was already needed.
 */
function rollUp(rows) {
  const t = {
    items: rows.length, required: 0, reserved: 0, issued: 0, ordered: 0,
    received: 0, billed: 0, shortItems: 0, shortQty: 0,
  };
  for (const r of rows) {
    t.required += n(r.bom);
    t.reserved += n(r.reserved);
    t.issued += n(r.issued);
    t.ordered += n(r.po);
    t.received += n(r.received);
    t.billed += n(r.billed);
    if (r.short) { t.shortItems++; t.shortQty += n(r.shortfallQty); }
  }
  // Fully covered = nothing outstanding and nothing short.
  t.complete = t.shortItems === 0 && t.required > 0 && t.reserved + t.issued >= t.required;
  return t;
}

/**
 * Pure: grid rows not yet fully issued (net issued < required). The Close gate —
 * unlike rollUp's `complete`, reserved material does not count; closing means
 * manufacturing consumed it.
 */
function unissuedRows(rows) {
  return rows.filter((r) => n(r.issued) < n(r.bom));
}

/**
 * SO-BOM report: one row per work order — BOM status, material status, and
 * whether anything is short. Filters are optional.
 */
async function soBom(catalyst, orgId, { status, salesOrderId } = {}) {
  let where = null;
  if (status) where = `status = ${zStr(String(status))}`;
  if (salesOrderId) {
    const clause = `salesOrderId = ${zStr(String(salesOrderId))}`;
    where = where ? `${where} AND ${clause}` : clause;
  }
  const wos = await byOrg(catalyst, orgId, "WorkOrder", where, "CREATEDTIME DESC");
  const ids = inList(wos.map((w) => w.ROWID));
  const fgs = ids ? await byOrg(catalyst, orgId, "WorkOrderFG", `workOrderId IN (${ids})`) : [];

  const pairs = wos.flatMap((wo) =>
    fgs.filter((f) => String(f.workOrderId) === String(wo.ROWID)).map((fg) => ({ wo, fg })));
  const grids = await buildGridsBulk(catalyst, orgId, pairs);

  const out = [];
  for (const wo of wos) {
    const rows = [];
    pairs.forEach((p, i) => { if (p.wo === wo) rows.push(...grids[i].rows); });
    out.push({
      id: String(wo.ROWID),
      woNumber: wo.woNumber,
      woDate: wo.woDate,
      salesOrderNumber: wo.salesOrderNumber,
      customerName: wo.customerName,
      projectName: wo.projectName || null,
      status: wo.status,
      qcStatus: wo.qcStatus || null,
      revision: n(wo.revision),
      bomImportedAt: wo.bomImportedAt || null,
      fgCount: fgs.filter((f) => String(f.workOrderId) === String(wo.ROWID)).length,
      ...rollUp(rows),
    });
  }
  return out;
}

/**
 * Shortfall / pending-items report: every short raw material across open work
 * orders, worst first — what the purchase team works from.
 */
async function shortfall(catalyst, orgId) {
  const wos = (await byOrg(catalyst, orgId, "WorkOrder"))
    .filter((w) => !["Closed", "Cancelled"].includes(String(w.status)));
  const ids = inList(wos.map((w) => w.ROWID));
  const fgs = ids ? await byOrg(catalyst, orgId, "WorkOrderFG", `workOrderId IN (${ids})`) : [];

  const pairs = wos.flatMap((wo) =>
    fgs.filter((f) => String(f.workOrderId) === String(wo.ROWID)).map((fg) => ({ wo, fg })));
  const grids = await buildGridsBulk(catalyst, orgId, pairs);

  const out = [];
  for (let i = 0; i < pairs.length; i++) {
    const { wo, fg } = pairs[i];
    for (const r of grids[i].rows.filter((x) => x.short)) {
      out.push({
        workOrderId: String(wo.ROWID),
        woNumber: wo.woNumber,
        salesOrderNumber: wo.salesOrderNumber,
        customerName: wo.customerName,
        bomImportedAt: wo.bomImportedAt || null,
        fgName: fg.fgName,
        rmItemId: r.itemId,
        rmName: r.name,
        required: r.bom,
        available: r.reservable,
        onOrder: r.po,
        received: r.received,
        shortfallQty: r.shortfallQty,
        // The BRD's "ordered late" flag: still short and nothing on order.
        noPoRaised: r.po === 0,
      });
    }
  }
  return out.sort((a, b) => b.shortfallQty - a.shortfallQty);
}

/**
 * Pure: group purchase-request lines by item into pipeline-stage columns
 * (CR-019). Stages are parallel sums, not exclusive buckets — received and
 * billed overlap with the on-PO quantities.
 */
function pipelineRollup(lines) {
  const byItem = new Map();
  for (const l of lines) {
    const key = String(l.rmItemId);
    const cur = byItem.get(key) || {
      rmItemId: key, rmName: l.rmName || "", vendors: new Set(),
      requested: 0, noPo: 0, onPoDraft: 0, onPoOpen: 0, received: 0, billed: 0,
    };
    if (l.vendorName) cur.vendors.add(l.vendorName);
    const qty = n(l.purchaseQty);
    const st = String(l.poStatus || "").toLowerCase();
    cur.requested += qty;
    if (!l.zohoPoId) cur.noPo += qty;
    else if (st === "draft") cur.onPoDraft += qty;
    else if (st === "open" || st === "issued") cur.onPoOpen += qty;
    cur.received += n(l.receivedQty);
    cur.billed += n(l.billedQty);
    byItem.set(key, cur);
  }
  return [...byItem.values()]
    .map((r) => ({ ...r, vendors: [...r.vendors].join(", ") }))
    .sort((a, b) => b.requested - a.requested);
}

/**
 * Item-pipeline report: one row per raw material across all purchase requests
 * — how much is requested and where it stands (still on a draft PR / on a
 * draft PO / on an open PO / received / billed). Filters optional.
 */
async function itemPipeline(catalyst, orgId, { workOrderId, vendorId } = {}) {
  let where = `status != ${zStr("Cancelled")}`;
  if (workOrderId) where += ` AND workOrderId = ${zStr(String(workOrderId))}`;
  const prs = await byOrg(catalyst, orgId, "PurchaseRequest", where);
  const ids = inList(prs.map((p) => p.ROWID));
  let lines = ids ? await byOrg(catalyst, orgId, "PurchaseRequestLine", `purchaseRequestId IN (${ids})`) : [];
  if (vendorId) lines = lines.filter((l) => String(l.vendorId) === String(vendorId));
  return pipelineRollup(lines);
}

/**
 * Pure: merge a work order's frozen lines with its reservation balances into
 * one reconciliation row per item (CR-031). `leftover` is what completion will
 * (or did) send back to Main: everything reserved plus any over-issue. A line
 * edited down to 0 while material was committed shows `removedFromBom`.
 */
function reconcileRows(lines, balances) {
  const byKey = new Map();
  const key = (fgId, itemId) => `${fgId}|${itemId}`;
  for (const l of lines || []) {
    byKey.set(key(String(l.workOrderFgId), String(l.rmItemId)), {
      workOrderFgId: String(l.workOrderFgId), itemId: String(l.rmItemId),
      name: l.rmName || String(l.rmItemId), sku: l.rmSku || null, uom: l.uom || null,
      required: n(l.requiredQty), reserved: 0, issued: 0, returned: 0,
    });
  }
  for (const b of balances || []) {
    const k = key(String(b.workOrderFgId), String(b.componentItemId));
    // Orphan balance (line hard-deleted before CR-031): still report the stock.
    const row = byKey.get(k) || {
      workOrderFgId: String(b.workOrderFgId), itemId: String(b.componentItemId),
      name: String(b.componentItemId), sku: null, uom: null,
      required: 0, reserved: 0, issued: 0, returned: 0,
    };
    row.reserved = n(b.reservedQty);
    row.issued = n(b.issuedQty);
    row.returned = n(b.returnedQty);
    byKey.set(k, row);
  }
  return [...byKey.values()].map((r) => {
    const issuedNet = r.issued - r.returned;
    return {
      ...r,
      leftover: r.reserved + Math.max(0, issuedNet - r.required),
      removedFromBom: r.required === 0 && (r.reserved + issuedNet > 0),
    };
  });
}

/**
 * Reconciliation report: required vs reserved/issued/returned/leftover per
 * item. With `workOrderId` → that work order only; without → every work order,
 * for the org-wide inventory comparison. Local tables only, zero Zoho calls.
 */
async function reconciliation(catalyst, orgId, { workOrderId } = {}) {
  const where = workOrderId ? `ROWID = ${zStr(String(workOrderId))}` : null;
  const wos = await byOrg(catalyst, orgId, "WorkOrder", where, "CREATEDTIME DESC");
  const ids = inList(wos.map((w) => w.ROWID));
  if (!ids) return [];
  const [fgs, lines, balances] = await Promise.all([
    byOrg(catalyst, orgId, "WorkOrderFG", `workOrderId IN (${ids})`),
    byOrg(catalyst, orgId, "WorkOrderLine", `workOrderId IN (${ids})`),
    byOrg(catalyst, orgId, "ReservationLine", `workOrderId IN (${ids})`),
  ]);
  const fgName = new Map(fgs.map((f) => [String(f.ROWID), f.fgName]));
  const out = [];
  for (const wo of wos) {
    const mine = (rows, k) => rows.filter((r) => String(r[k]) === String(wo.ROWID));
    for (const r of reconcileRows(mine(lines, "workOrderId"), mine(balances, "workOrderId"))) {
      out.push({
        workOrderId: String(wo.ROWID), woNumber: wo.woNumber, status: wo.status,
        salesOrderNumber: wo.salesOrderNumber, fgName: fgName.get(r.workOrderFgId) || null,
        ...r,
      });
    }
  }
  return out;
}

/**
 * Pure: join stock-snapshot rows to warehouse names and shape the report row.
 * `snap` rows are ItemStockSnapshot; `whMap` is warehouseId → name. Rows with no
 * matching warehouse fall back to the id so nothing is dropped. Sorted by item
 * then warehouse.
 */
/**
 * Warehouse-wise stock report, pivoted: one entry per ITEM with a column per
 * warehouse. Reads the FULL snapshot set from our own cache (zero per-item
 * Zoho calls), paged past ZCQL's ~300-row cap.
 *
 * `available` follows the Work Order logic (formulas.js: B = Main-warehouse
 * stock, issue routes reserve→issue, return routes issue→main): what can still
 * be consumed = Main (Head Office) stock − qty sitting in the Issue warehouse.
 * Items with no per-warehouse breakdown yet (Locations orgs' bulk sync only
 * writes the org total) fall back to their org total so stock never hides
 * (CR-068). Stale breakdown rows are pruned at write time (writeStock).
 */
async function warehouseStock(catalyst, orgId) {
  const { warehouseOptions } = require("./sync");
  const warehouses = (await warehouseOptions(catalyst))
    .sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true))
    .map((w) => ({ id: String(w.id), name: w.name }));
  const cfg = await settings(catalyst, orgId);
  const mainWarehouseId = String(cfg.mainWarehouseId || "");
  const issueWarehouseId = String(cfg.issueWarehouseId || "");

  const byItem = new Map();
  for (const r of await byOrgAll(catalyst, orgId, "ItemStockSnapshot")) {
    const id = String(r.itemId);
    const it = byItem.get(id) || { itemId: id, itemName: r.itemName || id, sku: r.sku || null, stocks: {}, total: 0, syncedAt: null };
    if (r.itemName) it.itemName = r.itemName;
    if (r.sku) it.sku = r.sku;
    const wid = String(r.warehouseId || "");
    if (wid) it.stocks[wid] = n(r.stockOnHand);
    else it.total = n(r.stockOnHand);
    // dsDate strings ("yyyy-MM-dd HH:mm:ss") compare correctly as strings.
    if (r.syncedAt && (!it.syncedAt || String(r.syncedAt) > it.syncedAt)) it.syncedAt = String(r.syncedAt);
    byItem.set(id, it);
  }

  const items = [...byItem.values()]
    .map((it) => ({
      ...it,
      available: Object.keys(it.stocks).length
        ? n(it.stocks[mainWarehouseId]) - n(it.stocks[issueWarehouseId])
        : it.total, // no breakdown yet — org total is the honest answer
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  return { warehouses, mainWarehouseId, issueWarehouseId, items };
}

// The work order's own History tab feed: material movements + BOM revisions +
// approvals, newest first, already merged.
async function history(catalyst, orgId, workOrderId) {
  const rows = await byOrg(
    catalyst, orgId, "ActivityLog",
    `entityId = ${zStr(String(workOrderId))} OR entityType = 'MaterialTxn'`,
    "loggedAt DESC",
  );
  return rows.slice(0, 200).map((r) => ({
    at: r.loggedAt,
    action: r.action,
    entityType: r.entityType,
    entityId: String(r.entityId),
    userId: r.userId || null,
    detail: r.detail || null,
  }));
}

module.exports = { rollUp, unissuedRows, soBom, shortfall, history, pipelineRollup, itemPipeline, reconcileRows, reconciliation, warehouseStock };

// ponytail self-check: `node functions/skuapi/workorder/reports.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const { gridRow } = require("./formulas");

  const rows = [
    // Fully reserved.
    gridRow({ rmItemId: "1", requiredQty: 10 }, { stockOnHand: 50 }, { reservedQty: 10 }, {}),
    // Short: needs 4, no stock, nothing ordered.
    gridRow({ rmItemId: "2", requiredQty: 4 }, { stockOnHand: 0 }, {}, {}),
    // Issued and part-received.
    gridRow({ rmItemId: "3", requiredQty: 6 }, { stockOnHand: 20 }, { reservedQty: 2, issuedQty: 4 },
      { poQty: 6, receivedQty: 3, billedQty: 1 }),
  ];
  const t = rollUp(rows);
  assert.strictEqual(t.items, 3);
  assert.strictEqual(t.required, 20, "10 + 4 + 6");
  assert.strictEqual(t.reserved, 12, "10 + 0 + 2");
  assert.strictEqual(t.issued, 4);
  assert.strictEqual(t.ordered, 6);
  assert.strictEqual(t.received, 3);
  assert.strictEqual(t.billed, 1);
  assert.strictEqual(t.shortItems, 1, "only item 2 is short");
  assert.strictEqual(t.shortQty, 4);
  assert.strictEqual(t.complete, false, "a short item means not complete");

  const done = rollUp([gridRow({ rmItemId: "1", requiredQty: 5 }, { stockOnHand: 9 }, { reservedQty: 5 }, {})]);
  assert.strictEqual(done.complete, true, "everything reserved and nothing short → complete");
  assert.strictEqual(rollUp([]).complete, false, "an empty BOM is not 'complete'");

  // Item pipeline: one item across two PRs/POs sums into parallel stage columns.
  const pipe = pipelineRollup([
    { rmItemId: "11", rmName: "Shaft", vendorName: "Acme", purchaseQty: 5, zohoPoId: "P1", poStatus: "draft", receivedQty: 0, billedQty: 0 },
    { rmItemId: "11", rmName: "Shaft", vendorName: "Bolt Co", purchaseQty: 3, zohoPoId: "P2", poStatus: "open", receivedQty: 2, billedQty: 1 },
    { rmItemId: "11", rmName: "Shaft", purchaseQty: 4, zohoPoId: "", poStatus: "" },
    { rmItemId: "22", rmName: "Seal", vendorName: "Acme", purchaseQty: 6, zohoPoId: "", poStatus: "" },
  ]);
  assert.strictEqual(pipe.length, 2, "one row per item");
  const shaft = pipe[0];
  assert.strictEqual(shaft.rmItemId, "11", "sorted by requested desc");
  assert.strictEqual(shaft.requested, 12, "5 + 3 + 4");
  assert.strictEqual(shaft.noPo, 4, "line without a PO stays in the draft-PR bucket");
  assert.strictEqual(shaft.onPoDraft, 5);
  assert.strictEqual(shaft.onPoOpen, 3);
  assert.strictEqual(shaft.received, 2);
  assert.strictEqual(shaft.billed, 1);
  assert.strictEqual(shaft.vendors, "Acme, Bolt Co");
  assert.strictEqual(pipe[1].noPo, 6);

  // Reconciliation rows (CR-031).
  const rec = reconcileRows(
    [
      { workOrderFgId: "f1", rmItemId: "11", rmName: "Shaft", rmSku: "SH-1", requiredQty: 10 },
      { workOrderFgId: "f1", rmItemId: "22", rmName: "Seal", requiredQty: 0 },   // removed while committed
      { workOrderFgId: "f1", rmItemId: "33", rmName: "Gasket", requiredQty: 4 }, // untouched
    ],
    [
      { workOrderFgId: "f1", componentItemId: "11", reservedQty: 2, issuedQty: 8, returnedQty: 0 },
      { workOrderFgId: "f1", componentItemId: "22", reservedQty: 1, issuedQty: 3, returnedQty: 1 },
      { workOrderFgId: "f1", componentItemId: "99", reservedQty: 5, issuedQty: 0, returnedQty: 0 }, // orphan
    ],
  );
  const byId = Object.fromEntries(rec.map((r) => [r.itemId, r]));
  assert.strictEqual(rec.length, 4, "3 lines + 1 orphan balance");
  assert.strictEqual(byId["11"].leftover, 2, "issued within requirement is consumed; only reserved comes back");
  assert.strictEqual(byId["11"].removedFromBom, false);
  assert.strictEqual(byId["22"].leftover, 3, "removed line: reserved 1 + (issued 3 − returned 1 − required 0)");
  assert.strictEqual(byId["22"].removedFromBom, true);
  assert.strictEqual(byId["33"].leftover, 0, "no material moved → nothing leftover");
  assert.strictEqual(byId["99"].leftover, 5, "orphan balance still reports its stock");

  console.log("workorder/reports.js self-check passed");
}
