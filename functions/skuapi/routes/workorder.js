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
const { getSalesOrder, listSalesOrders, listVendors } = require("../zoho/booksApi");
const { getUserById } = require("../session");
const { updateCompositeItem } = require("../zoho/inventoryApi");
const {
  SETTING_KEYS, settings, setSetting, nextNumber, logActivity, byOrg, inList,
} = require("../workorder/store");
const bom = require("../workorder/bom");
const { buildGrid } = require("../workorder/grid");
const txn = require("../workorder/txn");
const purchase = require("../workorder/purchase");
const reports = require("../workorder/reports");
const { warehouseOptions, reconcileOrg } = require("../workorder/sync");

const router = express.Router();
const n = (v) => Number(v) || 0;

// Status lifecycle (BRD §6.1.2). Cancelled is reachable from anywhere open.
const FLOW = {
  Draft: ["Approved", "Cancelled"],
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
  const sos = await listSalesOrders(req.catalyst, req.query.q);
  res.json(sos.map((s) => ({
    id: String(s.salesorder_id),
    number: s.salesorder_number,
    date: s.date,
    customerId: String(s.customer_id || ""),
    customerName: s.customer_name,
    status: s.status,
  })));
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

// ---- reports --------------------------------------------------------------

router.get("/reports/so-bom", ok(async (req, res) => {
  res.json(await reports.soBom(req.catalyst, req.orgId, { status: req.query.status, salesOrderId: req.query.salesOrderId }));
}));

router.get("/reports/shortfall", ok(async (req, res) => {
  res.json(await reports.shortfall(req.catalyst, req.orgId));
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

router.post("/pr/:prId/confirm", ok(async (req, res) => {
  res.json(await purchase.confirmPR(req.catalyst, req.orgId, req.params.prId, req.userId));
}));

// ---- work orders ----------------------------------------------------------

router.get("/", ok(async (req, res) => {
  const where = req.query.status ? `status = ${zStr(String(req.query.status))}` : null;
  const wos = await byOrg(req.catalyst, req.orgId, "WorkOrder", where, "CREATEDTIME DESC");
  const ids = inList(wos.map((w) => w.ROWID));
  const fgs = ids ? await byOrg(req.catalyst, req.orgId, "WorkOrderFG", `workOrderId IN (${ids})`) : [];
  res.json(wos.map((w) => ({
    id: String(w.ROWID),
    woNumber: w.woNumber,
    woDate: w.woDate,
    salesOrderId: String(w.salesOrderId || ""),
    salesOrderNumber: w.salesOrderNumber,
    customerName: w.customerName,
    projectName: w.projectName || null,
    status: w.status,
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
  const [fgs, prs, txns] = await Promise.all([
    byOrg(req.catalyst, req.orgId, "WorkOrderFG", `workOrderId = ${zStr(String(wo.ROWID))}`),
    purchase.listPRs(req.catalyst, req.orgId, wo.ROWID),
    txn.listTxns(req.catalyst, req.orgId, wo.ROWID),
  ]);
  const approvals = await byOrg(
    req.catalyst, req.orgId, "Approval",
    `entityType = 'WorkOrder' AND entityId = ${zStr(String(wo.ROWID))}`, "level",
  );
  res.json({
    id: String(wo.ROWID),
    woNumber: wo.woNumber,
    woDate: wo.woDate,
    salesOrderId: String(wo.salesOrderId || ""),
    salesOrderNumber: wo.salesOrderNumber,
    customerName: wo.customerName,
    projectName: wo.projectName || null,
    status: wo.status,
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
      id: String(a.ROWID), level: n(a.level), status: a.status,
      approverEmail: a.approverEmail, actedAt: a.actedAt || null, remarks: a.remarks || null,
    })),
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
  const fields = { ROWID: String(wo.ROWID), status };
  if (qcStatus) fields.qcStatus = qcStatus;
  await req.catalyst.datastore().table("WorkOrder").updateRow(fields);
  await logActivity(req.catalyst, req.orgId, "WorkOrder", wo.ROWID, "wo.status", req.userId, { from: wo.status, to: status, qcStatus });
  res.json({ ok: true, status, qcStatus: qcStatus || wo.qcStatus || null });
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
  const lines = [];
  for (const fg of fgs) {
    const grid = await buildGrid(req.catalyst, req.orgId, wo, fg);
    lines.push(...purchase.shortfallLines(grid));
  }
  res.json(lines);
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

  const existing = await byOrg(
    req.catalyst, req.orgId, "Approval",
    `entityType = 'WorkOrder' AND entityId = ${zStr(String(wo.ROWID))}`,
  );
  if (level === 2) {
    const l1 = existing.find((a) => n(a.level) === 1 && a.status === "Approved");
    if (!l1) { const e = new Error("Level 1 must approve before level 2"); e.status = 409; throw e; }
  }
  const prev = existing.find((a) => n(a.level) === level);
  const approver = await getUserById(req.catalyst, req.userId);
  const fields = {
    orgId: String(req.orgId), entityType: "WorkOrder", entityId: String(wo.ROWID), level, status,
    approverEmail: (approver && approver.email) || "",
    actedAt: dsDate(Date.now()), remarks: (req.body || {}).remarks || "",
  };
  const table = req.catalyst.datastore().table("Approval");
  if (prev) await table.updateRow({ ROWID: prev.ROWID, ...fields });
  else await table.insertRow(fields);

  await logActivity(req.catalyst, req.orgId, "WorkOrder", wo.ROWID, `approval.l${level}.${status}`, req.userId, null);
  res.json({ ok: true, level, status });
}));

/**
 * Invoice gate: both levels approved. The UI calls this before offering to
 * raise an invoice, so the block is visible rather than a surprise.
 */
router.get("/:id/invoice-gate", ok(async (req, res) => {
  const wo = await loadWo(req);
  const approvals = await byOrg(
    req.catalyst, req.orgId, "Approval", `entityType = 'WorkOrder' AND entityId = ${zStr(String(wo.ROWID))}`,
  );
  const approved = [1, 2].filter((lv) => approvals.some((a) => n(a.level) === lv && a.status === "Approved"));
  res.json({
    allowed: approved.length === 2,
    approvedLevels: approved,
    blockedReason: approved.length === 2 ? null : `Awaiting level ${[1, 2].filter((l) => !approved.includes(l)).join(" and ")} approval`,
  });
}));

// ---- manual refresh -------------------------------------------------------

router.post("/refresh", ok(async (req, res) => {
  res.json({ ok: true, ...(await reconcileOrg(req.catalyst, req.orgId)) });
}));

module.exports = router;
