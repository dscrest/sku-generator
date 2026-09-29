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
 * `node workorder/quoteBom.js --selftest`
 */
const { rowList, zStr } = require("../store");
const { byOrg, inList } = require("./store");
const { resolveBomLines } = require("../zoho/push");

const n = (v) => Number(v) || 0;
const CONFIG_MAX = 9500; // text column silently caps at 10000
const norm = (s) => String(s ?? "").trim().toLowerCase();
const parse = (s, dflt) => { try { return s ? JSON.parse(s) : dflt; } catch { return dflt; } };

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
const display = (config) => (config ? { quoteNo: config.quoteNo || null, values: config.values || {} } : null);
const fgConfig = (fg) => { const c = parse(fg && fg.configJson, null); return c && c.industryId ? c : null; };
function note(config) {
  const moc = Object.entries(config.values || {}).find(([k]) => norm(k) === "moc");
  return `from quote ${config.quoteNo || "configuration"}${moc ? ` · MOC: ${moc[1]}` : ""}`;
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
async function linesFor(catalyst, config, fgQty) {
  const r = await resolveBomLines(catalyst, config.industryId, config.sel);
  return { lines: requirementLines(r.lines, fgQty), problems: r.problems };
}

module.exports = { soQuoteKeys, matchLines, configOf, requirementLines, display, fgConfig, note, findQuote, configsForSo, linesFor };

// ponytail self-check: `node functions/skuapi/workorder/quoteBom.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const { bomFromMatch } = require("../zoho/push");

  assert.deepStrictEqual(
    soQuoteKeys({ reference_number: " Q-12 ", zcrm_potential_id: 99, salesorder_number: "SO-1", custom_fields: [{ value: "Q-12" }, { value: "" }, { value: null }, { value: "High" }] }),
    ["Q-12", "99", "High"],
  );
  assert.deepStrictEqual(soQuoteKeys(null), []);

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
  assert.strictEqual(configOf("Q", { config: cfg("x"), values: { big: "v".repeat(9600) } }).values, undefined, "oversize captions dropped, answers kept");
  assert.strictEqual(configOf("Q", { config: { industryId: "5", sel: { big: "v".repeat(9600) } } }), null);
  assert.deepStrictEqual(fgConfig({ configJson: JSON.stringify(c) }), c);
  assert.strictEqual(fgConfig({ configJson: "" }), null);
  assert.strictEqual(fgConfig({}), null);
  assert.deepStrictEqual(display(c), { quoteNo: "Q-12", values: { MOC: "CI" } });

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
  console.log("quoteBom: ok");
}
