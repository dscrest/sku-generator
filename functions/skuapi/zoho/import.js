"use strict";
const { rowList, out, idOk, reqOrg, orgClause } = require("../store");
const { isConfigured } = require("./auth");
const { listItems, listItemsByCategory, getItem } = require("./booksApi");
const { listCompositeItems } = require("./inventoryApi");
const { mergeBooksData } = require("../itemFields");
const { zStr } = require("../store");

// Books `product_type` (goods / service) kept on the item (CR-254): the
// Components page files a service under Associated Services, like Books.
// What a Books list row leaves on the SKU-master row: the goods/service flag
// and the selling rate (shown per BOM line in the configurator).
const typeData = (b) => mergeBooksData(null, { product_type: b.product_type || "", rate: b.rate ?? "" });
const storedRate = (booksData) => { try { return JSON.parse(booksData || "{}").rate; } catch { return undefined; } };

// Auto SKU code for an imported value: first 4 uppercase alphanumerics of the
// text, numeric suffix on collision within the property. Editable later in
// Property Manager.
function autoCode(text, used) {
  const base = String(text).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "VAL";
  let code = base;
  let n = 2;
  while (used.has(code)) code = `${base}${n++}`;
  used.add(code);
  return code;
}

/**
 * Import items from Zoho Books into a chosen industry. Create-only: items already
 * linked locally (by zohoItemId, then by sku) are skipped, never overwritten.
 * For each new item, custom fields whose api_name matches a Property.zohoCfApiName
 * in this industry are reverse-mapped into SKUItemValue. For Manual properties the
 * value is matched (case-insensitive) to a PropertyValue, creating one with an
 * auto-generated SKU code when missing; Range properties stay free-text.
 * ponytail: one detail fetch per imported item to read custom_fields (the list
 * endpoint omits them); fine for the create-only path.
 */
async function importFromBooks(catalyst, industryId) {
  if (!isConfigured()) throw new Error("Zoho not configured");
  if (!idOk(industryId)) throw new Error("Invalid industryId");

  const zcql = catalyst.zcql();
  const ds = catalyst.datastore();

  // The target industry must belong to this org.
  const owned = rowList(await zcql.executeZCQLQuery(`SELECT ROWID FROM Industry WHERE ROWID = ${industryId} AND ${orgClause(catalyst)}`));
  if (!owned.length) throw new Error("Industry not found");

  // Existing links (this org only) — match priority is zohoItemId, then sku.
  const existing = rowList(
    await zcql.executeZCQLQuery(`SELECT sku, zohoItemId FROM SKUItem WHERE ${orgClause(catalyst)}`),
  ).map(out);
  const knownSkus = new Set(existing.map((r) => r.sku));
  const knownZohoIds = new Set(existing.map((r) => r.zohoItemId).filter(Boolean).map(String));

  // This industry's custom-field map: Books api_name -> { id, valueType }.
  const props = rowList(
    await zcql.executeZCQLQuery(
      `SELECT ROWID, zohoCfApiName, valueType FROM Property WHERE industryId = ${industryId} AND ${orgClause(catalyst)}`,
    ),
  ).map(out);
  const mapped = props.filter((p) => p.zohoCfApiName);
  const propByCf = Object.fromEntries(mapped.map((p) => [p.zohoCfApiName, { id: String(p.id), valueType: p.valueType }]));

  // Existing values of the mapped Manual properties, for find-or-create:
  // propertyId -> { byName: Map<lowercased displayValue, valueId>, codes: Set<sku> }.
  const valuesByProp = {};
  for (const p of mapped) {
    if (p.valueType === "Range") continue;
    const vals = rowList(
      await zcql.executeZCQLQuery(`SELECT ROWID, displayValue, sku FROM PropertyValue WHERE propertyId = ${p.id}`),
    ).map(out);
    valuesByProp[String(p.id)] = {
      byName: new Map(vals.map((v) => [String(v.displayValue).toLowerCase(), String(v.id)])),
      codes: new Set(vals.map((v) => v.sku)),
    };
  }

  const books = await listItems(catalyst);
  const report = { total: books.length, imported: 0, skipped: 0, valuesMapped: 0, valuesCreated: 0, errors: [] };

  for (const b of books) {
    const sku = b.sku || "";
    if (knownZohoIds.has(String(b.item_id)) || (sku && knownSkus.has(sku))) { report.skipped++; continue; }
    if (!sku) { report.skipped++; continue; } // a SKU is required locally

    try {
      const row = await ds.table("SKUItem").insertRow({
        name: b.name || sku,
        sku,
        description: b.description || null,
        type: "Trading", // Books has no item-type concept; default, edit later
        industryId: String(industryId),
        zohoItemId: String(b.item_id),
        booksData: typeData(b),
        orgId: reqOrg(catalyst),
      });
      const item = out(row);
      knownSkus.add(sku);
      knownZohoIds.add(String(b.item_id));
      report.imported++;

      // Reverse-map custom fields -> SKUItemValue (detail fetch; list omits them).
      if (Object.keys(propByCf).length) {
        const detail = await getItem(catalyst, b.item_id);
        for (const cf of detail.custom_fields || []) {
          const prop = propByCf[cf.api_name];
          if (!prop || cf.value === undefined || cf.value === null || cf.value === "") continue;
          const text = String(cf.value);

          // Manual properties: link (or create) the PropertyValue for this text.
          let valueId = null;
          const vals = valuesByProp[prop.id];
          if (vals) {
            valueId = vals.byName.get(text.toLowerCase()) || null;
            if (!valueId) {
              const created = await ds.table("PropertyValue").insertRow({
                displayValue: text,
                name: text,
                sku: autoCode(text, vals.codes),
                description: null,
                propertyId: prop.id,
                orgId: reqOrg(catalyst),
              });
              valueId = String(created.ROWID);
              vals.byName.set(text.toLowerCase(), valueId);
              report.valuesCreated++;
            }
          }

          await ds.table("SKUItemValue").insertRow({
            skuItemId: String(item.id),
            propertyId: prop.id,
            valueId,
            valueText: text,
            orgId: reqOrg(catalyst),
          });
          report.valuesMapped++;
        }
      }
    } catch (err) {
      report.errors.push({ sku, message: err.message });
    }
  }
  return report;
}

/**
 * Refresh the SKU master from Zoho Books (CR-226). Books is the truth: every
 * Books item with a SKU is matched locally (zohoItemId, then sku) and its
 * name / sku / zohoItemId re-synced; composites become Manufacturing (never
 * demoted); unmatched items are created in `industryId`. Items without a SKU
 * are skipped. Custom fields (CR-271): when the org maps any Books field to a
 * property (`Property.zohoCfApiName`, any industry), the items Books changed
 * since the last run (`last_modified_time`, kept in booksData) are read in
 * detail and their mapped values replaced in SKUItemValue — at most
 * `detailCap` per run (one Books call each); the rest wait for the next run
 * (`report.detailsPending`).
 * ponytail: sequential updateRow; ≤ ~300 changed rows per run before the
 * 30 s function limit — a Catalyst Job if a catalog ever needs more.
 */
// `categoryId` (CR-287): read only the items of that Books category — the
// Finished-goods category an org picks in SKU Settings — instead of the whole
// catalog; composites are still read in full for the Manufacturing flag.
// `compositesOnly` (CR-295, MSUN): the Finished Goods are the Books composite
// items — only those rows are indexed, and each changed composite's BOM lines
// become values of the category-backed properties (`bomValues`), read through
// the WO module's CompositeItemCache. A category, when set, narrows further.
async function refreshFromBooks(catalyst, industryId, { detailCap = 40, skuFromName = false, categoryId = "", compositesOnly = false } = {}) {
  if (!isConfigured()) throw new Error("Zoho not configured");
  if (!idOk(industryId)) throw new Error("Invalid industryId");
  const zcql = catalyst.zcql();
  const ds = catalyst.datastore();
  const owned = rowList(await zcql.executeZCQLQuery(`SELECT ROWID FROM Industry WHERE ROWID = ${industryId} AND ${orgClause(catalyst)}`));
  if (!owned.length) throw new Error("Industry not found");

  const local = rowList(await zcql.executeZCQLQuery(`SELECT ROWID, sku, name, type, zohoItemId, booksData FROM SKUItem WHERE ${orgClause(catalyst)}`)).map(out);
  const byZoho = new Map(local.filter((r) => r.zohoItemId).map((r) => [String(r.zohoItemId), r]));
  const bySku = new Map(local.filter((r) => r.sku).map((r) => [String(r.sku).trim().toLowerCase(), r]));
  let [books, composites] = await Promise.all([
    categoryId ? listItemsByCategory(catalyst, categoryId) : listItems(catalyst),
    listCompositeItems(catalyst),
  ]);
  const compositeIds = new Set(composites.map((c) => String(c.composite_item_id)));
  if (compositesOnly) books = books.filter((b) => compositeIds.has(String(b.item_id)));
  const report = { total: books.length, updated: 0, created: 0, composites: 0, skipped: 0, values: 0, bomValues: 0, detailsPending: 0, errors: [] };
  const cfMap = await customFieldMap(catalyst);
  const track = cfMap.size > 0 || compositesOnly; // does a changed row need a second read at all
  const details = []; // rows whose mapped values need the item detail

  for (const b of books) {
    // skuFromName (CR-275, Product Designs v2): a Books item with no SKU lands under its name, the CR-264 composite rule
    const sku = String(b.sku || "").trim() || (skuFromName ? String(b.name || "").trim() : "");
    if (!sku) { report.skipped++; continue; }
    const zid = String(b.item_id);
    const isComposite = compositeIds.has(zid);
    if (isComposite) report.composites++;
    try {
      const row = byZoho.get(zid) || bySku.get(sku.toLowerCase());
      if (row) {
        const patch = {};
        if ((b.name || sku) !== row.name) patch.name = b.name || sku;
        if (sku !== row.sku) patch.sku = sku;
        if (!row.zohoItemId) patch.zohoItemId = zid;
        if (isComposite && row.type !== "Manufacturing") patch.type = "Manufacturing";
        const bd = {};
        if (b.product_type && !String(row.booksData || "").includes('"product_type"')) bd.product_type = b.product_type;
        if (b.rate !== undefined && b.rate !== null && (Number(b.rate) || 0) !== (Number(storedRate(row.booksData)) || 0)) bd.rate = b.rate;
        if (Object.keys(bd).length) patch.booksData = mergeBooksData(row.booksData, bd);
        if (Object.keys(patch).length) { await ds.table("SKUItem").updateRow({ ROWID: row.id, ...patch }); report.updated++; }
        if (track && changedSince(row.booksData, b)) details.push({ row, b });
      } else {
        const created = out(await ds.table("SKUItem").insertRow({
          name: b.name || sku, sku, description: b.description || null, type: isComposite ? "Manufacturing" : "Trading",
          industryId: String(industryId), zohoItemId: zid, booksData: typeData(b), orgId: reqOrg(catalyst),
        }));
        byZoho.set(zid, created);
        bySku.set(sku.toLowerCase(), created);
        report.created++;
        if (track) details.push({ row: created, b });
      }
    } catch (err) {
      report.errors.push({ sku, message: err.message });
    }
  }
  // Mapped custom fields → SKUItemValue, newest changes first; the cap keeps a
  // run inside the function limit — the rest come next run.
  details.sort((x, y) => String(y.b.last_modified_time || "").localeCompare(String(x.b.last_modified_time || "")));
  // A list row that already carries the custom fields needs no detail read
  // (CR-287, probed on MSUN): Books lists them as flat `cf_<api_name>` keys
  // (+ `_formatted` / `_unformatted`), omitted when blank, never as the
  // `custom_fields` array the detail returns. A row with any `cf_` key is
  // trusted (a mapped key missing there = blank in Books); a row with none is
  // ambiguous and still fetched, capped.
  const listed = details.filter(({ b }) => customFieldsFromRow(b, cfMap));
  const fetched = details.filter(({ b }) => !customFieldsFromRow(b, cfMap));
  // compositesOnly: every changed composite costs one BOM read, so the cap
  // covers all of them, not just the rows that need an item detail.
  const work = compositesOnly ? details.slice(0, detailCap) : listed.concat(fetched.slice(0, detailCap));
  report.detailsPending = compositesOnly ? Math.max(0, details.length - detailCap) : Math.max(0, fetched.length - detailCap);
  const bom = compositesOnly && work.length ? await bomContext(catalyst, cfMap) : null;
  for (const { row, b } of work) {
    try {
      if (cfMap.size) {
        const fromRow = customFieldsFromRow(b, cfMap);
        const detail = fromRow ? { custom_fields: fromRow } : await getItem(catalyst, b.item_id);
        report.values += await replaceMappedValues(catalyst, row, detail, cfMap);
      }
      if (bom && bom.propIds.length) {
        const { getComposite } = require("../workorder/bom"); // lazy: bom.js pulls the WO store
        const comp = await getComposite(catalyst, reqOrg(catalyst), b.item_id, true);
        report.bomValues += await replaceBomValues(catalyst, row, comp.mappedItems, bom);
      }
      await ds.table("SKUItem").updateRow({ ROWID: row.id, booksData: mergeBooksData(row.booksData, { last_modified_time: b.last_modified_time || "" }) });
    } catch (err) {
      report.errors.push({ sku: row.sku, message: err.message });
    }
  }
  return report;
}

// The org's category-backed properties ("Values are Zoho Books items", no
// Books field of their own) and every value of theirs that is linked to a
// Books item — the lookup a composite's BOM lines are matched against.
// ponytail: one page each (ZCQL caps at 300); page when a catalog outgrows it.
async function bomContext(catalyst, cfMap) {
  const zcql = catalyst.zcql();
  const mapped = new Set([...cfMap.values()].map((p) => p.id));
  const props = rowList(await zcql.executeZCQLQuery(`SELECT ROWID, createValuesAsItems FROM Property WHERE ${orgClause(catalyst)}`)).map(out);
  const propIds = props.filter((p) => (p.createValuesAsItems === true || p.createValuesAsItems === "true") && !mapped.has(String(p.id))).map((p) => String(p.id));
  if (!propIds.length) return { propIds, pvs: [] };
  const pvs = rowList(await zcql.executeZCQLQuery(
    `SELECT ROWID, propertyId, displayValue, zohoItemId FROM PropertyValue WHERE zohoItemId IS NOT NULL AND propertyId IN (${propIds.map(zStr).join(",")}) AND ${orgClause(catalyst)}`,
  )).map(out);
  return { propIds, pvs };
}

// Pure: a composite's BOM lines → the values they stand for. A line whose
// Books item is a value of a category-backed property yields that value;
// services, unknown items and duplicates of the same value are dropped.
// mappedItems: [{ item_id }]; pvs: PropertyValue rows [{ id, propertyId, displayValue, zohoItemId }]
function bomValues(mappedItems, pvs) {
  const byItem = new Map(pvs.filter((v) => v.zohoItemId).map((v) => [String(v.zohoItemId), v]));
  const seen = new Set();
  const res = [];
  for (const m of mappedItems || []) {
    const v = byItem.get(String(m.item_id));
    if (!v || seen.has(String(v.id))) continue;
    seen.add(String(v.id));
    res.push({ propertyId: String(v.propertyId), valueId: String(v.id), valueText: v.displayValue });
  }
  return res;
}

// One composite's BOM → its SKUItemValue rows for the category-backed
// properties (replaced, so a material dropped from the BOM disappears here too).
async function replaceBomValues(catalyst, item, mappedItems, { propIds, pvs }) {
  const ds = catalyst.datastore();
  const existing = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID FROM SKUItemValue WHERE skuItemId = ${zStr(String(item.id))} AND propertyId IN (${propIds.map(zStr).join(",")}) AND ${orgClause(catalyst)}`,
  ));
  for (const r of existing) await ds.table("SKUItemValue").deleteRow(r.ROWID);
  const rows = bomValues(mappedItems, pvs);
  for (const v of rows) await ds.table("SKUItemValue").insertRow({ skuItemId: String(item.id), ...v, orgId: reqOrg(catalyst) });
  return rows.length;
}

// Pure: the mapped custom fields of a Books *list* row as the detail shape
// `[{ api_name, value }]`, or null when the row carries no `cf_` key at all
// (then only a detail read can tell). A `custom_fields` array on the row is
// taken as is.
function customFieldsFromRow(b, cfMap) {
  if (Array.isArray(b.custom_fields)) return b.custom_fields;
  if (!Object.keys(b).some((k) => k.startsWith("cf_"))) return null;
  const out = [];
  for (const api of cfMap.keys()) if (b[api] !== undefined && b[api] !== null) out.push({ api_name: api, value: b[api] });
  return out;
}

// Pure: has Books changed the item since its mapped values were last read?
// A row that never stored the stamp is due; an item Books gives no stamp for
// is read once and then never again (the stored stamp is "").
function changedSince(booksData, b) {
  let stored;
  try { stored = JSON.parse(booksData || "{}").last_modified_time; } catch { stored = undefined; }
  return stored === undefined || String(stored) !== String(b.last_modified_time || "");
}

// Every Books custom field the org maps to a property, any industry:
// api_name → { id, valueType }. Empty map = no detail reads at all.
async function customFieldMap(catalyst) {
  const props = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID, zohoCfApiName, valueType FROM Property WHERE zohoCfApiName IS NOT NULL AND ${orgClause(catalyst)}`,
  )).map(out).filter((p) => String(p.zohoCfApiName || "").trim());
  return new Map(props.map((p) => [p.zohoCfApiName, { id: String(p.id), valueType: p.valueType }]));
}

// One item's mapped custom fields → its SKUItemValue rows for those
// properties (replaced, so a value Books cleared disappears here too). A List
// property's value is matched to a PropertyValue by text, created when missing
// (autoCode, as the import does). Returns the number of values written.
async function replaceMappedValues(catalyst, item, detail, cfMap) {
  const ds = catalyst.datastore();
  const zcql = catalyst.zcql();
  const propIds = [...new Set([...cfMap.values()].map((p) => p.id))];
  const existing = rowList(await zcql.executeZCQLQuery(
    `SELECT ROWID, propertyId FROM SKUItemValue WHERE skuItemId = ${zStr(String(item.id))} AND propertyId IN (${propIds.map(zStr).join(",")}) AND ${orgClause(catalyst)}`,
  ));
  for (const r of existing) await ds.table("SKUItemValue").deleteRow(r.ROWID);
  let n = 0;
  for (const cf of (detail && detail.custom_fields) || []) {
    const prop = cfMap.get(cf.api_name);
    if (!prop || cf.value === undefined || cf.value === null || cf.value === "") continue;
    const text = String(cf.value);
    let valueId = null;
    if (prop.valueType !== "Range") {
      const vals = rowList(await zcql.executeZCQLQuery(`SELECT ROWID, displayValue, sku FROM PropertyValue WHERE propertyId = ${prop.id}`)).map(out);
      const hit = vals.find((v) => String(v.displayValue).toLowerCase() === text.toLowerCase());
      if (hit) valueId = String(hit.id);
      else {
        const created = await ds.table("PropertyValue").insertRow({
          displayValue: text, name: text, sku: autoCode(text, new Set(vals.map((v) => v.sku))),
          description: null, propertyId: prop.id, orgId: reqOrg(catalyst),
        });
        valueId = String(created.ROWID);
      }
    }
    await ds.table("SKUItemValue").insertRow({ skuItemId: String(item.id), propertyId: prop.id, valueId, valueText: text, orgId: reqOrg(catalyst) });
    n++;
  }
  return n;
}

/**
 * Daily cron body (CR-271): refresh the SKU master of every org that reads
 * designs (the `recipe-engine` add-on) and has a connected Zoho user, into its
 * "Books items" industry (else its first — the CR-254 landing rule).
 */
async function refreshAllOrgs(catalyst) {
  const { tokenForOrg } = require("../workorder/sync");
  const addonRows = rowList(await catalyst.zcql().executeZCQLQuery(`SELECT orgId, enabled FROM OrgAddon WHERE addonKey = 'recipe-engine'`));
  const orgIds = [...new Set(addonRows.filter((r) => r.enabled === true || r.enabled === "true").map((r) => String(r.orgId)))];
  const synced = {};
  for (const orgId of orgIds) {
    if (!(await tokenForOrg(catalyst, orgId))) { synced[orgId] = "no connected user"; continue; }
    try {
      const industries = rowList(await catalyst.zcql().executeZCQLQuery(`SELECT ROWID, name FROM Industry WHERE ${orgClause(catalyst)}`)).map(out);
      const ind = industries.find((i) => /books items/i.test(i.name || "")) || industries[0];
      synced[orgId] = ind ? await refreshFromBooks(catalyst, String(ind.id)) : "no industry";
    } catch (err) {
      synced[orgId] = `error: ${err.message}`;
    }
  }
  return { orgs: orgIds.length, synced };
}

// Books composites vs the org's SKU master (CR-264). Pure. Match by zohoItemId,
// then SKU — the order refreshFromBooks uses. A matched row is promoted to
// Manufacturing (never demoted); an unknown composite becomes a new row.
// `matched` and `inserts` together are the list, in Books order.
function planCompositeSync(composites, localRows) {
  const byZoho = new Map(localRows.filter((r) => r.zohoItemId).map((r) => [String(r.zohoItemId), r]));
  const bySku = new Map(localRows.filter((r) => r.sku).map((r) => [String(r.sku).trim().toLowerCase(), r]));
  const plan = { updates: [], inserts: [], matched: [] };
  const seen = new Set();
  for (const c of composites) {
    if (String(c.status || "").toLowerCase() === "inactive") continue;
    const zid = String(c.composite_item_id);
    const sku = String(c.sku || "").trim() || String(c.name || "").trim();
    if (!sku || seen.has(zid)) continue;
    seen.add(zid);
    const row = byZoho.get(zid) || bySku.get(sku.toLowerCase());
    if (!row) {
      plan.inserts.push({ name: c.name || sku, sku, type: "Manufacturing", zohoItemId: zid, booksData: typeData(c) });
      continue;
    }
    const patch = {};
    if (row.type !== "Manufacturing") patch.type = "Manufacturing";
    if (!row.zohoItemId) patch.zohoItemId = zid;
    if (Object.keys(patch).length) plan.updates.push({ id: String(row.id), patch });
    plan.matched.push({ id: String(row.id), sku: row.sku, name: row.name });
  }
  return plan;
}

/**
 * The Books org's active composite items as SKU-master rows — the Product
 * Design form's Main product list (CR-264). Writes only what Books changed.
 * ponytail: sequential writes; a first run over a few hundred composites
 * needs a Catalyst Job (30 s function limit).
 */
async function syncComposites(catalyst, orgId) {
  if (!isConfigured()) throw new Error("Zoho not configured");
  const ds = catalyst.datastore();
  const composites = await listCompositeItems(catalyst);
  const local = rowList(await catalyst.zcql().executeZCQLQuery(`SELECT ROWID, sku, name, type, zohoItemId FROM SKUItem WHERE ${orgClause(catalyst)}`)).map(out);
  const plan = planCompositeSync(composites, local);
  for (const u of plan.updates) await ds.table("SKUItem").updateRow({ ROWID: u.id, ...u.patch });
  const list = [...plan.matched];
  if (plan.inserts.length) {
    // same landing rule as the service-item create (CR-254)
    const industries = rowList(await catalyst.zcql().executeZCQLQuery(`SELECT ROWID, name FROM Industry WHERE ${orgClause(catalyst)}`)).map(out);
    const ind = industries.find((i) => /books items/i.test(i.name || "")) || industries[0];
    for (const it of ind ? plan.inserts : []) {
      const row = out(await ds.table("SKUItem").insertRow({ ...it, description: null, industryId: String(ind.id), orgId }));
      list.push({ id: String(row.id), sku: it.sku, name: it.name });
    }
  }
  return list.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}

module.exports = { importFromBooks, refreshFromBooks, refreshAllOrgs, changedSince, customFieldsFromRow, autoCode, planCompositeSync, syncComposites, bomValues };

// ponytail self-check: `node functions/skuapi/zoho/import.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const local = [
    { id: "1", sku: "RAVB 150 S", name: "RAVB 150 S", type: "Trading", zohoItemId: "900" },
    { id: "2", sku: "ravh 100", name: "RAVH 100", type: "Trading", zohoItemId: null },
    { id: "3", sku: "OK", name: "Ok", type: "Manufacturing", zohoItemId: "902" },
  ];
  const plan = planCompositeSync([
    { composite_item_id: 900, name: "RAVB 150 S", sku: "RAVB 150 S", status: "active" },
    { composite_item_id: 901, name: "RAVH 100", sku: " RAVH 100 " },
    { composite_item_id: 902, name: "Ok", sku: "OK" },
    { composite_item_id: 903, name: "DHIRAJ COMP 1", sku: "" },
    { composite_item_id: 904, name: "Old", sku: "OLD", status: "inactive" },
    { composite_item_id: 903, name: "DHIRAJ COMP 1", sku: "" },
  ], local);
  assert.deepStrictEqual(plan.updates, [
    { id: "1", patch: { type: "Manufacturing" } },
    { id: "2", patch: { type: "Manufacturing", zohoItemId: "901" } },
  ]);
  assert.deepStrictEqual(plan.matched.map((m) => m.id), ["1", "2", "3"]);
  assert.strictEqual(plan.inserts.length, 1);
  assert.deepStrictEqual(
    { ...plan.inserts[0], booksData: undefined },
    { name: "DHIRAJ COMP 1", sku: "DHIRAJ COMP 1", type: "Manufacturing", zohoItemId: "903", booksData: undefined },
  );
  // changedSince (CR-271): no stamp → due; same stamp → not; Books without a stamp → once.
  assert.strictEqual(changedSince(null, { last_modified_time: "2026-09-30T10:00:00+0530" }), true);
  assert.strictEqual(changedSince('{"last_modified_time":"2026-09-30T10:00:00+0530"}', { last_modified_time: "2026-09-30T10:00:00+0530" }), false);
  assert.strictEqual(changedSince('{"last_modified_time":"2026-09-29T10:00:00+0530"}', { last_modified_time: "2026-09-30T10:00:00+0530" }), true);
  assert.strictEqual(changedSince('{"product_type":"goods"}', {}), true, "never read → read once");
  assert.strictEqual(changedSince('{"last_modified_time":""}', {}), false, "no stamp from Books → read once, then never");
  // bomValues (CR-295): BOM lines → category-backed values; services/unknown dropped, same value once.
  assert.deepStrictEqual(bomValues(
    [{ item_id: 11 }, { item_id: "22" }, { item_id: "99" }, { item_id: 11 }],
    [
      { id: "1", propertyId: "P1", displayValue: "WCB - (Pcs)", zohoItemId: "11" },
      { id: "2", propertyId: "P2", displayValue: "SS 316 - (Pcs)", zohoItemId: 22 },
      { id: "3", propertyId: "P2", displayValue: "Unlinked", zohoItemId: null },
    ],
  ), [
    { propertyId: "P1", valueId: "1", valueText: "WCB - (Pcs)" },
    { propertyId: "P2", valueId: "2", valueText: "SS 316 - (Pcs)" },
  ]);
  assert.deepStrictEqual(bomValues(null, []), []);
  console.log("import selftest ok");
}
