"use strict";
const { isConfigured } = require("./auth");
const { createItem, updateItem } = require("./booksApi");
const { buildZohoCustomFields } = require("../itemValues");

/**
 * Best-effort push of a SKU item to Zoho Books. No-op (returns null) until Zoho
 * credentials are configured. `item` is the API-shaped row (item.id = ROWID).
 * Property values whose Property has a zohoCfApiName are pushed into the matching
 * Books custom fields.
 */
async function pushToZoho(catalyst, item, description) {
  if (!isConfigured()) {
    console.log("[Zoho] skipped (not configured) — sku:", item.sku);
    return null;
  }
  const customFields = await buildZohoCustomFields(catalyst, item.id);
  if (item.zohoItemId) {
    return updateItem(catalyst, item.zohoItemId, item.name, item.sku, description, customFields);
  }
  const zohoItem = await createItem(catalyst, item.name, item.sku, description, customFields);
  if (zohoItem && zohoItem.item_id) {
    await catalyst.datastore().table("SKUItem").updateRow({ ROWID: item.id, zohoItemId: String(zohoItem.item_id) });
  }
  return zohoItem;
}

module.exports = { pushToZoho };
