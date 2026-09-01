"use strict";

/**
 * Work Order add-on API (BRD: BOM, Reserve, De-Reserve, Issue, Return,
 * Purchase Request). Mounted at /api/wo behind requireAddon("work-order").
 *
 * Handlers stay thin — the rules live in workorder/*.js so they can be
 * self-checked without a Data Store.
 */
const express = require("express");
const { zStr, idOk } = require("../store");
const { dsDate } = require("../zoho/auth");
const {
  getSalesOrder, listSalesOrders, listVendors, findItemByName, findItemBySku, createComponentItem, searchItems,
} = require("../zoho/booksApi");
const { getUserById, requireAdmin } = require("../session");
const { updateCompositeItem, listCompositeItems, createCompositeItem } = require("../zoho/inventoryApi");
const {
  SETTING_KEYS, settings, setSetting, nextNumber, logActivity, byOrg, inList, creatableSalesOrders, requiredLevelsMet, approvalLevelCount,
} = require("../workorder/store");
const bom = require("../workorder/bom");
const { buildGrid, buildGridsBulk } = require("../workorder/grid");
const txn = require("../workorder/txn");
const purchase = require("../workorder/purchase");
const reports = require("../workorder/reports");
const { warehouseOptions, reconcileOrg, syncItem } = require("../workorder/sync");

const router = express.Router();
const n = (v) => Number(v) || 0;

// Status lifecycle (BRD §6.1.2). Cancelled is reachable from anywhere open.
// Draft/PendingApproval do NOT list "Approved": the only path to Approved is the
// /approve sign-off flow, so the manual status dropdown can't skip approvals.
const FLOW = {
  Draft: ["Cancelled"],
  PendingApproval: ["Cancelled"],
  Approved: ["MaterialAllocationPending", "Cancelled"],
  MaterialAllocationPending: ["ReadyForProduction", "Cancelled"],
  ReadyForProduction: ["InProgress", "Cancelled"],
  InProgress: ["QualityCheck", "Cancelled"],
  QualityCheck: ["Completed", "InProgress", "Cancelled"],
  Completed: ["Closed"],
  Closed: [],
  Cancelled: [],
};

function isReauth(err) {
  return err.zohoCode === 57 || err.httpStatus === 401 || /INVALID_OAUTH|not authorized/i.test(err.message || "");
}
function fail(res, err) {
  if (isReauth(err)) {
    return res.status(409).json({ error: "reauth_required", message: "Reconnect Zoho to grant Inventory access" });
  }
  console.error(err && (err.stack || err.message));
  res.status(err.status || 500).json({ error: err.message, details: err.details });
}
const ok = (handler) => async (req, res) => {
  try { await handler(req, res); } catch (err) { fail(res, err); }
};

async function loadWo(req) {
  if (!idOk(req.params.id)) { const e = new Error("Work order not found"); e.status = 404; throw e; }
  const rows = await byOrg(req.catalyst, req.orgId, "WorkOrder", `ROWID = ${zStr(req.params.id)}`);
  if (!rows.length) { const e = new Error("Work order not found"); e.status = 404; throw e; }
  return rows[0];
}

// Items are editable until production is done (CR-031).
const EDIT_LOCKED = ["Completed", "Closed", "Cancelled"];
function assertEditable(wo) {
  if (EDIT_LOCKED.includes(String(wo.status))) {
    const e = new Error(`${wo.woNumber} is ${wo.status} — items can no longer be edited`);
    e.status = 409;
    throw e;
  }
}

// ---- settings -------------------------------------------------------------

router.get("/settings", ok(async (req, res) => {
  const values = await settings(req.catalyst, req.orgId);
  let warehouses = [];
  let warehouseError = null;
  try { warehouses = await warehouseOptions(req.catalyst); } catch (err) { warehouseError = err.message; }
  res.json({ keys: SETTING_KEYS, values, warehouses, warehouseError });
}));

router.put("/settings", ok(async (req, res) => {
  const allowed = new Set(SETTING_KEYS.map((k) => k.key));
  const saved = [];
  for (const [key, value] of Object.entries(req.body || {})) {
    if (!allowed.has(key)) continue;
    await setSetting(req.catalyst, req.orgId, key, value);
    saved.push(key);
  }
  await logActivity(req.catalyst, req.orgId, "OrgSetting", req.orgId, "settings.update", req.userId, { saved });
  res.json({ ok: true, saved });
}));

// ---- Zoho pickers (the only live reads outside a refresh) ------------------

router.get("/sales-orders", ok(async (req, res) => {
  // Confirmed SOs only (the only ones eligible for a work order), and drop any
  // that already have a work order so an SO is never offered twice. The
  // confirmed-only gate lives in creatableSalesOrders (order_status "open") —
  // Zoho's salesorders filter_by can't express it: Status.confirmed is rejected
  // (code 2) and Status.Confirmed matches nothing.
  const sos = (await listSalesOrders(req.catalyst, req.query.q)).map((s) => ({
    id: String(s.salesorder_id),
    number: s.salesorder_number,
    date: s.date,
    customerId: String(s.customer_id || ""),
    customerName: s.customer_name,
    status: s.status,
    orderStatus: s.order_status,
  }));
  const soIds = inList(sos.map((s) => s.id));
  const taken = soIds
    ? new Set((await byOrg(req.catalyst, req.orgId, "WorkOrder", `salesOrderId IN (${soIds})`))
        .map((w) => String(w.salesOrderId)))
    : new Set();
  res.json(creatableSalesOrders(sos, taken));
}));

router.get("/so/:soId", ok(async (req, res) => {
  const so = await getSalesOrder(req.catalyst, req.params.soId);
  res.json({
    id: String(so.salesorder_id),
    number: so.salesorder_number,
    date: so.date,
    customerId: String(so.customer_id || ""),
    customerName: so.customer_name,
    status: so.status,
    lineItems: (so.line_items || []).map((l) => ({
      itemId: String(l.item_id), name: l.name, sku: l.sku || null, quantity: n(l.quantity),
    })),
  });
}));

router.get("/vendors", ok(async (req, res) => res.json(await listVendors(req.catalyst))));

// Books-item typeahead for the WO Items tab (CR-031) — only items that already
// exist in Zoho Books can be picked. Static path — must stay above /:id.
router.get("/items", ok(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json([]);
  const items = await searchItems(req.catalyst, q);
  res.json(items.map((i) => ({
    id: String(i.item_id), name: i.name, sku: i.sku || null, unit: i.unit || "",
  })));
}));

// ---- composite-item BOM (CR-028) ------------------------------------------
// The global BOM page works on Zoho composite items directly — no work-order
// framing, no frozen lines, no revision/guard. Static paths — must stay above
// the /:id handlers.

// Resolve uploaded rows against the composite's own components first, then the
// wider Books catalog. Rows found nowhere land in `missing`.
async function resolveRows(catalyst, rows, known) {
  const matched = bom.matchUpload(rows, known, 1);
  const incoming = [...matched.lines];
  const missing = [];
  for (const row of matched.unmatched) {
    const item = (await findItemBySku(catalyst, row.sku)) || (await findItemByName(catalyst, row.name));
    if (item) {
      incoming.push({
        rmItemId: String(item.item_id), rmName: item.name || row.name, rmSku: item.sku || row.sku,
        uom: item.unit || "", perUnitQty: row.qty, requiredQty: row.qty, source: "excel",
      });
    } else {
      missing.push(row);
    }
  }
  return { incoming, missing };
}

router.get("/composites", ok(async (req, res) => {
  const items = await listCompositeItems(req.catalyst);
  res.json(items.map((c) => ({
    id: String(c.composite_item_id), name: c.name, sku: c.sku || null, status: c.status,
  })));
}));

/**
 * Bulk import of a Zoho Books composite-items export, grouped client-side:
 * groups = [{ name, sku, rows: [{ sku, name, qty }] }]. A group matching an
 * existing composite (SKU first, then name) gets its mapped_items replaced by
 * the sheet; unknown groups become new composites. Per-group errors don't
 * abort the rest.
 */
router.post("/composites/import", ok(async (req, res) => {
  const { groups, createMissing } = req.body || {};
  if (!Array.isArray(groups) || !groups.length) { const e = new Error("Nothing to import"); e.status = 400; throw e; }
  const existing = await listCompositeItems(req.catalyst);
  const bySku = new Map(existing.filter((c) => c.sku).map((c) => [String(c.sku).trim().toLowerCase(), c]));
  const byName = new Map(existing.map((c) => [String(c.name || "").trim().toLowerCase(), c]));
  const results = [];
  for (const g of groups) {
    try {
      const hit = (g.sku && bySku.get(String(g.sku).trim().toLowerCase()))
        || byName.get(String(g.name || "").trim().toLowerCase());
      const known = hit
        ? bom.linesFromComposite((await bom.getComposite(req.catalyst, req.orgId, hit.composite_item_id, true)).mappedItems, 1)
        : [];
      const { incoming, missing } = await resolveRows(req.catalyst, g.rows, known);
      const created = [];
      if (missing.length) {
        if (!createMissing) {
          results.push({ name: g.name, status: "skipped", error: `no Books item for: ${missing.map((m) => m.name || m.sku).join(", ")}` });
          continue;
        }
        for (const row of missing) {
          const item = await createComponentItem(req.catalyst, row.name || row.sku, row.sku);
          incoming.push({ rmItemId: String(item.item_id), perUnitQty: n(row.qty) });
          created.push(item.name);
        }
      }
      if (hit) {
        await updateCompositeItem(req.catalyst, hit.composite_item_id, incoming);
        await bom.refreshComposite(req.catalyst, req.orgId, hit.composite_item_id);
        results.push({ name: g.name, status: "updated", created });
      } else {
        const comp = await createCompositeItem(req.catalyst, { name: g.name, sku: g.sku, mappedItems: incoming });
        await bom.refreshComposite(req.catalyst, req.orgId, comp.composite_item_id);
        results.push({ name: g.name, status: "created", created });
      }
    } catch (err) {
      results.push({ name: g.name, status: "error", error: err.message });
    }
  }
  await logActivity(req.catalyst, req.orgId, "CompositeItem", "bulk", "composite.import", req.userId, {
    results: results.map((r) => `${r.name}: ${r.status}`),
  });
  res.json({ results });
}));

router.get("/composites/:itemId/bom", ok(async (req, res) => {
  const comp = await bom.getComposite(req.catalyst, req.orgId, req.params.itemId, req.query.refresh === "1");
  res.json({
    id: String(req.params.itemId), name: comp.name, sku: comp.sku || null,
    lines: bom.linesFromComposite(comp.mappedItems, 1),
  });
}));

router.post("/composites/:itemId/bom/preview", ok(async (req, res) => {
  const comp = await bom.getComposite(req.catalyst, req.orgId, req.params.itemId, false);
  const current = bom.linesFromComposite(comp.mappedItems, 1);
  const { incoming, missing } = await resolveRows(req.catalyst, req.body?.rows, current);
  res.json({ ...bom.diffBom(current, incoming), missing });
}));

router.post("/composites/:itemId/bom/apply", ok(async (req, res) => {
  const { lines, missing, createMissing } = req.body || {};
  if (!Array.isArray(lines)) { const e = new Error("Nothing to apply"); e.status = 400; throw e; }
  const keep = lines.filter((l) => l.diffStatus !== "removed");
  const created = [];
  if (createMissing) {
    for (const row of missing || []) {
      const item = await createComponentItem(req.catalyst, row.name || row.sku, row.sku);
      keep.push({ rmItemId: String(item.item_id), perUnitQty: n(row.qty) });
      created.push(item.name);
    }
  }
  await updateCompositeItem(req.catalyst, req.params.itemId, keep);
  await bom.refreshComposite(req.catalyst, req.orgId, req.params.itemId);
  await logActivity(req.catalyst, req.orgId, "CompositeItem", req.params.itemId, "composite.bom.apply", req.userId, { created });
  res.json({ updated: true, created });
}));

router.post("/composites", ok(async (req, res) => {
  const { name, sku, rows, createMissing } = req.body || {};
  if (!name) { const e = new Error("Name is required"); e.status = 400; throw e; }
  const { incoming, missing } = await resolveRows(req.catalyst, rows, []);
  const created = [];
  if (missing.length) {
    if (!createMissing) {
      const e = new Error("Some rows match no Books item");
      e.status = 400;
      e.details = missing.map((m) => `${m.sku || m.name}: not found in Books`);
      throw e;
    }
    for (const row of missing) {
      const item = await createComponentItem(req.catalyst, row.name || row.sku, row.sku);
      incoming.push({ rmItemId: String(item.item_id), perUnitQty: n(row.qty) });
      created.push(item.name);
    }
  }
  const comp = await createCompositeItem(req.catalyst, { name, sku, mappedItems: incoming });
  await bom.refreshComposite(req.catalyst, req.orgId, comp.composite_item_id);
  await logActivity(req.catalyst, req.orgId, "CompositeItem", comp.composite_item_id, "composite.create", req.userId, { name, created });
  res.json({ id: String(comp.composite_item_id), name: comp.name, created });
}));

// Global Purchase page (CR-018). Static path — must stay above /:id.
router.get("/purchase-requests", ok(async (req, res) => {
  res.json(await purchase.listAllPRs(req.catalyst, req.orgId));
}));

// Orders grid (CR-020): every PO in the Books org, app-created ones stamped
// with their PR / work order. Static path — must stay above /:id.
router.get("/purchase-orders", ok(async (req, res) => {
  res.json(await purchase.listAllPOs(req.catalyst, req.orgId));
}));

// Item-wise Purchase Request (CR-023): shortfall of every open WO, aggregated
// by raw material so the buyer orders across work orders in one place. Static
// path — must stay above /:id.
router.get("/purchase/shortfall-by-item", ok(async (req, res) => {
  const wos = await byOrg(req.catalyst, req.orgId, "WorkOrder", null, "CREATEDTIME DESC");
  const open = wos.filter((w) => !["Closed", "Cancelled"].includes(String(w.status)));
  const openIds = inList(open.map((w) => w.ROWID));
  const fgs = openIds ? await byOrg(req.catalyst, req.orgId, "WorkOrderFG", `workOrderId IN (${openIds})`) : [];
  const fgsByWo = new Map();
  for (const f of fgs) {
    const k = String(f.workOrderId);
    if (!fgsByWo.has(k)) fgsByWo.set(k, []);
    fgsByWo.get(k).push(f);
  }

  const pairs = open.flatMap((wo) => (fgsByWo.get(String(wo.ROWID)) || []).map((fg) => ({ wo, fg })));
  const grids = await buildGridsBulk(req.catalyst, req.orgId, pairs);
  const tagged = [];
  pairs.forEach(({ wo }, i) => {
    for (const l of purchase.shortfallLines(grids[i])) {
      tagged.push({ ...l, woId: String(wo.ROWID), woNumber: wo.woNumber, salesOrderNumber: wo.salesOrderNumber });
    }
  });

  // Deduct draft-PR quantities (not yet on a PO) so raising never duplicates a
  // pending request — org-wide, since consolidated PRs span work orders.
  const draftPrs = await byOrg(req.catalyst, req.orgId, "PurchaseRequest", "status = 'Draft'");
  const prIds = inList(draftPrs.map((p) => p.ROWID));
  const prNo = new Map(draftPrs.map((p) => [String(p.ROWID), p.prNumber]));
  const draftLines = prIds
    ? (await byOrg(req.catalyst, req.orgId, "PurchaseRequestLine", `purchaseRequestId IN (${prIds})`))
        .filter((l) => !l.zohoPoId)
        .map((l) => ({ ...l, prNumber: prNo.get(String(l.purchaseRequestId)) }))
    : [];

  // Already-requested/ordered lines stay visible with status + PO number
  // (CR-048) so a buyer sees what's on order instead of the row vanishing.
  // Two PurchaseRequestLine queries on purpose: draft coverage is keyed by
  // draft-PR id org-wide, ordered lines by open-WO id — merging would change
  // the coverage semantics.
  const woById = new Map(open.map((w) => [String(w.ROWID), w]));
  const woOf = (l) => woById.get(String(l.workOrderId)) || {};
  const poLines = openIds
    ? (await byOrg(req.catalyst, req.orgId, "PurchaseRequestLine", `workOrderId IN (${openIds})`))
        .filter((l) => l.zohoPoId && String(l.poStatus) !== "cancelled")
    : [];
  const orderedEntries = [
    ...poLines.map((l) => {
      const qty = Number(l.purchaseQty) || 0;
      const received = Number(l.receivedQty) || 0;
      return {
        rmItemId: l.rmItemId, rmName: l.rmName,
        workOrderId: l.workOrderId, woNumber: woOf(l).woNumber, salesOrderNumber: woOf(l).salesOrderNumber,
        qty,
        status: received >= qty ? "Fulfilled" : received > 0 ? "PartiallyReceived" : "PORaised",
        poNumber: l.zohoPoNumber || "",
      };
    }),
    ...draftLines.map((l) => ({
      rmItemId: l.rmItemId, rmName: l.rmName,
      workOrderId: l.workOrderId, woNumber: woOf(l).woNumber, salesOrderNumber: woOf(l).salesOrderNumber,
      qty: Number(l.purchaseQty) || 0,
      status: "Requested",
      poNumber: l.prNumber || "",
    })),
  ];
  res.json(purchase.shortfallByItem(purchase.applyDraftCoverage(tagged, draftLines), orderedEntries));
}));

// One-step item-wise raise (CR-023): selected items + one vendor → consolidated
// PR + a grouped draft PO. Static path — must stay above /:id.
router.post("/purchase/raise", ok(async (req, res) => {
  const { vendorId, vendorName, items } = req.body || {};
  res.json(await purchase.raiseItemPO(req.catalyst, req.orgId, { vendorId, vendorName, items }, req.userId));
}));

// ---- reports --------------------------------------------------------------

router.get("/reports/so-bom", ok(async (req, res) => {
  res.json(await reports.soBom(req.catalyst, req.orgId, { status: req.query.status, salesOrderId: req.query.salesOrderId }));
}));

router.get("/reports/shortfall", ok(async (req, res) => {
  res.json(await reports.shortfall(req.catalyst, req.orgId));
}));

router.get("/reports/reconciliation", ok(async (req, res) => {
  res.json(await reports.reconciliation(req.catalyst, req.orgId, { workOrderId: req.query.workOrderId }));
}));

router.get("/reports/item-pipeline", ok(async (req, res) => {
  res.json(await reports.itemPipeline(req.catalyst, req.orgId, {
    workOrderId: req.query.workOrderId, vendorId: req.query.vendorId,
  }));
}));

router.get("/reports/warehouse-stock", ok(async (req, res) => {
  res.json(await reports.warehouseStock(req.catalyst, req.orgId));
}));

// ---- material transactions (ids are not work-order ids → before /:id) ------

router.post("/txn/:txnId/confirm", ok(async (req, res) => {
  res.json(await txn.confirmTxn(req.catalyst, req.orgId, req.params.txnId, req.userId));
}));

router.post("/txn/:txnId/cancel", ok(async (req, res) => {
  res.json(await txn.cancelTxn(req.catalyst, req.orgId, req.params.txnId, req.userId));
}));

router.put("/pr-line/:lineId", ok(async (req, res) => {
  res.json(await purchase.updatePRLine(req.catalyst, req.orgId, req.params.lineId, req.body || {}));
}));

router.delete("/pr-line/:lineId", ok(async (req, res) => {
  res.json(await purchase.deletePRLine(req.catalyst, req.orgId, req.params.lineId, req.userId));
}));

router.post("/pr/:prId/confirm", ok(async (req, res) => {
  res.json(await purchase.confirmPR(req.catalyst, req.orgId, req.params.prId, req.userId));
}));

router.delete("/pr/:prId", ok(async (req, res) => {
  res.json(await purchase.deletePR(req.catalyst, req.orgId, req.params.prId, req.userId));
}));

// ---- purchase orders (live Books detail + actions) ------------------------

router.get("/po/:poId", ok(async (req, res) => {
  res.json(await purchase.poDetail(req.catalyst, req.orgId, req.params.poId));
}));

router.put("/po/:poId", ok(async (req, res) => {
  res.json(await purchase.updatePoLines(req.catalyst, req.orgId, req.params.poId, (req.body || {}).lines, req.userId));
}));

router.delete("/po/:poId", ok(async (req, res) => {
  res.json(await purchase.deletePo(req.catalyst, req.orgId, req.params.poId, req.userId));
}));

router.post("/po/:poId/status", ok(async (req, res) => {
  res.json(await purchase.setPoStatus(req.catalyst, req.orgId, req.params.poId, String((req.body || {}).status || ""), req.userId));
}));

// ---- work orders ----------------------------------------------------------

router.get("/", ok(async (req, res) => {
  const where = req.query.status ? `status = ${zStr(String(req.query.status))}` : null;
  const wos = await byOrg(req.catalyst, req.orgId, "WorkOrder", where, "CREATEDTIME DESC");
  const ids = inList(wos.map((w) => w.ROWID));
  const fgs = ids ? await byOrg(req.catalyst, req.orgId, "WorkOrderFG", `workOrderId IN (${ids})`) : [];
  const procMap = await purchase.procStatusByWo(req.catalyst, req.orgId);
  res.json(wos.map((w) => ({
    id: String(w.ROWID),
    woNumber: w.woNumber,
    woDate: w.woDate,
    salesOrderId: String(w.salesOrderId || ""),
    salesOrderNumber: w.salesOrderNumber,
    customerName: w.customerName,
    projectName: w.projectName || null,
    status: w.status,
    procStatus: procMap.get(String(w.ROWID)) || null,
    qcStatus: w.qcStatus || null,
    revision: n(w.revision),
    bomImportedAt: w.bomImportedAt || null,
    fgs: fgs.filter((f) => String(f.workOrderId) === String(w.ROWID))
      .map((f) => ({ id: String(f.ROWID), name: f.fgName, qty: n(f.fgQty) })),
  })));
}));

/**
 * Create a work order from a Sales Order and seed its BOM from each FG's
 * composite item. `fgLines` picks which SO lines are finished goods; a line
 * whose item is not a composite comes back as a clear error naming it.
 */
router.post("/", ok(async (req, res) => {
  const { salesOrderId, projectName, fgLines, woDate } = req.body || {};
  if (!salesOrderId || !Array.isArray(fgLines) || !fgLines.length) {
    const e = new Error("Pick a sales order and at least one finished good");
    e.status = 400;
    throw e;
  }
  const so = await getSalesOrder(req.catalyst, salesOrderId);
  const s = await settings(req.catalyst, req.orgId);
  const woNumber = await nextNumber(req.catalyst, req.orgId, "WorkOrder", "woNumber", s.woNumberPrefix);

  const wo = await req.catalyst.datastore().table("WorkOrder").insertRow({
    orgId: String(req.orgId),
    woNumber,
    woDate: woDate || new Date().toISOString().slice(0, 10),
    salesOrderId: String(so.salesorder_id),
    salesOrderNumber: String(so.salesorder_number || ""),
    customerId: String(so.customer_id || ""),
    customerName: String(so.customer_name || ""),
    projectName: projectName || "",
    status: "Draft",
    qcStatus: "",
    revision: 0,
    bomImportedAt: null,
    estimatedCost: n(so.total),
    actualCost: 0,
    notes: "",
  });

  const fgTable = req.catalyst.datastore().table("WorkOrderFG");
  const seeded = [];
  const problems = [];
  for (const pick of fgLines) {
    const line = (so.line_items || []).find((l) => String(l.item_id) === String(pick.itemId));
    if (!line) { problems.push(`Item ${pick.itemId} is not on ${so.salesorder_number}`); continue; }
    const fgQty = n(pick.qty) || n(line.quantity);
    const fg = await fgTable.insertRow({
      orgId: String(req.orgId),
      workOrderId: String(wo.ROWID),
      fgItemId: String(line.item_id),
      fgName: line.name || "",
      fgSku: line.sku || "",
      fgQty,
    });
    try {
      const comp = await bom.getComposite(req.catalyst, req.orgId, line.item_id, true);
      const lines = bom.linesFromComposite(comp.mappedItems, fgQty);
      const diff = bom.diffBom([], lines);
      await bom.applyBom(req.catalyst, req.orgId, { ...wo, revision: 0 }, fg, diff.lines, diff.summary, req.userId);
      seeded.push({ fgId: String(fg.ROWID), name: line.name, lines: lines.length });
    } catch (err) {
      // Not a composite item, or Zoho refused — the FG stays on the work order
      // with an empty BOM so the user can upload one instead.
      problems.push(`${line.name}: BOM not seeded (${err.message})`);
    }
  }

  await logActivity(req.catalyst, req.orgId, "WorkOrder", wo.ROWID, "wo.create", req.userId, { woNumber, seeded });
  res.status(201).json({ id: String(wo.ROWID), woNumber, status: "Draft", seeded, problems });
}));

router.get("/:id", ok(async (req, res) => {
  const wo = await loadWo(req);
  const [fgs, prs, txns, approvals, procMap, values] = await Promise.all([
    byOrg(req.catalyst, req.orgId, "WorkOrderFG", `workOrderId = ${zStr(String(wo.ROWID))}`),
    purchase.listPRs(req.catalyst, req.orgId, wo.ROWID),
    txn.listTxns(req.catalyst, req.orgId, wo.ROWID),
    byOrg(
      req.catalyst, req.orgId, "Approval",
      `entityType = 'WorkOrder' AND entityId = ${zStr(String(wo.ROWID))}`, "approvalLevel",
    ),
    purchase.procStatusByWo(req.catalyst, req.orgId, wo.ROWID),
    settings(req.catalyst, req.orgId),
  ]);
  res.json({
    id: String(wo.ROWID),
    woNumber: wo.woNumber,
    woDate: wo.woDate,
    salesOrderId: String(wo.salesOrderId || ""),
    salesOrderNumber: wo.salesOrderNumber,
    customerName: wo.customerName,
    projectName: wo.projectName || null,
    status: wo.status,
    procStatus: procMap.get(String(wo.ROWID)) || null,
    qcStatus: wo.qcStatus || null,
    revision: n(wo.revision),
    bomImportedAt: wo.bomImportedAt || null,
    estimatedCost: n(wo.estimatedCost),
    actualCost: n(wo.actualCost),
    notes: wo.notes || "",
    nextStatuses: FLOW[String(wo.status)] || [],
    fgs: fgs.map((f) => ({
      id: String(f.ROWID), fgItemId: String(f.fgItemId), name: f.fgName, sku: f.fgSku || null, qty: n(f.fgQty),
    })),
    purchaseRequests: prs,
    transactions: txns,
    approvals: approvals.map((a) => ({
      id: String(a.ROWID), level: n(a.approvalLevel), status: a.status,
      approverEmail: a.approverEmail, actedAt: a.actedAt || null, remarks: a.remarks || null,
    })),
    requiredApprovalLevels: approvalLevelCount(values),
  });
}));

router.put("/:id", ok(async (req, res) => {
  const wo = await loadWo(req);
  const fields = { ROWID: String(wo.ROWID) };
  for (const k of ["projectName", "notes", "woDate"]) if (req.body[k] !== undefined) fields[k] = req.body[k] || "";
  for (const k of ["estimatedCost", "actualCost"]) if (req.body[k] !== undefined) fields[k] = n(req.body[k]);
  await req.catalyst.datastore().table("WorkOrder").updateRow(fields);
  await logActivity(req.catalyst, req.orgId, "WorkOrder", wo.ROWID, "wo.update", req.userId, fields);
  res.json({ ok: true });
}));

/**
 * Delete a work order and its child rows (CR-018). Only Draft/Cancelled, and
 * only when nothing irreversible happened: no POs raised, no material moved.
 * ActivityLog rows stay — the audit trail outlives the record.
 */
router.delete("/:id", ok(async (req, res) => {
  const wo = await loadWo(req);
  const woId = String(wo.ROWID);
  if (!["Draft", "Cancelled"].includes(String(wo.status))) {
    const e = new Error(`${wo.woNumber} is ${wo.status} — only Draft or Cancelled work orders can be deleted. Cancel it first.`);
    e.status = 409;
    throw e;
  }

  const prs = await byOrg(req.catalyst, req.orgId, "PurchaseRequest", `workOrderId = ${zStr(woId)}`);
  const prIds = inList(prs.map((p) => p.ROWID));
  const prLines = prIds
    ? await byOrg(req.catalyst, req.orgId, "PurchaseRequestLine", `purchaseRequestId IN (${prIds})`)
    : [];
  if (prLines.some((l) => l.zohoPoId)) {
    const e = new Error(`${wo.woNumber} has purchase orders in Zoho Books — delete or cancel those first.`);
    e.status = 409;
    throw e;
  }
  const resLines = await byOrg(req.catalyst, req.orgId, "ReservationLine", `workOrderId = ${zStr(woId)}`);
  if (resLines.some((l) => n(l.reservedQty) > 0 || n(l.issuedQty) - n(l.returnedQty) > 0)) {
    const e = new Error(`${wo.woNumber} still has reserved or issued material — return / de-reserve it first.`);
    e.status = 409;
    throw e;
  }

  const ds = req.catalyst.datastore();
  const wipe = async (table, rows) => { for (const r of rows) await ds.table(table).deleteRow(r.ROWID); };
  const txns = await byOrg(req.catalyst, req.orgId, "MaterialTxn", `workOrderId = ${zStr(woId)}`);
  const txnIds = inList(txns.map((t) => t.ROWID));
  await wipe("MaterialTxnLine", txnIds ? await byOrg(req.catalyst, req.orgId, "MaterialTxnLine", `txnId IN (${txnIds})`) : []);
  await wipe("MaterialTxn", txns);
  await wipe("PurchaseRequestLine", prLines);
  await wipe("PurchaseRequest", prs);
  await wipe("ReservationLine", resLines);
  await wipe("WorkOrderLine", await byOrg(req.catalyst, req.orgId, "WorkOrderLine", `workOrderId = ${zStr(woId)}`));
  await wipe("BomRevision", await byOrg(req.catalyst, req.orgId, "BomRevision", `workOrderId = ${zStr(woId)}`));
  await wipe("Approval", await byOrg(req.catalyst, req.orgId, "Approval", `entityType = 'WorkOrder' AND entityId = ${zStr(woId)}`));
  await wipe("WorkOrderFG", await byOrg(req.catalyst, req.orgId, "WorkOrderFG", `workOrderId = ${zStr(woId)}`));
  await ds.table("WorkOrder").deleteRow(woId);

  await logActivity(req.catalyst, req.orgId, "WorkOrder", woId, "wo.delete", req.userId, { woNumber: wo.woNumber });
  res.json({ deleted: true });
}));

/** Status transitions, including the QC gate (FR-BOM-003). */
router.post("/:id/status", ok(async (req, res) => {
  const wo = await loadWo(req);
  const to = String((req.body || {}).status || "");
  const allowed = FLOW[String(wo.status)] || [];
  if (!allowed.includes(to)) {
    const e = new Error(
      `${wo.woNumber} is ${wo.status} — it can only move to: ${allowed.join(", ") || "nothing (this is a final status)"}`,
    );
    e.status = 400;
    throw e;
  }
  const qcStatus = (req.body || {}).qcStatus;
  if (to === "Completed" && !qcStatus && !wo.qcStatus) {
    const e = new Error("Record the quality check result (Passed or Rejected) before completing this work order");
    e.status = 400;
    throw e;
  }
  if (qcStatus && !["Passed", "Rejected"].includes(qcStatus)) {
    const e = new Error("Quality check result must be Passed or Rejected");
    e.status = 400;
    throw e;
  }
  // QC rejected sends the job back to production rather than forward (§6.1.4).
  const status = qcStatus === "Rejected" ? "InProgress" : to;
  // Closing means manufacturing consumed the material — warn when items are not
  // fully issued; the client resends with force:true to close anyway (CR-080).
  const force = Boolean((req.body || {}).force);
  if (status === "Closed" && !force) {
    const fgs = await byOrg(req.catalyst, req.orgId, "WorkOrderFG", `workOrderId = ${zStr(String(wo.ROWID))}`);
    const grids = await buildGridsBulk(req.catalyst, req.orgId, fgs.map((fg) => ({ wo, fg })));
    const short = reports.unissuedRows(grids.flatMap((g) => g.rows));
    if (short.length) {
      return res.status(409).json({
        code: "unissued",
        error: `${short.length} item${short.length === 1 ? " is" : "s are"} not fully issued`,
        items: short.map((r) => ({ sku: r.sku, name: r.name, required: r.bom, issued: r.issued })),
      });
    }
  }
  // Production is over: whatever still sits in the Reserve/Issue warehouses for
  // this WO goes back to Main (CR-031). A Zoho failure aborts the transition —
  // a retry only sweeps the remainder, since confirmed txns update balances.
  let transferOrders = [];
  if (status === "Completed") {
    transferOrders = (await txn.autoReturnOnComplete(req.catalyst, req.orgId, wo, req.userId)).transferOrders;
  }
  const fields = { ROWID: String(wo.ROWID), status };
  if (qcStatus) fields.qcStatus = qcStatus;
  await req.catalyst.datastore().table("WorkOrder").updateRow(fields);
  await logActivity(req.catalyst, req.orgId, "WorkOrder", wo.ROWID, "wo.status", req.userId, {
    from: wo.status, to: status, qcStatus, transferOrders, ...(status === "Closed" && force ? { forced: true } : {}),
  });
  res.json({ ok: true, status, qcStatus: qcStatus || wo.qcStatus || null, transferOrders });
}));

/**
 * Admin-only: reopen a Closed work order back to Completed, reason required
 * (CR-080). Deliberately NOT in FLOW — Closed stays terminal for the generic
 * status endpoint, so only this guarded route can reopen.
 */
router.post("/:id/reopen", requireAdmin, ok(async (req, res) => {
  const wo = await loadWo(req);
  if (String(wo.status) !== "Closed") {
    const e = new Error(`${wo.woNumber} is ${wo.status} — only a Closed work order can be reopened`);
    e.status = 400;
    throw e;
  }
  const reason = String((req.body || {}).reason || "").trim();
  if (!reason) {
    const e = new Error("A reason is required to reopen a work order");
    e.status = 400;
    throw e;
  }
  await req.catalyst.datastore().table("WorkOrder").updateRow({ ROWID: String(wo.ROWID), status: "Completed" });
  await logActivity(req.catalyst, req.orgId, "WorkOrder", wo.ROWID, "wo.reopen", req.userId, { reason, from: "Closed", to: "Completed" });
  res.json({ ok: true, status: "Completed" });
}));

// ---- BOM ------------------------------------------------------------------

router.get("/:id/bom", ok(async (req, res) => {
  const wo = await loadWo(req);
  const lines = await bom.currentLines(req.catalyst, req.orgId, wo.ROWID, req.query.fgId);
  const revisions = await byOrg(
    req.catalyst, req.orgId, "BomRevision", `workOrderId = ${zStr(String(wo.ROWID))}`, "revision DESC",
  );
  res.json({
    revision: n(wo.revision),
    lines: lines.map((l) => ({
      id: String(l.ROWID),
      workOrderFgId: String(l.workOrderFgId),
      rmItemId: String(l.rmItemId),
      rmName: l.rmName,
      rmSku: l.rmSku || null,
      uom: l.uom || null,
      perUnitQty: n(l.perUnitQty),
      requiredQty: n(l.requiredQty),
      source: l.source,
      diffStatus: l.diffStatus || "unchanged",
    })),
    revisions: revisions.map((r) => ({
      revision: n(r.revision), changedAt: r.changedAt, changedBy: r.changedBy || null,
      pushedToZoho: r.pushedToZoho === true || r.pushedToZoho === "true",
      summary: bom.safeParse(r.summary, {}),
    })),
  });
}));

/**
 * Preview a BOM change without writing anything. Source is either the live
 * composite item ("refresh from Zoho") or an uploaded sheet parsed in the
 * browser. Always returns the diff plus any reason it cannot be applied.
 */
router.post("/:id/bom/preview", ok(async (req, res) => {
  const wo = await loadWo(req);
  const { fgId, source, rows } = req.body || {};
  const fgs = await byOrg(
    req.catalyst, req.orgId, "WorkOrderFG",
    `ROWID = ${zStr(String(fgId))} AND workOrderId = ${zStr(String(wo.ROWID))}`,
  );
  if (!fgs.length) { const e = new Error("Finished good not found on this work order"); e.status = 404; throw e; }
  const fg = fgs[0];
  const current = await bom.currentLines(req.catalyst, req.orgId, wo.ROWID, fg.ROWID);

  let incoming;
  let unmatched = [];
  if (source === "excel") {
    const comp = await bom.getComposite(req.catalyst, req.orgId, fg.fgItemId, false);
    // Known items = the composite's own components plus whatever is already on
    // the work order, so a previously added manual line still matches.
    const known = [
      ...bom.linesFromComposite(comp.mappedItems, n(fg.fgQty)),
      ...current.map((l) => ({ rmItemId: String(l.rmItemId), rmName: l.rmName, rmSku: l.rmSku, uom: l.uom })),
    ];
    const matched = bom.matchUpload(rows, known, n(fg.fgQty));
    incoming = matched.lines;
    unmatched = matched.unmatched;
  } else {
    const comp = await bom.getComposite(req.catalyst, req.orgId, fg.fgItemId, true);
    incoming = bom.linesFromComposite(comp.mappedItems, n(fg.fgQty));
  }

  const diff = bom.diffBom(current.map((l) => ({ ...l, rmItemId: String(l.rmItemId) })), incoming);
  const balances = await byOrg(
    req.catalyst, req.orgId, "ReservationLine",
    `workOrderId = ${zStr(String(wo.ROWID))} AND workOrderFgId = ${zStr(String(fg.ROWID))}`,
  );
  res.json({
    fgId: String(fg.ROWID),
    source: source === "excel" ? "excel" : "composite",
    ...diff,
    unmatched,
    blocked: bom.guardAgainstCommitted(diff.lines, balances),
  });
}));

/** Apply a previewed diff: rewrites the frozen lines and records a revision. */
router.post("/:id/bom/apply", ok(async (req, res) => {
  const wo = await loadWo(req);
  const { fgId, lines, summary, pushToZoho } = req.body || {};
  if (!Array.isArray(lines)) { const e = new Error("Nothing to apply"); e.status = 400; throw e; }
  const fgs = await byOrg(
    req.catalyst, req.orgId, "WorkOrderFG",
    `ROWID = ${zStr(String(fgId))} AND workOrderId = ${zStr(String(wo.ROWID))}`,
  );
  if (!fgs.length) { const e = new Error("Finished good not found on this work order"); e.status = 404; throw e; }
  const fg = fgs[0];

  const balances = await byOrg(
    req.catalyst, req.orgId, "ReservationLine",
    `workOrderId = ${zStr(String(wo.ROWID))} AND workOrderFgId = ${zStr(String(fg.ROWID))}`,
  );
  const blocked = bom.guardAgainstCommitted(lines, balances);
  if (blocked.length) { const e = new Error(blocked.join("\n")); e.status = 409; e.details = blocked; throw e; }

  const applied = await bom.applyBom(req.catalyst, req.orgId, wo, fg, lines, summary, req.userId);

  // Zoho stays the master: an accepted revision is pushed back to the composite
  // item unless the user opted out.
  let pushed = false;
  if (pushToZoho !== false) {
    try {
      const keep = lines.filter((l) => l.diffStatus !== "removed");
      await updateCompositeItem(req.catalyst, fg.fgItemId, keep);
      await bom.refreshComposite(req.catalyst, req.orgId, fg.fgItemId);
      pushed = true;
    } catch (err) {
      console.error("composite push failed:", err && err.message);
    }
  }
  res.json({ ...applied, pushedToZoho: pushed });
}));

/**
 * Single-line item edit during production (CR-031). Internal to the work order
 * only: never pushes to the Zoho composite item and never touches the Sales
 * Order. A removed/replaced line with material already reserved or issued is
 * kept at requiredQty 0 — the stock goes back to Main automatically when the
 * work order completes (see txn.autoReturnOnComplete).
 *
 * Body: { fgId, op: { action: 'add'|'setQty'|'remove'|'replace',
 *                     rmItemId?, qty?, item?: {id,name,sku,unit}, reason? } }
 */
router.post("/:id/lines", ok(async (req, res) => {
  const wo = await loadWo(req);
  assertEditable(wo);
  const { fgId, op } = req.body || {};
  const action = String((op || {}).action || "");
  const fgs = await byOrg(
    req.catalyst, req.orgId, "WorkOrderFG",
    `ROWID = ${zStr(String(fgId))} AND workOrderId = ${zStr(String(wo.ROWID))}`,
  );
  if (!fgs.length) { const e = new Error("Finished good not found on this work order"); e.status = 404; throw e; }
  const fg = fgs[0];
  const fgQty = n(fg.fgQty);
  const current = await bom.currentLines(req.catalyst, req.orgId, wo.ROWID, fg.ROWID);
  const byItem = new Map(current.map((l) => [String(l.rmItemId), l]));
  const balances = await bom.balancesFor(req.catalyst, req.orgId, wo.ROWID, fg.ROWID);
  const committed = (itemId) => {
    const b = balances.get(String(itemId));
    return b ? n(b.reservedQty) + n(b.issuedQty) - n(b.returnedQty) : 0;
  };
  const bad = (msg) => { const e = new Error(msg); e.status = 400; throw e; };
  const label = (l) => `${l.rmName || l.rmItemId}${l.rmSku ? ` (${l.rmSku})` : ""}`;

  const addEntry = (item, qty) => {
    if (!item || !item.id) bad("Pick an item from Zoho Books");
    if (byItem.has(String(item.id))) bad(`${item.name} is already on this BOM — edit its quantity instead`);
    if (!(n(qty) > 0)) bad("Quantity must be greater than zero");
    return {
      diffStatus: "new", rmItemId: String(item.id), rmName: item.name || "", rmSku: item.sku || "",
      uom: item.unit || "", perUnitQty: fgQty ? n(qty) / fgQty : n(qty), requiredQty: n(qty),
      source: "manual", prevQty: null,
    };
  };
  const dropEntry = (line) => committed(line.rmItemId) > 0
    // Material already moved: keep the line at 0 so the grid still shows it and
    // completion knows to send the stock back.
    ? { ...line, rmItemId: String(line.rmItemId), diffStatus: "qtyChanged", prevQty: n(line.requiredQty), requiredQty: 0, perUnitQty: 0 }
    : { ...line, rmItemId: String(line.rmItemId), diffStatus: "removed", prevQty: n(line.requiredQty), requiredQty: 0 };
  const mustFind = (rmItemId) => {
    const line = byItem.get(String(rmItemId || ""));
    if (!line) bad("That item is not on this BOM");
    return line;
  };

  const entries = [];
  let note = "";
  if (action === "add") {
    const entry = addEntry(op.item, op.qty);
    entries.push(entry);
    note = `${label({ rmName: entry.rmName, rmSku: entry.rmSku })} added manually — not part of the composite item`;
  } else if (action === "setQty") {
    const line = mustFind(op.rmItemId);
    const qty = n(op.qty);
    if (qty < 0) bad("Quantity cannot be negative");
    entries.push({
      ...line, rmItemId: String(line.rmItemId), diffStatus: "qtyChanged",
      prevQty: n(line.requiredQty), requiredQty: qty, perUnitQty: fgQty ? qty / fgQty : qty,
    });
    note = `${label(line)} quantity changed from ${n(line.requiredQty)} to ${qty}`;
  } else if (action === "remove") {
    const line = mustFind(op.rmItemId);
    entries.push(dropEntry(line));
    note = `${label(line)} removed`;
  } else if (action === "replace") {
    const line = mustFind(op.rmItemId);
    const entry = addEntry(op.item, op.qty === undefined || op.qty === null ? n(line.requiredQty) : op.qty);
    entries.push(dropEntry(line), entry);
    note = `${label(line)} replaced by ${label({ rmName: entry.rmName, rmSku: entry.rmSku })}`;
  } else {
    bad("Unknown action — use add, setQty, remove or replace");
  }
  if (op.reason) note += ` — ${String(op.reason).trim()}`;

  const summary = {
    added: entries.filter((l) => l.diffStatus === "new").map((l) => ({ rmItemId: l.rmItemId, name: l.rmName, qty: l.requiredQty })),
    removed: entries.filter((l) => l.diffStatus === "removed" || (l.diffStatus === "qtyChanged" && n(l.requiredQty) === 0))
      .map((l) => ({ rmItemId: l.rmItemId, name: l.rmName, qty: n(l.prevQty) })),
    changed: entries.filter((l) => l.diffStatus === "qtyChanged" && n(l.requiredQty) > 0)
      .map((l) => ({ rmItemId: l.rmItemId, name: l.rmName, from: n(l.prevQty), to: n(l.requiredQty) })),
    note,
  };
  const applied = await bom.applyBom(req.catalyst, req.orgId, wo, fg, entries, summary, req.userId);
  res.json({ revision: applied.revision, note });
}));

// ---- the grid + material actions ------------------------------------------

router.get("/:id/grid", ok(async (req, res) => {
  const wo = await loadWo(req);
  const fgs = await byOrg(
    req.catalyst, req.orgId, "WorkOrderFG",
    req.query.fgId
      ? `ROWID = ${zStr(String(req.query.fgId))} AND workOrderId = ${zStr(String(wo.ROWID))}`
      : `workOrderId = ${zStr(String(wo.ROWID))}`,
  );
  if (!fgs.length) { const e = new Error("Finished good not found on this work order"); e.status = 404; throw e; }
  res.json(await buildGrid(req.catalyst, req.orgId, wo, fgs[0]));
}));

router.post("/:id/txn", ok(async (req, res) => {
  const wo = await loadWo(req);
  const { fgId, type, requested, notes, confirm } = req.body || {};
  const draft = await txn.createDraft(
    req.catalyst, req.orgId,
    { workOrderId: wo.ROWID, workOrderFgId: fgId, type, requested, notes },
    req.userId,
  );
  // The grid's Confirm button does both in one call — Draft is only kept as a
  // separate step for people who want to stage an action.
  if (confirm) return res.json(await txn.confirmTxn(req.catalyst, req.orgId, draft.id, req.userId));
  res.json(draft);
}));

router.post("/:id/recompute", ok(async (req, res) => {
  const wo = await loadWo(req);
  res.json(await txn.recompute(req.catalyst, req.orgId, wo.ROWID));
}));

router.get("/:id/history", ok(async (req, res) => {
  const wo = await loadWo(req);
  res.json(await reports.history(req.catalyst, req.orgId, wo.ROWID));
}));

// ---- purchase requests ----------------------------------------------------

router.get("/:id/purchase-requests", ok(async (req, res) => {
  const wo = await loadWo(req);
  res.json(await purchase.listPRs(req.catalyst, req.orgId, wo.ROWID));
}));

/** Shortfall rows of the whole work order, pre-filled for a new request. */
router.get("/:id/shortfall", ok(async (req, res) => {
  const wo = await loadWo(req);
  const fgs = await byOrg(req.catalyst, req.orgId, "WorkOrderFG", `workOrderId = ${zStr(String(wo.ROWID))}`);
  const grids = await buildGridsBulk(req.catalyst, req.orgId, fgs.map((fg) => ({ wo, fg })));
  const lines = grids.flatMap((grid) => purchase.shortfallLines(grid));
  // Draft PRs are not on a PO yet (poSums can't see them) — deduct their
  // quantities here so raising again never duplicates a pending request.
  const draftLines = await purchase.openDraftLines(req.catalyst, req.orgId, wo.ROWID);
  res.json(purchase.applyDraftCoverage(lines, draftLines));
}));

router.post("/:id/purchase-request", ok(async (req, res) => {
  const wo = await loadWo(req);
  res.json(await purchase.createPR(req.catalyst, req.orgId, { workOrderId: wo.ROWID, lines: (req.body || {}).lines }, req.userId));
}));

// ---- approvals (FR-ADO-007) -----------------------------------------------

router.post("/:id/approve", ok(async (req, res) => {
  const wo = await loadWo(req);
  const level = n((req.body || {}).level);
  const status = String((req.body || {}).status || "Approved");
  if (![1, 2].includes(level)) { const e = new Error("Approval level must be 1 or 2"); e.status = 400; throw e; }
  if (!["Approved", "Rejected"].includes(status)) { const e = new Error("Status must be Approved or Rejected"); e.status = 400; throw e; }

  // The org's settings decide how many levels are required (0, 1 or 2).
  const levels = approvalLevelCount(await settings(req.catalyst, req.orgId));
  if (levels === 0) { const e = new Error("Approvals are disabled in settings"); e.status = 409; throw e; }
  if (level > levels) { const e = new Error("Only one approval level is configured — first-level approval is sufficient"); e.status = 409; throw e; }

  const existing = await byOrg(
    req.catalyst, req.orgId, "Approval",
    `entityType = 'WorkOrder' AND entityId = ${zStr(String(wo.ROWID))}`,
  );
  if (level === 2) {
    const l1 = existing.find((a) => n(a.approvalLevel) === 1 && a.status === "Approved");
    if (!l1) { const e = new Error("Level 1 must approve before level 2"); e.status = 409; throw e; }
  }
  const prev = existing.find((a) => n(a.approvalLevel) === level);
  const approver = await getUserById(req.catalyst, req.userId);
  const fields = {
    orgId: String(req.orgId), entityType: "WorkOrder", entityId: String(wo.ROWID), approvalLevel: level, status,
    approverEmail: (approver && approver.email) || "",
    actedAt: dsDate(Date.now()), remarks: (req.body || {}).remarks || "",
  };
  const table = req.catalyst.datastore().table("Approval");
  if (prev) await table.updateRow({ ROWID: prev.ROWID, ...fields });
  else await table.insertRow(fields);

  await logActivity(req.catalyst, req.orgId, "WorkOrder", wo.ROWID, `approval.l${level}.${status}`, req.userId, null);

  // Advance the lifecycle so the chip reflects the approval: Approved once every
  // required level has signed off; PendingApproval after the first level when a
  // second level is still required.
  let woStatus = String(wo.status);
  if (status === "Approved" && ["Draft", "PendingApproval"].includes(woStatus)) {
    const approvedLevels = new Set(
      existing.filter((a) => a.status === "Approved" && n(a.approvalLevel) !== level).map((a) => n(a.approvalLevel)),
    );
    approvedLevels.add(level);
    const next = requiredLevelsMet(approvedLevels, levels)
      ? "Approved"
      : (levels === 2 && approvedLevels.has(1) ? "PendingApproval" : woStatus);
    if (next !== woStatus) {
      await req.catalyst.datastore().table("WorkOrder").updateRow({ ROWID: String(wo.ROWID), status: next });
      await logActivity(req.catalyst, req.orgId, "WorkOrder", wo.ROWID, "wo.status", req.userId, { from: woStatus, to: next });
      woStatus = next;
    }
  }
  res.json({ ok: true, level, status, woStatus, requiredLevels: levels });
}));

/**
 * Invoice gate: every configured approval level approved (none configured =
 * always open). The UI calls this before offering to raise an invoice, so the
 * block is visible rather than a surprise.
 */
router.get("/:id/invoice-gate", ok(async (req, res) => {
  const wo = await loadWo(req);
  const levels = approvalLevelCount(await settings(req.catalyst, req.orgId));
  const approvals = await byOrg(
    req.catalyst, req.orgId, "Approval", `entityType = 'WorkOrder' AND entityId = ${zStr(String(wo.ROWID))}`,
  );
  const approved = [1, 2].filter((lv) => approvals.some((a) => n(a.approvalLevel) === lv && a.status === "Approved"));
  const needed = [1, 2].slice(0, levels);
  const missing = needed.filter((l) => !approved.includes(l));
  res.json({
    allowed: missing.length === 0,
    approvedLevels: approved,
    requiredLevels: needed,
    blockedReason: missing.length === 0 ? null : `Awaiting level ${missing.join(" and ")} approval`,
  });
}));

// ---- manual refresh -------------------------------------------------------

router.post("/refresh", ok(async (req, res) => {
  // ?full=1 sweeps the whole catalog (incl. items on no open WO) so a Zoho
  // adjustment / opening stock reflects; default stays bounded to open WOs.
  // full is incremental by default (only items changed since the cursor);
  // ?force=1 re-pulls everything. A forced/first sweep is paged (?offset=&limit=)
  // so each call clears the 30s ceiling — the client loops until done.
  const full = req.query.full === "1" || req.query.full === "true";
  const force = req.query.force === "1" || req.query.force === "true";
  const limit = full ? Number(req.query.limit) || 50 : null;
  const offset = Number(req.query.offset) || 0;
  res.json({ ok: true, ...(await reconcileOrg(req.catalyst, req.orgId, { full, force, offset, limit })) });
}));

// Instant per-item stock sync (static path — keep above /:id). Reflects a Zoho
// inventory adjustment / opening stock for one item immediately.
router.post("/items/:itemId/sync-stock", ok(async (req, res) => {
  if (!idOk(req.params.itemId)) { const e = new Error("Invalid item id"); e.status = 400; throw e; }
  res.json({ ok: true, ...(await syncItem(req.catalyst, req.orgId, req.params.itemId)) });
}));

module.exports = router;
