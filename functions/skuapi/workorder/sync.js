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
const { getItemStock, listItemsWithStock } = require("../zoho/inventoryApi");
const { byOrg, inList, warehouses, logActivity, setSetting } = require("./store");
const { refreshPurchaseOrders } = require("./purchase");
const { refreshComposite } = require("./bom");

const n = (v) => Number(v) || 0;
const OPEN_WO = ["Closed", "Cancelled"];

// Run `fn` over `items` at most `limit` at a time. The reconcile is bounded by
// Catalyst's 30s function ceiling, so per-item Zoho calls must overlap instead
// of running serially — a single sequential sweep of a few hundred items times
// out (408). limit 6 keeps ~6 concurrent Zoho calls: fast enough to finish well
// inside 30s, gentle enough not to trip the org rate limit for a short burst.
// The full catalog sweep no longer relies on one request fitting the ceiling —
// reconcileOrg pages it via offset/limit (see below).
async function mapLimit(items, limit, fn) {
  const it = items[Symbol.iterator]();
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let x = it.next(); !x.done; x = it.next()) await fn(x.value);
  });
  await Promise.all(workers);
}

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
// Pure: shape a Zoho item payload into stock rows — index 0 is the org total
// (warehouseId ""), then one row per warehouse/location. Locations-enabled orgs
// report the breakdown as locations[] with location_* field names; legacy orgs
// as warehouses[] with warehouse_* names.
function stockTargets(item) {
  const pick = (...vs) => vs.find((v) => v !== undefined);
  const targets = [{ warehouseId: "", stockOnHand: n(item.stock_on_hand), availableStock: n(item.available_stock) }];
  for (const w of [...(item.warehouses || []), ...(item.locations || [])]) {
    targets.push({
      warehouseId: String(pick(w.warehouse_id, w.location_id)),
      stockOnHand: n(pick(w.warehouse_stock_on_hand, w.location_stock_on_hand, w.stock_on_hand)),
      availableStock: n(pick(w.warehouse_available_stock, w.location_available_stock, w.available_stock)),
    });
  }
  return targets;
}

async function writeStock(catalyst, orgId, item, source) {
  const table = catalyst.datastore().table("ItemStockSnapshot");
  const itemId = String(item.item_id);
  const existing = await byOrg(catalyst, orgId, "ItemStockSnapshot", `itemId = ${zStr(itemId)}`);
  const byWarehouse = new Map(existing.map((r) => [String(r.warehouseId || ""), r]));

  const targets = stockTargets(item);

  for (const t of targets) {
    const prev = byWarehouse.get(t.warehouseId);
    const fields = {
      orgId: String(orgId), itemId, warehouseId: t.warehouseId,
      itemName: item.name || "", sku: item.sku || "",
      stockOnHand: t.stockOnHand, availableStock: t.availableStock,
      source, syncedAt: dsDate(Date.now()),
    };
    if (prev) await table.updateRow({ ROWID: prev.ROWID, ...fields });
    else await table.insertRow({ ...fields, poQty: 0, receivedQty: 0, billedQty: 0 });
  }

  // Drop per-warehouse rows this payload no longer carries — else a location
  // that emptied out (or an old breakdown Zoho stopped returning) leaves a stale
  // row behind. Only when the payload HAS a breakdown: a total-only payload
  // (bulk list) says nothing about warehouses, and pruning on it deletes the
  // Main-warehouse baseline the grid and the TO write-through depend on — that
  // is how WO-0008 showed In stock −2 (write-through rebuilt Main from 0).
  if (targets.length > 1) {
    const keep = new Set(targets.map((t) => t.warehouseId));
    for (const r of existing) {
      if (!keep.has(String(r.warehouseId || ""))) await table.deleteRow(r.ROWID);
    }
  }
}

// Per-org delta cursor: the newest Zoho last_modified_time an incremental full
// sweep has caught up to. Stored in the generic OrgSetting key/value table (no
// schema change). Read directly so it never leaks into the /settings response.
async function getStockCursor(catalyst, orgId) {
  const rows = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT settingValue FROM OrgSetting WHERE orgId = ${zStr(String(orgId))} AND settingKey = 'stockSyncCursor'`,
  ));
  return rows.length && rows[0].settingValue ? String(rows[0].settingValue) : null;
}
const newestLmt = (bulk) => {
  let max = null;
  for (const it of bulk.values()) {
    const lmt = it.last_modified_time;
    if (lmt && (!max || new Date(lmt).getTime() > new Date(max).getTime())) max = lmt;
  }
  return max;
};

/**
 * One org's nightly reconcile. Returns a count of everything touched so the
 * cron log shows the call cost at a glance.
 */
// full: sweep the whole catalog instead of just open work orders' items — the
// "Sync all stock" path so a Zoho adjustment / opening stock on any item lands
// immediately, even when the item is on no open WO. full skips the PO/composite
// refresh (it only needs stock), so it stays a stock-only pull.
//
// A full sweep of a Locations-enabled org needs one item-detail call PER item
// (the bulk list reports stock_on_hand 0 with no per-location breakdown). To
// keep that affordable it runs incrementally: a per-org cursor (newest Zoho
// last_modified_time) means a normal sync only pulls items changed since — five
// changed items cost ~five calls, not the whole catalog. First run (no cursor)
// and `force` do the full sweep, which is paged (`limit` → items[offset..+limit],
// returns `{ total, nextOffset, done }`) so each request clears the 30s ceiling;
// the cursor is advanced once a sweep completes.
async function reconcileOrg(catalyst, orgId, { full = false, force = false, offset = 0, limit = null } = {}) {
  const ws = full ? { itemIds: [], fgItemIds: [] } : await workingSet(catalyst, orgId);
  const result = { items: 0, purchaseOrders: 0, compositeItems: 0 };
  if (!full && !ws.itemIds.length) return result;

  // Incremental only when full, not forced, and a cursor exists. The delta is
  // small, so it is processed whole (no paging); a full/forced sweep still pages.
  const cursor = full && !force ? await getStockCursor(catalyst, orgId) : null;

  // Bulk /items sweep first (200 per call), then a per-item detail call only
  // where the bulk payload is ambiguous: Locations-enabled orgs report
  // stock_on_hand 0 there with no per-location breakdown — only the item
  // detail carries locations[]. Everything the bulk row answers costs zero
  // extra calls and zero rate-limit sleeps.
  const wanted = full ? null : new Set(ws.itemIds.map(String));
  let bulk = new Map();
  try {
    bulk = new Map(
      (await listItemsWithStock(catalyst, cursor ? { since: cursor } : undefined))
        .filter((i) => !wanted || wanted.has(String(i.item_id)))
        .map((i) => [String(i.item_id), i]),
    );
  } catch (err) {
    console.error("bulk stock list failed, falling back to per-item:", err && err.message);
  }
  const allIds = full ? [...bulk.keys()] : ws.itemIds;
  // Page only a full/forced sweep; the incremental delta is small enough to
  // finish in one request. total/nextOffset/done let the caller resume a sweep.
  const paged = full && !cursor && limit != null;
  const total = allIds.length;
  const itemIds = paged ? allIds.slice(offset, offset + limit) : allIds;
  const nextOffset = offset + itemIds.length;
  const fgItemIds = ws.fgItemIds;
  await mapLimit(itemIds, 6, async (itemId) => {
    const b = bulk.get(String(itemId));
    // Trust the bulk row only when it carries the per-warehouse breakdown —
    // writeStock needs it to keep the Main-warehouse row fresh. A bare total
    // (this org's bulk shape) forces the item-detail call.
    const trustworthy = b && ((b.warehouses || []).length || (b.locations || []).length);
    try {
      const item = trustworthy ? b : await getItemStock(catalyst, itemId);
      await writeStock(catalyst, orgId, item, "cron");
      result.items++;
    } catch (err) {
      console.error(`item ${itemId} stock refresh failed:`, err && err.message);
    }
  });

  // stock-only pull — skip PO/composite refresh; hand back paging cursor.
  if (full) {
    const done = paged ? nextOffset >= total : true;
    // Advance the cursor once the sweep is complete (whole delta, or last chunk),
    // so the next sync only pulls what changed after the newest item seen here.
    if (done) {
      const newest = newestLmt(bulk);
      if (newest) await setSetting(catalyst, orgId, "stockSyncCursor", newest);
    }
    return { ...result, total, nextOffset, done };
  }

  const po = await refreshPurchaseOrders(catalyst, orgId);
  result.purchaseOrders = po.purchaseOrders;

  await mapLimit(fgItemIds, 6, async (fgItemId) => {
    try {
      await refreshComposite(catalyst, orgId, fgItemId);
      result.compositeItems++;
    } catch (err) {
      console.error(`composite ${fgItemId} refresh failed:`, err && err.message);
    }
  });
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

/**
 * Instant "Sync now" for one item: pull its current stock straight from Zoho and
 * write it through, so a Zoho inventory adjustment / opening stock reflects in the
 * app immediately instead of waiting for the nightly reconcile.
 */
async function syncItem(catalyst, orgId, itemId) {
  const item = await getItemStock(catalyst, itemId);
  await writeStock(catalyst, orgId, item, "manual");
  // Return the org total plus the per-warehouse breakdown so the caller (the
  // per-item refresh in the report) can patch its row in place, no re-pull.
  const targets = stockTargets(item);
  return { itemId: String(itemId), stockOnHand: targets[0].stockOnHand, availableStock: targets[0].availableStock, warehouses: targets.slice(1) };
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
  OPEN_WO, workingSet, writeStock, stockTargets, reconcileOrg, reconcileAllOrgs, tokenForOrg,
  handleZohoEvent, warehouseOptions, warehouses, syncItem, mapLimit,
};
