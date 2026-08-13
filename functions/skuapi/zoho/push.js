"use strict";
const { isConfigured } = require("./auth");
const { createItem, updateItem, findItemByName, getItem } = require("./booksApi");
const { buildZohoCustomFields } = require("../itemValues");
const { rowList, out, orgClause, zStr } = require("../store");

// Books says the linked item no longer exists (deleted in Books):
// GET → code 1002 (HTTP 404), PUT → code 2006 (HTTP 400). A stale link must
// fall through to re-create, not error out — otherwise the push "succeeds"
// while nothing appears in Books.
const isGone = (e) => e.zohoCode === 1002 || e.zohoCode === 2006;

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
    try {
      return await updateItem(catalyst, item.zohoItemId, item.name, item.sku, description, customFields);
    } catch (e) {
      if (!isGone(e)) throw e; // stale link: item was deleted in Books → re-create below
    }
  }
  const zohoItem = await createItem(catalyst, item.name, item.sku, description, customFields);
  if (zohoItem && zohoItem.item_id) {
    await catalyst.datastore().table("SKUItem").updateRow({ ROWID: item.id, zohoItemId: String(zohoItem.item_id) });
  }
  return zohoItem;
}

/**
 * Best-effort create/link of a PropertyValue as a standalone Books item.
 * `value` is the API-shaped row (value.id = ROWID). No SKU is sent — value codes
 * are short and collide across properties — so the Books item is name-only.
 * Dedupes before creating: (a) already linked → update; (b) a sibling value with
 * the same name already made the item → reuse; (c) an item with that name exists
 * in Books → link; (d) otherwise create. Writes the resolved item_id back.
 * Returns null (no-op) until Zoho is configured.
 */
async function pushValueToZoho(catalyst, value) {
  if (!isConfigured()) {
    console.log("[Zoho] value push skipped (not configured) —", value.displayValue);
    return null;
  }
  const name = value.displayValue;
  const description = value.description || undefined;

  // (a) already linked → keep Books in sync; a dead link falls through to re-create
  if (value.zohoItemId) {
    try {
      return await updateItem(catalyst, value.zohoItemId, name, undefined, description, []);
    } catch (e) {
      if (!isGone(e)) throw e;
      value.zohoItemId = null;
    }
  }

  // (b) a sibling value of this org with the same name already created the item.
  // The twin's link can be just as stale, so verify the item still exists.
  const twins = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT zohoItemId FROM PropertyValue WHERE displayValue = ${zStr(name)} AND zohoItemId IS NOT NULL AND ${orgClause(catalyst)} LIMIT 1`,
    ),
  ).map(out);
  let zohoItemId = twins.length ? String(twins[0].zohoItemId) : null;
  if (zohoItemId) {
    try {
      await getItem(catalyst, zohoItemId);
    } catch (e) {
      if (!isGone(e)) throw e;
      zohoItemId = null;
    }
  }

  // (c) an item with this exact name already exists in Books → link it
  if (!zohoItemId) {
    const existing = await findItemByName(catalyst, name);
    if (existing && existing.item_id) zohoItemId = String(existing.item_id);
  }

  // (d) nothing found → create it
  if (!zohoItemId) {
    const zohoItem = await createItem(catalyst, name, undefined, description, []);
    if (zohoItem && zohoItem.item_id) zohoItemId = String(zohoItem.item_id);
  }

  if (zohoItemId) {
    await catalyst.datastore().table("PropertyValue").updateRow({ ROWID: value.id, zohoItemId });
  }
  return zohoItemId ? { item_id: zohoItemId } : null;
}

module.exports = { pushToZoho, pushValueToZoho };
