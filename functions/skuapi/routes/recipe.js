"use strict";

/**
 * Recipe Engine (CR-104): recipe templates -> components -> material options
 * -> configurable cost elements -> immutable quotation snapshots. Mounted at
 * /api/recipe behind requireAddon("recipe-engine"). A design is live the
 * moment it is created and is edited in place — no draft / publish / versions
 * (CR-266). Stored status: "Published" = Active, "Archived" = Inactive;
 * "Superseded" rows are old versions from before CR-266, kept read-only.
 * Quotations freeze a full snapshot so later recipe/rate edits never change
 * history.
 */
const express = require("express");
const { rowList, out, idOk, zStr, orgClause, ownsRow, findSkuRowId } = require("../store");
const { nextNumber, byOrgAll, settings, logActivity } = require("../workorder/store");
const { optionCost, computeQuote, selectByMaterial, bomLines } = require("../recipe/calc");
const { DEFAULT_COST_ELEMENTS, SIZING_MODELS, RAV_QUESTIONS, RAV_MAP_SAMPLE } = require("../recipe/seedData");
const { selectModels } = require("../recipe/sizing");
const { matchComponents, selectedFromValues, groupRows, planSync, uomsOf, normUom } = require("../recipe/componentMap");
const { searchItems, listCategories, listItemsByCategory, createItem } = require("../zoho/booksApi");
const { listCompositeItems, createCompositeItem, updateCompositeItem } = require("../zoho/inventoryApi");
const { syncComposites } = require("../zoho/import");
const bom = require("../workorder/bom");

const router = express.Router();

const bad = (res, status, error) => res.status(status).json({ error });
// Audit trail (CR-233): every write lands in ActivityLog for the History tab.
const log = (req, entityType, entityId, action, detail) => logActivity(req.catalyst, req.orgId, entityType, entityId, action, req.userId, detail);
const parseFixed = (o) => ({ ...o, fixedCosts: safeJson(o.fixedCostsJson) });
function safeJson(s) {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

// ---------- shared loaders ----------

// Org-default elements (blank recipeTemplateId) — a library the UI can copy
// from. Per-recipe rows carry the owning RecipeTemplate ROWID.
async function costElements(req) {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "CostElement")).map(out)
    .filter((r) => !r.recipeTemplateId);
  if (rows.length) return rows.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const table = req.catalyst.datastore().table("CostElement");
  const made = [];
  for (const el of DEFAULT_COST_ELEMENTS) made.push(out(await table.insertRow({ ...el, recipeTemplateId: "", orgId: req.orgId })));
  return made;
}

// Each recipe version owns its cost elements; new recipes start with none.
// Default values live in the cost master (org rows) and are fetched live by
// code, so a master rate change flows into every new calculation.
async function recipeCostElements(req, recipe) {
  const all = (await byOrgAll(req.catalyst, req.orgId, "CostElement")).map(out);
  const masterByCode = new Map(all.filter((r) => !r.recipeTemplateId).map((r) => [r.code, r]));
  const rows = all.filter((r) => String(r.recipeTemplateId) === String(recipe.id));
  for (const r of rows) {
    if (r.rate === null || r.rate === undefined || r.rate === "") {
      const m = masterByCode.get(r.code);
      if (m) r.rate = m.rate;
    }
  }
  return rows.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
}

async function recipeById(req, id) {
  if (!idOk(id)) return null;
  const rows = rowList(
    await req.catalyst.zcql().executeZCQLQuery(
      `SELECT * FROM RecipeTemplate WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`,
    ),
  );
  return rows.length ? out(rows[0]) : null;
}

// Whole recipe in flat org-scoped queries (options/attrs carry recipeId for this).
async function loadBundle(req, recipe) {
  const [components, options, attrs, materials, els] = [
    (await byOrgAll(req.catalyst, req.orgId, "RecipeComponent", `recipeId = ${zStr(recipe.id)}`))
      .map(out).sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
    (await byOrgAll(req.catalyst, req.orgId, "RecipeComponentOption", `recipeId = ${zStr(recipe.id)}`)).map(out).map(parseFixed),
    (await byOrgAll(req.catalyst, req.orgId, "RecipeComponentAttr", `recipeId = ${zStr(recipe.id)}`))
      .map(out).sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
    (await byOrgAll(req.catalyst, req.orgId, "MaterialType")).map(out),
    await recipeCostElements(req, recipe),
  ];
  return { recipe, components, options, attrs, materials, costElements: els };
}

// Write guard: every design is editable in place (CR-266) except the old
// versions left over from the publish era.
function assertEditable(res, recipe) {
  if (!recipe) { bad(res, 404, "Not found"); return false; }
  if (recipe.status === "Superseded") {
    bad(res, 409, "This is an old copy of the design — edit the current one");
    return false;
  }
  return true;
}

// For component/option writes: resolve the owning recipe and guard it.
async function editableRecipeOf(req, res, recipeId) {
  const recipe = await recipeById(req, recipeId);
  return assertEditable(res, recipe) ? recipe : null;
}

// Zoho auth expiry surfaces the same way as in workorder.js: 409 reauth_required.
const isReauth = (err) => err.zohoCode === 57 || err.httpStatus === 401 || /INVALID_OAUTH|not authorized/i.test(err.message || "");
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  if (isReauth(err)) return res.status(409).json({ error: "reauth_required", message: "Reconnect Zoho to grant Books access" });
  bad(res, err.status || 500, err.message);
});

// ---------- materials master ----------

router.get("/materials", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "MaterialType")).map(out);
  res.json(rows.sort((a, b) => String(a.code).localeCompare(String(b.code))));
}));

router.post("/materials", wrap(async (req, res) => {
  const { code, name, rate, uom = "KG", effectiveFrom = "", status = "Active", zohoItemId = "", zohoItemName = "" } = req.body || {};
  if (!code) return bad(res, 400, "code is required");
  const row = await req.catalyst.datastore().table("MaterialType").insertRow({
    code, name: name || code, rate: Number(rate) || 0, uom, effectiveFrom, status, zohoItemId, zohoItemName, orgId: req.orgId,
  });
  const m = out(row);
  await log(req, "MaterialType", m.id, "material.create", { code });
  res.status(201).json(m);
}));

router.put("/materials/:id", wrap(async (req, res) => {
  const id = req.params.id;
  if (!idOk(id) || !(await ownsRow(req.catalyst, "MaterialType", id))) return bad(res, 404, "Not found");
  const { code, name, rate, uom, effectiveFrom, status, zohoItemId, zohoItemName } = req.body || {};
  const data = { ROWID: id };
  if (code !== undefined) data.code = code;
  if (name !== undefined) data.name = name;
  if (rate !== undefined) data.rate = Number(rate) || 0;
  if (uom !== undefined) data.uom = uom;
  if (effectiveFrom !== undefined) data.effectiveFrom = effectiveFrom;
  if (status !== undefined) data.status = status;
  if (zohoItemId !== undefined) data.zohoItemId = zohoItemId;
  if (zohoItemName !== undefined) data.zohoItemName = zohoItemName;
  const m = out(await req.catalyst.datastore().table("MaterialType").updateRow(data));
  await log(req, "MaterialType", id, "material.update", { keys: Object.keys(data).filter((k) => k !== "ROWID") });
  res.json(m);
}));

router.delete("/materials/:id", wrap(async (req, res) => {
  const id = req.params.id;
  if (!idOk(id) || !(await ownsRow(req.catalyst, "MaterialType", id))) return bad(res, 404, "Not found");
  const used = rowList(
    await req.catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID FROM RecipeComponentOption WHERE materialId = ${zStr(id)} AND ${orgClause(req.catalyst)} LIMIT 1`,
    ),
  );
  if (used.length) return bad(res, 409, "Material is used by a recipe — set it Inactive instead");
  await req.catalyst.datastore().table("MaterialType").deleteRow(id);
  await log(req, "MaterialType", id, "material.delete");
  res.status(204).end();
}));

router.get("/cost-elements", wrap(async (req, res) => res.json(await costElements(req))));

// ---------- cost elements (master + per-recipe) ----------

const CALC_TYPES = ["RATE_QTY", "FIXED", "PERCENTAGE"];
const elCodeOf = (code, label) =>
  String(code || label).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

// Cost master: org-wide element with a default rate. Recipes referencing the
// same code pick the rate up automatically on every calculation.
router.post("/cost-elements", wrap(async (req, res) => {
  const { code, label, calcType = "FIXED", rate } = req.body || {};
  if (!label) return bad(res, 400, "label is required");
  if (!CALC_TYPES.includes(calcType)) return bad(res, 400, "Invalid calcType");
  const elCode = elCodeOf(code, label);
  if (!elCode) return bad(res, 400, "label must contain letters or digits");
  const existing = await costElements(req);
  if (existing.some((e) => e.code === elCode)) return bad(res, 409, `Cost element "${elCode}" already exists`);
  const row = await req.catalyst.datastore().table("CostElement").insertRow({
    code: elCode, label, calcType, rate: Number(rate) || 0, sequence: existing.length + 1,
    recipeTemplateId: "", orgId: req.orgId,
  });
  const el = out(row);
  await log(req, "CostElement", el.id, "cost_element.create", { code: elCode });
  res.status(201).json(el);
}));

router.post("/recipes/:id/cost-elements", wrap(async (req, res) => {
  const recipe = await editableRecipeOf(req, res, req.params.id);
  if (!recipe) return;
  const { code, label, calcType = "FIXED", rate } = req.body || {};
  if (!label) return bad(res, 400, "label is required");
  if (!CALC_TYPES.includes(calcType)) return bad(res, 400, "Invalid calcType");
  const elCode = elCodeOf(code, label);
  if (!elCode) return bad(res, 400, "label must contain letters or digits");
  const existing = await recipeCostElements(req, recipe);
  if (existing.some((e) => e.code === elCode)) return bad(res, 409, `Cost element "${elCode}" already exists`);
  const data = {
    code: elCode, label, calcType, sequence: existing.length + 1,
    recipeTemplateId: String(recipe.id), orgId: req.orgId,
  };
  if (rate !== undefined && rate !== null && rate !== "") data.rate = Number(rate) || 0;
  const row = await req.catalyst.datastore().table("CostElement").insertRow(data);
  await log(req, "RecipeTemplate", recipe.id, "recipe.update", { what: "cost element added", code: elCode });
  res.status(201).json(out(row));
}));

// Master rows (blank recipeTemplateId) are writable directly; per-recipe rows
// unless their recipe is an old (Superseded) copy.
async function writableElementById(req, res, id) {
  if (!idOk(id)) { bad(res, 404, "Not found"); return null; }
  const rows = rowList(
    await req.catalyst.zcql().executeZCQLQuery(
      `SELECT * FROM CostElement WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`,
    ),
  );
  const el = rows.length ? out(rows[0]) : null;
  if (!el) { bad(res, 404, "Not found"); return null; }
  if (!el.recipeTemplateId) return el; // master row
  return (await editableRecipeOf(req, res, el.recipeTemplateId)) ? el : null;
}

// Code stays immutable — renaming it would orphan fixedCosts keys on options
// and break the master-default lookup by code.
router.put("/cost-elements/:id", wrap(async (req, res) => {
  const el = await writableElementById(req, res, req.params.id);
  if (!el) return;
  const { label, calcType, sequence, rate } = req.body || {};
  const data = { ROWID: el.id };
  if (label !== undefined) data.label = label;
  if (calcType !== undefined) {
    if (!CALC_TYPES.includes(calcType)) return bad(res, 400, "Invalid calcType");
    data.calcType = calcType;
  }
  if (sequence !== undefined) data.sequence = Number(sequence) || 0;
  // Blank rate on a per-recipe row = "revert to the cost-master default".
  if (rate !== undefined) data.rate = rate === "" || rate === null ? null : Number(rate) || 0;
  const saved = out(await req.catalyst.datastore().table("CostElement").updateRow(data));
  if (el.recipeTemplateId) await log(req, "RecipeTemplate", el.recipeTemplateId, "recipe.update", { what: "cost element", code: el.code });
  else await log(req, "CostElement", el.id, "cost_element.update", { code: el.code });
  res.json(saved);
}));

// Leftover fixedCosts values keyed by the deleted code are harmless — calc
// only iterates the element list.
router.delete("/cost-elements/:id", wrap(async (req, res) => {
  const el = await writableElementById(req, res, req.params.id);
  if (!el) return;
  await req.catalyst.datastore().table("CostElement").deleteRow(el.id);
  if (el.recipeTemplateId) await log(req, "RecipeTemplate", el.recipeTemplateId, "recipe.update", { what: "cost element removed", code: el.code });
  else await log(req, "CostElement", el.id, "cost_element.delete", { code: el.code });
  res.status(204).end();
}));

// Thin ERP item list for the wizard's product step (independent of the
// sku-generator addon gate on /api/sku-items).
router.get("/products", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "SKUItem")).map(out);
  // service = Books product_type kept in booksData (sheet import CR-127, API import / refresh CR-254)
  const isService = (r) => { try { return JSON.parse(r.booksData || "{}").product_type === "service"; } catch { return false; } };
  res.json(rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name, type: r.type, inBooks: Boolean(r.zohoItemId), service: isService(r) })).sort((a, b) => String(a.sku).localeCompare(String(b.sku))));
}));

// Main product list of the Product Design form (CR-264): the Books org's active
// composite items as SKU-master rows [{ id, sku, name }]. Promotes / adds the
// rows the SKU master lacks, so productItemId stays a SKUItem ROWID.
router.get("/products/composites", wrap(async (req, res) => {
  res.json(await syncComposites(req.catalyst, req.orgId));
}));

// Create a Books SERVICE item from the design / component forms (CR-254):
// { name, sku, sac?, rate? } → Books item (product_type service, sales +
// purchases, no inventory fields) + SKUItem row flagged service. Lands in the
// "Books items" industry (the import target), else the org's first industry.
router.post("/service-items", wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim(), sku = String(b.sku || "").trim();
  if (!name || !sku) return bad(res, 400, "Name and SKU are required");
  if (await findSkuRowId(req.catalyst, sku)) return bad(res, 409, `SKU ${sku} already exists`);
  const industries = (await byOrgAll(req.catalyst, req.orgId, "Industry")).map(out);
  const ind = industries.find((i) => /books items/i.test(i.name || "")) || industries[0];
  if (!ind) return bad(res, 400, "Add a product (industry) first");
  const rate = Number(b.rate) || 0;
  const zohoItem = await createItem(req.catalyst, name, sku, b.description || "", undefined, undefined, {
    item_type: "sales_and_purchases", product_type: "service", unit: "nos", rate,
    ...(String(b.sac || "").trim() ? { hsn_or_sac: String(b.sac).trim() } : {}),
  });
  const row = out(await req.catalyst.datastore().table("SKUItem").insertRow({
    name, sku, description: b.description || null, type: "Trading", industryId: String(ind.id), zohoItemId: String(zohoItem.item_id),
    booksData: JSON.stringify({ product_type: "service", item_type: "sales_and_purchases", unit: "nos", rate }), orgId: req.orgId,
  }));
  await log(req, "SKUItem", row.id, "sku_item.create_service", { sku, zohoItemId: String(zohoItem.item_id) });
  res.status(201).json({ id: row.id, sku, name, inBooks: true, service: true });
}));

// Thin property list for the attribute picker (independent of the
// sku-generator addon gate on /api/properties, like /products above).
// Range properties are excluded — attributes pick from PropertyValue rows.
router.get("/properties", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "Property")).map(out)
    .filter((p) => p.valueType !== "Range");
  res.json(rows
    .map((p) => ({ id: p.id, name: p.name, caption: p.caption, unit: p.unit || "" }))
    .sort((a, b) => String(a.caption || a.name).localeCompare(String(b.caption || b.name))));
}));

// Batched values for the given property ids: { propertyId: [{id, displayValue, isDefault}] }.
// One request regardless of property count (function-concurrency 429 protection).
router.get("/property-values", wrap(async (req, res) => {
  const ids = String(req.query.ids || "").split(",").map((s) => s.trim()).filter(idOk);
  const byProp = {};
  if (ids.length) {
    const zcql = req.catalyst.zcql();
    for (let offset = 0; ; offset += 300) { // ZCQL pages at 300 rows
      const page = rowList(await zcql.executeZCQLQuery(
        `SELECT * FROM PropertyValue WHERE propertyId IN (${ids.join(",")}) AND ${orgClause(req.catalyst)} ORDER BY displayValue LIMIT 300 OFFSET ${offset}`,
      )).map(out);
      for (const v of page) {
        (byProp[v.propertyId] ||= []).push({ id: v.id, displayValue: v.displayValue, isDefault: v.isDefault === true });
      }
      if (page.length < 300) break;
    }
  }
  res.json(byProp);
}));

// ---------- recipe templates ----------

router.get("/recipes", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "RecipeTemplate")).map(out)
    .filter((r) => r.status !== "Superseded"); // pre-CR-266 old versions
  rows.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  res.json(rows);
}));

router.get("/recipes/:id", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!recipe) return bad(res, 404, "Not found");
  const bundle = await loadBundle(req, recipe);
  const matById = new Map(bundle.materials.map((m) => [String(m.id), m]));
  // Pre-compute each option's cost so the UI never owns pricing math.
  bundle.options = bundle.options.map((o) => {
    const m = matById.get(String(o.materialId)) || null;
    return { ...o, materialRate: m ? m.rate : null, cost: optionCost(o, m, bundle.costElements) };
  });
  res.json(bundle);
}));

// Optional SKU-master link (CR-221), own-org only; anything else = "". The
// New/Edit page no longer sets it (CR-236: a component is a plain name).
async function skuItemRef(req, id) {
  return idOk(id) && (await ownsRow(req.catalyst, "SKUItem", id)) ? String(id) : "";
}

// CR-236: sync a component's allowed materials (RecipeComponentOption) to a
// list of MaterialType ids. Diff, not replace — retained options keep their
// castWeight / fixed costs. Unknown or cross-org ids are skipped.
async function syncMaterials(req, recipe, compId, materialIds) {
  const ds = req.catalyst.datastore();
  const want = new Set(materialIds.map(String));
  const have = (await byOrgAll(req.catalyst, req.orgId, "RecipeComponentOption", `componentId = ${zStr(compId)}`)).map(out);
  for (const o of have) if (!want.has(String(o.materialId))) await ds.table("RecipeComponentOption").deleteRow(o.id);
  const haveIds = new Set(have.map((o) => String(o.materialId)));
  for (const mid of want) {
    if (haveIds.has(mid) || !idOk(mid) || !(await ownsRow(req.catalyst, "MaterialType", mid))) continue;
    const mat = out(rowList(await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM MaterialType WHERE ROWID = ${mid}`))[0]);
    await ds.table("RecipeComponentOption").insertRow({
      componentId: compId, recipeId: recipe.id, materialId: mid, materialCode: mat.code,
      castWeight: 0, fixedCostsJson: "{}", enabled: true, orgId: req.orgId,
    });
  }
}

// Bulk upsert shared by single-form create and the builder's Save. Rows keep
// table order (sequence = index + 1). Never deletes components — options/attrs
// hang off componentId; deletion stays the explicit DELETE /components/:id.
async function upsertComponents(req, recipe, rows) {
  const ds = req.catalyst.datastore();
  const propById = new Map((await byOrgAll(req.catalyst, req.orgId, "Property")).map(out).map((p) => [String(p.id), p]));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    if (!r.name) continue;
    let compId = idOk(r.id) && (await ownsRow(req.catalyst, "RecipeComponent", r.id)) ? String(r.id) : null;
    const fields = {
      name: r.name, question: r.question || "", sequence: i + 1,
      qty: Number(r.qty) || 1, uom: r.uom || "Nos", required: r.required !== false,
      allowMaterial: r.allowMaterial !== false, allowQtyOverride: r.allowQtyOverride === true,
      allowComponentOverride: r.allowComponentOverride === true,
    };
    if (r.skuItemId !== undefined) fields.skuItemId = await skuItemRef(req, r.skuItemId);
    if (compId) {
      await ds.table("RecipeComponent").updateRow({ ROWID: compId, ...fields });
    } else {
      const row = await ds.table("RecipeComponent").insertRow({
        recipeId: recipe.id, code: r.code || r.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
        ...fields, parentComponentId: "", orgId: req.orgId,
      });
      compId = String(out(row).id);
    }
    if (Array.isArray(r.materialIds)) await syncMaterials(req, recipe, compId, r.materialIds);
    if (r.attrs === undefined) continue;
    // Attrs are full-replace per component — nothing references an attr row.
    for (const a of await byOrgAll(req.catalyst, req.orgId, "RecipeComponentAttr", `componentId = ${zStr(compId)}`)) {
      await ds.table("RecipeComponentAttr").deleteRow(a.ROWID);
    }
    const attrs = Array.isArray(r.attrs) ? r.attrs : [];
    for (let j = 0; j < attrs.length; j++) {
      const prop = propById.get(String(attrs[j].propertyId));
      if (!prop) continue; // unknown / cross-org propertyId
      await ds.table("RecipeComponentAttr").insertRow({
        recipeId: recipe.id, componentId: compId, propertyId: String(prop.id),
        propertyName: prop.caption || prop.name, unit: prop.unit || "",
        required: attrs[j].required !== false, defaultValueId: String(attrs[j].defaultValueId || ""),
        sequence: j + 1, orgId: req.orgId,
      });
    }
  }
}

router.post("/recipes", wrap(async (req, res) => {
  const { code, name, productItemId = "", productCode = "", productName = "", effectiveFrom = "", uom = "", components } = req.body || {};
  if (!code || !name) return bad(res, 400, "code and name are required");
  const dupe = rowList(
    await req.catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID FROM RecipeTemplate WHERE code = ${zStr(code)} AND ${orgClause(req.catalyst)} LIMIT 1`,
    ),
  );
  if (dupe.length) return bad(res, 409, `Recipe code "${code}" already exists`);
  const row = await req.catalyst.datastore().table("RecipeTemplate").insertRow({
    code, name, productItemId, productCode, productName, version: 1, status: "Published",
    effectiveFrom, uom: uom ? normUom(uom, uomsOf(await settings(req.catalyst, req.orgId))) : "",
    changeReason: "", updatedBy: String(req.userId || ""), orgId: req.orgId,
  });
  const recipe = out(row);
  // Single-form create: recipe + all components (+ attrs) in one request.
  if (Array.isArray(components) && components.length) await upsertComponents(req, recipe, components);
  await log(req, "RecipeTemplate", recipe.id, "recipe.create", { code });
  res.status(201).json(recipe);
}));

// Builder save: the whole component table in one request (429-safe).
router.put("/recipes/:id/components-bulk", wrap(async (req, res) => {
  const recipe = await editableRecipeOf(req, res, req.params.id);
  if (!recipe) return;
  const comps = (req.body && req.body.components) || [];
  await upsertComponents(req, recipe, comps);
  await log(req, "RecipeTemplate", recipe.id, "recipe.update", { what: "items", count: comps.length });
  res.json({ ok: true });
}));

router.put("/recipes/:id", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!assertEditable(res, recipe)) return;
  const { name, productItemId, productCode, productName, effectiveFrom, changeReason, uom } = req.body || {};
  const data = { ROWID: recipe.id, updatedBy: String(req.userId || "") };
  for (const [k, v] of Object.entries({ name, productItemId, productCode, productName, effectiveFrom, changeReason })) {
    if (v !== undefined) data[k] = v;
  }
  if (uom !== undefined) data.uom = uom ? normUom(uom, uomsOf(await settings(req.catalyst, req.orgId))) : "";
  const saved = out(await req.catalyst.datastore().table("RecipeTemplate").updateRow(data));
  await log(req, "RecipeTemplate", recipe.id, "recipe.update", { keys: Object.keys(data).filter((k) => k !== "ROWID" && k !== "updatedBy") });
  res.json(saved);
}));

router.delete("/recipes/:id", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!assertEditable(res, recipe)) return;
  const ds = req.catalyst.datastore();
  // No DB cascade: remove options + attrs + components by hand.
  for (const o of await byOrgAll(req.catalyst, req.orgId, "RecipeComponentOption", `recipeId = ${zStr(recipe.id)}`)) {
    await ds.table("RecipeComponentOption").deleteRow(o.ROWID);
  }
  for (const a of await byOrgAll(req.catalyst, req.orgId, "RecipeComponentAttr", `recipeId = ${zStr(recipe.id)}`)) {
    await ds.table("RecipeComponentAttr").deleteRow(a.ROWID);
  }
  for (const c of await byOrgAll(req.catalyst, req.orgId, "RecipeComponent", `recipeId = ${zStr(recipe.id)}`)) {
    await ds.table("RecipeComponent").deleteRow(c.ROWID);
  }
  for (const e of await recipeCostElements(req, recipe)) {
    await ds.table("CostElement").deleteRow(e.id);
  }
  await ds.table("RecipeTemplate").deleteRow(recipe.id);
  await log(req, "RecipeTemplate", recipe.id, "recipe.delete", { code: recipe.code });
  res.status(204).end();
}));

// ---------- components ----------

router.post("/recipes/:id/components", wrap(async (req, res) => {
  const recipe = await editableRecipeOf(req, res, req.params.id);
  if (!recipe) return;
  const { code = "", name, question = "", qty = 1, uom = "Nos", required = true,
    allowMaterial = true, allowQtyOverride = false, allowComponentOverride = false, skuItemId } = req.body || {};
  if (!name) return bad(res, 400, "name is required");
  const existing = await byOrgAll(req.catalyst, req.orgId, "RecipeComponent", `recipeId = ${zStr(recipe.id)}`);
  const row = await req.catalyst.datastore().table("RecipeComponent").insertRow({
    recipeId: recipe.id, code: code || name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), name, question,
    sequence: existing.length + 1, qty: Number(qty) || 1, uom, required: !!required,
    allowMaterial: !!allowMaterial, allowQtyOverride: !!allowQtyOverride,
    allowComponentOverride: !!allowComponentOverride, parentComponentId: "", orgId: req.orgId,
    skuItemId: await skuItemRef(req, skuItemId),
  });
  await log(req, "RecipeTemplate", recipe.id, "recipe.update", { what: "item added", name });
  res.status(201).json(out(row));
}));

async function componentById(req, id) {
  if (!idOk(id)) return null;
  const rows = rowList(
    await req.catalyst.zcql().executeZCQLQuery(
      `SELECT * FROM RecipeComponent WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`,
    ),
  );
  return rows.length ? out(rows[0]) : null;
}

router.put("/components/:id", wrap(async (req, res) => {
  const comp = await componentById(req, req.params.id);
  if (!comp) return bad(res, 404, "Not found");
  if (!(await editableRecipeOf(req, res, comp.recipeId))) return;
  const data = { ROWID: comp.id };
  const { code, name, question, qty, uom, required, allowMaterial, allowQtyOverride, allowComponentOverride, sequence, skuItemId } = req.body || {};
  if (code !== undefined) data.code = code;
  if (skuItemId !== undefined) data.skuItemId = await skuItemRef(req, skuItemId);
  if (name !== undefined) data.name = name;
  if (question !== undefined) data.question = question;
  if (qty !== undefined) data.qty = Number(qty) || 1;
  if (uom !== undefined) data.uom = uom;
  if (sequence !== undefined) data.sequence = Number(sequence) || 0;
  for (const [k, v] of Object.entries({ required, allowMaterial, allowQtyOverride, allowComponentOverride })) {
    if (v !== undefined) data[k] = !!v;
  }
  const saved = out(await req.catalyst.datastore().table("RecipeComponent").updateRow(data));
  await log(req, "RecipeTemplate", comp.recipeId, "recipe.update", { what: "item", name: comp.name });
  res.json(saved);
}));

// Drag-and-drop reorder: body { ids: [componentId in new order] }.
router.put("/recipes/:id/component-order", wrap(async (req, res) => {
  const recipe = await editableRecipeOf(req, res, req.params.id);
  if (!recipe) return;
  const ids = (req.body && req.body.ids) || [];
  const table = req.catalyst.datastore().table("RecipeComponent");
  for (let i = 0; i < ids.length; i++) {
    if (!idOk(ids[i]) || !(await ownsRow(req.catalyst, "RecipeComponent", ids[i]))) continue;
    await table.updateRow({ ROWID: ids[i], sequence: i + 1 });
  }
  await log(req, "RecipeTemplate", recipe.id, "recipe.update", { what: "item order" });
  res.json({ ok: true });
}));

router.delete("/components/:id", wrap(async (req, res) => {
  const comp = await componentById(req, req.params.id);
  if (!comp) return bad(res, 404, "Not found");
  if (!(await editableRecipeOf(req, res, comp.recipeId))) return;
  const ds = req.catalyst.datastore();
  for (const o of await byOrgAll(req.catalyst, req.orgId, "RecipeComponentOption", `componentId = ${zStr(comp.id)}`)) {
    await ds.table("RecipeComponentOption").deleteRow(o.ROWID);
  }
  for (const a of await byOrgAll(req.catalyst, req.orgId, "RecipeComponentAttr", `componentId = ${zStr(comp.id)}`)) {
    await ds.table("RecipeComponentAttr").deleteRow(a.ROWID);
  }
  await ds.table("RecipeComponent").deleteRow(comp.id);
  await log(req, "RecipeTemplate", comp.recipeId, "recipe.update", { what: "item removed", name: comp.name });
  res.status(204).end();
}));

// ---------- component material options ----------

router.post("/components/:id/options", wrap(async (req, res) => {
  const comp = await componentById(req, req.params.id);
  if (!comp) return bad(res, 404, "Not found");
  if (!(await editableRecipeOf(req, res, comp.recipeId))) return;
  const { materialId, castWeight = 0, fixedCosts = {}, enabled = true } = req.body || {};
  if (!idOk(materialId) || !(await ownsRow(req.catalyst, "MaterialType", materialId))) return bad(res, 400, "Invalid materialId");
  const mat = out(rowList(await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM MaterialType WHERE ROWID = ${materialId}`))[0]);
  const dupe = await byOrgAll(req.catalyst, req.orgId, "RecipeComponentOption",
    `componentId = ${zStr(comp.id)} AND materialId = ${zStr(String(materialId))}`);
  if (dupe.length) return bad(res, 409, "Material already allowed for this component");
  const row = await req.catalyst.datastore().table("RecipeComponentOption").insertRow({
    componentId: comp.id, recipeId: comp.recipeId, materialId: String(materialId), materialCode: mat.code,
    castWeight: Number(castWeight) || 0, fixedCostsJson: JSON.stringify(fixedCosts || {}), enabled: !!enabled, orgId: req.orgId,
  });
  await log(req, "RecipeTemplate", comp.recipeId, "recipe.update", { what: "material allowed", component: comp.name, material: mat.code });
  res.status(201).json(parseFixed(out(row)));
}));

async function optionById(req, id) {
  if (!idOk(id)) return null;
  const rows = rowList(
    await req.catalyst.zcql().executeZCQLQuery(
      `SELECT * FROM RecipeComponentOption WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`,
    ),
  );
  return rows.length ? out(rows[0]) : null;
}

router.put("/options/:id", wrap(async (req, res) => {
  const opt = await optionById(req, req.params.id);
  if (!opt) return bad(res, 404, "Not found");
  if (!(await editableRecipeOf(req, res, opt.recipeId))) return;
  const { castWeight, fixedCosts, enabled } = req.body || {};
  const data = { ROWID: opt.id };
  if (castWeight !== undefined) data.castWeight = Number(castWeight) || 0;
  if (fixedCosts !== undefined) data.fixedCostsJson = JSON.stringify(fixedCosts || {});
  if (enabled !== undefined) data.enabled = !!enabled;
  const saved = parseFixed(out(await req.catalyst.datastore().table("RecipeComponentOption").updateRow(data)));
  await log(req, "RecipeTemplate", opt.recipeId, "recipe.update", { what: "material", material: opt.materialCode });
  res.json(saved);
}));

router.delete("/options/:id", wrap(async (req, res) => {
  const opt = await optionById(req, req.params.id);
  if (!opt) return bad(res, 404, "Not found");
  if (!(await editableRecipeOf(req, res, opt.recipeId))) return;
  await req.catalyst.datastore().table("RecipeComponentOption").deleteRow(opt.id);
  await log(req, "RecipeTemplate", opt.recipeId, "recipe.update", { what: "material removed", material: opt.materialCode });
  res.status(204).end();
}));

// ---------- clone / status ----------

// Deep-copies a design (header + CostElement + RecipeComponent + Option + Attr)
// into a new, live row under the code / name in `header` (clone, CR-230).
async function copyRecipeInto(req, recipe, header) {
  const ds = req.catalyst.datastore();
  const copy = out(await ds.table("RecipeTemplate").insertRow({
    code: recipe.code, name: recipe.name, productItemId: recipe.productItemId || "",
    productCode: recipe.productCode || "", productName: recipe.productName || "",
    version: 1, status: "Published", effectiveFrom: recipe.effectiveFrom || "", uom: recipe.uom || "",
    booksCompositeItemId: "", changeReason: "", updatedBy: String(req.userId || ""), orgId: req.orgId,
    ...header,
  }));
  // Raw rows, not recipeCostElements(): that helper merges the live master
  // rate in, and copying it would freeze the default into the copy.
  for (const e of (await byOrgAll(req.catalyst, req.orgId, "CostElement", `recipeTemplateId = ${zStr(String(recipe.id))}`)).map(out)) {
    const data = {
      code: e.code, label: e.label, calcType: e.calcType, sequence: e.sequence || 0,
      recipeTemplateId: String(copy.id), orgId: req.orgId,
    };
    if (e.rate !== null && e.rate !== undefined && e.rate !== "") data.rate = e.rate;
    await ds.table("CostElement").insertRow(data);
  }
  const comps = (await byOrgAll(req.catalyst, req.orgId, "RecipeComponent", `recipeId = ${zStr(recipe.id)}`)).map(out);
  const opts = (await byOrgAll(req.catalyst, req.orgId, "RecipeComponentOption", `recipeId = ${zStr(recipe.id)}`)).map(out);
  const attrs = (await byOrgAll(req.catalyst, req.orgId, "RecipeComponentAttr", `recipeId = ${zStr(recipe.id)}`)).map(out);
  for (const c of comps) {
    const nc = out(await ds.table("RecipeComponent").insertRow({
      recipeId: copy.id, code: c.code || "", name: c.name || "", question: c.question || "",
      sequence: c.sequence || 0, qty: c.qty || 1, uom: c.uom || "", required: c.required === true,
      allowMaterial: c.allowMaterial === true, allowQtyOverride: c.allowQtyOverride === true,
      allowComponentOverride: c.allowComponentOverride === true, parentComponentId: "", orgId: req.orgId,
    }));
    for (const o of opts.filter((o) => String(o.componentId) === String(c.id))) {
      await ds.table("RecipeComponentOption").insertRow({
        componentId: nc.id, recipeId: copy.id, materialId: o.materialId || "", materialCode: o.materialCode || "",
        castWeight: o.castWeight || 0, fixedCostsJson: o.fixedCostsJson || "{}", enabled: o.enabled !== false, orgId: req.orgId,
      });
    }
    for (const a of attrs.filter((a) => String(a.componentId) === String(c.id))) {
      await ds.table("RecipeComponentAttr").insertRow({
        componentId: nc.id, recipeId: copy.id, propertyId: a.propertyId || "", propertyName: a.propertyName || "",
        unit: a.unit || "", required: a.required === true, defaultValueId: a.defaultValueId || "",
        sequence: a.sequence || 0, orgId: req.orgId,
      });
    }
  }
  return copy;
}

// Clone (CR-230): same design under a new code, live at once, no Books link.
router.post("/recipes/:id/clone", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!recipe) return bad(res, 404, "Not found");
  const { code, name } = req.body || {};
  if (!code || !name) return bad(res, 400, "code and name are required");
  const dupe = rowList(await req.catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID FROM RecipeTemplate WHERE code = ${zStr(code)} AND ${orgClause(req.catalyst)} LIMIT 1`,
  ));
  if (dupe.length) return bad(res, 409, `Recipe code "${code}" already exists`);
  const copy = await copyRecipeInto(req, recipe, { code, name, changeReason: `Cloned from ${recipe.code}` });
  await log(req, "RecipeTemplate", recipe.id, "recipe.clone", { to: code });
  await log(req, "RecipeTemplate", copy.id, "recipe.create", { code, from: recipe.code });
  res.status(201).json(copy);
}));

// Mark inactive / active (CR-230): Published (= Active) ↔ Archived (= Inactive)
// only; Superseded rows are pre-CR-266 history and never move.
router.put("/recipes/:id/status", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!recipe) return bad(res, 404, "Not found");
  const to = req.body && req.body.status;
  const ok = (recipe.status === "Published" && to === "Archived") || (recipe.status === "Archived" && to === "Published");
  if (!ok) return bad(res, 409, "This design cannot change status");
  if (to === "Published") {
    const live = (await byOrgAll(req.catalyst, req.orgId, "RecipeTemplate", `code = ${zStr(recipe.code)} AND status = 'Published'`)).map(out);
    if (live.length) return bad(res, 409, "Another active design already uses this SKU");
  }
  const saved = out(await req.catalyst.datastore().table("RecipeTemplate").updateRow({ ROWID: recipe.id, status: to, updatedBy: String(req.userId || "") }));
  await log(req, "RecipeTemplate", recipe.id, "recipe.status", { from: recipe.status, to });
  res.json(saved);
}));

// ---------- Books push (CR-143) ----------

// Books says the composite no longer exists: GET → 1002/404, PUT → 2006/400.
const isGone = (e) => e.zohoCode === 1002 || e.zohoCode === 2006 || e.httpStatus === 404;

// Materials-page typeahead for linking a material to a Books raw-material item.
router.get("/books-items", wrap(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json([]);
  res.json((await searchItems(req.catalyst, q)).map((i) => ({
    id: String(i.item_id), name: i.name, sku: i.sku || null, unit: i.unit || "",
  })));
}));

// Configurator (CR-223): every Books item under item category <parent> → <child>,
// e.g. MOC → CI lists Casing CI, Side Cover CI… Unknown pair → []. Display only;
// the composite BOM still comes from the Component Map.
router.get("/category-items", wrap(async (req, res) => {
  const key = (s) => String(s || "").trim().toLowerCase();
  const parent = key(req.query.parent), child = key(req.query.child);
  if (!parent || !child) return res.json([]);
  const cat = (await listCategories(req.catalyst)).find((c) => key(c.name) === child && key(c.parent_category_name) === parent);
  if (!cat) return res.json([]);
  res.json((await listItemsByCategory(req.catalyst, cat.category_id)).map((i) => ({
    id: String(i.item_id), name: i.name, sku: i.sku || null, unit: i.unit || "",
  })));
}));

// Push-dialog picker: every composite item in the Books org.
router.get("/books-composites", wrap(async (req, res) => {
  res.json((await listCompositeItems(req.catalyst)).map((c) => ({
    id: String(c.composite_item_id), name: c.name, sku: c.sku || null, status: c.status || "",
  })));
}));

// Create/overwrite the linked Books composite from the recipe's default BOM
// (first enabled option per component). Recipe is source of truth: push fully
// replaces mapped_items; Books name/sku stay user-owned on update.
router.post("/recipes/:id/push-books", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!recipe) return bad(res, 404, "Not found");
  if (recipe.status !== "Published") {
    return bad(res, 409, recipe.status === "Archived" ? "Inactive design — mark it active first" : "This is an old copy of the design — push the current one");
  }
  const { components, options, materials } = await loadBundle(req, recipe);
  // Services (CR-254): components linked to a SKU-master item instead of a material.
  const svcIds = [...new Set(components.map((c) => c.skuItemId).filter((v) => idOk(v)))];
  const items = new Map(svcIds.length ? rowList(await req.catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID, sku, name, zohoItemId FROM SKUItem WHERE ROWID IN (${svcIds.join(",")}) AND ${orgClause(req.catalyst)}`,
  )).map(out).map((it) => [String(it.id), it]) : []);
  const { lines, unlinked, skipped } = bomLines({ components, options, materials, items });
  if (unlinked.length) {
    return res.status(400).json({
      error: `Link these to a Books item first: ${unlinked.map((u) => u.code).join(", ")}`,
      unlinked,
    });
  }
  if (!lines.length) return bad(res, 400, "Recipe produces an empty BOM");
  const table = req.catalyst.datastore().table("RecipeTemplate");
  const linkId = recipe.booksCompositeItemId || String((req.body && req.body.compositeItemId) || "");
  let comp;
  if (linkId) {
    try {
      comp = await updateCompositeItem(req.catalyst, linkId, lines);
    } catch (e) {
      if (!isGone(e)) throw e;
      if (recipe.booksCompositeItemId) await table.updateRow({ ROWID: recipe.id, booksCompositeItemId: "" });
      return bad(res, 409, "The linked composite no longer exists in Books — push again to re-link or create a new one");
    }
  } else {
    comp = await createCompositeItem(req.catalyst, {
      name: recipe.name, sku: recipe.productCode || recipe.code, mappedItems: lines,
    });
  }
  const id = String((comp && comp.composite_item_id) || linkId);
  if (id !== String(recipe.booksCompositeItemId || "")) {
    await table.updateRow({ ROWID: recipe.id, booksCompositeItemId: id });
  }
  await bom.refreshComposite(req.catalyst, req.orgId, id).catch((e) => console.error("composite cache refresh failed", e.message));
  await log(req, "RecipeTemplate", recipe.id, "recipe.push_books", { compositeItemId: id, created: !linkId });
  res.json({ compositeItemId: id, name: (comp && comp.name) || recipe.name, created: !linkId, lines, skipped });
}));

// ---------- calculation + quotations ----------

router.post("/recipes/:id/calculate", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!recipe) return bad(res, 404, "Not found");
  const bundle = await loadBundle(req, recipe);
  const { qty, selections, overrides, marginPct, discountPct, gstPct } = req.body || {};
  res.json(computeQuote({ ...bundle, selections, overrides, qty, marginPct, discountPct, gstPct }));
}));

router.get("/quotations", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "RecipeQuotation")).map(out);
  rows.forEach((r) => delete r.snapshotJson); // list stays light
  res.json(rows.sort((a, b) => String(b.qtnNo).localeCompare(String(a.qtnNo))));
}));

router.get("/quotations/:id", wrap(async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return bad(res, 404, "Not found");
  const rows = rowList(
    await req.catalyst.zcql().executeZCQLQuery(
      `SELECT * FROM RecipeQuotation WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`,
    ),
  );
  if (!rows.length) return bad(res, 404, "Not found");
  const q = out(rows[0]);
  q.snapshot = safeJson(q.snapshotJson);
  delete q.snapshotJson;
  res.json(q);
}));

router.post("/quotations", wrap(async (req, res) => {
  const { recipeId, qty, selections, overrides, marginPct = 0, discountPct = 0, gstPct = 0 } = req.body || {};
  const recipe = await recipeById(req, recipeId);
  if (!recipe) return bad(res, 404, "Recipe not found");
  if (recipe.status !== "Published") return bad(res, 400, "Only active designs can be quoted");
  const bundle = await loadBundle(req, recipe);
  const quote = computeQuote({ ...bundle, selections, overrides, qty, marginPct, discountPct, gstPct });
  const snapshot = {
    capturedAt: new Date().toISOString(),
    recipe: { id: recipe.id, code: recipe.code, name: recipe.name, version: recipe.version },
    product: { code: recipe.productCode || "", name: recipe.productName || "" },
    elementsMeta: bundle.costElements.map((e) => ({ code: e.code, label: e.label, calcType: e.calcType })),
    qty: quote.qty, marginPct: Number(marginPct) || 0, discountPct: Number(discountPct) || 0, gstPct: Number(gstPct) || 0,
    lines: quote.lines, unitCost: quote.unitCost, unitPrice: quote.unitPrice, orderValue: quote.orderValue,
  };
  const json = JSON.stringify(snapshot);
  // snapshotJson column is text(10000) — Data Store's API max. ~40 component
  // lines fit; reject clearly instead of storing a truncated snapshot.
  if (json.length > 9500) return bad(res, 413, "Configuration too large to snapshot");
  const qtnNo = await nextNumber(req.catalyst, req.orgId, "RecipeQuotation", "qtnNo", "QTN-");
  const row = await req.catalyst.datastore().table("RecipeQuotation").insertRow({
    qtnNo, status: "Quotation", productCode: recipe.productCode || "", productName: recipe.productName || "",
    recipeCode: recipe.code, recipeVersion: recipe.version, qty: quote.qty,
    marginPct: Number(marginPct) || 0, discountPct: Number(discountPct) || 0, gstPct: Number(gstPct) || 0,
    unitCost: quote.unitCost, unitPrice: quote.unitPrice, orderValue: quote.orderValue,
    snapshotJson: json, createdBy: String(req.userId || ""), orgId: req.orgId,
  });
  const created = out(row);
  await log(req, "RecipeQuotation", created.id, "quotation.create", { qtnNo, recipe: recipe.code });
  created.snapshot = snapshot;
  delete created.snapshotJson;
  res.status(201).json(created);
}));

router.post("/quotations/:id/convert", wrap(async (req, res) => {
  const id = req.params.id;
  if (!idOk(id) || !(await ownsRow(req.catalyst, "RecipeQuotation", id))) return bad(res, 404, "Not found");
  const rows = rowList(await req.catalyst.zcql().executeZCQLQuery(`SELECT status FROM RecipeQuotation WHERE ROWID = ${id}`));
  if (rows[0].status !== "Quotation") return bad(res, 409, "Only quotations can be converted");
  await req.catalyst.datastore().table("RecipeQuotation").updateRow({ ROWID: id, status: "Order" });
  await log(req, "RecipeQuotation", id, "quotation.convert", { to: "Order" });
  res.json({ ok: true, status: "Order" });
}));

// ---------- sizing models (Product Configurator, CR-181) ----------

// skuItemId (CR-226): the Books valve item (SKU master row) the widget quotes for
// this model; blank = the widget generates a new SKU for the pick.
const SIZING_FIELDS = ["industryId", "groupValue", "series", "modelCode", "recipeCode", "status", "skuItemId"];
const sizingItemOk = async (req, id) => !id || (idOk(id) && (await ownsRow(req.catalyst, "SKUItem", id)));

router.get("/sizing-models", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "SizingModel")).map(out);
  res.json(rows.sort((a, b) => String(a.series).localeCompare(String(b.series)) || a.capacity - b.capacity));
}));

router.post("/sizing-models", wrap(async (req, res) => {
  const b = req.body || {};
  if (!idOk(b.industryId) || !(await ownsRow(req.catalyst, "Industry", b.industryId))) return bad(res, 400, "Valid industryId is required");
  if (!b.modelCode || !b.series || !(Number(b.capacity) > 0)) return bad(res, 400, "series, modelCode and a capacity above zero are required");
  if (!(await sizingItemOk(req, b.skuItemId))) return bad(res, 400, "Invalid skuItemId");
  const row = await req.catalyst.datastore().table("SizingModel").insertRow({
    industryId: String(b.industryId), groupValue: b.groupValue || "", series: b.series, modelCode: b.modelCode,
    capacity: Number(b.capacity), recipeCode: b.recipeCode || "", status: b.status || "Active",
    skuItemId: b.skuItemId ? String(b.skuItemId) : "", orgId: req.orgId,
  });
  const m = out(row);
  await log(req, "SizingModel", m.id, "sizing_model.create", { modelCode: b.modelCode });
  res.status(201).json(m);
}));

router.put("/sizing-models/:id", wrap(async (req, res) => {
  const id = req.params.id;
  if (!idOk(id) || !(await ownsRow(req.catalyst, "SizingModel", id))) return bad(res, 404, "Not found");
  const b = req.body || {};
  if (b.industryId !== undefined && (!idOk(b.industryId) || !(await ownsRow(req.catalyst, "Industry", b.industryId)))) return bad(res, 400, "Invalid industryId");
  if (b.capacity !== undefined && !(Number(b.capacity) > 0)) return bad(res, 400, "capacity must be above zero");
  if (b.skuItemId !== undefined && !(await sizingItemOk(req, b.skuItemId))) return bad(res, 400, "Invalid skuItemId");
  const data = { ROWID: id };
  for (const f of SIZING_FIELDS) if (b[f] !== undefined) data[f] = String(b[f]);
  if (b.capacity !== undefined) data.capacity = Number(b.capacity);
  const m = out(await req.catalyst.datastore().table("SizingModel").updateRow(data));
  await log(req, "SizingModel", id, "sizing_model.update", { keys: Object.keys(data).filter((k) => k !== "ROWID") });
  res.json(m);
}));

router.delete("/sizing-models/:id", wrap(async (req, res) => {
  const id = req.params.id;
  if (!idOk(id) || !(await ownsRow(req.catalyst, "SizingModel", id))) return bad(res, 404, "Not found");
  await req.catalyst.datastore().table("SizingModel").deleteRow(id);
  await log(req, "SizingModel", id, "sizing_model.delete");
  res.status(204).end();
}));

// ---------- component map (Product Configurator: answers -> component items) ----------

// conditions: [{propertyId, valueId}], AND-ed. Returns the JSON string, or null when invalid.
function conditionsJson(conditions) {
  if (conditions === undefined) return "[]";
  if (!Array.isArray(conditions) || !conditions.every((c) => c && idOk(c.propertyId) && idOk(c.valueId))) return null;
  const json = JSON.stringify(conditions.map((c) => ({ propertyId: String(c.propertyId), valueId: String(c.valueId) })));
  return json.length > 9500 ? null : json; // text column silently caps at 10000
}

// Shared by POST and PUT: validates the fields present in `b`, returns the row data or an error string.
async function componentMapData(req, b, partial) {
  const data = {};
  if (!partial || b.industryId !== undefined) {
    if (!idOk(b.industryId) || !(await ownsRow(req.catalyst, "Industry", b.industryId))) return "Valid industryId is required";
    data.industryId = String(b.industryId);
  }
  if (!partial || b.skuItemId !== undefined) {
    if (!idOk(b.skuItemId) || !(await ownsRow(req.catalyst, "SKUItem", b.skuItemId))) return "Valid skuItemId is required";
    data.skuItemId = String(b.skuItemId);
  }
  if (!partial || b.component !== undefined) {
    if (!String(b.component || "").trim()) return "component is required";
    data.component = String(b.component).trim().slice(0, 255);
  }
  if (!partial || b.conditions !== undefined) {
    const json = conditionsJson(b.conditions);
    if (json === null) return "conditions must be a list of {propertyId, valueId}";
    data.conditionsJson = json;
  }
  if (b.qtyPropertyId !== undefined) {
    if (b.qtyPropertyId && !idOk(b.qtyPropertyId)) return "Invalid qtyPropertyId";
    data.qtyPropertyId = b.qtyPropertyId ? String(b.qtyPropertyId) : "";
  }
  if (!partial || b.qty !== undefined) {
    const qty = b.qty === undefined || b.qty === "" ? 1 : Number(b.qty);
    if (!(qty > 0)) return "qty must be above zero";
    data.qty = qty;
  }
  if (!partial || b.uom !== undefined) data.uom = normUom(b.uom, uomsOf(await settings(req.catalyst, req.orgId)));
  if (b.required !== undefined) data.required = b.required === true || b.required === "true" ? "true" : "false";
  // CR-195: the component is sold as its own quote/SO line, not a BOM line.
  if (b.asQuoteLine !== undefined) data.asQuoteLine = b.asQuoteLine === true || b.asQuoteLine === "true" ? "true" : "false";
  if (!partial || b.status !== undefined) data.status = b.status || "Active";
  return data;
}

const mapOut = (r) => { const o = out(r); return { ...o, conditions: safeList(o.conditionsJson) }; };
function safeList(s) {
  try { const v = JSON.parse(s || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

// Units for the Component Map + template builder selects: the org's list
// (SKU Settings → Units of measure, CR-216) or the default one.
router.get("/uoms", wrap(async (req, res) => res.json(uomsOf(await settings(req.catalyst, req.orgId)))));

router.get("/component-map", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "ComponentMap")).map(mapOut);
  res.json(rows.sort((a, b) => String(a.component).localeCompare(String(b.component)) || a.conditions.length - b.conditions.length));
}));

// ---- Components form (CR-253): one component = its rows, saved as a unit ----
// The end-user model is "component X is item Y always" or "depends on one
// question: answer → item". Both are plain ComponentMap rows (0 / 1 condition),
// so nothing downstream changes; these routes only read and write the group.
const groupWhere = (industryId, component) => `industryId = ${zStr(String(industryId))} AND component = ${zStr(String(component).trim())}`;

router.get("/component-map/components", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "ComponentMap")).map(mapOut);
  res.json(groupRows(rows).sort((a, b) => String(a.component).localeCompare(String(b.component))));
}));

// { industryId, component, from?, propertyId|null, items:[{valueId?, skuItemId}],
//   qty, uom, qtyPropertyId, required, asQuoteLine, status }
// `from` = the existing name when renaming. Rows fitting the new shape (or the
// old simple shape) are diff-synced by answer: update in place, insert missing,
// delete dropped. Advanced rows are left alone (renamed only).
router.put("/component-map/component", wrap(async (req, res) => {
  const b = req.body || {};
  const component = String(b.component || "").trim().slice(0, 255);
  const propertyId = b.propertyId ? String(b.propertyId) : null;
  const items = (Array.isArray(b.items) ? b.items : []).filter((it) => it && it.skuItemId);
  if (!component) return bad(res, 400, "Component is required");
  if (propertyId && !(idOk(propertyId) && (await ownsRow(req.catalyst, "Property", propertyId)))) return bad(res, 400, "Invalid question");
  if (!items.length) return bad(res, 400, propertyId ? "Map at least one answer to an item" : "Pick the item");
  if (!propertyId && items.length > 1) return bad(res, 400, "One item when the component does not depend on a question");
  if (propertyId) {
    const valid = new Set((await byOrgAll(req.catalyst, req.orgId, "PropertyValue", `propertyId = ${zStr(propertyId)}`)).map((r) => String(r.ROWID)));
    if (!items.every((it) => valid.has(String(it.valueId)))) return bad(res, 400, "An answer does not belong to the question");
    if (new Set(items.map((it) => String(it.valueId))).size !== items.length) return bad(res, 400, "Each answer once");
  }
  // Shared fields go through the row validator once; every item is ownership-checked.
  const shared = await componentMapData(req, { ...b, component, skuItemId: items[0].skuItemId, conditions: [] }, false);
  if (typeof shared === "string") return bad(res, 400, shared);
  for (const it of items) if (!idOk(it.skuItemId) || !(await ownsRow(req.catalyst, "SKUItem", it.skuItemId))) return bad(res, 400, "Valid skuItemId is required");

  const from = String(b.from || component).trim();
  const existing = (await byOrgAll(req.catalyst, req.orgId, "ComponentMap", groupWhere(b.industryId, from))).map(mapOut);
  const plan = planSync(existing, propertyId, items);
  const table = req.catalyst.datastore().table("ComponentMap");
  const saved = [];
  for (const u of plan.update) saved.push(mapOut(await table.updateRow({ ROWID: u.row.id, ...shared, skuItemId: u.skuItemId, conditionsJson: conditionsJson(u.conditions) })));
  for (const i of plan.insert) saved.push(mapOut(await table.insertRow({ ...shared, skuItemId: i.skuItemId, conditionsJson: conditionsJson(i.conditions), orgId: req.orgId })));
  for (const r of plan.remove) await table.deleteRow(r.id);
  if (from !== component) for (const r of plan.advanced) await table.updateRow({ ROWID: r.id, component });
  await log(req, "ComponentMap", saved[0].id, "component_map.save", { component, rows: saved.length, removed: plan.remove.length });
  res.json(groupRows([...saved, ...plan.advanced])[0]);
}));

// ?industryId=&component= → every row of the component, advanced ones included.
router.delete("/component-map/component", wrap(async (req, res) => {
  const { industryId, component } = req.query || {};
  if (!idOk(industryId) || !String(component || "").trim()) return bad(res, 400, "industryId and component are required");
  const rows = await byOrgAll(req.catalyst, req.orgId, "ComponentMap", groupWhere(industryId, component));
  const table = req.catalyst.datastore().table("ComponentMap");
  for (const r of rows) await table.deleteRow(r.ROWID);
  if (rows.length) await log(req, "ComponentMap", String(rows[0].ROWID), "component_map.delete", { component, rows: rows.length });
  res.status(204).end();
}));

router.post("/component-map", wrap(async (req, res) => {
  const data = await componentMapData(req, req.body || {}, false);
  if (typeof data === "string") return bad(res, 400, data);
  const m = mapOut(await req.catalyst.datastore().table("ComponentMap").insertRow({ ...data, orgId: req.orgId }));
  await log(req, "ComponentMap", m.id, "component_map.create", { component: data.component });
  res.status(201).json(m);
}));

router.put("/component-map/:id", wrap(async (req, res) => {
  const id = req.params.id;
  if (!idOk(id) || !(await ownsRow(req.catalyst, "ComponentMap", id))) return bad(res, 404, "Not found");
  const data = await componentMapData(req, req.body || {}, true);
  if (typeof data === "string") return bad(res, 400, data);
  const m = mapOut(await req.catalyst.datastore().table("ComponentMap").updateRow({ ROWID: id, ...data }));
  await log(req, "ComponentMap", id, "component_map.update", { keys: Object.keys(data) });
  res.json(m);
}));

router.delete("/component-map/:id", wrap(async (req, res) => {
  const id = req.params.id;
  if (!idOk(id) || !(await ownsRow(req.catalyst, "ComponentMap", id))) return bad(res, 404, "Not found");
  await req.catalyst.datastore().table("ComponentMap").deleteRow(id);
  await log(req, "ComponentMap", id, "component_map.delete");
  res.status(204).end();
}));

// Answers -> component items for the widget. One request, one SKUItem read.
// Configurator sends { industryId, selectedValues } (the item may not exist yet);
// the Quote Maker sends { skuItemId } (CR-200) and the stored answers are used —
// the same ones push.js turns into the Books composite BOM.
router.post("/component-map/resolve", wrap(async (req, res) => {
  let { industryId, selectedValues, skuItemId } = req.body || {};
  if (skuItemId !== undefined) {
    if (!idOk(skuItemId) || !(await ownsRow(req.catalyst, "SKUItem", skuItemId))) return bad(res, 404, "Item not found");
    const zcql = req.catalyst.zcql();
    const [item] = rowList(await zcql.executeZCQLQuery(`SELECT industryId FROM SKUItem WHERE ROWID = ${skuItemId} AND ${orgClause(req.catalyst)}`)).map(out);
    industryId = item && item.industryId;
    selectedValues = selectedFromValues(rowList(await zcql.executeZCQLQuery(
      `SELECT propertyId, valueId, valueText FROM SKUItemValue WHERE skuItemId = ${skuItemId} AND ${orgClause(req.catalyst)}`,
    )).map(out));
  }
  if (!idOk(industryId)) return bad(res, 400, "Valid industryId is required");
  const rows = (await byOrgAll(req.catalyst, req.orgId, "ComponentMap", `industryId = ${zStr(industryId)}`)).map(out);
  const { lines, missing } = matchComponents(rows, selectedValues || {});
  const ids = [...new Set(lines.map((l) => l.skuItemId))].filter(idOk);
  const items = ids.length
    ? rowList(await req.catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID, sku, name, zohoItemId FROM SKUItem WHERE ROWID IN (${ids.join(",")}) AND ${orgClause(req.catalyst)}`)).map(out)
    : [];
  const byId = new Map(items.map((it) => [String(it.id), it]));
  res.json({
    lines: lines.map((l) => {
      const it = byId.get(l.skuItemId);
      return { ...l, sku: it ? it.sku : null, name: it ? it.name : null, inBooks: Boolean(it && it.zohoItemId) };
    }),
    missing,
  });
}));

// Duty -> suitable models (recipe/sizing.js). Each option also carries the
// PropertyValue ids of the industry's `model` / `series` questions so the
// widget can fill those answers in.
// ponytail: matched by display text; store value ids on SizingModel if renames become a problem.
router.post("/sizing/select", wrap(async (req, res) => {
  const { industryId, tph, bd, rpm, group } = req.body || {};
  if (!idOk(industryId)) return bad(res, 400, "Valid industryId is required");
  const models = (await byOrgAll(req.catalyst, req.orgId, "SizingModel", `industryId = ${zStr(industryId)}`)).map(out);
  const result = selectModels({ tph, bd, rpm: rpm || undefined, group, models });
  const props = (await byOrgAll(req.catalyst, req.orgId, "Property", `industryId = ${zStr(industryId)}`)).map(out);
  const valueIds = async (role) => {
    const prop = props.find((p) => p.sizingRole === role);
    if (!prop) return new Map();
    const vals = (await byOrgAll(req.catalyst, req.orgId, "PropertyValue", `propertyId = ${zStr(prop.id)}`)).map(out);
    return new Map(vals.map((v) => [String(v.displayValue).trim().toLowerCase(), v.id]));
  };
  const [modelIds, seriesIds] = [await valueIds("model"), await valueIds("series")];
  const key = (t) => String(t).trim().toLowerCase();
  // Linked Books valve item per option (CR-226): the widget quotes it as-is
  // instead of generating a SKU. A row without its own link borrows the
  // Product of its Product Design (RecipeTemplate.productItemId, Published
  // version first). One lookup per table, none when nothing is linked.
  const codes = [...new Set(result.options.filter((o) => !idOk(o.skuItemId) && o.recipeCode).map((o) => o.recipeCode))];
  if (codes.length) {
    const byCode = new Map();
    for (const t of rowList(await req.catalyst.zcql().executeZCQLQuery(
      `SELECT code, productItemId, status FROM RecipeTemplate WHERE code IN (${codes.map(zStr).join(",")}) AND ${orgClause(req.catalyst)}`,
    )).map(out)) {
      if (!idOk(t.productItemId)) continue;
      if (!byCode.has(t.code) || t.status === "Published") byCode.set(t.code, String(t.productItemId));
    }
    for (const o of result.options) if (!idOk(o.skuItemId) && byCode.has(o.recipeCode)) o.skuItemId = byCode.get(o.recipeCode);
  }
  const itemIds = [...new Set(result.options.map((o) => o.skuItemId).filter((v) => idOk(v)))];
  const items = new Map(itemIds.length ? rowList(await req.catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID, sku, name, type, zohoItemId FROM SKUItem WHERE ROWID IN (${itemIds.join(",")}) AND ${orgClause(req.catalyst)}`,
  )).map(out).map((it) => [String(it.id), { id: String(it.id), sku: it.sku, name: it.name, type: it.type, zohoItemId: it.zohoItemId || null }]) : []);
  for (const o of result.options) {
    o.seriesValueId = seriesIds.get(key(o.series)) || null;
    o.valueId = modelIds.get(key(o.modelCode)) || null;
    o.item = items.get(String(o.skuItemId)) || null;
  }
  res.json(result);
}));

// The design the widget should use: the active one; `where` picks it by code
// or by product item (CR-227). The newest-row fallback only matters for rows
// from before CR-266.
async function templateBy(req, where) {
  const versions = (await byOrgAll(req.catalyst, req.orgId, "RecipeTemplate", where)).map(out)
    .filter((r) => r.status !== "Archived");
  return versions.find((r) => r.status === "Published")
    || versions.sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0] || null;
}

// Picked model → design cost for the widget's Rate box (CR-211). Org-gated by
// the SKU setting cfgDesignRate; the design comes from SizingModel.recipeCode.
router.post("/sizing/price", wrap(async (req, res) => {
  const { recipeCode, answers } = req.body || {};
  if (!recipeCode) return bad(res, 400, "recipeCode is required");
  if ((await settings(req.catalyst, req.orgId)).cfgDesignRate !== "true") return bad(res, 404, "Design costing is off for this organization");
  const recipe = await templateBy(req, `code = ${zStr(recipeCode)}`);
  if (!recipe) return bad(res, 404, `No product design "${recipeCode}"`);
  const bundle = await loadBundle(req, recipe);
  const selections = selectByMaterial(bundle.components, bundle.options, Array.isArray(answers) ? answers : []);
  const q = computeQuote({ ...bundle, selections, qty: 1 });
  res.json({
    recipe: { id: recipe.id, code: recipe.code, name: recipe.name, version: recipe.version, status: recipe.status },
    unitCost: q.unitCost,
    lines: q.lines.map((l) => ({ componentName: l.componentName, materialCode: l.materialCode, qty: l.qty, castWeight: l.castWeight, componentCost: l.componentCost })),
  });
}));

// Picked model → its Product Design's component list for the widget's BOM
// box (CR-227). Design = SizingModel.recipeCode, else the design whose Product
// is the picked Books item. Display only: never gated by cfgDesignRate, never
// 400s on an unmatched material — the material cell just stays blank until
// an answer (MOC) names one. Item per line: the component's linked SKU-master
// item (RecipeComponent.skuItemId, CR-221), else the picked material's Books
// item (MaterialType.zohoItemName), else nothing.
router.post("/sizing/bom", wrap(async (req, res) => {
  const { recipeCode, skuItemId, answers } = req.body || {};
  let recipe = recipeCode ? await templateBy(req, `code = ${zStr(recipeCode)}`) : null;
  if (!recipe && idOk(skuItemId) && (await ownsRow(req.catalyst, "SKUItem", skuItemId))) {
    recipe = await templateBy(req, `productItemId = ${zStr(String(skuItemId))}`);
  }
  if (!recipe) return res.json({ recipe: null, lines: [] });
  const { components, options, materials } = await loadBundle(req, recipe);
  const want = new Set((Array.isArray(answers) ? answers : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean));
  const matById = new Map(materials.map((m) => [String(m.id), m]));
  const itemIds = [...new Set(components.map((c) => c.skuItemId).filter((v) => idOk(v)))];
  const items = new Map(itemIds.length ? rowList(await req.catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID, sku, name, zohoItemId FROM SKUItem WHERE ROWID IN (${itemIds.join(",")}) AND ${orgClause(req.catalyst)}`,
  )).map(out).map((it) => [String(it.id), it]) : []);
  const lines = components.map((c) => {
    const opts = options.filter((o) => String(o.componentId) === String(c.id) && o.enabled !== false);
    const opt = c.allowMaterial === false ? null
      : opts.find((o) => want.has(String(o.materialCode || "").trim().toLowerCase())) || (opts.length === 1 ? opts[0] : null);
    const mat = opt ? matById.get(String(opt.materialId)) || null : null;
    const it = items.get(String(c.skuItemId)) || null;
    return {
      component: c.name || c.code || "", qty: Number(c.qty) || 1, uom: c.uom || "Nos", required: c.required !== false,
      material: (mat && mat.code) || (opt && opt.materialCode) || null,
      sku: it ? it.sku : null,
      name: it ? it.name : (mat && mat.zohoItemName) || null,
      inBooks: it ? Boolean(it.zohoItemId) : Boolean(mat && mat.zohoItemId),
    };
  });
  res.json({ recipe: { id: recipe.id, code: recipe.code, name: recipe.name, version: recipe.version, status: recipe.status }, lines });
}));

/* ---------- saved configurator quote (CR-246) ---------- */
// One saved cart per CRM record per org: ConfigQuote { orgId, docKey, crmRowIds }
// + ConfigQuoteLine { orgId, quoteId, seq, lineJson, bomJson } (row per line —
// PackingList/PackingBox pattern, no plan-size cap from the 10000-char text
// limit). crmRowIds = the Quoted_Items rows the widget wrote and still owns,
// replaced on the next push; rows typed by hand in CRM are never touched.
const CQ_DOC_RE = /^(quotes|deals):\d+$/;
const CQ_MAX = 9500; // text column silently caps at 10000
// Pure guard: array of lines → rows. A line over the cap is refused (413) —
// its answers are the payload; the BOM snapshot is trimmed to fit instead.
function cleanConfigLines(lines) {
  if (!Array.isArray(lines) || lines.length > 200) throw { status: 400, message: "lines must be an array (max 200)" };
  return lines.map((l, i) => {
    if (!l || typeof l !== "object") throw { status: 400, message: `Line ${i + 1} is not an object` };
    const { bom, ...rest } = l;
    const lineJson = JSON.stringify(rest);
    if (lineJson.length > CQ_MAX) throw { status: 413, message: `Line ${i + 1} too large to save` };
    const rows = Array.isArray(bom) ? bom.slice() : [];
    while (rows.length && JSON.stringify(rows).length > CQ_MAX) rows.pop();
    return { seq: i + 1, lineJson, bomJson: JSON.stringify(rows) };
  });
}
async function loadConfigQuote(catalyst, orgId, docKey) {
  const heads = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID, crmRowIds FROM ConfigQuote WHERE orgId = ${zStr(orgId)} AND docKey = ${zStr(docKey)}`,
  ));
  if (!heads.length) return null;
  const rows = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT seq, lineJson, bomJson FROM ConfigQuoteLine WHERE orgId = ${zStr(orgId)} AND quoteId = ${zStr(String(heads[0].ROWID))} ORDER BY seq ASC`,
  ));
  const parse = (s, dflt) => { try { return s ? JSON.parse(s) : dflt; } catch { return dflt; } };
  return {
    rowId: String(heads[0].ROWID),
    crmRowIds: parse(heads[0].crmRowIds, []),
    lines: rows.map((r) => Object.assign(parse(r.lineJson, {}), { bom: parse(r.bomJson, []) })),
  };
}
// GET /config-quote?docKey=quotes:<id> → { crmRowIds, lines } | { crmRowIds: [], lines: null }
router.get("/config-quote", wrap(async (req, res) => {
  const docKey = String(req.query.docKey || "");
  if (!CQ_DOC_RE.test(docKey)) return bad(res, 400, "Bad doc key");
  const saved = await loadConfigQuote(req.catalyst, req.orgId, docKey);
  res.json(saved ? { crmRowIds: saved.crmRowIds, lines: saved.lines } : { crmRowIds: [], lines: null });
}));
// POST /config-quote/:docKey { crmRowIds, lines, quoteNo? } → { ok } — lines replaced wholesale.
// quoteNo (CR-261) = the CRM quote number as it reaches the Books SO; the work order
// finds this cart by it (workorder/quoteBom.js). A save without one keeps the stored value.
// POST, not PUT: the widget calls cross-origin and PUT forces a preflight the
// Catalyst gateway answers without CORS headers (same as /api/packing).
router.post("/config-quote/:docKey", wrap(async (req, res) => {
  const { docKey } = req.params;
  if (!CQ_DOC_RE.test(docKey)) return bad(res, 400, "Bad doc key");
  const { crmRowIds, lines } = req.body || {};
  const quoteNo = String((req.body || {}).quoteNo ?? "").trim().slice(0, 100);
  const head = quoteNo ? { quoteNo } : {};
  const ids = JSON.stringify((Array.isArray(crmRowIds) ? crmRowIds : []).map(String).slice(0, 300));
  let rows;
  try { rows = cleanConfigLines(lines); } catch (e) { return bad(res, e.status || 400, e.message); }
  const ds = req.catalyst.datastore();
  const existing = await loadConfigQuote(req.catalyst, req.orgId, docKey);
  let quoteId;
  if (existing) {
    quoteId = existing.rowId;
    await ds.table("ConfigQuote").updateRow({ ROWID: quoteId, crmRowIds: ids, ...head });
  } else {
    quoteId = String((await ds.table("ConfigQuote").insertRow({ orgId: req.orgId, docKey, crmRowIds: ids, ...head })).ROWID);
  }
  const old = rowList(await req.catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID FROM ConfigQuoteLine WHERE orgId = ${zStr(req.orgId)} AND quoteId = ${zStr(quoteId)}`,
  ));
  const tbl = ds.table("ConfigQuoteLine");
  for (const r of old) await tbl.deleteRow(r.ROWID);
  if (rows.length) await tbl.insertRows(rows.map((r) => ({ orgId: req.orgId, quoteId, ...r })));
  res.json({ ok: true });
}));

// Idempotent RAV starter: industry + question bank + sizing sheet (seedData.js).
// Bulk inserts — ~180 rows one at a time would not fit the 30 s function limit.
router.post("/seed-rav", wrap(async (req, res) => {
  const ds = req.catalyst.datastore();
  if ((await byOrgAll(req.catalyst, req.orgId, "Industry", `name = 'RAV'`)).length) return res.json({ ok: true, skipped: true });
  const industry = out(await ds.table("Industry").insertRow({ name: "RAV", skuSeparator: "-", orgId: req.orgId }));
  const tf = (v) => (v ? "true" : "false");
  const props = (await ds.table("Property").insertRows(RAV_QUESTIONS.map((q, i) => ({
    name: q.caption, caption: q.caption, unit: q.unit || null, valueType: q.range ? "Range" : "List",
    skuPosition: i + 1, industryId: String(industry.id), required: tf(q.required),
    activeInSku: tf(q.sku !== false), includeInName: tf(q.inName), createValuesAsItems: "false",
    showInWidget: tf(q.widget !== false), sizingRole: q.role || null, orgId: req.orgId,
  })))).map(out);
  const propByCaption = new Map(props.map((p) => [p.caption, p]));
  const values = RAV_QUESTIONS.flatMap((q) => (q.values || []).map((v) => {
    const [display, sku] = Array.isArray(v) ? v : [v, String(v).toUpperCase().replace(/[^A-Z0-9.]/g, "")];
    return {
      displayValue: display, name: display, sku, propertyId: String(propByCaption.get(q.caption).id),
      createAsItem: "false", isDefault: "false", orgId: req.orgId,
    };
  }));
  await ds.table("PropertyValue").insertRows(values);
  await ds.table("SizingModel").insertRows(SIZING_MODELS.map((m) => ({ ...m, recipeCode: "", industryId: String(industry.id), orgId: req.orgId })));
  res.status(201).json({ ok: true, industryId: industry.id, properties: props.length, values: values.length, models: SIZING_MODELS.length });
}));

// Idempotent Component Map starter for RAV (CR-195): the sample sheet's rows,
// resolved by caption / answer text and Books item name. Adds the "Motor supply"
// question when absent. Skips when the industry already has map rows. Items it
// cannot find are reported (import them from Books, run again).
router.post("/seed-rav-map", wrap(async (req, res) => {
  const ds = req.catalyst.datastore();
  const industry = (await byOrgAll(req.catalyst, req.orgId, "Industry", `name = 'RAV'`)).map(out)[0];
  if (!industry) return bad(res, 400, "Seed the RAV product first (Load RAV defaults)");
  const where = `industryId = ${zStr(String(industry.id))}`;
  if ((await byOrgAll(req.catalyst, req.orgId, "ComponentMap", where)).length) return res.json({ ok: true, skipped: true });
  const props = (await byOrgAll(req.catalyst, req.orgId, "Property", where)).map(out);
  const key = (s) => String(s || "").trim().toLowerCase();
  let added = null;
  const q = RAV_MAP_SAMPLE.question;
  if (!props.some((p) => key(p.caption) === key(q.caption))) {
    const prop = out(await ds.table("Property").insertRow({
      name: q.caption, caption: q.caption, unit: null, valueType: "List",
      skuPosition: Math.max(0, ...props.map((p) => Number(p.skuPosition) || 0)) + 1, industryId: String(industry.id),
      required: "false", activeInSku: "true", includeInName: "false", createValuesAsItems: "false",
      showInWidget: q.widget === false ? "false" : "true", sizingRole: null, orgId: req.orgId,
    }));
    await ds.table("PropertyValue").insertRows(q.values.map(([displayValue, sku]) => ({
      displayValue, name: displayValue, sku, propertyId: String(prop.id), createAsItem: "false", isDefault: "false", orgId: req.orgId,
    })));
    props.push(prop);
    added = q.caption;
  }
  const propByCaption = new Map(props.map((p) => [key(p.caption), p]));
  const values = (await byOrgAll(req.catalyst, req.orgId, "PropertyValue", `propertyId IN (${props.map((p) => p.id).join(",")})`)).map(out);
  const valueId = (prop, text) => { const v = values.find((x) => String(x.propertyId) === String(prop.id) && key(x.displayValue) === key(text)); return v ? String(v.id) : null; };
  const items = (await byOrgAll(req.catalyst, req.orgId, "SKUItem")).map(out);
  const itemByName = new Map(items.map((it) => [key(it.name), it]));
  const rows = [];
  const notFound = [];
  for (const r of RAV_MAP_SAMPLE.rows) {
    const it = itemByName.get(key(r.item));
    if (!it) { notFound.push(`item "${r.item}"`); continue; }
    const conditions = [];
    for (const [caption, answer] of Object.entries(r.when)) {
      const prop = propByCaption.get(key(caption));
      const vid = prop && valueId(prop, answer);
      if (!vid) { notFound.push(`${caption} = ${answer}`); break; }
      conditions.push({ propertyId: String(prop.id), valueId: vid });
    }
    if (conditions.length !== Object.keys(r.when).length) continue;
    rows.push({
      industryId: String(industry.id), component: r.component, conditionsJson: JSON.stringify(conditions),
      skuItemId: String(it.id), qty: r.qty, qtyPropertyId: "", required: r.required ? "true" : "false",
      asQuoteLine: r.asQuoteLine ? "true" : "false", status: "Active", orgId: req.orgId,
    });
  }
  if (rows.length) await ds.table("ComponentMap").insertRows(rows);
  res.status(rows.length ? 201 : 200).json({ ok: true, rows: rows.length, questionAdded: added, notFound: [...new Set(notFound)] });
}));

module.exports = router;

// ponytail self-check: `node functions/skuapi/routes/recipe.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  assert.ok(CQ_DOC_RE.test("quotes:123") && CQ_DOC_RE.test("deals:9"), "docKey accepts quotes:/deals:");
  assert.ok(!CQ_DOC_RE.test("quotes:") && !CQ_DOC_RE.test("so:1") && !CQ_DOC_RE.test("quotes:1; DROP"), "docKey rejects junk");
  const big = Array.from({ length: 400 }, (_, i) => ({ c: "Comp " + i, item: "SKU-" + i + " · a long item name", qty: "× 1 Nos", cls: "" }));
  const rows = cleanConfigLines([{ id: "c1", sku: "A", qty: 2, bom: big }, { id: "c2", sku: "B" }]);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].seq, 1);
  assert.strictEqual(JSON.parse(rows[0].lineJson).sku, "A");
  assert.ok(!("bom" in JSON.parse(rows[0].lineJson)), "bom kept out of lineJson");
  assert.ok(rows[0].bomJson.length <= CQ_MAX && JSON.parse(rows[0].bomJson).length < big.length, "bom trimmed to fit");
  assert.strictEqual(rows[1].bomJson, "[]");
  assert.throws(() => cleanConfigLines("nope"));
  assert.throws(() => cleanConfigLines([{ id: "c1", values: { x: "y".repeat(CQ_MAX) } }]), (e) => e.status === 413);
  console.log("recipe.js self-check passed");
}
