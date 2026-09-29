"use strict";
const { isConfigured, dsDate } = require("./auth");
const { createItem, updateItem, findItemByName, getItem, deleteItem, getGstTaxId } = require("./booksApi");
const { pushableBooksFields } = require("../booksImport");
const { catalogueFields } = require("../itemFields");
const { createCompositeItem, updateCompositeItemFields, getCompositeItem, updateCompositeItem, deleteCompositeItem } = require("./inventoryApi");
const { rowList, out, orgClause, zStr, isActive, idOk } = require("../store");
const { matchComponents, selectedFromValues } = require("../recipe/componentMap");

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
 * reuses twins, links by name, or creates). An unselected flagged property is
 * simply not part of this SKU and is skipped (CR-030 — most industries have
 * far more parameters than any one SKU uses); only a *selected* value that
 * can't be resolved fails the push. Quantity is always 1 (per-unit); the BOM
 * is refined later on the BOM pages.
 */
async function buildAssociatedItems(catalyst, item) {
  const zcql = catalyst.zcql();
  const flagged = rowList(
    await zcql.executeZCQLQuery(`SELECT * FROM Property WHERE industryId = ${item.industryId} AND ${orgClause(catalyst)}`),
  ).map(out).filter(isActive).filter((p) => p.createValuesAsItems === true);

  const vals = rowList(
    await zcql.executeZCQLQuery(`SELECT * FROM SKUItemValue WHERE skuItemId = ${item.id} AND ${orgClause(catalyst)}`),
  ).map(out);
  const components = await componentLines(catalyst, item, vals);
  if (!flagged.length) return components;
  const valByProp = Object.fromEntries(vals.map((v) => [String(v.propertyId), v]));

  // Only list-value selections can be Books items (a Range number can't).
  const selected = flagged.filter((p) => idOk((valByProp[String(p.id)] || {}).valueId));

  // ponytail: a value item has no HSN of its own, so it inherits the parent
  // composite's catalogue fields (HSN, Manufacturer) — an HSN-mandatory Books
  // org rejects an item without one (code 2207). Add a PropertyValue.hsn column
  // when a client needs per-value codes.
  let extra = {};
  try { extra = catalogueFields(JSON.parse(item.booksData || "{}")); } catch { extra = {}; }

  const mapped = [];
  for (const prop of selected) {
    const sel = valByProp[String(prop.id)];
    const pvs = rowList(
      await zcql.executeZCQLQuery(`SELECT * FROM PropertyValue WHERE ROWID = ${sel.valueId} AND ${orgClause(catalyst)}`),
    ).map(out);
    if (!pvs.length) throw new Error(`${prop.caption}: value "${sel.valueText}" no longer exists`);
    let resolved;
    try {
      resolved = await pushValueToZoho(catalyst, pvs[0], extra);
    } catch (e) {
      // Name the value item — Books' message alone reads as if the composite failed.
      throw new Error(`Books item "${sel.valueText}" (${prop.caption}): ${e.message}`);
    }
    if (!resolved || !resolved.item_id) {
      throw new Error(`${prop.caption}: "${sel.valueText}" could not be resolved to a Zoho Books item`);
    }
    mapped.push({ rmItemId: String(resolved.item_id), perUnitQty: 1 });
  }
  // A Books BOM can't list one item twice — a component line wins over a flagged value.
  const compIds = new Set(components.map((c) => c.rmItemId));
  return [...mapped.filter((m) => !compIds.has(m.rmItemId)), ...components];
}

// ComponentMap rows of the item's industry (Product Configurator). Paged like
// byOrgAll — a map can run to hundreds of rows and ZCQL caps a page at 300.
async function componentMapRows(catalyst, industryId) {
  const rows = [];
  let last = "0";
  for (;;) {
    const page = rowList(await catalyst.zcql().executeZCQLQuery(
      `SELECT * FROM ComponentMap WHERE industryId = ${zStr(String(industryId))} AND ${orgClause(catalyst)} AND ROWID > ${last} ORDER BY ROWID LIMIT 290`,
    ));
    rows.push(...page.map(out));
    if (page.length < 290) return rows;
    last = String(page[page.length - 1].ROWID);
  }
}

// Chunked: the sync pool reads every mapped item, and ZCQL returns 300 rows at most.
async function componentItems(catalyst, ids) {
  const items = [];
  for (let i = 0; i < ids.length; i += 200) {
    items.push(...rowList(await catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID, sku, name, zohoItemId, uom, booksData FROM SKUItem WHERE ROWID IN (${ids.slice(i, i + 200).join(",")}) AND ${orgClause(catalyst)}`,
    )).map(out));
  }
  return items;
}

// service = Books product_type kept in booksData (CR-127 / CR-254).
const isServiceItem = (it) => { try { return JSON.parse(it.booksData || "{}").product_type === "service"; } catch { return false; } };

// Pure: matched map lines + their SKU items → BOM lines keyed by Books item id.
// Separate-line components (CR-195) are their own quote/SO lines, never BOM
// lines; two components may share one Books item → one line, summed qty. A
// line that cannot be resolved is named in `problems`, never silently dropped.
function bomFromMatch(lines, items) {
  const byId = new Map((items || []).map((it) => [String(it.id), it]));
  const merged = new Map();
  const problems = [];
  for (const l of (lines || []).filter((x) => !x.asQuoteLine)) {
    const it = byId.get(String(l.skuItemId));
    if (!it) { problems.push(`${l.component}: the mapped item no longer exists`); continue; }
    if (!it.zohoItemId) { problems.push(`${l.component}: item ${it.sku || it.name} is not in Zoho Books yet — push it first`); continue; }
    const id = String(it.zohoItemId);
    const cur = merged.get(id);
    if (cur) cur.perUnitQty += l.qty;
    else merged.set(id, { rmItemId: id, rmName: it.name || "", rmSku: it.sku || "", uom: it.uom || l.uom || "", perUnitQty: l.qty, service: isServiceItem(it) });
  }
  return { lines: [...merged.values()], problems };
}

/**
 * Answers → BOM lines with Books item ids, from the Component Map (CR-261). Shared by
 * the Books composite push (componentLines) and the work order, which seeds a
 * configured valve's BOM from the quote's answers instead of the composite.
 * `sel` = the matcher's selectedValues ({ propertyId: valueId | text }).
 */
async function resolveBomLines(catalyst, industryId, sel) {
  const rows = await componentMapRows(catalyst, industryId);
  const { lines, missing } = matchComponents(rows, sel || {});
  // matchComponents defaults a blank row unit to "Nos" — a guess the WO must not show as fact.
  const unitSet = new Set(rows.filter((r) => String(r.uom || "").trim()).map((r) => `${r.component}|${r.skuItemId}`));
  const keep = lines.map((l) => (unitSet.has(`${l.component}|${l.skuItemId}`) ? l : { ...l, uom: "" }));
  const ids = [...new Set(keep.filter((l) => !l.asQuoteLine).map((l) => l.skuItemId))].filter(idOk);
  const res = bomFromMatch(keep, ids.length ? await componentItems(catalyst, ids) : []);
  if (missing.length) res.problems.unshift(`Component Map has no matching row for: ${missing.join(", ")}`);
  return { ...res, mapped: rows.length > 0 };
}

/**
 * BOM lines from the Component Map: the item's stored answers matched against
 * the industry's map rows (recipe/componentMap.js), each component resolved to
 * its SKUItem's Books id. Fails loudly — a required component with no matching
 * row, or a component item never pushed to Books, must not produce a composite
 * that silently lacks it. Duty answers (activeInSku=false) are not stored on the
 * item, so map conditions can only use SKU-active questions.
 */
async function componentLines(catalyst, item, vals) {
  const { lines, problems } = await resolveBomLines(catalyst, item.industryId, selectedFromValues(vals));
  if (problems.length) throw new Error(problems[0]);
  return lines.map((l) => ({ rmItemId: l.rmItemId, perUnitQty: l.perUnitQty }));
}

// Outbound half of the Property.zohoCfApiName mapping: every selected value
// whose property maps to a Books custom field becomes an {api_name, value}
// entry on the item create/update body. Mirror of the import read-back
// (import.js propByCf). Empty array when the industry maps nothing.
async function buildCustomFields(catalyst, item) {
  const zcql = catalyst.zcql();
  const mapped = rowList(
    await zcql.executeZCQLQuery(`SELECT ROWID, zohoCfApiName FROM Property WHERE industryId = ${item.industryId} AND ${orgClause(catalyst)}`),
  ).map(out).filter((p) => p.zohoCfApiName);
  if (!mapped.length) return [];
  const vals = rowList(
    await zcql.executeZCQLQuery(`SELECT propertyId, valueText FROM SKUItemValue WHERE skuItemId = ${item.id} AND ${orgClause(catalyst)}`),
  ).map(out);
  const textByProp = Object.fromEntries(vals.map((v) => [String(v.propertyId), v.valueText]));
  return mapped
    .filter((p) => textByProp[String(p.id)] !== undefined && textByProp[String(p.id)] !== null && String(textByProp[String(p.id)]) !== "")
    .map((p) => ({ api_name: p.zohoCfApiName, value: String(textByProp[String(p.id)]) }));
}

/**
 * Merge a composite's existing BOM with the current property-derived lines
 * (CR-030). `poolIds` is the set of item ids the generator owns (every
 * zohoItemId a flagged property's values could contribute): lines outside the
 * pool are manual BOM work and pass through untouched, quantities included;
 * pool lines are replaced by `desired` (keeping an existing line's quantity
 * when the item stays). Pure — exported for the self-check.
 */
function mergeMappedLines(existingLines, desired, poolIds) {
  const existing = (existingLines || []).map((l) => ({ id: String(l.item_id), qty: Number(l.quantity) || 0 }));
  const byId = Object.fromEntries(existing.map((l) => [l.id, l]));
  const manual = existing.filter((l) => !poolIds.has(l.id));
  const propLines = desired.map((d) => {
    const id = String(d.rmItemId);
    return { id, qty: byId[id] ? byId[id].qty : Number(d.perUnitQty) || 1 };
  });
  const merged = [...manual, ...propLines];
  const key = (ls) => ls.map((l) => `${l.id}:${l.qty}`).sort().join("|");
  return { lines: merged.map((l) => ({ rmItemId: l.id, perUnitQty: l.qty })), changed: key(merged) !== key(existing) };
}

// After a Manufacturing re-push, bring the composite's property-derived
// associated items in line with the current selections — swap out the old
// value's item, swap in the new — without ever touching manual BOM lines.
async function syncMappedItems(catalyst, item, desired) {
  const zcql = catalyst.zcql();
  // Pool = every Books item any flagged property's values map to. A manual
  // line that happens to reuse one of those items is treated as
  // property-derived — acceptable ambiguity; the generator re-adds it if selected.
  const flaggedProps = rowList(
    await zcql.executeZCQLQuery(`SELECT ROWID, createValuesAsItems FROM Property WHERE industryId = ${item.industryId} AND ${orgClause(catalyst)}`),
  ).map(out).filter((p) => p.createValuesAsItems === true).map((p) => String(p.id));
  // Component Map items are generator-owned too, so a changed answer swaps them.
  const mapItemIds = [...new Set((await componentMapRows(catalyst, item.industryId)).map((r) => String(r.skuItemId)))].filter(idOk);
  if (!flaggedProps.length && !mapItemIds.length) return;
  const pool = new Set(flaggedProps.length ? rowList(
    await zcql.executeZCQLQuery(
      `SELECT zohoItemId FROM PropertyValue WHERE propertyId IN (${flaggedProps.join(",")}) AND zohoItemId IS NOT NULL AND ${orgClause(catalyst)}`,
    ),
  ).map((r) => String(r.zohoItemId)) : []);
  for (const it of await componentItems(catalyst, mapItemIds)) if (it.zohoItemId) pool.add(String(it.zohoItemId));
  const comp = await getCompositeItem(catalyst, item.zohoItemId);
  // Legacy RM1/RM2 placeholder lines are ours to remove: put them in the pool.
  const onComp = new Set((comp.mapped_items || []).map((l) => String(l.item_id)));
  for (const name of PLACEHOLDER_RMS) {
    const found = await findItemByName(catalyst, name);
    if (found && onComp.has(String(found.item_id))) pool.add(String(found.item_id));
  }
  const { lines, changed } = mergeMappedLines(comp.mapped_items, desired, pool);
  if (changed) await updateCompositeItem(catalyst, item.zohoItemId, requireBomLines(lines));
}

// Zoho refuses a composite with fewer than two BOM lines (code 2056). The BOM
// is the configuration's raw materials (flagged property values); a short one
// fails loudly instead of being padded — CR-165's RM1/RM2 placeholders are
// gone (CR-184), and any still sitting on a composite are dropped on re-push.
const PLACEHOLDER_RMS = ["RM1", "RM2"];
function requireBomLines(mapped) {
  if (mapped.length >= 2) return mapped;
  throw new Error(
    `Composite needs at least 2 raw-material lines (has ${mapped.length}) — flag the properties whose values are Books items ("Create values as items") or add the lines in Books`,
  );
}

// Trading → plain Books inventory item: update the linked item, or (no link /
// link dead) create and store the id.
async function pushPlain(catalyst, item, description, opts = {}, customFields = []) {
  // Imported Books-sheet fields (CR: books import) ride along on the push.
  // "_" reference keys stay local; a stored GST rate resolves to a tax_id.
  let stored = {};
  try { stored = item.booksData ? JSON.parse(item.booksData) : {}; } catch { stored = {}; }
  let extraCreate, extraUpdate;
  if (Object.keys(stored).length) {
    extraCreate = pushableBooksFields(stored);
    extraUpdate = pushableBooksFields(stored, { update: true });
    if (stored._gstRate) {
      const taxId = await getGstTaxId(catalyst, stored._gstRate, { interState: true });
      if (taxId) extraCreate.tax_id = extraUpdate.tax_id = taxId;
    }
  }
  // Item UOM (CR-206, configurator) beats the sheet's unit; null keeps "pcs".
  if (item.uom) {
    extraCreate = { ...(extraCreate || {}), unit: item.uom };
    extraUpdate = { ...(extraUpdate || {}), unit: item.uom };
  }
  if (item.zohoItemId) {
    try {
      return await updateItem(catalyst, item.zohoItemId, item.name, item.sku, description, customFields, extraUpdate);
    } catch (e) {
      if (!isGone(e)) throw e; // stale link: item was deleted in Books → re-create below
    }
  }
  const result = await createItem(catalyst, item.name, item.sku, description, opts, customFields, extraCreate);
  if (result && result.item_id) {
    await catalyst.datastore().table("SKUItem").updateRow({ ROWID: item.id, zohoItemId: String(result.item_id) });
  }
  return result;
}

// Manufacturing → Books composite (assembly) item. Same self-heal shape as the
// plain path, plus the legacy case: an item pushed before CR-029 holds a
// plain-item id, so the composite update 404s — if that plain item still
// exists, delete it first or the composite create collides on SKU. Books
// refuses to delete an item with transactions; that error surfaces verbatim.
async function pushManufacturing(catalyst, item, description, opts = {}, customFields = []) {
  // ponytail: only the ITEM_FIELDS catalogue (HSN, Manufacturer) rides onto a
  // composite; carry full booksData if a sheet import ever yields Manufacturing.
  let extra = {};
  try { extra = catalogueFields(JSON.parse(item.booksData || "{}")); } catch { extra = {}; }
  const mapped = await buildAssociatedItems(catalyst, item);
  if (item.zohoItemId) {
    try {
      const updated = await updateCompositeItemFields(catalyst, item.zohoItemId, {
        name: item.name,
        sku: item.sku,
        ...extra,
        ...(item.uom ? { unit: item.uom } : {}),
        ...(description !== undefined ? { description, purchase_description: description } : {}),
        ...(customFields.length ? { custom_fields: customFields } : {}),
      });
      await syncMappedItems(catalyst, item, mapped);
      return updated;
    } catch (e) {
      if (!isGone(e)) throw e;
    }
  }
  // A single-item sync from the SKU Items page (opts.plainIfNoBom) with a BOM
  // Books would refuse (< 2 lines, code 2056) lands as a plain inventory item
  // instead of failing — it updates the plain item it already is, or creates
  // one. The next push with ≥ 2 lines upgrades it: the legacy branch below
  // deletes the plain item and creates the composite. Widget/generator pushes
  // keep failing loudly (CR-184).
  if (mapped.length < 2 && opts.plainIfNoBom) return pushPlain(catalyst, item, description, opts, customFields);
  if (item.zohoItemId) {
    let plain = null;
    try { plain = await getItem(catalyst, item.zohoItemId); } catch (e2) { if (!isGone(e2)) throw e2; }
    if (plain) await deleteItem(catalyst, item.zohoItemId);
  }
  const mappedItems = requireBomLines(mapped);
  const comp = await createCompositeItem(catalyst, {
    name: item.name, sku: item.sku, description, mappedItems, customFields, unit: item.uom,
    tracking: opts.tracking, inventoryAccountId: opts.inventoryAccountId, extra,
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
 * Properties mapped via zohoCfApiName are pushed as Books custom fields.
 * Manufacturing items become composite (assembly) items; Trading items stay
 * plain inventory items. `item.type` tells which Books API the stored
 * zohoItemId belongs to — safe because type locks after first push.
 * opts: { tracking: 'none'|'serial'|'batch', inventoryAccountId } from the push
 * dialog — only used on create (immutable in Books after transactions).
 */
async function pushToZoho(catalyst, item, description, opts = {}) {
  if (!isConfigured()) {
    console.log("[Zoho] skipped (not configured) — sku:", item.sku);
    return null;
  }
  const customFields = await buildCustomFields(catalyst, item);
  const result = item.type === "Manufacturing"
    ? await pushManufacturing(catalyst, item, description, opts, customFields)
    : await pushPlain(catalyst, item, description, opts, customFields);
  // Stamp when the push landed — the grid's stale-sync badge compares this to
  // the row's MODIFIEDTIME. Best-effort: a failed stamp must not fail the push.
  if (result) {
    await catalyst.datastore().table("SKUItem")
      .updateRow({ ROWID: item.id, lastPushedAt: dsDate(Date.now()) })
      .catch((e) => console.error("lastPushedAt stamp failed:", e && e.message));
  }
  return result;
}

/**
 * CR-223: remove the Books/Inventory counterpart of a SKU item before the
 * local row goes — Zoho first, like assembly.deleteAssembly. `item.type`
 * picks the API (composite for Manufacturing, plain item otherwise), same
 * lock as pushToZoho. Already gone in Books → fine, the caller proceeds.
 * Any other refusal (item has transactions) → 409 with Zoho's message, and
 * the caller must leave the local row alone.
 */
async function deleteFromZoho(catalyst, item) {
  if (!isConfigured() || !item.zohoItemId) return { zohoDeleted: false };
  try {
    if (item.type === "Manufacturing") await deleteCompositeItem(catalyst, item.zohoItemId);
    else await deleteItem(catalyst, item.zohoItemId);
    return { zohoDeleted: true };
  } catch (e) {
    if (isGone(e)) return { zohoDeleted: false, gone: true };
    const err = new Error(`Zoho Books refused to delete item ${item.sku || item.zohoItemId}: ${e.message}`);
    err.status = 409;
    throw err;
  }
}

/**
 * Best-effort create/link of a PropertyValue as a standalone Books item.
 * `value` is the API-shaped row (value.id = ROWID). The Books item's SKU is the
 * name (see valueItemSku) — value codes are short and collide across properties.
 * Dedupes before creating: (a) already linked → update; (b) a sibling value with
 * the same name already made the item → reuse; (c) an item with that name exists
 * in Books → link; (d) otherwise create. Writes the resolved item_id back.
 * Returns null (no-op) until Zoho is configured.
 */
// "Cotton : Silk" → "COTTON-SILK". Pure — exported for the self-check.
const valueItemSku = (name) => String(name).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);

// `extra` (optional): Books item fields (hsn_or_sac, manufacturer…) the value
// item carries on create/update — the parent composite's when pushed as a BOM line.
async function pushValueToZoho(catalyst, value, extra) {
  if (!isConfigured()) {
    console.log("[Zoho] value push skipped (not configured) —", value.displayValue);
    return null;
  }
  const name = value.displayValue;
  const description = value.description || undefined;

  // (a) already linked → keep Books in sync; a dead link falls through to re-create
  if (value.zohoItemId) {
    try {
      return await updateItem(catalyst, value.zohoItemId, name, undefined, description, undefined, extra);
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

  // (d) nothing found → create it. SKU = the name itself, uppercased: orgs with
  // Books "SKU mandatory" (Item Preferences) reject a SKU-less item with code
  // 2112 (CR-163). The value's own code (HM, CN) is too short to be unique
  // across properties; the name already is — (b)/(c) dedupe on it.
  if (!zohoItemId) {
    const zohoItem = await createItem(catalyst, name, valueItemSku(name), description, undefined, undefined, extra);
    if (zohoItem && zohoItem.item_id) zohoItemId = String(zohoItem.item_id);
  }

  if (zohoItemId) {
    await catalyst.datastore().table("PropertyValue").updateRow({ ROWID: value.id, zohoItemId });
  }
  return zohoItemId ? { item_id: zohoItemId } : null;
}

module.exports = {
  pushToZoho, deleteFromZoho, pushValueToZoho, buildAssociatedItems, mergeMappedLines, valueItemSku, requireBomLines,
  bomFromMatch, resolveBomLines,
};
