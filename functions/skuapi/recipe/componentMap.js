"use strict";
/**
 * Component Map matcher (Product Configurator): answers -> component items.
 *
 * A ComponentMap row says "when these answers hold, component X is item Y × qty".
 * Conditions are AND-ed `{propertyId, valueId}` pairs; none = always. Per
 * component the MOST SPECIFIC matching row wins (most conditions), so a generic
 * row (MOC=CI) can be overridden by a specific one (Model=RAVH 200 + MOC=CI).
 * Qty comes from the row, or from a numeric answer when qtyPropertyId is set
 * (companion flanges → Nos); qty ≤ 0 drops the line. A component with a
 * `required` row and no match is reported in `missing`.
 *
 * Pure — no I/O. `node recipe/componentMap.js --selftest`.
 */

function conditionsOf(row) {
  if (Array.isArray(row.conditions)) return row.conditions;
  try { const c = JSON.parse(row.conditionsJson || "[]"); return Array.isArray(c) ? c : []; } catch { return []; }
}

const isTrue = (v) => v === true || v === "true";

// Units offered everywhere in the configurator (widget Qty, Component Map rows,
// template builder) — also the Books item `unit` and the CRM Usage Unit.
// Default list; an org overrides it via OrgSetting `uomList` (CR-216, SKU
// Settings → Units of measure, comma-separated). Free text is still stored
// (like RecipeComponent.uom); the list only canonicalises casing.
const UOMS = ["Nos", "Pcs", "Kgs", "Gms", "Mtr", "CM", "MM", "Ltr", "Set", "Box"];
// Comma-separated setting → clean list: trimmed, ≤20 chars, de-duplicated
// case-insensitively, first spelling wins. Empty → UOMS.
function parseUoms(text) {
  const seen = new Set();
  const list = [];
  for (const raw of String(text ?? "").split(",")) {
    const s = raw.trim().slice(0, 20);
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); list.push(s); }
  }
  return list.length ? list : UOMS;
}
const uomsOf = (settings) => parseUoms(settings && settings.uomList);
function normUom(v, list = UOMS) {
  const s = String(v ?? "").trim().slice(0, 20);
  if (!s) return "Nos";
  return list.find((u) => u.toLowerCase() === s.toLowerCase()) || s;
}

function matchComponents(rows, selectedValues) {
  const sel = selectedValues || {};
  const active = (rows || []).filter((r) => !r.status || r.status === "Active");
  const best = new Map(); // component -> { row, n }
  for (const row of active) {
    const conds = conditionsOf(row);
    const ok = conds.every((c) => sel[c.propertyId] !== undefined && String(sel[c.propertyId]) === String(c.valueId));
    if (!ok) continue;
    const cur = best.get(row.component);
    if (!cur || conds.length > cur.n) best.set(row.component, { row, n: conds.length });
  }
  const lines = [];
  for (const [component, { row }] of best) {
    const qty = row.qtyPropertyId ? Number(sel[row.qtyPropertyId]) : Number(row.qty) || 1;
    if (!(qty > 0)) continue;
    // asQuoteLine (CR-195): sold as its own quote/SO line, not part of the composite BOM.
    lines.push({ component, skuItemId: String(row.skuItemId), qty, uom: normUom(row.uom), asQuoteLine: isTrue(row.asQuoteLine) });
  }
  const missing = [...new Set(active.filter((r) => isTrue(r.required)).map((r) => r.component))]
    .filter((c) => !best.has(c));
  return { lines, missing };
}

// An item's stored answers (SKUItemValue rows) as the matcher's selectedValues:
// List answers by value ROWID, Range/Text answers by their text. Shared by the
// Books push and the by-item widget resolve (CR-200) so both see the same BOM.
function selectedFromValues(vals) {
  return Object.fromEntries((vals || []).map((v) => [String(v.propertyId), /^\d+$/.test(String(v.valueId)) ? String(v.valueId) : v.valueText]));
}

// Components form (CR-253): rows sharing industryId + component are ONE
// component. Its "shape" is the question the single-condition rows agree on
// (most rows wins; none = the component does not depend on a question).
// `simple` rows fit the shape — no condition when the shape is null, else
// exactly one condition on that question — and the form owns them; anything
// else is `advanced` (2+ conditions, another question, or a fallback row
// beside answer rows) and stays editable per row only.
const fitsShape = (conds, propertyId) => (propertyId
  ? conds.length === 1 && String(conds[0].propertyId) === String(propertyId)
  : conds.length === 0);
function groupRows(rows) {
  const groups = new Map();
  for (const r of rows || []) {
    const key = `${r.industryId}|${String(r.component || "").trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { industryId: String(r.industryId), component: r.component, rows: [] });
    groups.get(key).rows.push(r);
  }
  return [...groups.values()].map(({ industryId, component, rows: list }) => {
    const votes = new Map();
    for (const r of list) {
      const c = conditionsOf(r);
      if (c.length === 1) votes.set(String(c[0].propertyId), (votes.get(String(c[0].propertyId)) || 0) + 1);
    }
    const propertyId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const simple = [], advanced = [];
    for (const r of list) (fitsShape(conditionsOf(r), propertyId) ? simple : advanced).push(r);
    return { industryId, component, propertyId, simple, advanced };
  });
}

// Save plan for the form: `items` = [{valueId?, skuItemId}] under `propertyId`
// (null = one unconditioned row). Rows fitting the new shape OR the old simple
// shape are owned; per answer the first owned row is updated, the rest removed,
// unmatched answers inserted. Advanced rows are returned untouched.
function planSync(existing, propertyId, items) {
  const [old] = groupRows(existing);
  const owned = (existing || []).filter((r) => fitsShape(conditionsOf(r), propertyId) || (old && old.simple.includes(r)));
  const keyOf = (conds) => (conds.length ? String(conds[0].valueId) : "");
  const have = new Map(); const remove = [];
  for (const r of owned) { const k = keyOf(conditionsOf(r)); if (have.has(k)) remove.push(r); else have.set(k, r); }
  const update = [], insert = [];
  for (const it of items || []) {
    const conditions = propertyId ? [{ propertyId: String(propertyId), valueId: String(it.valueId) }] : [];
    const cur = have.get(keyOf(conditions));
    if (cur) { have.delete(keyOf(conditions)); update.push({ row: cur, skuItemId: String(it.skuItemId), conditions }); }
    else insert.push({ skuItemId: String(it.skuItemId), conditions });
  }
  return { update, insert, remove: [...remove, ...have.values()], advanced: old ? old.advanced : [] };
}

module.exports = { matchComponents, conditionsOf, selectedFromValues, groupRows, fitsShape, planSync, UOMS, parseUoms, uomsOf, normUom };

if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const MODEL = "10", MOC = "11", FLANGE = "12", PROX = "13";
  const rows = [
    { component: "Body", conditions: [{ propertyId: MOC, valueId: "CI" }], skuItemId: "1", qty: 1, required: true },
    { component: "Body", conditions: [{ propertyId: MODEL, valueId: "200" }, { propertyId: MOC, valueId: "CI" }], skuItemId: "2", qty: 1, uom: "kgs", required: true },
    { component: "Flange", conditionsJson: "[]", skuItemId: "3", qtyPropertyId: FLANGE },
    { component: "Prox", conditionsJson: JSON.stringify([{ propertyId: PROX, valueId: "Y" }]), skuItemId: "4", qty: 2, uom: "Pair" },
    { component: "Rotor", conditions: [], skuItemId: "5", qty: 1, status: "Inactive", required: "true" },
    { component: "Motor", conditions: [{ propertyId: PROX, valueId: "Y" }], skuItemId: "6", qty: 1, asQuoteLine: "true" },
  ];
  // specific row beats generic; qty from answer; Y/N accessory; separate-line flag passes through;
  // uom canonicalised from the list (kgs → Kgs), unknown kept, blank → Nos
  let r = matchComponents(rows, { [MODEL]: "200", [MOC]: "CI", [FLANGE]: "2", [PROX]: "Y" });
  assert.deepStrictEqual(r.lines, [
    { component: "Body", skuItemId: "2", qty: 1, uom: "Kgs", asQuoteLine: false },
    { component: "Flange", skuItemId: "3", qty: 2, uom: "Nos", asQuoteLine: false },
    { component: "Prox", skuItemId: "4", qty: 2, uom: "Pair", asQuoteLine: false },
    { component: "Motor", skuItemId: "6", qty: 1, uom: "Nos", asQuoteLine: true },
  ]);
  assert.deepStrictEqual(r.missing, []); // inactive required row is ignored
  // generic fallback for another model; zero / unanswered flange qty drops; N accessory has no row
  r = matchComponents(rows, { [MODEL]: "250", [MOC]: "CI", [FLANGE]: "0", [PROX]: "N" });
  assert.deepStrictEqual(r.lines, [{ component: "Body", skuItemId: "1", qty: 1, uom: "Nos", asQuoteLine: false }]);
  r = matchComponents(rows, { [MOC]: "CI" });
  assert.deepStrictEqual(r.lines, [{ component: "Body", skuItemId: "1", qty: 1, uom: "Nos", asQuoteLine: false }]);
  assert.strictEqual(normUom(" mm "), "MM");
  assert.strictEqual(normUom(""), "Nos");
  // org list (CR-216): parsed from the comma-separated setting, org casing wins, blank → default list
  assert.deepStrictEqual(parseUoms(" MTR, kgs ,,Box, mtr ,"), ["MTR", "kgs", "Box"]);
  assert.deepStrictEqual(uomsOf({}), UOMS);
  assert.strictEqual(normUom("mtr", ["MTR", "Box"]), "MTR");
  assert.strictEqual(normUom("Pair", ["MTR", "Box"]), "Pair");
  // required component with no matching row
  r = matchComponents(rows, { [MOC]: "WCB" });
  assert.deepStrictEqual(r.missing, ["Body"]);
  assert.deepStrictEqual(r.lines, []);
  assert.deepStrictEqual(matchComponents([], {}), { lines: [], missing: [] });
  // stored answers → selectedValues: List by value id, Range by text; feeds the same matcher
  const sel = selectedFromValues([
    { propertyId: MODEL, valueId: "200", valueText: "RAVH 200" },
    { propertyId: MOC, valueId: "CI", valueText: "CI" }, // non-numeric id → text (same here)
    { propertyId: FLANGE, valueId: null, valueText: "2" },
  ]);
  assert.deepStrictEqual(sel, { [MODEL]: "200", [MOC]: "CI", [FLANGE]: "2" });
  assert.deepStrictEqual(matchComponents(rows, sel).lines.map((l) => l.skuItemId), ["2", "3"]);
  // groupRows: one group per industry + component (case-insensitive); shape = the
  // question most single-condition rows use; fallback / 2-condition rows are advanced
  const g = groupRows([
    { id: "a", industryId: "1", component: "Body", conditions: [{ propertyId: MOC, valueId: "CI" }] },
    { id: "b", industryId: "1", component: "body", conditions: [{ propertyId: MOC, valueId: "SS" }] },
    { id: "c", industryId: "1", component: "Body", conditions: [{ propertyId: MODEL, valueId: "200" }, { propertyId: MOC, valueId: "CI" }] },
    { id: "d", industryId: "1", component: "Body", conditionsJson: "[]" },
    { id: "e", industryId: "1", component: "Flange", conditions: [] },
    { id: "f", industryId: "2", component: "Body", conditions: [{ propertyId: MODEL, valueId: "200" }] },
  ]);
  assert.deepStrictEqual(g.map((x) => [x.industryId, x.component, x.propertyId, x.simple.map((r) => r.id), x.advanced.map((r) => r.id)]), [
    ["1", "Body", MOC, ["a", "b"], ["c", "d"]],
    ["1", "Flange", null, ["e"], []],
    ["2", "Body", MODEL, ["f"], []],
  ]);
  assert.deepStrictEqual(groupRows([]), []);
  // planSync: same shape updates in place + removes dropped answers + duplicate rows;
  // shape change deletes the old simple rows; advanced rows untouched; fresh = inserts
  const body = [
    { id: "a", industryId: "1", component: "Body", conditions: [{ propertyId: MOC, valueId: "CI" }], skuItemId: "1" },
    { id: "b", industryId: "1", component: "Body", conditions: [{ propertyId: MOC, valueId: "SS" }], skuItemId: "2" },
    { id: "b2", industryId: "1", component: "Body", conditions: [{ propertyId: MOC, valueId: "SS" }], skuItemId: "9" },
    { id: "c", industryId: "1", component: "Body", conditions: [{ propertyId: MODEL, valueId: "200" }, { propertyId: MOC, valueId: "CI" }], skuItemId: "3" },
  ];
  let p = planSync(body, MOC, [{ valueId: "CI", skuItemId: "7" }, { valueId: "WCB", skuItemId: "8" }]);
  assert.deepStrictEqual(p.update.map((u) => [u.row.id, u.skuItemId]), [["a", "7"]]);
  assert.deepStrictEqual(p.insert, [{ skuItemId: "8", conditions: [{ propertyId: MOC, valueId: "WCB" }] }]);
  assert.deepStrictEqual(p.remove.map((r) => r.id).sort(), ["b", "b2"]);
  assert.deepStrictEqual(p.advanced.map((r) => r.id), ["c"]);
  p = planSync(body, null, [{ skuItemId: "5" }]);
  assert.deepStrictEqual([p.update, p.insert], [[], [{ skuItemId: "5", conditions: [] }]]);
  assert.deepStrictEqual(p.remove.map((r) => r.id).sort(), ["a", "b", "b2"]);
  p = planSync([], MODEL, [{ valueId: "200", skuItemId: "1" }]);
  assert.deepStrictEqual([p.update.length, p.insert.length, p.remove.length, p.advanced.length], [0, 1, 0, 0]);
  console.log("componentMap selftest ok");
}
