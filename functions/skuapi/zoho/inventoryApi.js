"use strict";

/** Zoho Inventory v1 reads for the reserve add-on (needs ZohoInventory scope). */
const { apiRequest } = require("./booksApi");

// BOM: composite_item.mapped_items[] = { item_id, name, sku, quantity }
async function getCompositeItem(catalyst, itemId) {
  const data = await apiRequest(catalyst, "GET", `/compositeitems/${itemId}`, null, "inventory");
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

// ---- Phase 4 writes (document mapping pending — RESERVE-TASKS.md open item 1) ----
function pendingWrite(name) {
  return async () => {
    const err = new Error(`${name}: Zoho document mapping pending — see RESERVE-TASKS.md`);
    err.status = 501;
    throw err;
  };
}
const createTransferOrder = pendingWrite("createTransferOrder");       // POST /inventory/v1/transferorders
const createInventoryAdjustment = pendingWrite("createInventoryAdjustment"); // POST /inventory/v1/inventoryadjustments

module.exports = { getCompositeItem, listWarehouses, getItemStock, createTransferOrder, createInventoryAdjustment };
