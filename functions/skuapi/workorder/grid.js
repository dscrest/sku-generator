"use strict";

/**
 * Assembles the A–I grid for one work order FG.
 *
 * Every input is read from our own Data Store — the frozen BOM lines, the stock
 * snapshot, our reservation balances and our purchase-request lines. Opening a
 * work order therefore costs **zero** Zoho API calls; freshness comes from the
 * webhook sink and the nightly reconcile in sync.js. The one exception: an item
 * with no snapshot row at all is pulled live once (self-heal below) — otherwise
 * it reads as zero stock and every new work order opens with a false shortage.
 */
const { zStr } = require("../store");
const { gridRow } = require("./formulas");
const { byOrg, inList, warehouses } = require("./store");

const n = (v) => Number(v) || 0;

/**
 * Columns E / F / G per raw material: summed from the purchase-request lines of
 * this work order, not from the item-level snapshot. The BRD tracks PO against
 * the project, and it means the reconcile only ever refreshes POs we created.
 */
async function poSums(catalyst, orgId, workOrderId) {
  const prs = await byOrg(catalyst, orgId, "PurchaseRequest", `workOrderId = ${zStr(String(workOrderId))}`);
  const ids = inList(prs.filter((p) => p.status !== "Cancelled").map((p) => p.ROWID));
  const sums = new Map();
  if (!ids) return sums;
  const lines = await byOrg(catalyst, orgId, "PurchaseRequestLine", `purchaseRequestId IN (${ids})`);
  for (const l of lines) {
    if (!l.zohoPoId) continue; // not ordered yet — nothing is on order
    const key = String(l.rmItemId);
    const cur = sums.get(key) || { poQty: 0, receivedQty: 0, billedQty: 0 };
    cur.poQty += n(l.purchaseQty);
    cur.receivedQty += n(l.receivedQty);
    cur.billedQty += n(l.billedQty);
    sums.set(key, cur);
  }
  return sums;
}

/**
 * Column B per item. Reserving pulls from the Main warehouse, so that is the
 * stock that caps it — the org total would over-promise material sitting in
 * the Reserve or Issue warehouse. Falls back to the org-total row when no
 * per-warehouse row has been synced yet.
 */
async function stockMap(catalyst, orgId, itemIds, mainWarehouseId) {
  const ids = inList(itemIds);
  const map = new Map();
  if (!ids) return { map, lastSyncAt: null };
  const rows = await byOrg(catalyst, orgId, "ItemStockSnapshot", `itemId IN (${ids})`);
  let lastSyncAt = null;
  for (const r of rows) {
    const key = String(r.itemId);
    const isMain = mainWarehouseId && String(r.warehouseId) === String(mainWarehouseId);
    const isTotal = !r.warehouseId;
    if (!isMain && !isTotal) continue;
    // A per-warehouse row always beats the org total.
    const prev = map.get(key);
    if (!prev || (isMain && !prev.__main)) map.set(key, { stockOnHand: n(r.stockOnHand), __main: isMain });
    if (r.syncedAt && (!lastSyncAt || r.syncedAt > lastSyncAt)) lastSyncAt = r.syncedAt;
  }
  return { map, lastSyncAt };
}

// Our reservation balances (columns C / D) for one FG, keyed by item id.
async function balanceMap(catalyst, orgId, workOrderId, workOrderFgId) {
  const rows = await byOrg(
    catalyst, orgId, "ReservationLine",
    `workOrderId = ${zStr(String(workOrderId))} AND workOrderFgId = ${zStr(String(workOrderFgId))}`,
  );
  return new Map(rows.map((r) => [String(r.componentItemId), r]));
}

/**
 * The grid for one FG of one work order. `wo` and `fg` are the raw rows.
 * Returns rows in BOM order plus the banner metadata the page shows.
 */
async function buildGrid(catalyst, orgId, wo, fg) {
  const lines = await byOrg(
    catalyst, orgId, "WorkOrderLine",
    `workOrderId = ${zStr(String(wo.ROWID))} AND workOrderFgId = ${zStr(String(fg.ROWID))}`,
  );
  const itemIds = lines.map((l) => String(l.rmItemId));

  // Warehouses may not be configured yet — the BOM tab must still render, so a
  // missing map degrades column B to the org total rather than failing the page.
  let mainWarehouseId = null;
  try {
    mainWarehouseId = (await warehouses(catalyst, orgId)).main;
  } catch { /* not configured yet */ }

  const [{ map: stock, lastSyncAt }, balances, po] = await Promise.all([
    stockMap(catalyst, orgId, itemIds, mainWarehouseId),
    balanceMap(catalyst, orgId, wo.ROWID, fg.ROWID),
    poSums(catalyst, orgId, wo.ROWID),
  ]);

  // Self-heal: never-synced items read as zero stock → false shortage. Pull
  // them live once; the webhook/reconcile keeps them fresh from then on.
  const missing = [...new Set(itemIds.filter((id) => !stock.has(id)))];
  if (missing.length) {
    const { getItemStock } = require("../zoho/inventoryApi");
    const { writeStock } = require("./sync");
    for (const itemId of missing) {
      try {
        await writeStock(catalyst, orgId, await getItemStock(catalyst, itemId), "grid");
      } catch (err) {
        console.error(`stock self-heal ${itemId}:`, err && err.message);
      }
    }
    const healed = await stockMap(catalyst, orgId, missing, mainWarehouseId);
    for (const [k, v] of healed.map) stock.set(k, v);
  }

  const rows = lines.map((l) =>
    gridRow(l, stock.get(String(l.rmItemId)), balances.get(String(l.rmItemId)), po.get(String(l.rmItemId))),
  );

  return {
    workOrderId: String(wo.ROWID),
    workOrderFgId: String(fg.ROWID),
    fgItemId: String(fg.fgItemId),
    fgName: fg.fgName,
    fgQty: n(fg.fgQty),
    revision: n(wo.revision),
    lastSyncAt,
    warehousesConfigured: Boolean(mainWarehouseId),
    rows,
    // What the header banner and the shortfall badge need, without a second pass.
    shortCount: rows.filter((r) => r.short).length,
  };
}

// Row lookup for action validation — same numbers the user is looking at.
function indexRows(grid) {
  return new Map(grid.rows.map((r) => [String(r.itemId), r]));
}

module.exports = { buildGrid, indexRows, poSums, stockMap, balanceMap };
