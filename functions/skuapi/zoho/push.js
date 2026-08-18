"use strict";
const { isConfigured } = require("./auth");
const { createItem, updateItem, findItemByName, getItem, deleteItem } = require("./booksApi");
const { createCompositeItem, updateCompositeItemFields } = require("./inventoryApi");
const { buildZohoCustomFields } = require("../itemValues");
const { rowList, out, orgClause, zStr, isActive, idOk } = require("../store");

// Books says the linked item no longer exists (deleted in Books):
// GET → code 1002 (HTTP 404), PUT → code 2006 (HTTP 400). Composite endpoints
// signal the same with a plain 404. A stale link must fall through to
// re-create, not error out — otherwise the push "succeeds" while nothing
// appears in Books.
const isGone = (e) => e.zohoCode === 1002 || e.zohoCode === 2006 || e.httpStatus === 404;

/**
 * Associated items for a Manufacturing composite (CR-029, spec §4/§11): the
 * selected values of every active property flagged createValuesAsItems, each
 * resolved to a live Books item via pushValueToZoho (which heals stale links,
 * reuses twins, links by name, or creates). Throws — failing the push — when a
 * flagged property has no usable selection or a value can't be resolved.
 * Quantity is always 1 (per-unit); the BOM is refined later on the BOM pages.
 */
async function buildAssociatedItems(catalyst, item) {
  const zcql = catalyst.zcql();
  const flagged = rowList(
    await zcql.executeZCQLQuery(`SELECT * FROM Property WHERE industryId = ${item.industryId} AND ${orgClause(catalyst)}`),
  ).map(out).filter(isActive).filter((p) => p.createValuesAsItems === true);
  if (!flagged.length) return [];

  const vals = rowList(
    await zcql.executeZCQLQuery(`SELECT * FROM SKUItemValue WHERE skuItemId = ${item.id} AND ${orgClause(catalyst)}`),
  ).map(out);
  const valByProp = Object.fromEntries(vals.map((v) => [String(v.propertyId), v]));

  // A flagged property needs a list-value selection (valueId) — a Range number
  // can never be a Books item, so it counts as missing too.
  const missing = flagged.filter((p) => !idOk((valByProp[String(p.id)] || {}).valueId));
  if (missing.length) {
    throw new Error(`Books-item properties missing a value: ${missing.map((p) => p.caption).join(", ")}`);
  }

  const mapped = [];
  for (const prop of flagged) {
    const sel = valByProp[String(prop.id)];
    const pvs = rowList(
      await zcql.executeZCQLQuery(`SELECT * FROM PropertyValue WHERE ROWID = ${sel.valueId} AND ${orgClause(catalyst)}`),
    ).map(out);
    if (!pvs.length) throw new Error(`${prop.caption}: value "${sel.valueText}" no longer exists`);
    const resolved = await pushValueToZoho(catalyst, pvs[0]);
    if (!resolved || !resolved.item_id) {
      throw new Error(`${prop.caption}: "${sel.valueText}" could not be resolved to a Zoho Books item`);
    }
    mapped.push({ rmItemId: String(resolved.item_id), perUnitQty: 1 });
  }
  return mapped;
}

// Manufacturing → Books composite (assembly) item. Same self-heal shape as the
// plain path, plus the legacy case: an item pushed before CR-029 holds a
// plain-item id, so the composite update 404s — if that plain item still
// exists, delete it first or the composite create collides on SKU. Books
// refuses to delete an item with transactions; that error surfaces verbatim.
async function pushManufacturing(catalyst, item, description, customFields) {
  if (item.zohoItemId) {
    try {
      return await updateCompositeItemFields(catalyst, item.zohoItemId, {
        name: item.name,
        sku: item.sku,
        ...(description !== undefined ? { description, purchase_description: description } : {}),
        ...(customFields && customFields.length ? { custom_fields: customFields } : {}),
      });
    } catch (e) {
      if (!isGone(e)) throw e;
      let plain = null;
      try { plain = await getItem(catalyst, item.zohoItemId); } catch (e2) { if (!isGone(e2)) throw e2; }
      if (plain) await deleteItem(catalyst, item.zohoItemId);
    }
  }
  const mappedItems = await buildAssociatedItems(catalyst, item);
  const comp = await createCompositeItem(catalyst, {
    name: item.name, sku: item.sku, description, customFields, mappedItems,
  });
  const compId = comp && (comp.composite_item_id || comp.item_id);
  if (compId) {
    await catalyst.datastore().table("SKUItem").updateRow({ ROWID: item.id, zohoItemId: String(compId) });
  }
  return comp;
}

/**
 * Best-effort push of a SKU item to Zoho Books. No-op (returns null) until Zoho
 * credentials are configured. `item` is the API-shaped row (item.id = ROWID).
 * Property values whose Property has a zohoCfApiName are pushed into the matching
 * Books custom fields. Manufacturing items become composite (assembly) items;
 * Trading items stay plain inventory items. `item.type` tells which Books API
 * the stored zohoItemId belongs to — safe because type locks after first push.
 */
async function pushToZoho(catalyst, item, description) {
  if (!isConfigured()) {
    console.log("[Zoho] skipped (not configured) — sku:", item.sku);
    return null;
  }
  const customFields = await buildZohoCustomFields(catalyst, item.id);
  if (item.type === "Manufacturing") return pushManufacturing(catalyst, item, description, customFields);
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

module.exports = { pushToZoho, pushValueToZoho, buildAssociatedItems };
