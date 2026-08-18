"use strict";

/** Zoho Inventory v1 calls for the work-order / reserve add-ons (needs ZohoInventory scope). */
const { apiRequest, getStockAccountId, buildItemCfs } = require("./booksApi");

// BOM: composite_item.mapped_items[] = { item_id, name, sku, quantity }
async function getCompositeItem(catalyst, itemId) {
  const data = await apiRequest(catalyst, "GET", `/compositeitems/${itemId}`, null, "inventory");
  return data.composite_item;
}

async function updateCompositeItem(catalyst, itemId, mappedItems) {
  const data = await apiRequest(catalyst, "PUT", `/compositeitems/${itemId}`, {
    mapped_items: mappedItems.map((m) => ({ item_id: String(m.rmItemId), quantity: Number(m.perUnitQty) || 0 })),
  }, "inventory");
  return data.composite_item;
}

// Every composite item in the org — the global BOM page's grid (CR-028).
async function listCompositeItems(catalyst) {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await apiRequest(catalyst, "GET", `/compositeitems?page=${page}&per_page=200`, null, "inventory");
    items.push(...(data.composite_items || []));
    if (!data.page_context || !data.page_context.has_more_page) break;
    page++;
  }
  return items;
}

// Zoho requires the composite to be inventory-tracked (code 13084 otherwise):
// item_type "inventory" + a stock account. A composite is a finished good, so
// prefer the org's "Finished Goods" account, falling back to the Books default
// "Inventory Asset". Anything else the org demands surfaces verbatim.
// description/customFields are optional (CR-029 Manufacturing push sends them;
// the work-order BOM screens don't) — a composite is a finished good, so it
// gets the same defaults as booksApi.createItem: descriptions in both boxes,
// default CFs, rate 0, Taxable, serial tracking, FIFO.
async function createCompositeItem(catalyst, { name, sku, description, customFields, mappedItems }) {
  const inventoryAccountId = (await getStockAccountId(catalyst, "finished goods"))
    || (await getStockAccountId(catalyst, "inventory asset"));
  const data = await apiRequest(catalyst, "POST", "/compositeitems", {
    name,
    sku: sku || undefined,
    description: description || undefined,
    purchase_description: description || undefined,
    unit: "pcs",
    item_type: "inventory",
    product_type: "goods",
    rate: 0,
    is_taxable: true,
    track_serial_number: true,
    inventory_valuation_method: "fifo",
    inventory_account_id: inventoryAccountId || undefined,
    custom_fields: customFields ? await buildItemCfs(catalyst, customFields) : undefined,
    mapped_items: (mappedItems || []).map((m) => ({ item_id: String(m.rmItemId), quantity: Number(m.perUnitQty) || 0 })),
  }, "inventory");
  return data.composite_item;
}

// Top-level field update (name/sku/descriptions/custom_fields) WITHOUT
// mapped_items — a re-push must never clobber a BOM refined on the Composite
// BOM page. Custom fields are normalized here; everything else passes through.
async function updateCompositeItemFields(catalyst, itemId, body) {
  if (body.custom_fields) body = { ...body, custom_fields: await buildItemCfs(catalyst, body.custom_fields) };
  const data = await apiRequest(catalyst, "PUT", `/compositeitems/${itemId}`, body, "inventory");
  return data.composite_item;
}

/**
 * Orgs with Books "Locations" enabled keep branches (e.g. a head office) out of
 * the legacy /warehouses payload — only warehouse-type entries come back, so
 * the settings dropdown misses the locations that actually hold stock. Prefer
 * /locations and normalise to the warehouse shape callers already expect.
 */
async function listWarehouses(catalyst) {
  try {
    const data = await apiRequest(catalyst, "GET", "/locations", null, "books");
    const locs = (data.locations || []).filter((l) => l.status !== "inactive");
    if (locs.length) {
      return locs.map((l) => ({
        warehouse_id: String(l.location_id),
        warehouse_name: `${l.location_name}${l.type === "warehouse" ? " (Warehouse)" : ""}`,
        is_primary_warehouse: Boolean(l.is_primary),
      }));
    }
  } catch { /* org without Locations — fall through to the legacy endpoint */ }
  const data = await apiRequest(catalyst, "GET", "/warehouses", null, "inventory");
  return data.warehouses || [];
}

// Item detail incl. stock_on_hand and per-warehouse warehouses[] breakdown.
async function getItemStock(catalyst, itemId) {
  const data = await apiRequest(catalyst, "GET", `/items/${itemId}`, null, "inventory");
  return data.item;
}

/**
 * Bulk stock read for the nightly reconcile: 200 items per call instead of one
 * call per item. `warehouses[]` is present on the list payload for
 * inventory-enabled orgs; callers fall back to the org total when it is not.
 */
async function listItemsWithStock(catalyst) {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await apiRequest(catalyst, "GET", `/items?page=${page}&per_page=200`, null, "inventory");
    items.push(...(data.items || []));
    if (!data.page_context || !data.page_context.has_more_page) break;
    page++;
  }
  return items;
}

// ---- writes ---------------------------------------------------------------

/**
 * The document every material movement writes (BRD §6.2–6.5): a Transfer Order
 * between two warehouses. Reserve = Main→Reserve, de-reserve = Reserve→Main,
 * issue = Reserve→Issue, return = Issue→Main — the caller supplies the pair.
 *
 * lines: [{ rmItemId, qty, name }]
 */
async function createTransferOrder(catalyst, { date, fromWarehouseId, toWarehouseId, lines, reason }) {
  const data = await apiRequest(catalyst, "POST", "/transferorders", {
    date,
    // Location ids are the required pair (warehouse ids are the legacy alias);
    // our OrgSetting values come from /locations, so they are location ids.
    from_location_id: String(fromWarehouseId),
    to_location_id: String(toWarehouseId),
    // Not in transit: the move is immediate, so stock lands in the destination
    // location as soon as the action is confirmed.
    is_intransit_order: false,
    description: reason || undefined,
    // name and quantity_transfer are the documented required line fields —
    // plain `quantity` is ignored and `name` missing is rejected (code 4).
    line_items: lines.map((l) => ({
      item_id: String(l.rmItemId),
      name: l.name || String(l.rmItemId),
      quantity_transfer: Number(l.qty) || 0,
    })),
  }, "inventory");
  return data.transfer_order;
}

async function getTransferOrder(catalyst, transferOrderId) {
  const data = await apiRequest(catalyst, "GET", `/transferorders/${transferOrderId}`, null, "inventory");
  return data.transfer_order;
}

module.exports = {
  getCompositeItem, updateCompositeItem, updateCompositeItemFields, listCompositeItems, createCompositeItem,
  listWarehouses, getItemStock, listItemsWithStock, createTransferOrder, getTransferOrder,
};
