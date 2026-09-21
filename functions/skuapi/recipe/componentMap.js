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
    lines.push({ component, skuItemId: String(row.skuItemId), qty });
  }
  const missing = [...new Set(active.filter((r) => isTrue(r.required)).map((r) => r.component))]
    .filter((c) => !best.has(c));
  return { lines, missing };
}

module.exports = { matchComponents, conditionsOf };

if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const MODEL = "10", MOC = "11", FLANGE = "12", PROX = "13";
  const rows = [
    { component: "Body", conditions: [{ propertyId: MOC, valueId: "CI" }], skuItemId: "1", qty: 1, required: true },
    { component: "Body", conditions: [{ propertyId: MODEL, valueId: "200" }, { propertyId: MOC, valueId: "CI" }], skuItemId: "2", qty: 1, required: true },
    { component: "Flange", conditionsJson: "[]", skuItemId: "3", qtyPropertyId: FLANGE },
    { component: "Prox", conditionsJson: JSON.stringify([{ propertyId: PROX, valueId: "Y" }]), skuItemId: "4", qty: 2 },
    { component: "Rotor", conditions: [], skuItemId: "5", qty: 1, status: "Inactive", required: "true" },
  ];
  // specific row beats generic; qty from answer; Y/N accessory
  let r = matchComponents(rows, { [MODEL]: "200", [MOC]: "CI", [FLANGE]: "2", [PROX]: "Y" });
  assert.deepStrictEqual(r.lines, [
    { component: "Body", skuItemId: "2", qty: 1 },
    { component: "Flange", skuItemId: "3", qty: 2 },
    { component: "Prox", skuItemId: "4", qty: 2 },
  ]);
  assert.deepStrictEqual(r.missing, []); // inactive required row is ignored
  // generic fallback for another model; zero / unanswered flange qty drops; N accessory has no row
  r = matchComponents(rows, { [MODEL]: "250", [MOC]: "CI", [FLANGE]: "0", [PROX]: "N" });
  assert.deepStrictEqual(r.lines, [{ component: "Body", skuItemId: "1", qty: 1 }]);
  r = matchComponents(rows, { [MOC]: "CI" });
  assert.deepStrictEqual(r.lines, [{ component: "Body", skuItemId: "1", qty: 1 }]);
  // required component with no matching row
  r = matchComponents(rows, { [MOC]: "WCB" });
  assert.deepStrictEqual(r.missing, ["Body"]);
  assert.deepStrictEqual(r.lines, []);
  assert.deepStrictEqual(matchComponents([], {}), { lines: [], missing: [] });
  console.log("componentMap selftest ok");
}
