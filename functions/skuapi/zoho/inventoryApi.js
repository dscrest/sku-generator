"use strict";

/** Zoho Inventory v1 calls for the work-order / reserve add-ons (needs ZohoInventory scope). */
const { apiRequest } = require("./booksApi");

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

async function listWarehouses(catalyst) {
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
 * lines: [{ rmItemId, qty }]
 */
async function createTransferOrder(catalyst, { date, fromWarehouseId, toWarehouseId, lines, reason }) {
  const data = await apiRequest(catalyst, "POST", "/transferorders", {
    date,
    from_warehouse_id: String(fromWarehouseId),
    to_warehouse_id: String(toWarehouseId),
    // Not in transit: the move is immediate, so stock lands in the destination
    // warehouse as soon as the action is confirmed.
    is_intransit_order: false,
    reason: reason || undefined,
    line_items: lines.map((l) => ({ item_id: String(l.rmItemId), quantity: Number(l.qty) || 0 })),
  }, "inventory");
  return data.transfer_order;
}

async function getTransferOrder(catalyst, transferOrderId) {
  const data = await apiRequest(catalyst, "GET", `/transferorders/${transferOrderId}`, null, "inventory");
  return data.transfer_order;
}

module.exports = {
  getCompositeItem, updateCompositeItem, listWarehouses, getItemStock,
  listItemsWithStock, createTransferOrder, getTransferOrder,
};
