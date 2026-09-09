"use strict";

/**
 * Recipe Engine (CR-104): recipe templates -> components -> material options
 * -> configurable cost elements -> immutable quotation snapshots. Mounted at
 * /api/recipe behind requireAddon("recipe-engine"). Published recipes are
 * immutable server-side (assertDraft); quotations freeze a full snapshot so
 * later recipe/rate edits never change history.
 */
const express = require("express");
const { rowList, out, idOk, zStr, orgClause, ownsRow } = require("../store");
const { nextNumber, byOrgAll } = require("../workorder/store");
const { optionCost, computeQuote } = require("../recipe/calc");
const { MATERIALS, DEMO_RECIPE, DEFAULT_COST_ELEMENTS } = require("../recipe/seedData");

const router = express.Router();

const bad = (res, status, error) => res.status(status).json({ error });
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

// Whole recipe in flat org-scoped queries (options carry recipeId for this).
async function loadBundle(req, recipe) {
  const [components, options, materials, els] = [
    (await byOrgAll(req.catalyst, req.orgId, "RecipeComponent", `recipeId = ${zStr(recipe.id)}`))
      .map(out).sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
    (await byOrgAll(req.catalyst, req.orgId, "RecipeComponentOption", `recipeId = ${zStr(recipe.id)}`)).map(out).map(parseFixed),
    (await byOrgAll(req.catalyst, req.orgId, "MaterialType")).map(out),
    await recipeCostElements(req, recipe),
  ];
  return { recipe, components, options, materials, costElements: els };
}

// Immutability guard: only Draft recipes accept writes.
function assertDraft(res, recipe) {
  if (!recipe) { bad(res, 404, "Not found"); return false; }
  if (recipe.status !== "Draft") {
    bad(res, 409, "Published recipes are immutable — create a new version");
    return false;
  }
  return true;
}

// For component/option writes: resolve the owning recipe and draft-guard it.
async function draftRecipeOf(req, res, recipeId) {
  const recipe = await recipeById(req, recipeId);
  return assertDraft(res, recipe) ? recipe : null;
}

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => bad(res, err.status || 500, err.message));

// ---------- materials master ----------

router.get("/materials", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "MaterialType")).map(out);
  res.json(rows.sort((a, b) => String(a.code).localeCompare(String(b.code))));
}));

router.post("/materials", wrap(async (req, res) => {
  const { code, name, rate, uom = "KG", effectiveFrom = "", status = "Active" } = req.body || {};
  if (!code) return bad(res, 400, "code is required");
  const row = await req.catalyst.datastore().table("MaterialType").insertRow({
    code, name: name || code, rate: Number(rate) || 0, uom, effectiveFrom, status, orgId: req.orgId,
  });
  res.status(201).json(out(row));
}));

router.put("/materials/:id", wrap(async (req, res) => {
  const id = req.params.id;
  if (!idOk(id) || !(await ownsRow(req.catalyst, "MaterialType", id))) return bad(res, 404, "Not found");
  const { code, name, rate, uom, effectiveFrom, status } = req.body || {};
  const data = { ROWID: id };
  if (code !== undefined) data.code = code;
  if (name !== undefined) data.name = name;
  if (rate !== undefined) data.rate = Number(rate) || 0;
  if (uom !== undefined) data.uom = uom;
  if (effectiveFrom !== undefined) data.effectiveFrom = effectiveFrom;
  if (status !== undefined) data.status = status;
  res.json(out(await req.catalyst.datastore().table("MaterialType").updateRow(data)));
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
  res.status(201).json(out(row));
}));

router.post("/recipes/:id/cost-elements", wrap(async (req, res) => {
  const recipe = await draftRecipeOf(req, res, req.params.id);
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
  res.status(201).json(out(row));
}));

// Master rows (blank recipeTemplateId) are writable directly; per-recipe rows
// only while their recipe is Draft.
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
  return (await draftRecipeOf(req, res, el.recipeTemplateId)) ? el : null;
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
  res.json(out(await req.catalyst.datastore().table("CostElement").updateRow(data)));
}));

// Leftover fixedCosts values keyed by the deleted code are harmless — calc
// only iterates the element list.
router.delete("/cost-elements/:id", wrap(async (req, res) => {
  const el = await writableElementById(req, res, req.params.id);
  if (!el) return;
  await req.catalyst.datastore().table("CostElement").deleteRow(el.id);
  res.status(204).end();
}));

// Thin ERP item list for the wizard's product step (independent of the
// sku-generator addon gate on /api/sku-items).
router.get("/products", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "SKUItem")).map(out);
  res.json(rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name })).sort((a, b) => String(a.sku).localeCompare(String(b.sku))));
}));

// ---------- recipe templates ----------

router.get("/recipes", wrap(async (req, res) => {
  const rows = (await byOrgAll(req.catalyst, req.orgId, "RecipeTemplate")).map(out);
  rows.sort((a, b) => String(a.code).localeCompare(String(b.code)) || (b.version || 0) - (a.version || 0));
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

router.post("/recipes", wrap(async (req, res) => {
  const { code, name, productItemId = "", productCode = "", productName = "", effectiveFrom = "" } = req.body || {};
  if (!code || !name) return bad(res, 400, "code and name are required");
  const dupe = rowList(
    await req.catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID FROM RecipeTemplate WHERE code = ${zStr(code)} AND ${orgClause(req.catalyst)} LIMIT 1`,
    ),
  );
  if (dupe.length) return bad(res, 409, `Recipe code "${code}" already exists`);
  const row = await req.catalyst.datastore().table("RecipeTemplate").insertRow({
    code, name, productItemId, productCode, productName, version: 1, status: "Draft",
    effectiveFrom, changeReason: "Initial version", updatedBy: String(req.userId || ""), orgId: req.orgId,
  });
  res.status(201).json(out(row));
}));

router.put("/recipes/:id", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!assertDraft(res, recipe)) return;
  const { name, productItemId, productCode, productName, effectiveFrom, changeReason } = req.body || {};
  const data = { ROWID: recipe.id, updatedBy: String(req.userId || "") };
  for (const [k, v] of Object.entries({ name, productItemId, productCode, productName, effectiveFrom, changeReason })) {
    if (v !== undefined) data[k] = v;
  }
  res.json(out(await req.catalyst.datastore().table("RecipeTemplate").updateRow(data)));
}));

router.delete("/recipes/:id", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!assertDraft(res, recipe)) return;
  const ds = req.catalyst.datastore();
  // No DB cascade: remove options + components by hand.
  for (const o of await byOrgAll(req.catalyst, req.orgId, "RecipeComponentOption", `recipeId = ${zStr(recipe.id)}`)) {
    await ds.table("RecipeComponentOption").deleteRow(o.ROWID);
  }
  for (const c of await byOrgAll(req.catalyst, req.orgId, "RecipeComponent", `recipeId = ${zStr(recipe.id)}`)) {
    await ds.table("RecipeComponent").deleteRow(c.ROWID);
  }
  for (const e of await recipeCostElements(req, recipe)) {
    await ds.table("CostElement").deleteRow(e.id);
  }
  await ds.table("RecipeTemplate").deleteRow(recipe.id);
  res.status(204).end();
}));

// ---------- components ----------

router.post("/recipes/:id/components", wrap(async (req, res) => {
  const recipe = await draftRecipeOf(req, res, req.params.id);
  if (!recipe) return;
  const { code = "", name, question = "", qty = 1, uom = "Nos", required = true,
    allowMaterial = true, allowQtyOverride = false, allowComponentOverride = false } = req.body || {};
  if (!name) return bad(res, 400, "name is required");
  const existing = await byOrgAll(req.catalyst, req.orgId, "RecipeComponent", `recipeId = ${zStr(recipe.id)}`);
  const row = await req.catalyst.datastore().table("RecipeComponent").insertRow({
    recipeId: recipe.id, code: code || name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), name, question,
    sequence: existing.length + 1, qty: Number(qty) || 1, uom, required: !!required,
    allowMaterial: !!allowMaterial, allowQtyOverride: !!allowQtyOverride,
    allowComponentOverride: !!allowComponentOverride, parentComponentId: "", orgId: req.orgId,
  });
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
  if (!(await draftRecipeOf(req, res, comp.recipeId))) return;
  const data = { ROWID: comp.id };
  const { code, name, question, qty, uom, required, allowMaterial, allowQtyOverride, allowComponentOverride, sequence } = req.body || {};
  if (code !== undefined) data.code = code;
  if (name !== undefined) data.name = name;
  if (question !== undefined) data.question = question;
  if (qty !== undefined) data.qty = Number(qty) || 1;
  if (uom !== undefined) data.uom = uom;
  if (sequence !== undefined) data.sequence = Number(sequence) || 0;
  for (const [k, v] of Object.entries({ required, allowMaterial, allowQtyOverride, allowComponentOverride })) {
    if (v !== undefined) data[k] = !!v;
  }
  res.json(out(await req.catalyst.datastore().table("RecipeComponent").updateRow(data)));
}));

// Drag-and-drop reorder: body { ids: [componentId in new order] }.
router.put("/recipes/:id/component-order", wrap(async (req, res) => {
  const recipe = await draftRecipeOf(req, res, req.params.id);
  if (!recipe) return;
  const ids = (req.body && req.body.ids) || [];
  const table = req.catalyst.datastore().table("RecipeComponent");
  for (let i = 0; i < ids.length; i++) {
    if (!idOk(ids[i]) || !(await ownsRow(req.catalyst, "RecipeComponent", ids[i]))) continue;
    await table.updateRow({ ROWID: ids[i], sequence: i + 1 });
  }
  res.json({ ok: true });
}));

router.delete("/components/:id", wrap(async (req, res) => {
  const comp = await componentById(req, req.params.id);
  if (!comp) return bad(res, 404, "Not found");
  if (!(await draftRecipeOf(req, res, comp.recipeId))) return;
  const ds = req.catalyst.datastore();
  for (const o of await byOrgAll(req.catalyst, req.orgId, "RecipeComponentOption", `componentId = ${zStr(comp.id)}`)) {
    await ds.table("RecipeComponentOption").deleteRow(o.ROWID);
  }
  await ds.table("RecipeComponent").deleteRow(comp.id);
  res.status(204).end();
}));

// ---------- component material options ----------

router.post("/components/:id/options", wrap(async (req, res) => {
  const comp = await componentById(req, req.params.id);
  if (!comp) return bad(res, 404, "Not found");
  if (!(await draftRecipeOf(req, res, comp.recipeId))) return;
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
  if (!(await draftRecipeOf(req, res, opt.recipeId))) return;
  const { castWeight, fixedCosts, enabled } = req.body || {};
  const data = { ROWID: opt.id };
  if (castWeight !== undefined) data.castWeight = Number(castWeight) || 0;
  if (fixedCosts !== undefined) data.fixedCostsJson = JSON.stringify(fixedCosts || {});
  if (enabled !== undefined) data.enabled = !!enabled;
  res.json(parseFixed(out(await req.catalyst.datastore().table("RecipeComponentOption").updateRow(data))));
}));

router.delete("/options/:id", wrap(async (req, res) => {
  const opt = await optionById(req, req.params.id);
  if (!opt) return bad(res, 404, "Not found");
  if (!(await draftRecipeOf(req, res, opt.recipeId))) return;
  await req.catalyst.datastore().table("RecipeComponentOption").deleteRow(opt.id);
  res.status(204).end();
}));

// ---------- versioning ----------

router.get("/recipes/:id/versions", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!recipe) return bad(res, 404, "Not found");
  const rows = (await byOrgAll(req.catalyst, req.orgId, "RecipeTemplate", `code = ${zStr(recipe.code)}`)).map(out);
  res.json(rows.sort((a, b) => (b.version || 0) - (a.version || 0)));
}));

router.post("/recipes/:id/publish", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!assertDraft(res, recipe)) return;
  const comps = await byOrgAll(req.catalyst, req.orgId, "RecipeComponent", `recipeId = ${zStr(recipe.id)}`);
  if (!comps.length) return bad(res, 400, "Add at least one component before publishing");
  const table = req.catalyst.datastore().table("RecipeTemplate");
  // Publish new first, supersede last: a partial failure leaves two Published
  // rows briefly; re-publish resolves. No transactions in Data Store.
  await table.updateRow({ ROWID: recipe.id, status: "Published", updatedBy: String(req.userId || "") });
  const prior = (await byOrgAll(req.catalyst, req.orgId, "RecipeTemplate",
    `code = ${zStr(recipe.code)} AND status = 'Published'`)).map(out);
  for (const p of prior) {
    if (String(p.id) !== String(recipe.id)) await table.updateRow({ ROWID: p.id, status: "Superseded" });
  }
  res.json({ ...recipe, status: "Published" });
}));

router.post("/recipes/:id/new-version", wrap(async (req, res) => {
  const recipe = await recipeById(req, req.params.id);
  if (!recipe) return bad(res, 404, "Not found");
  const all = (await byOrgAll(req.catalyst, req.orgId, "RecipeTemplate", `code = ${zStr(recipe.code)}`)).map(out);
  if (all.some((r) => r.status === "Draft")) return bad(res, 409, "A draft version already exists for this recipe");
  const maxV = Math.max(...all.map((r) => r.version || 0));
  const ds = req.catalyst.datastore();
  const copy = out(await ds.table("RecipeTemplate").insertRow({
    code: recipe.code, name: recipe.name, productItemId: recipe.productItemId || "",
    productCode: recipe.productCode || "", productName: recipe.productName || "",
    version: maxV + 1, status: "Draft", effectiveFrom: recipe.effectiveFrom || "",
    changeReason: String((req.body && req.body.changeReason) || ""), updatedBy: String(req.userId || ""), orgId: req.orgId,
  }));
  // Raw rows, not recipeCostElements(): that helper merges the live master
  // rate in, and copying it would freeze the default into the new version.
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
  }
  res.status(201).json(copy);
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
  if (recipe.status !== "Published") return bad(res, 400, "Only published recipes can be quoted");
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
  res.json({ ok: true, status: "Order" });
}));

// ---------- demo seed ----------

router.post("/seed-demo", wrap(async (req, res) => {
  const existing = await byOrgAll(req.catalyst, req.orgId, "RecipeTemplate", `code = ${zStr(DEMO_RECIPE.code)}`);
  if (existing.length) return res.json({ ok: true, skipped: true });
  const ds = req.catalyst.datastore();
  const demoEls = await costElements(req);
  // Materials: insert only codes the org doesn't already have.
  const have = new Set((await byOrgAll(req.catalyst, req.orgId, "MaterialType")).map((m) => m.code));
  for (const m of MATERIALS.filter((m) => !have.has(m.code))) {
    await ds.table("MaterialType").insertRow({ ...m, orgId: req.orgId });
  }
  const mats = (await byOrgAll(req.catalyst, req.orgId, "MaterialType")).map(out);
  const matByCode = new Map(mats.map((m) => [m.code, m]));
  const recipe = out(await ds.table("RecipeTemplate").insertRow({
    code: DEMO_RECIPE.code, name: DEMO_RECIPE.name, productItemId: "",
    productCode: DEMO_RECIPE.productCode, productName: DEMO_RECIPE.productName,
    version: 1, status: "Published", effectiveFrom: DEMO_RECIPE.effectiveFrom,
    changeReason: DEMO_RECIPE.changeReason, updatedBy: String(req.userId || ""), orgId: req.orgId,
  }));
  for (const e of demoEls) {
    await ds.table("CostElement").insertRow({
      code: e.code, label: e.label, calcType: e.calcType, sequence: e.sequence || 0,
      recipeTemplateId: String(recipe.id), orgId: req.orgId,
    });
  }
  let seq = 0;
  for (const c of DEMO_RECIPE.components) {
    const comp = out(await ds.table("RecipeComponent").insertRow({
      recipeId: recipe.id, code: c.code, name: c.name, question: c.question, sequence: ++seq,
      qty: c.qty, uom: c.uom, required: c.required, allowMaterial: c.allowMaterial,
      allowQtyOverride: false, allowComponentOverride: false, parentComponentId: "", orgId: req.orgId,
    }));
    for (const o of c.options) {
      const mat = matByCode.get(o.mat);
      await ds.table("RecipeComponentOption").insertRow({
        componentId: comp.id, recipeId: recipe.id, materialId: mat ? mat.id : "", materialCode: o.mat,
        castWeight: o.castWeight, fixedCostsJson: JSON.stringify(o.fixedCosts), enabled: true, orgId: req.orgId,
      });
    }
  }
  res.status(201).json({ ok: true, recipeId: recipe.id });
}));

module.exports = router;
