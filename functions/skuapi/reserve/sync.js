"use strict";

/**
 * Stock snapshot sync: pulls B/E/F/G numbers from Zoho into ItemStockSnapshot.
 * Only items a reserve grid has referenced are synced — never the full catalog.
 * Sequential with small delays: Zoho allows ~100 req/min/org.
 */
const { rowList, zStr } = require("../store");
const { dsDate } = require("../zoho/auth");
const { listPurchaseOrdersForItem, getPurchaseOrder } = require("../zoho/booksApi");
const { getItemStock } = require("../zoho/inventoryApi");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DELAY_MS = 150;

// Org-total snapshot rows for a set of item ids -> Map(itemId -> row).
async function snapshotRows(catalyst, orgId, itemIds) {
  if (!itemIds.length) return new Map();
  const inList = itemIds.map(zStr).join(",");
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT * FROM ItemStockSnapshot WHERE orgId = ${zStr(orgId)} AND itemId IN (${inList})`,
    ),
  );
  return new Map(rows.map((r) => [String(r.itemId), r]));
}

// Fetch live numbers for one item. E/F/G default to open-PO ordered/received/
// billed line quantities — exact definitions pending (RESERVE-TASKS.md item 4).
async function fetchItemNumbers(catalyst, itemId) {
  const item = await getItemStock(catalyst, itemId);
  let poQty = 0;
  let receivedQty = 0;
  let billedQty = 0;
  const pos = await listPurchaseOrdersForItem(catalyst, itemId);
  for (const po of pos) {
    if (["cancelled", "draft"].includes(po.status)) continue;
    await sleep(DELAY_MS);
    const detail = await getPurchaseOrder(catalyst, po.purchaseorder_id);
    for (const line of detail.line_items || []) {
      if (String(line.item_id) !== String(itemId)) continue;
      poQty += Number(line.quantity) || 0;
      receivedQty += Number(line.quantity_received) || 0;
      billedQty += Number(line.quantity_billed) || 0;
    }
  }
  return {
    stockOnHand: Number(item.stock_on_hand) || 0,
    poQty,
    receivedQty,
    billedQty,
  };
}

// Sync the given items for an org (upsert org-total rows). Returns the fresh
// Map(itemId -> snapshot fields).
async function syncItems(catalyst, orgId, itemIds) {
  const existing = await snapshotRows(catalyst, orgId, itemIds);
  const table = catalyst.datastore().table("ItemStockSnapshot");
  const out = new Map();
  for (const itemId of itemIds) {
    const nums = await fetchItemNumbers(catalyst, itemId);
    const fields = { orgId, itemId: String(itemId), ...nums, syncedAt: dsDate(Date.now()) };
    const prev = existing.get(String(itemId));
    if (prev) {
      await table.updateRow({ ROWID: prev.ROWID, ...fields });
    } else {
      await table.insertRow(fields);
    }
    out.set(String(itemId), fields);
    await sleep(DELAY_MS);
  }
  return out;
}

// Refresh every item this org's grids have ever referenced.
async function syncOrgStock(catalyst, orgId) {
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(`SELECT itemId FROM ItemStockSnapshot WHERE orgId = ${zStr(orgId)}`),
  );
  const itemIds = [...new Set(rows.map((r) => String(r.itemId)))];
  await syncItems(catalyst, orgId, itemIds);
  return itemIds.length;
}

// Cron entry: every org with the reserve add-on enabled, using that org's
// most-recently-active user token. ponytail: if that user disconnects, the
// org's sync silently stops until someone reconnects — org-level service
// token is the upgrade path.
async function syncAllOrgs(catalyst) {
  const addonRows = rowList(
    await catalyst.zcql().executeZCQLQuery(`SELECT orgId, enabled FROM OrgAddon WHERE addonKey = 'reserve'`),
  );
  const orgIds = [...new Set(addonRows.filter((r) => r.enabled === true || r.enabled === "true").map((r) => String(r.orgId)))];
  const synced = {};
  for (const orgId of orgIds) {
    const tokens = rowList(
      await catalyst.zcql().executeZCQLQuery(
        `SELECT userId FROM ZohoToken WHERE orgId = ${zStr(orgId)} ORDER BY MODIFIEDTIME DESC LIMIT 1`,
      ),
    );
    if (!tokens.length) continue;
    catalyst.__userId = String(tokens[0].userId);
    catalyst.__orgId = orgId;
    try {
      synced[orgId] = await syncOrgStock(catalyst, orgId);
    } catch (err) {
      synced[orgId] = `error: ${err.message}`;
    }
  }
  return { orgs: orgIds.length, synced };
}

module.exports = { snapshotRows, syncItems, syncOrgStock, syncAllOrgs };
