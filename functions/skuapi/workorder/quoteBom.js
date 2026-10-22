"use strict";

/**
 * Configured finished goods (CR-261). A valve quoted through the CRM Product
 * Configurator keeps its answers (MOC …) in ConfigQuote; its Books composite
 * holds placeholder raw material. The work order therefore resolves the real
 * items from those answers (Component Map, zoho/push.js resolveBomLines)
 * instead of copying the composite.
 *
 * SO → quote: the converted Books SO carries the CRM quote number or record id
 * in its Reference#, a custom field or a zcrm_* field — whichever value equals
 * a saved ConfigQuote.quoteNo / docKey id is the link. Quote line → SO line:
 * same SKU, in cart order.
 *
 * Source order for a configurator org's FG (CR-270, `resolve`): saved quote +
 * Components rows → the FG's Product Design (designBom.js) → Books composite.
 *
 * `node workorder/quoteBom.js --selftest`
 */
const { rowList, zStr, out } = require("../store");
const { byOrg, inList } = require("./store");
const { resolveBomLines } = require("../zoho/push");
const designBom = require("./designBom");

const n = (v) => Number(v) || 0;
const CONFIG_MAX = 9500; // text column silently caps at 10000
const norm = (s) => String(s ?? "").trim().toLowerCase();
const parse = (s, dflt) => { try { return s ? JSON.parse(s) : dflt; } catch { return dflt; } };

// Pure: a work order reads the template only in an org that has the Product
// Configurator add-on AND the WO setting "Work order raw material" = Direct
// from Template (CR-270). Every other org keeps the Books composite and never
// runs the lookup.
const useQuote = (addonKeys, settings) => (addonKeys || []).includes("recipe-engine")
  && String((settings || {}).woBomSource || "") === "template";

// Pure: every SO value that could name the quote.
function soQuoteKeys(so) {
  const vals = [so && so.reference_number];
  for (const [k, v] of Object.entries(so || {})) if (/^zcrm_/.test(k)) vals.push(v);
  for (const cf of (so && so.custom_fields) || []) vals.push(cf.value);
  return [...new Set(vals
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map((v) => String(v).trim())
    .filter((v) => v && v.length <= 100))].slice(0, 30);
}

// Pure: SO lines → the quote line each one was sold from, keyed by SO line id.
// Only configured lines count (loose component lines follow their `parent`).
// The same valve twice on one quote pairs up in order.
function matchLines(soLines, quoteLines) {
  const pool = new Map();
  for (const q of quoteLines || []) {
    if (!q || q.parent || !q.config || !q.config.industryId) continue;
    const key = norm(q.sku) || norm(q.name);
    if (key) pool.set(key, [...(pool.get(key) || []), q]);
  }
  const matched = new Map();
  for (const l of soLines || []) {
    const list = pool.get(norm(l.sku)) || pool.get(norm(l.name));
    if (list && list.length) matched.set(String(l.line_item_id), list.shift());
  }
  return matched;
}

// Pure: the snapshot frozen on the FG — what was sold, even if the quote is edited later.
function configOf(quoteNo, q) {
  const full = { quoteNo: String(quoteNo || ""), industryId: String(q.config.industryId), sel: q.config.sel || {}, values: q.values || {} };
  // Geared motor (CR-284): the pick is an item id, not an answer the Component Map can match.
  const motorItem = q.config.motor && String(q.config.motor.skuItemId || "");
  if (/^\d+$/.test(motorItem)) full.motorItemId = motorItem;
  if (JSON.stringify(full).length <= CONFIG_MAX) return full;
  const { values, ...rest } = full; // answers are the payload; the captions are display only
  return JSON.stringify(rest).length <= CONFIG_MAX ? rest : null;
}

// Pure: resolved lines → WO requirement lines (services are never WO lines, CR-149).
function requirementLines(lines, fgQty) {
  return (lines || []).filter((l) => !l.service).map((l) => ({
    rmItemId: String(l.rmItemId), rmName: l.rmName || "", rmSku: l.rmSku || "", uom: l.uom || "",
    perUnitQty: n(l.perUnitQty), requiredQty: n(l.perUnitQty) * n(fgQty), source: "quote",
  }));
}

// What the WO screens show for a configured FG.
const display = (config) => (config
  ? { quoteNo: config.quoteNo || null, values: config.values || {}, design: config.designName || config.designCode || null }
  : null);
// Frozen on the FG: quote answers (industryId) and / or the design that fed the BOM (designCode).
const fgConfig = (fg) => { const c = parse(fg && fg.configJson, null); return c && (c.industryId || c.designCode) ? c : null; };
function note(config, source = config.designCode ? "design" : "quote") {
  const moc = Object.entries(config.values || {}).find(([k]) => norm(k) === "moc");
  const from = source === "design" ? `design ${config.designCode}` : `quote ${config.quoteNo || "configuration"}`;
  return `from ${from}${moc ? ` · MOC: ${moc[1]}` : ""}`;
}

// The saved quote this SO was converted from. A quote beats a deal; newest wins.
async function findQuote(catalyst, orgId, so) {
  const keys = soQuoteKeys(so);
  if (!keys.length) return null;
  const ids = keys.filter((k) => /^\d+$/.test(k));
  const heads = await byOrg(catalyst, orgId, "ConfigQuote", `quoteNo IN (${inList(keys)})`);
  if (ids.length) {
    heads.push(...await byOrg(catalyst, orgId, "ConfigQuote", `docKey IN (${inList(ids.flatMap((k) => [`quotes:${k}`, `deals:${k}`]))})`));
  }
  if (!heads.length) return null;
  const rank = (h) => (String(h.docKey).startsWith("quotes:") ? 1 : 0);
  const head = heads.sort((a, b) => rank(b) - rank(a) || String(b.MODIFIEDTIME).localeCompare(String(a.MODIFIEDTIME)))[0];
  const rows = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT seq, lineJson FROM ConfigQuoteLine WHERE orgId = ${zStr(String(orgId))} AND quoteId = ${zStr(String(head.ROWID))} ORDER BY seq ASC`,
  ));
  return { quoteNo: head.quoteNo || String(head.docKey).split(":")[1], lines: rows.map((r) => parse(r.lineJson, null)).filter(Boolean) };
}

// SO → Map(SO line id → frozen config). Empty when the SO names no saved quote.
async function configsForSo(catalyst, orgId, so) {
  const quote = await findQuote(catalyst, orgId, so);
  const configs = new Map();
  if (!quote) return configs;
  for (const [lineId, q] of matchLines(so.line_items, quote.lines)) {
    const c = configOf(quote.quoteNo, q);
    if (c) configs.set(lineId, c);
  }
  return configs;
}

// Config → requirement lines + what could not be resolved.
async function linesFor(catalyst, orgId, config, fgQty) {
  const r = await resolveBomLines(catalyst, config.industryId, config.sel);
  const lines = requirementLines(r.lines, fgQty);
  const problems = [...r.problems];
  // Geared motor (CR-284): the picked motor item, one per FG unit.
  if (/^\d+$/.test(String(config.motorItemId || ""))) {
    const it = (await byOrg(catalyst, orgId, "SKUItem", `ROWID = ${config.motorItemId}`)).map(out)[0];
    if (!it) problems.push("Geared motor: the picked item no longer exists");
    else if (!it.zohoItemId) problems.push(`Geared motor: item ${it.sku || it.name} is not in Zoho Books yet — push it first`);
    else lines.push({ rmItemId: String(it.zohoItemId), rmName: it.name || "", rmSku: it.sku || "", uom: it.uom || "", perUnitQty: 1, requiredQty: n(fgQty), source: "quote" });
  }
  return { lines, problems };
}

/**
 * One FG's BOM in a configurator org (CR-270), first source that gives a line:
 * 1. saved quote answers → Components rows (`source: "quote"`),
 * 2. the design whose Main product is the FG; quote answers, when there are
 *    any, pick the material (`source: "design"`).
 * No lines = take the Books composite. `on` = the org reads the template
 * (`useQuote`); off, nothing is looked up — the setting decides, also for an
 * FG that froze a configuration while it was on. `config` out is what
 * to freeze on the FG. A failed stage is reported and the next one tried.
 */
async function resolve(catalyst, orgId, { fgItemId, fgQty, config, on }) {
  const problems = [];
  if (!on) return { lines: [], problems, source: null, config: config || null, note: "" };
  if (config && config.industryId) {
    try {
      const r = await linesFor(catalyst, orgId, config, fgQty);
      problems.push(...r.problems);
      if (r.lines.length) return { lines: r.lines, problems, source: "quote", config, note: note(config, "quote") };
    } catch (err) {
      problems.push(`quote configuration not used (${err.message})`);
    }
  }
  try {
    const d = await designBom.linesForFg(catalyst, orgId, fgItemId, Object.values((config && config.values) || {}), fgQty);
    if (d) {
      problems.push(...d.problems);
      if (d.lines.length) {
        const cfg = { ...(config || {}), designId: d.design.id, designCode: d.design.code, designName: d.design.name };
        return { lines: d.lines, problems, source: "design", config: cfg, note: note(cfg, "design") };
      }
    }
  } catch (err) {
    problems.push(`product design not used (${err.message})`);
  }
  return { lines: [], problems, source: null, config: config || null, note: "" };
}

module.exports = { useQuote, soQuoteKeys, matchLines, configOf, requirementLines, display, fgConfig, note, findQuote, configsForSo, linesFor, resolve };

// ponytail self-check: `node functions/skuapi/workorder/quoteBom.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const { bomFromMatch } = require("../zoho/push");

  assert.deepStrictEqual(
    soQuoteKeys({ reference_number: " Q-12 ", zcrm_potential_id: 99, salesorder_number: "SO-1", custom_fields: [{ value: "Q-12" }, { value: "" }, { value: null }, { value: "High" }] }),
    ["Q-12", "99", "High"],
  );
  assert.deepStrictEqual(soQuoteKeys(null), []);

  const tplOn = { woBomSource: "template" };
  assert.strictEqual(useQuote(["work-order", "recipe-engine"], tplOn), true);
  assert.strictEqual(useQuote(["work-order", "recipe-engine"], {}), false, "add-on alone is not enough — Direct from Books is the default");
  assert.strictEqual(useQuote(["work-order", "recipe-engine"], undefined), false);
  assert.strictEqual(useQuote(["sku-generator", "work-order"], tplOn), false, "setting without the add-on never looks a quote up");
  assert.strictEqual(useQuote(undefined, tplOn), false);

  const cfg = (moc) => ({ industryId: "5", sel: { 1: moc } });
  const quote = [
    { sku: "RAVH 150", config: cfg("ci"), values: { MOC: "CI" } },
    { sku: "Motor", parent: "c1" },                       // loose line — never a template
    { sku: "ravh 150 ", config: cfg("wcb"), values: { MOC: "WCB" } },
    { sku: "RAVB 200", values: {} },                      // no config
  ];
  const m = matchLines([
    { line_item_id: "a", sku: "RAVH 150" }, { line_item_id: "b", sku: "RAVH 150" },
    { line_item_id: "c", sku: "RAVH 150" }, { line_item_id: "d", sku: "RAVB 200" }, { line_item_id: "e", sku: "Motor" },
  ], quote);
  assert.deepStrictEqual([...m.keys()], ["a", "b"], "same valve twice pairs in order; third has no template");
  assert.strictEqual(m.get("b").values.MOC, "WCB");

  const c = configOf("Q-12", quote[0]);
  assert.deepStrictEqual(c, { quoteNo: "Q-12", industryId: "5", sel: { 1: "ci" }, values: { MOC: "CI" } });
  assert.strictEqual(note(c), "from quote Q-12 · MOC: CI");
  // Geared motor pick (CR-284) rides the frozen config as an item id; junk ids are dropped.
  assert.strictEqual(configOf("Q", { config: { ...cfg("ci"), motor: { id: "9", model: "M0422", skuItemId: "77" } } }).motorItemId, "77");
  assert.strictEqual(configOf("Q", { config: { ...cfg("ci"), motor: { skuItemId: "x; DROP" } } }).motorItemId, undefined);
  assert.strictEqual(configOf("Q", { config: cfg("x"), values: { big: "v".repeat(9600) } }).values, undefined, "oversize captions dropped, answers kept");
  assert.strictEqual(configOf("Q", { config: { industryId: "5", sel: { big: "v".repeat(9600) } } }), null);
  assert.deepStrictEqual(fgConfig({ configJson: JSON.stringify(c) }), c);
  assert.strictEqual(fgConfig({ configJson: "" }), null);
  assert.strictEqual(fgConfig({}), null);
  assert.deepStrictEqual(display(c), { quoteNo: "Q-12", values: { MOC: "CI" }, design: null });

  // Design config (CR-270): an FG fed by its Product Design, with or without a quote.
  const d = { designId: "7", designCode: "TEST12345", designName: "TEST SKU Item" };
  assert.deepStrictEqual(fgConfig({ configJson: JSON.stringify(d) }), d, "design-only config counts as configured");
  assert.deepStrictEqual(display(d), { quoteNo: null, values: {}, design: "TEST SKU Item" });
  assert.strictEqual(note(d), "from design TEST12345");
  assert.strictEqual(note({ ...c, ...d }, "quote"), "from quote Q-12 · MOC: CI", "both on the FG: the note names the source used");
  assert.strictEqual(note({ ...c, ...d }, "design"), "from design TEST12345 · MOC: CI");

  // Resolver rules (push.js bomFromMatch) → WO lines.
  const r = bomFromMatch([
    { component: "Casing", skuItemId: "1", qty: 55, uom: "" },
    { component: "Liner", skuItemId: "1", qty: 5, uom: "" },        // same Books item → summed
    { component: "Motor", skuItemId: "2", qty: 1, uom: "Nos", asQuoteLine: true },
    { component: "Coating", skuItemId: "3", qty: 1, uom: "Nos" },
    { component: "Gland", skuItemId: "4", qty: 1, uom: "Nos" },
    { component: "Brg Cover", skuItemId: "9", qty: 1, uom: "Nos" },
  ], [
    { id: "1", sku: "Casing CI", name: "Casing CI", zohoItemId: "901", uom: "Kgs" },
    { id: "2", sku: "M", name: "Motor", zohoItemId: "902" },
    { id: "3", sku: "Coat", name: "Coating", zohoItemId: "903", booksData: "{\"product_type\":\"service\"}" },
    { id: "4", sku: "Gland WCB", name: "Gland WCB", zohoItemId: null },
  ]);
  assert.deepStrictEqual(r.problems, [
    "Gland: item Gland WCB is not in Zoho Books yet — push it first",
    "Brg Cover: the mapped item no longer exists",
  ]);
  assert.deepStrictEqual(requirementLines(r.lines, 2), [
    { rmItemId: "901", rmName: "Casing CI", rmSku: "Casing CI", uom: "Kgs", perUnitQty: 60, requiredQty: 120, source: "quote" },
  ], "separate-line + service dropped, shared item summed");

  // resolve (CR-270): no quote answers → the FG's Product Design; add-on off → no lookup at all.
  const tables = {
    SKUItem: [{ ROWID: "5", zohoItemId: "100" }],
    RecipeTemplate: [{ ROWID: "7", code: "TEST12345", name: "TEST SKU Item", status: "Published", productItemId: "5" }],
    RecipeComponent: [{ ROWID: "1", name: "RM1", qty: "1", uom: "Nos", sequence: "1" }],
    RecipeComponentOption: [{ ROWID: "9", componentId: "1", materialId: "3", materialCode: "TST1", castWeight: "0", enabled: true }],
    MaterialType: [{ ROWID: "3", code: "TST1", uom: "pcs", zohoItemId: "901", zohoItemName: "Dhiraj RM 1" }],
  };
  let queries = 0;
  const stub = { __orgId: "1", zcql: () => ({ executeZCQLQuery: async (q) => {
    queries += 1;
    const t = /FROM (\w+)/.exec(q)[1];
    const id = /ROWID = (\d+)/.exec(q);
    return (tables[t] || []).filter((r) => !id || String(r.ROWID) === id[1]).map((r) => ({ [t]: r }));
  } }) };
  (async () => {
    const off = await resolve(stub, "1", { fgItemId: "100", fgQty: 2, config: undefined, on: false });
    assert.deepStrictEqual([off.lines, off.source, off.config, queries], [[], null, null, 0], "composite-only org: nothing read");
    const frozen = await resolve(stub, "1", { fgItemId: "100", fgQty: 2, config: c, on: false });
    assert.deepStrictEqual([frozen.lines, frozen.config, queries], [[], c, 0], "Direct from Books: a frozen configuration is kept, not read");
    const hit = await resolve(stub, "1", { fgItemId: "100", fgQty: 2, config: undefined, on: true });
    assert.strictEqual(hit.source, "design");
    assert.deepStrictEqual(hit.lines, [{ rmItemId: "901", rmName: "Dhiraj RM 1", rmSku: "", uom: "pcs", perUnitQty: 1, requiredQty: 2, source: "design" }]);
    assert.deepStrictEqual(hit.config, { designId: "7", designCode: "TEST12345", designName: "TEST SKU Item" });
    assert.strictEqual(hit.note, "from design TEST12345");
    tables.RecipeTemplate[0].status = "Archived";
    const gone = await resolve(stub, "1", { fgItemId: "100", fgQty: 2, config: undefined, on: true });
    assert.deepStrictEqual([gone.lines, gone.source], [[], null], "inactive design → composite");
    // Geared motor (CR-284): the frozen item id becomes one quote-sourced line × FG qty; unpushed item = problem, no line.
    tables.SKUItem.push({ ROWID: "6", name: "Gear SEW R47", sku: "R47DIBE90S4", zohoItemId: "906", uom: "Nos" }, { ROWID: "8", name: "Gear PBL", sku: "M0422", zohoItemId: null });
    const mot = await resolve(stub, "1", { fgItemId: "100", fgQty: 3, config: { ...c, motorItemId: "6" }, on: true });
    assert.deepStrictEqual([mot.source, mot.lines], ["quote", [{ rmItemId: "906", rmName: "Gear SEW R47", rmSku: "R47DIBE90S4", uom: "Nos", perUnitQty: 1, requiredQty: 3, source: "quote" }]]);
    const unp = await resolve(stub, "1", { fgItemId: "100", fgQty: 3, config: { ...c, motorItemId: "8" }, on: true });
    assert.ok(unp.problems.some((p) => /Geared motor: item M0422 is not in Zoho Books/.test(p)), unp.problems.join(" | "));
    console.log("quoteBom: ok");
  })().catch((e) => { console.error(e); process.exit(1); });
}
