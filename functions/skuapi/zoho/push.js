"use strict";
const { isConfigured } = require("./auth");
const { createItem, updateItem } = require("./booksApi");

/**
 * Best-effort push of a SKU item to Zoho Books. No-op (returns null) until Zoho
 * credentials are configured. `item` is the API-shaped row (item.id = ROWID).
 */
async function pushToZoho(catalyst, item, description) {
  if (!isConfigured()) {
    console.log("[Zoho] skipped (not configured) — sku:", item.sku);
    return null;
  }
  if (item.zohoItemId) {
    return updateItem(catalyst, item.zohoItemId, item.name, item.sku, description);
  }
  const zohoItem = await createItem(catalyst, item.name, item.sku, description);
  if (zohoItem && zohoItem.item_id) {
    await catalyst.datastore().table("SKUItem").updateRow({ ROWID: item.id, zohoItemId: String(zohoItem.item_id) });
  }
  return zohoItem;
}

module.exports = { pushToZoho };
