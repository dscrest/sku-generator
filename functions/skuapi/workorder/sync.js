"use strict";

/**
 * Keeping the read model fresh — the whole API-budget story lives here.
 *
 *   1. Write-through (txn.js / purchase.js) — free, and covers everything we do.
 *   2. Webhooks (handleZohoEvent) — Books workflow rules push the changes other
 *      people make. Near-real-time, one small call each.
 *   3. This reconcile — the safety net, because webhook delivery is not
 *      guaranteed and workflow rules can be switched off in the client's console.
 *
 * The reconcile is bounded by *open work orders*, never by catalog size:
 *   - stock: one bulk page per 200 items, filtered to the working set
 *   - purchase orders: only the POs our own purchase requests created, and only
 *     while they are unsettled
 *   - composite items: only the finished goods on open work orders
 */
const { rowList, zStr } = require("../store");
const { dsDate } = require("../zoho/auth");
const { getItemStock } = require("../zoho/inventoryApi");
const { byOrg, inList, warehouses, logActivity } = require("./store");
const { refreshPurchaseOrders } = require("./purchase");
const { refreshComposite } = require("./bom");

const n = (v) => Number(v) || 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DELAY_MS = 150; // Zoho allows ~100 req/min/org
const OPEN_WO = ["Closed", "Cancelled"];

// The only items worth syncing: raw materials on work orders still in play.
async function workingSet(catalyst, orgId) {
  const wos = await byOrg(catalyst, orgId, "WorkOrder");
  const open = wos.filter((w) => !OPEN_WO.includes(String(w.status)));
  const ids = inList(open.map((w) => w.ROWID));
  if (!ids) return { itemIds: [], fgItemIds: [], workOrders: [] };
  const [lines, fgs] = await Promise.all([
    byOrg(catalyst, orgId, "WorkOrderLine", `workOrderId IN (${ids})`),
    byOrg(catalyst, orgId, "WorkOrderFG", `workOrderId IN (${ids})`),
  ]);
  return {
    itemIds: [...new Set(lines.map((l) => String(l.rmItemId)))],
    fgItemIds: [...new Set(fgs.map((f) => String(f.fgItemId)))],
    workOrders: open,
  };
}

/**
 * Upsert one item's stock rows: the org total plus a row per warehouse when
 * Zoho gives us the breakdown. Column B reads the Main-warehouse row.
 */
async function writeStock(catalyst, orgId, item, source) {
  const table = catalyst.datastore().table("ItemStockSnapshot");
  const itemId = String(item.item_id);
  const existing = await byOrg(catalyst, orgId, "ItemStockSnapshot", `itemId = ${zStr(itemId)}`);
  const byWarehouse = new Map(existing.map((r) => [String(r.warehouseId || ""), r]));

  // Locations-enabled orgs report the breakdown as locations[] with location_*
  // field names; legacy orgs as warehouses[] with warehouse_* names.
  const pick = (...vs) => vs.find((v) => v !== undefined);
  const targets = [{ warehouseId: "", stockOnHand: n(item.stock_on_hand), availableStock: n(item.available_stock) }];
  for (const w of [...(item.warehouses || []), ...(item.locations || [])]) {
    targets.push({
      warehouseId: String(pick(w.warehouse_id, w.location_id)),
      stockOnHand: n(pick(w.warehouse_stock_on_hand, w.location_stock_on_hand, w.stock_on_hand)),
      availableStock: n(pick(w.warehouse_available_stock, w.location_available_stock, w.available_stock)),
    });
  }

  for (const t of targets) {
    const prev = byWarehouse.get(t.warehouseId);
    const fields = {
      orgId: String(orgId), itemId, warehouseId: t.warehouseId,
      stockOnHand: t.stockOnHand, availableStock: t.availableStock,
      source, syncedAt: dsDate(Date.now()),
    };
    if (prev) await table.updateRow({ ROWID: prev.ROWID, ...fields });
    else await table.insertRow({ ...fields, poQty: 0, receivedQty: 0, billedQty: 0 });
  }
}

/**
 * One org's nightly reconcile. Returns a count of everything touched so the
 * cron log shows the call cost at a glance.
 */
async function reconcileOrg(catalyst, orgId) {
  const { itemIds, fgItemIds } = await workingSet(catalyst, orgId);
  const result = { items: 0, purchaseOrders: 0, compositeItems: 0 };
  if (!itemIds.length) return result;

  // One detail call per working-set item, not the bulk /items sweep: on
  // Locations-enabled orgs the bulk payload reports stock_on_hand 0 with no
  // per-location breakdown, and only the item detail carries locations[].
  // The working set is bounded by open work orders, so this stays cheap.
  for (const itemId of itemIds) {
    try {
      await writeStock(catalyst, orgId, await getItemStock(catalyst, itemId), "cron");
      result.items++;
    } catch (err) {
      console.error(`item ${itemId} stock refresh failed:`, err && err.message);
    }
    await sleep(DELAY_MS);
  }

  const po = await refreshPurchaseOrders(catalyst, orgId);
  result.purchaseOrders = po.purchaseOrders;

  for (const fgItemId of fgItemIds) {
    try {
      await refreshComposite(catalyst, orgId, fgItemId);
      result.compositeItems++;
    } catch (err) {
      console.error(`composite ${fgItemId} refresh failed:`, err && err.message);
    }
    await sleep(DELAY_MS);
  }
  return result;
}

/**
 * Cron entry: every org with the work-order add-on, using that org's
 * most-recently-active user token.
 * ponytail: if that user disconnects, the org's reconcile stops silently until
 * someone reconnects — an org-level service token is the upgrade path.
 */
/**
 * Borrow an org's most-recently-active user token and pin it on the request's
 * catalyst instance, so a session-less call (cron, webhook) can reach Zoho.
 * Returns the userId, or null when nobody in that org is connected.
 */
async function tokenForOrg(catalyst, orgId) {
  const tokens = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT userId FROM ZohoToken WHERE orgId = ${zStr(String(orgId))} ORDER BY MODIFIEDTIME DESC LIMIT 1`,
    ),
  );
  if (!tokens.length) return null;
  catalyst.__userId = String(tokens[0].userId);
  catalyst.__orgId = String(orgId);
  delete catalyst.__woSettings;
  return String(tokens[0].userId);
}

async function reconcileAllOrgs(catalyst) {
  const addonRows = rowList(
    await catalyst.zcql().executeZCQLQuery(`SELECT orgId, enabled FROM OrgAddon WHERE addonKey = 'work-order'`),
  );
  const orgIds = [...new Set(
    addonRows.filter((r) => r.enabled === true || r.enabled === "true").map((r) => String(r.orgId)),
  )];
  const synced = {};
  for (const orgId of orgIds) {
    if (!(await tokenForOrg(catalyst, orgId))) { synced[orgId] = "no connected user"; continue; }
    try {
      synced[orgId] = await reconcileOrg(catalyst, orgId);
    } catch (err) {
      synced[orgId] = `error: ${err.message}`;
    }
  }
  return { orgs: orgIds.length, synced };
}

// ---- webhook sink ---------------------------------------------------------

/**
 * Books workflow rules POST here. The rule's URL carries `?type=…&orgId=…`
 * (the setup procedure is in WORKORDER.md) because Books payloads do not carry
 * a consistent envelope. Unknown types are acknowledged, not rejected — a
 * client adding a rule we do not handle must never see failures in their
 * Books console.
 */
async function handleZohoEvent(catalyst, orgId, type, body) {
  catalyst.__orgId = String(orgId);
  const kind = String(type || "").toLowerCase();

  if (kind === "purchaseorder" || kind === "bill" || kind === "purchasereceive") {
    const poId = body && (body.purchaseorder_id ||
      (body.purchaseorder && body.purchaseorder.purchaseorder_id));
    const res = await refreshPurchaseOrders(catalyst, orgId, poId ? { poIds: [String(poId)] } : undefined);
    await logActivity(catalyst, orgId, "PurchaseOrder", String(poId || "*"), `webhook.${kind}`, null, res);
    return { handled: kind, ...res };
  }

  if (kind === "item") {
    const itemId = body && (body.item_id || (body.item && body.item.item_id));
    if (!itemId) return { handled: kind, skipped: "no item_id in payload" };
    const item = await getItemStock(catalyst, itemId);
    await writeStock(catalyst, orgId, item, "webhook");
    return { handled: kind, itemId: String(itemId) };
  }

  if (kind === "compositeitem") {
    const itemId = body && (body.composite_item_id ||
      (body.composite_item && body.composite_item.composite_item_id) || body.item_id);
    if (!itemId) return { handled: kind, skipped: "no composite item id in payload" };
    await refreshComposite(catalyst, orgId, itemId);
    // The frozen WorkOrderLine snapshot is deliberately untouched — a composite
    // edit surfaces as a diff on the BOM tab, it does not rewrite live work orders.
    await logActivity(catalyst, orgId, "CompositeItem", String(itemId), "webhook.compositeitem", null, null);
    return { handled: kind, fgItemId: String(itemId) };
  }

  if (kind === "salesorder") {
    const soId = body && (body.salesorder_id || (body.salesorder && body.salesorder.salesorder_id));
    // Order changes (BRD FR-ADO-005) are flagged for the planner rather than
    // applied: quantity changes have to be re-costed and re-reserved by a human.
    const wos = soId
      ? await byOrg(catalyst, orgId, "WorkOrder", `salesOrderId = ${zStr(String(soId))}`)
      : [];
    for (const wo of wos) {
      await logActivity(catalyst, orgId, "WorkOrder", wo.ROWID, "webhook.salesorder.changed", null, { soId });
    }
    return { handled: kind, workOrdersFlagged: wos.length };
  }

  return { handled: false, type: kind };
}

/** Warehouse list for the settings screen (the one place that needs it live). */
async function warehouseOptions(catalyst) {
  const { listWarehouses } = require("../zoho/inventoryApi");
  const list = await listWarehouses(catalyst);
  return list.map((w) => ({
    id: String(w.warehouse_id),
    name: w.warehouse_name,
    isPrimary: Boolean(w.is_primary_warehouse),
  }));
}

module.exports = {
  OPEN_WO, workingSet, writeStock, reconcileOrg, reconcileAllOrgs, tokenForOrg,
  handleZohoEvent, warehouseOptions, warehouses,
};
