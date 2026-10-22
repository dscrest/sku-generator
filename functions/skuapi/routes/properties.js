"use strict";
const express = require("express");
const { rowList, out, idOk, orgClause, ownsRow, valueSourceOf, sourceFlags } = require("../store");

// API shape of a Property row: adds `valueSource` (manual | items | options, CR-288)
const outProp = (row) => { const p = out(row); return p ? { ...p, valueSource: valueSourceOf(p) } : p; };

const router = express.Router();
const TABLE = "Property";

// Books item custom-field definitions — source list for the Zoho mapping screen.
// Lives here (not zohoAuth) so it inherits the /api requireOrg + addon gates.
router.get("/zoho/item-custom-fields", async (req, res) => {
  try {
    res.json(await require("../zoho/booksApi").listItemCustomFields(req.catalyst));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/industries/:id/properties", async (req, res) => {
  const industryId = req.params.id;
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid id" });
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLE} WHERE industryId = ${industryId} AND ${orgClause(req.catalyst)} ORDER BY skuPosition`,
      ),
    );
    res.json(rows.map(outProp));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All properties of the org (the Properties tab grid), with industry names.
router.get("/properties", async (req, res) => {
  try {
    const zcql = req.catalyst.zcql();
    const props = rowList(
      await zcql.executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ${orgClause(req.catalyst)} ORDER BY skuPosition`),
    );
    const inds = rowList(
      await zcql.executeZCQLQuery(`SELECT ROWID, name FROM Industry WHERE ${orgClause(req.catalyst)}`),
    );
    const nameById = new Map(inds.map((i) => [String(i.ROWID), i.name]));
    res.json(props.map((p) => ({ ...outProp(p), industryName: nameById.get(String(p.industryId)) || null })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Books item categories for the property form (CR-286): [{ id, name, parent }].
// Always a fresh read — the user has just created the category they are about to pick.
router.get("/properties/books-categories", async (req, res) => {
  try {
    const cats = await require("../zoho/booksApi").listCategories(req.catalyst, { fresh: true });
    res.json(cats.map((c) => ({ id: String(c.category_id), name: c.name, parent: c.parent_category_name || "" }))
      .sort((a, b) => `${a.parent} ${a.name}`.localeCompare(`${b.parent} ${b.name}`)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Sync from Books: the property's value source decides what is read.
//  items   (CR-286) every active item in the property's Books category becomes a
//          value — new items get the next code in the property's series,
//          same-named values get linked, renamed items rename the value.
//  options (CR-288) every option of the mapped Books dropdown field becomes a
//          value — name match only (options have no id), nothing renamed.
// Writes go straight to the Data Store (the /property-values route would push
// back to Books). Nothing is deleted. `fields` = a listItemCustomFields result
// the caller already has (sync-books-all reads it once for every property).
// Throws { httpStatus: 400 } when the property is not set up for a sync.
function syncError(msg) { const e = new Error(msg); e.httpStatus = 400; return e; }
async function syncPropertyFromBooks(req, prop, fields) {
  const id = String(prop.id);
  const source = valueSourceOf(prop);
  const { listItemsByCategory, listItemCustomFields, isOptionField } = require("../zoho/booksApi");
  const { planValueSync, planOptionSync } = require("../zoho/valueSync");
  const values = rowList(await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM PropertyValue WHERE propertyId = ${id} AND ${orgClause(req.catalyst)}`)).map(out);
  const ds = req.catalyst.datastore().table("PropertyValue");
  if (source === "items") {
    if (!prop.booksCategoryId) throw syncError("Pick a Books category on the property first");
    const items = await listItemsByCategory(req.catalyst, prop.booksCategoryId);
    const plan = planValueSync(items, values);
    // ponytail: sequential writes; a category is tens of items, not thousands
    for (const v of plan.create) await ds.insertRow({ ...v, propertyId: id, isDefault: "false", orgId: req.orgId });
    for (const v of plan.link) await ds.updateRow({ ROWID: v.id, zohoItemId: v.zohoItemId });
    for (const v of plan.rename) await ds.updateRow({ ROWID: v.id, displayValue: v.displayValue, name: v.name });
    return { source, total: items.length, created: plan.create.length, linked: plan.link.length, renamed: plan.rename.length, unchanged: plan.unchanged };
  }
  if (source === "options") {
    if (!prop.zohoCfApiName) throw syncError("Pick the Zoho Books field on the property first");
    const field = (fields || await listItemCustomFields(req.catalyst)).find((f) => f.api_name === prop.zohoCfApiName);
    if (!field) throw syncError(`Zoho Books has no item field ${prop.zohoCfApiName}`);
    if (!isOptionField(field)) throw syncError(`Zoho Books field ${field.label || prop.zohoCfApiName} is not a dropdown`);
    const plan = planOptionSync(field.values, values);
    for (const v of plan.create) await ds.insertRow({ ...v, propertyId: id, isDefault: "false", orgId: req.orgId });
    return { source, total: field.values.length, created: plan.create.length, linked: 0, renamed: 0, unchanged: plan.unchanged };
  }
  throw syncError("This property's values are kept in this app — nothing to sync from Books");
}

router.post("/properties/:id/sync-books", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  const props = rowList(await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`)).map(out);
  if (!props.length) return res.status(404).json({ error: "Not found" });
  try {
    res.json(await syncPropertyFromBooks(req, props[0]));
  } catch (err) {
    res.status(err.httpStatus === 400 ? 400 : err.httpStatus === 401 ? 409 : 502).json({ error: err.message });
  }
});

// Every Books-backed property of an industry in one call (CR-287, + option-
// backed CR-288): the Quote Maker widget fires this on open / Refresh so its
// lookups show what Books has now. Sequential — one Books read per property,
// never a fan-out (Dev concurrency cap); the field list is read once for all
// option-backed properties. A property that fails is reported, the rest go on.
router.post("/properties/sync-books-all", async (req, res) => {
  const { industryId } = req.body || {};
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  try {
    const props = rowList(await req.catalyst.zcql().executeZCQLQuery(
      `SELECT * FROM ${TABLE} WHERE industryId = ${industryId} AND ${orgClause(req.catalyst)} ORDER BY skuPosition`,
    )).map(outProp).filter((p) => (p.valueSource === "items" && p.booksCategoryId) || (p.valueSource === "options" && p.zohoCfApiName));
    let fields = null;
    if (props.some((p) => p.valueSource === "options")) {
      try { fields = await require("../zoho/booksApi").listItemCustomFields(req.catalyst); } catch (err) { fields = { error: err.message }; }
    }
    const synced = [];
    for (const prop of props) {
      try {
        if (prop.valueSource === "options" && fields && fields.error) throw new Error(fields.error);
        synced.push({ propertyId: String(prop.id), caption: prop.caption, ...(await syncPropertyFromBooks(req, prop, Array.isArray(fields) ? fields : undefined)) });
      } catch (err) {
        synced.push({ propertyId: String(prop.id), caption: prop.caption, error: err.message });
      }
    }
    res.json({ properties: props.length, synced });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/properties", async (req, res) => {
  const { name, caption, unit, valueType, skuPosition, industryId, rangeMin, rangeMax, required, zohoCfApiName, activeInSku, includeInName, clubKey, createValuesAsItems, showInWidget, sizingRole, booksCategoryId, valueSource } = req.body;
  if (!name || !caption || !valueType || skuPosition === undefined || !industryId) {
    return res.status(400).json({ error: "name, caption, valueType, skuPosition, industryId are required" });
  }
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  // CR-288: `valueSource` wins over a raw createValuesAsItems (older clients send only the flag)
  const flags = sourceFlags(valueSource) || { createValuesAsItems: createValuesAsItems ? "true" : "false", valuesFromCf: "false" };
  if (valueSource !== undefined && !sourceFlags(valueSource)) return res.status(400).json({ error: "valueSource must be manual, items or options" });
  if (flags.valuesFromCf === "true" && !zohoCfApiName) return res.status(400).json({ error: "Pick the Zoho Books field whose options are the values" });
  // The parent industry must belong to this org, or you could graft a property onto another tenant's industry.
  if (!(await ownsRow(req.catalyst, "Industry", industryId))) return res.status(404).json({ error: "Industry not found" });
  try {
    const row = await req.catalyst.datastore().table(TABLE).insertRow({
      name,
      caption,
      unit: unit || null,
      valueType,
      skuPosition: parseInt(skuPosition),
      industryId: String(industryId),
      rangeMin: rangeMin !== undefined && rangeMin !== null ? parseFloat(rangeMin) : null,
      rangeMax: rangeMax !== undefined && rangeMax !== null ? parseFloat(rangeMax) : null,
      required: required ? "true" : "false",
      activeInSku: activeInSku === false ? "false" : "true", // new properties join the SKU by default
      includeInName: includeInName ? "true" : "false",
      zohoCfApiName: zohoCfApiName || null,
      clubKey: clubKey || null, // props sharing this club concatenate codes with no separator
      ...flags, // createValuesAsItems (values are Books items, CR-026) / valuesFromCf (values are the Books field's options, CR-288)
      showInWidget: showInWidget ? "true" : "false", // gate: shows as a filter in the CRM quote widget
      sizingRole: sizingRole || null, // configurator sizing input/output: capacity|density|speed|group|series|model (CR-181)
      booksCategoryId: booksCategoryId || null, // Books item category whose items are this property's values (CR-286)
      orgId: req.orgId,
    });
    res.status(201).json(outProp(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/properties/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  if (!(await ownsRow(req.catalyst, TABLE, id))) return res.status(404).json({ error: "Not found" });
  const { name, caption, unit, valueType, skuPosition, rangeMin, rangeMax, required, zohoCfApiName, activeInSku, includeInName, clubKey, showInWidget, sizingRole, booksCategoryId, valueSource } = req.body;
  let { createValuesAsItems } = req.body;
  const data = { ROWID: id };
  // CR-288: `valueSource` wins over a raw createValuesAsItems; `options` needs a mapped field
  if (valueSource !== undefined) {
    const flags = sourceFlags(valueSource);
    if (!flags) return res.status(400).json({ error: "valueSource must be manual, items or options" });
    if (valueSource === "options") {
      const cf = zohoCfApiName !== undefined ? zohoCfApiName : (await ownsRowFull(req, id)).zohoCfApiName;
      if (!cf) return res.status(400).json({ error: "Pick the Zoho Books field whose options are the values" });
    }
    data.valuesFromCf = flags.valuesFromCf;
    createValuesAsItems = flags.createValuesAsItems === "true";
  }
  if (name) data.name = name;
  if (caption) data.caption = caption;
  if (unit !== undefined) data.unit = unit;
  if (valueType) data.valueType = valueType;
  if (skuPosition !== undefined) data.skuPosition = parseInt(skuPosition);
  if (rangeMin !== undefined) data.rangeMin = rangeMin === null ? null : parseFloat(rangeMin);
  if (rangeMax !== undefined) data.rangeMax = rangeMax === null ? null : parseFloat(rangeMax);
  if (required !== undefined) data.required = required ? "true" : "false";
  if (activeInSku !== undefined) data.activeInSku = activeInSku ? "true" : "false";
  if (includeInName !== undefined) data.includeInName = includeInName ? "true" : "false";
  if (zohoCfApiName !== undefined) data.zohoCfApiName = zohoCfApiName || null;
  if (clubKey !== undefined) data.clubKey = clubKey || null; // empty string clears the club (un-club)
  if (createValuesAsItems !== undefined) data.createValuesAsItems = createValuesAsItems ? "true" : "false";
  if (showInWidget !== undefined) data.showInWidget = showInWidget ? "true" : "false";
  if (sizingRole !== undefined) data.sizingRole = sizingRole || null;
  if (booksCategoryId !== undefined) data.booksCategoryId = booksCategoryId || null;
  try {
    const row = await req.catalyst.datastore().table(TABLE).updateRow(data);
    // Turning the items gate ON backfills existing values into Books (best-effort,
    // idempotent — pushValueToZoho links/updates existing items, never dupes).
    // Switching to `options` pushes nothing: Sync from Books pulls, values added
    // afterwards push (CR-288).
    if (createValuesAsItems === true) await backfillPropertyItems(req.catalyst, id);
    res.json(outProp(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The property row (the caller already checked ownsRow) — for a PUT that needs a column it did not send.
async function ownsRowFull(req, id) {
  return rowList(await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`)).map(out)[0] || {};
}

// Push every value of a property to Books as an item. Best-effort: a Zoho
// failure is logged, never fails the property save.
async function backfillPropertyItems(catalyst, propertyId) {
  try {
    const { pushValueToZoho } = require("../zoho/push");
    const vals = rowList(
      await catalyst.zcql().executeZCQLQuery(
        `SELECT * FROM PropertyValue WHERE propertyId = ${propertyId} AND ${orgClause(catalyst)}`,
      ),
    ).map(out);
    for (const v of vals) {
      try { await pushValueToZoho(catalyst, v); } catch (e) { console.error("[Zoho] backfill value failed:", e.message); }
    }
  } catch (e) {
    console.error("[Zoho] backfill property items failed:", e.message);
  }
}

router.delete("/properties/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  if (!(await ownsRow(req.catalyst, TABLE, id))) return res.status(404).json({ error: "Not found" });
  try {
    const ds = req.catalyst.datastore();
    const vals = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT ROWID FROM PropertyValue WHERE propertyId = ${id}`),
    );
    for (const v of vals) await ds.table("PropertyValue").deleteRow(v.ROWID);
    await ds.table(TABLE).deleteRow(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
