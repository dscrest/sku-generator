"use strict";

/**
 * The material ledger: Reserve, De-Reserve, Issue and Return.
 *
 * They are one table and one code path because they differ only by `type` and
 * the warehouse pair (BRD §6.2–6.5). Every confirmed transaction writes exactly
 * one Zoho Transfer Order and updates our running balance — nothing is ever
 * read back from Zoho to find out what we just did.
 */
const { rowList, zStr } = require("../store");
const { dsDate } = require("../zoho/auth");
const { createTransferOrder } = require("../zoho/inventoryApi");
const { validateLine, applyToBalance, TXN_TYPES } = require("./formulas");
const { routeFor, nextNumber, logActivity, byOrg, settings, inList } = require("./store");
const { buildGrid, indexRows } = require("./grid");

const n = (v) => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Pure: match the requested quantities to the grid rows and check every cap.
 * Returns the lines to write plus every problem found — all of them, so the
 * user fixes the whole form in one pass instead of one error at a time.
 */
function planLines(type, gridRows, requested) {
  if (!TXN_TYPES.includes(type)) return { lines: [], errors: [`Unknown transaction type "${type}"`] };
  const byItem = new Map(gridRows.map((r) => [String(r.itemId), r]));
  const lines = [];
  const errors = [];
  const seen = new Set();

  for (const req of requested || []) {
    const itemId = String(req.itemId);
    const qty = n(req.qty);
    if (qty === 0) continue; // untouched cell — not an error, just nothing to do
    if (seen.has(itemId)) { errors.push(`Item ${itemId} appears twice in one transaction`); continue; }
    seen.add(itemId);
    const row = byItem.get(itemId);
    if (!row) { errors.push(`Item ${itemId} is not on this work order's BOM`); continue; }
    const problem = validateLine(type, row, qty);
    if (problem) { errors.push(problem); continue; }
    lines.push({ rmItemId: itemId, workOrderLineId: row.workOrderLineId, qty, name: row.name });
  }
  if (!lines.length && !errors.length) errors.push("Enter a quantity on at least one line");
  return { lines, errors };
}

// ---- draft ----------------------------------------------------------------

async function createDraft(catalyst, orgId, { workOrderId, workOrderFgId, type, requested, notes }, userId) {
  const { wo, fg } = await loadContext(catalyst, orgId, workOrderId, workOrderFgId);
  const grid = await buildGrid(catalyst, orgId, wo, fg);
  const { lines, errors } = planLines(type, grid.rows, requested);
  if (errors.length) { const e = new Error(errors.join("\n")); e.status = 400; e.details = errors; throw e; }

  const s = await settings(catalyst, orgId);
  const txnNumber = await nextNumber(catalyst, orgId, "MaterialTxn", "txnNumber", s.txnNumberPrefix);
  const route = await routeFor(catalyst, orgId, type);

  const txn = await catalyst.datastore().table("MaterialTxn").insertRow({
    orgId: String(orgId),
    txnNumber,
    type,
    workOrderId: String(wo.ROWID),
    workOrderFgId: String(fg.ROWID),
    salesOrderId: String(wo.salesOrderId || ""),
    status: "Draft",
    fromWarehouseId: route.fromWarehouseId,
    toWarehouseId: route.toWarehouseId,
    zohoTransferOrderId: "",
    zohoTransferOrderNumber: "",
    zohoStatus: "",
    p2pLinkId: "",
    confirmedBy: "",
    confirmedAt: null,
    notes: notes || "",
  });

  const lineTable = catalyst.datastore().table("MaterialTxnLine");
  for (const l of lines) {
    await lineTable.insertRow({
      orgId: String(orgId),
      txnId: String(txn.ROWID),
      workOrderLineId: String(l.workOrderLineId || ""),
      rmItemId: String(l.rmItemId),
      qty: l.qty,
    });
  }

  await logActivity(catalyst, orgId, "MaterialTxn", txn.ROWID, `txn.draft.${type}`, userId, { txnNumber, lines });
  return { id: String(txn.ROWID), txnNumber, type, status: "Draft", lines };
}

// ---- confirm --------------------------------------------------------------

/**
 * Confirm re-reads the balances and re-checks every cap before writing. Two
 * store users reserving the same stock at the same time is the race the NFR
 * calls out; whoever confirms second gets a clear "only N available" instead of
 * an over-reservation.
 *
 * ponytail: last-write-wins on a single function instance. A per-work-order
 * lock row is the upgrade path if the store team ever grows enough to collide.
 */
async function confirmTxn(catalyst, orgId, txnId, userId) {
  const txn = await loadTxn(catalyst, orgId, txnId);
  if (txn.status !== "Draft") {
    const e = new Error(`${txn.txnNumber} is already ${String(txn.status).toLowerCase()}`);
    e.status = 409;
    throw e;
  }
  const { wo, fg } = await loadContext(catalyst, orgId, txn.workOrderId, txn.workOrderFgId);
  const txnLines = await byOrg(catalyst, orgId, "MaterialTxnLine", `txnId = ${zStr(String(txnId))}`);
  if (!txnLines.length) { const e = new Error("This transaction has no lines"); e.status = 400; throw e; }

  const grid = await buildGrid(catalyst, orgId, wo, fg);
  const { lines, errors } = planLines(
    txn.type, grid.rows, txnLines.map((l) => ({ itemId: l.rmItemId, qty: l.qty })),
  );
  if (errors.length) { const e = new Error(errors.join("\n")); e.status = 409; e.details = errors; throw e; }

  const route = await routeFor(catalyst, orgId, txn.type);
  const to = await createTransferOrder(catalyst, {
    date: today(),
    fromWarehouseId: route.fromWarehouseId,
    toWarehouseId: route.toWarehouseId,
    reason: `${txn.type} — ${wo.woNumber} / ${wo.salesOrderNumber || "SO"}`,
    lines,
  });

  await catalyst.datastore().table("MaterialTxn").updateRow({
    ROWID: String(txn.ROWID),
    status: "Confirmed",
    fromWarehouseId: route.fromWarehouseId,
    toWarehouseId: route.toWarehouseId,
    zohoTransferOrderId: String(to.transfer_order_id || ""),
    zohoTransferOrderNumber: String(to.transfer_order_number || ""),
    zohoStatus: String(to.status || ""),
    confirmedBy: userId ? String(userId) : "",
    confirmedAt: dsDate(Date.now()),
  });

  await applyBalances(catalyst, orgId, wo, fg, txn.type, lines);
  await adjustSnapshots(catalyst, orgId, route, lines);
  await advanceWoStatus(catalyst, orgId, wo, txn, userId);

  await logActivity(catalyst, orgId, "MaterialTxn", txn.ROWID, `txn.confirm.${txn.type}`, userId, {
    txnNumber: txn.txnNumber, transferOrder: to.transfer_order_number, lines,
  });

  return {
    id: String(txn.ROWID),
    txnNumber: txn.txnNumber,
    type: txn.type,
    status: "Confirmed",
    transferOrderId: String(to.transfer_order_id || ""),
    transferOrderNumber: String(to.transfer_order_number || ""),
  };
}

/**
 * Confirmed material movement drives the WO lifecycle (BRD §6.1.2): the first
 * reserve marks allocation underway, the first issue marks production started.
 * Forward-only — dereserve/return never demote, so the completion sweep
 * (autoReturnOnComplete) leaves the status alone.
 */
const STATUS_BUMP = {
  reserve: { to: "MaterialAllocationPending", from: ["Draft", "Approved"] },
  issue: { to: "InProgress", from: ["Draft", "Approved", "MaterialAllocationPending", "ReadyForProduction"] },
};

async function advanceWoStatus(catalyst, orgId, wo, txn, userId) {
  const bump = STATUS_BUMP[txn.type];
  if (!bump || !bump.from.includes(String(wo.status))) return;
  await catalyst.datastore().table("WorkOrder").updateRow({ ROWID: String(wo.ROWID), status: bump.to });
  await logActivity(catalyst, orgId, "WorkOrder", wo.ROWID, "wo.status", userId, {
    from: wo.status, to: bump.to, via: txn.txnNumber,
  });
}

async function cancelTxn(catalyst, orgId, txnId, userId) {
  const txn = await loadTxn(catalyst, orgId, txnId);
  if (txn.status === "Confirmed") {
    const e = new Error(
      `${txn.txnNumber} is confirmed — its Transfer Order already moved the material. Raise the opposite action to reverse it.`,
    );
    e.status = 409;
    throw e;
  }
  await catalyst.datastore().table("MaterialTxn").updateRow({ ROWID: String(txn.ROWID), status: "Cancelled" });
  await logActivity(catalyst, orgId, "MaterialTxn", txn.ROWID, "txn.cancel", userId, { txnNumber: txn.txnNumber });
  return { id: String(txn.ROWID), status: "Cancelled" };
}

// ---- auto-return on completion (CR-031) -----------------------------------

/**
 * Pure: what goes back to Main once production is done. Everything still in the
 * Reserve warehouse is leftover (dereserve = C), and anything issued beyond the
 * final requirement is over-issue (return = max(0, D − A)). Issued stock within
 * the requirement is assumed consumed by assembly — the app cannot know
 * otherwise; users return unconsumed material via the grid before completing.
 */
function sweepLines(gridRows) {
  const dereserve = [];
  const ret = [];
  for (const r of gridRows || []) {
    if (n(r.reserved) > 0) dereserve.push({ itemId: String(r.itemId), qty: n(r.reserved) });
    const over = n(r.issued) - n(r.bom);
    if (over > 0) ret.push({ itemId: String(r.itemId), qty: over });
  }
  return { dereserve, return: ret };
}

/**
 * Send leftover material back to Main when a work order completes. One
 * dereserve and/or return txn per FG, confirmed immediately (each writes a Zoho
 * Transfer Order). A Zoho failure throws — the caller aborts the status change,
 * and a retry sweeps only what is still outstanding.
 */
async function autoReturnOnComplete(catalyst, orgId, wo, userId) {
  const fgs = await byOrg(catalyst, orgId, "WorkOrderFG", `workOrderId = ${zStr(String(wo.ROWID))}`);
  const transferOrders = [];
  for (const fg of fgs) {
    const grid = await buildGrid(catalyst, orgId, wo, fg);
    const sweep = sweepLines(grid.rows);
    for (const [type, lines] of [["dereserve", sweep.dereserve], ["return", sweep.return]]) {
      if (!lines.length) continue;
      const draft = await createDraft(
        catalyst, orgId,
        {
          workOrderId: wo.ROWID, workOrderFgId: fg.ROWID, type,
          requested: lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
          notes: "Auto-return on completion",
        },
        userId,
      );
      const confirmed = await confirmTxn(catalyst, orgId, draft.id, userId);
      transferOrders.push({ type, txnNumber: confirmed.txnNumber, transferOrderNumber: confirmed.transferOrderNumber });
    }
  }
  return { transferOrders };
}

// ---- balances & snapshots -------------------------------------------------

// Upsert ReservationLine per item. C and D are disjoint (see formulas.js).
async function applyBalances(catalyst, orgId, wo, fg, type, lines) {
  const table = catalyst.datastore().table("ReservationLine");
  for (const l of lines) {
    const existing = await byOrg(
      catalyst, orgId, "ReservationLine",
      `workOrderId = ${zStr(String(wo.ROWID))} AND workOrderFgId = ${zStr(String(fg.ROWID))} AND componentItemId = ${zStr(String(l.rmItemId))}`,
    );
    const prev = existing[0];
    const next = applyToBalance(type, prev || {}, l.qty);
    const fields = {
      orgId: String(orgId),
      workOrderId: String(wo.ROWID),
      workOrderFgId: String(fg.ROWID),
      salesOrderId: String(wo.salesOrderId || ""),
      fgItemId: String(fg.fgItemId || ""),
      componentItemId: String(l.rmItemId),
      ...next,
    };
    if (prev) await table.updateRow({ ROWID: prev.ROWID, ...fields });
    else await table.insertRow({ ...fields, requestedPoQty: 0, warehouseId: "", zohoDocs: "" });
  }
}

/**
 * Write-through: the Transfer Order we just posted moved stock out of one
 * warehouse and into another, so adjust the cached rows instead of re-reading
 * them from Zoho. The nightly reconcile is what corrects any drift.
 */
async function adjustSnapshots(catalyst, orgId, route, lines) {
  const table = catalyst.datastore().table("ItemStockSnapshot");
  for (const l of lines) {
    for (const [warehouseId, delta] of [[route.fromWarehouseId, -l.qty], [route.toWarehouseId, l.qty]]) {
      const rows = await byOrg(
        catalyst, orgId, "ItemStockSnapshot",
        `itemId = ${zStr(String(l.rmItemId))} AND warehouseId = ${zStr(String(warehouseId))}`,
      );
      const prev = rows[0];
      const stockOnHand = n(prev && prev.stockOnHand) + delta;
      const fields = {
        orgId: String(orgId),
        itemId: String(l.rmItemId),
        warehouseId: String(warehouseId),
        stockOnHand,
        availableStock: stockOnHand,
        source: "writethrough",
        syncedAt: dsDate(Date.now()),
      };
      if (prev) await table.updateRow({ ROWID: prev.ROWID, ...fields });
      else await table.insertRow({ ...fields, poQty: 0, receivedQty: 0, billedQty: 0 });
    }
  }
}

/**
 * Rebuild the running balances from the ledger. The balances are derived, so
 * this is the repair tool if they ever drift (a crash between the Transfer
 * Order and the balance write, say).
 */
async function recompute(catalyst, orgId, workOrderId) {
  const txns = await byOrg(
    catalyst, orgId, "MaterialTxn",
    `workOrderId = ${zStr(String(workOrderId))} AND status = 'Confirmed'`,
    "CREATEDTIME",
  );
  const fresh = new Map(); // `${fgId}|${itemId}` -> balance
  const lineMap = await txnLines(catalyst, orgId, txns);
  for (const t of txns) {
    for (const l of lineMap.get(String(t.ROWID)) || []) {
      const key = `${t.workOrderFgId}|${l.rmItemId}`;
      fresh.set(key, applyToBalance(t.type, fresh.get(key) || {}, l.qty));
    }
  }
  const table = catalyst.datastore().table("ReservationLine");
  const existing = await byOrg(catalyst, orgId, "ReservationLine", `workOrderId = ${zStr(String(workOrderId))}`);
  let updated = 0;
  for (const row of existing) {
    const bal = fresh.get(`${row.workOrderFgId}|${row.componentItemId}`) ||
      { reservedQty: 0, issuedQty: 0, returnedQty: 0 };
    if (n(row.reservedQty) === bal.reservedQty && n(row.issuedQty) === bal.issuedQty &&
        n(row.returnedQty) === bal.returnedQty) continue;
    await table.updateRow({ ROWID: row.ROWID, ...bal });
    updated++;
  }
  return { transactions: txns.length, balancesRepaired: updated };
}

// ---- loaders --------------------------------------------------------------

async function loadContext(catalyst, orgId, workOrderId, workOrderFgId) {
  const wos = await byOrg(catalyst, orgId, "WorkOrder", `ROWID = ${zStr(String(workOrderId))}`);
  if (!wos.length) { const e = new Error("Work order not found"); e.status = 404; throw e; }
  const fgs = await byOrg(
    catalyst, orgId, "WorkOrderFG",
    `ROWID = ${zStr(String(workOrderFgId))} AND workOrderId = ${zStr(String(workOrderId))}`,
  );
  if (!fgs.length) { const e = new Error("Finished good not found on this work order"); e.status = 404; throw e; }
  const wo = wos[0];
  if (["Closed", "Cancelled"].includes(String(wo.status))) {
    const e = new Error(`${wo.woNumber} is ${String(wo.status).toLowerCase()} — material cannot be moved against it`);
    e.status = 409;
    throw e;
  }
  return { wo, fg: fgs[0] };
}

async function loadTxn(catalyst, orgId, txnId) {
  const rows = await byOrg(catalyst, orgId, "MaterialTxn", `ROWID = ${zStr(String(txnId))}`);
  if (!rows.length) { const e = new Error("Transaction not found"); e.status = 404; throw e; }
  return rows[0];
}

// All lines of a set of transactions in one IN (...) query, grouped by txn id.
async function txnLines(catalyst, orgId, txns) {
  const ids = inList(txns.map((t) => t.ROWID));
  const map = new Map();
  if (!ids) return map;
  for (const l of await byOrg(catalyst, orgId, "MaterialTxnLine", `txnId IN (${ids})`)) {
    const k = String(l.txnId);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(l);
  }
  return map;
}

// History for the work order's History tab.
async function listTxns(catalyst, orgId, workOrderId) {
  const txns = await byOrg(
    catalyst, orgId, "MaterialTxn", `workOrderId = ${zStr(String(workOrderId))}`, "CREATEDTIME DESC",
  );
  const lineMap = await txnLines(catalyst, orgId, txns);
  const out = [];
  for (const t of txns) {
    const lines = lineMap.get(String(t.ROWID)) || [];
    out.push({
      id: String(t.ROWID),
      txnNumber: t.txnNumber,
      type: t.type,
      status: t.status,
      transferOrderNumber: t.zohoTransferOrderNumber || null,
      confirmedAt: t.confirmedAt || null,
      createdAt: t.CREATEDTIME,
      notes: t.notes || null,
      lines: lines.map((l) => ({ rmItemId: String(l.rmItemId), qty: n(l.qty) })),
    });
  }
  return out;
}

module.exports = {
  planLines, createDraft, confirmTxn, cancelTxn, recompute, listTxns,
  applyBalances, adjustSnapshots, loadContext, loadTxn, sweepLines, autoReturnOnComplete,
};

// ponytail self-check: `node functions/skuapi/workorder/txn.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const { gridRow } = require("./formulas");

  const rows = [
    gridRow({ rmItemId: "11", rmName: "Shaft", requiredQty: 10 }, { stockOnHand: 6 }, { reservedQty: 2, issuedQty: 1 }, {}),
    gridRow({ rmItemId: "22", rmName: "Seal", requiredQty: 4 }, { stockOnHand: 0 }, {}, {}),
  ];
  // Shaft: A=10 C=2 D=1 B=6 → H = min(10−2−1, 6) = 6.  Seal: no stock → H = 0.
  assert.strictEqual(rows[0].reservable, 6);
  assert.strictEqual(rows[1].reservable, 0);

  const ok = planLines("reserve", rows, [{ itemId: "11", qty: 6 }]);
  assert.deepStrictEqual(ok.errors, []);
  assert.strictEqual(ok.lines.length, 1);
  assert.strictEqual(ok.lines[0].qty, 6);

  // Zero-quantity cells are skipped, not rejected — the grid posts every row.
  const mixed = planLines("reserve", rows, [{ itemId: "11", qty: 6 }, { itemId: "22", qty: 0 }]);
  assert.strictEqual(mixed.lines.length, 1, "untouched rows are ignored");
  assert.deepStrictEqual(mixed.errors, []);

  // Over the cap → a message that says what is available.
  const over = planLines("reserve", rows, [{ itemId: "11", qty: 7 }]);
  assert.strictEqual(over.lines.length, 0);
  assert.match(over.errors[0], /only 6 can be reserved/);

  // Every problem is reported at once, not one at a time.
  const many = planLines("reserve", rows, [{ itemId: "11", qty: 99 }, { itemId: "22", qty: 5 }]);
  assert.strictEqual(many.errors.length, 2, "all problems come back together");

  // Issue is capped by what is reserved, and says how to fix it.
  const issue = planLines("issue", rows, [{ itemId: "11", qty: 5 }]);
  assert.match(issue.errors[0], /reserve 3 more first/);
  assert.deepStrictEqual(planLines("issue", rows, [{ itemId: "11", qty: 2 }]).errors, []);

  // Return is capped by issued net of returns.
  assert.deepStrictEqual(planLines("return", rows, [{ itemId: "11", qty: 1 }]).errors, []);
  assert.match(planLines("return", rows, [{ itemId: "11", qty: 2 }]).errors[0], /only 1 has been issued/);

  // Guards.
  assert.match(planLines("reserve", rows, [{ itemId: "99", qty: 1 }]).errors[0], /not on this work order's BOM/);
  assert.match(planLines("teleport", rows, [{ itemId: "11", qty: 1 }]).errors[0], /Unknown transaction type/);
  assert.match(planLines("reserve", rows, []).errors[0], /at least one line/);
  assert.match(planLines("reserve", rows, [{ itemId: "11", qty: 1 }, { itemId: "11", qty: 1 }]).errors[0], /twice/);

  // Auto-return sweep (CR-031): reserved stock always goes back; issued only
  // when it exceeds the final requirement (a removed line has bom = 0).
  const sweep = sweepLines([
    gridRow({ rmItemId: "11", requiredQty: 10 }, { stockOnHand: 0 }, { reservedQty: 2, issuedQty: 1 }, {}),
    gridRow({ rmItemId: "22", requiredQty: 0 }, { stockOnHand: 0 }, { reservedQty: 3, issuedQty: 4, returnedQty: 1 }, {}),
    gridRow({ rmItemId: "33", requiredQty: 5 }, { stockOnHand: 9 }, {}, {}),
  ]);
  assert.deepStrictEqual(sweep.dereserve, [{ itemId: "11", qty: 2 }, { itemId: "22", qty: 3 }]);
  assert.deepStrictEqual(sweep.return, [{ itemId: "22", qty: 3 }], "removed line: issued 4 − returned 1 − bom 0 = 3 back");
  assert.deepStrictEqual(sweepLines([]), { dereserve: [], return: [] }, "nothing committed → nothing to sweep");

  console.log("workorder/txn.js self-check passed");
}
