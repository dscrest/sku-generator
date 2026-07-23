"use strict";

/**
 * Reporting (BRD FR-ADO-009). Every number here comes from our own tables, so a
 * report costs **zero** Zoho API calls no matter how many projects it spans —
 * which is the whole reason the read model exists.
 */
const { zStr } = require("../store");
const { byOrg, inList } = require("./store");
const { buildGrid } = require("./grid");

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

  const out = [];
  for (const wo of wos) {
    const rows = [];
    for (const fg of fgs.filter((f) => String(f.workOrderId) === String(wo.ROWID))) {
      const grid = await buildGrid(catalyst, orgId, wo, fg);
      rows.push(...grid.rows);
    }
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

  const out = [];
  for (const wo of wos) {
    for (const fg of fgs.filter((f) => String(f.workOrderId) === String(wo.ROWID))) {
      const grid = await buildGrid(catalyst, orgId, wo, fg);
      for (const r of grid.rows.filter((x) => x.short)) {
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
  }
  return out.sort((a, b) => b.shortfallQty - a.shortfallQty);
}

// The work order's own History tab feed: material movements + BOM revisions +
// approvals, newest first, already merged.
async function history(catalyst, orgId, workOrderId) {
  const rows = await byOrg(
    catalyst, orgId, "ActivityLog",
    `entityId = ${zStr(String(workOrderId))} OR entityType = 'MaterialTxn'`,
    "at DESC",
  );
  return rows.slice(0, 200).map((r) => ({
    at: r.at,
    action: r.action,
    entityType: r.entityType,
    entityId: String(r.entityId),
    userId: r.userId || null,
    detail: r.detail || null,
  }));
}

module.exports = { rollUp, soBom, shortfall, history };

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

  console.log("workorder/reports.js self-check passed");
}
