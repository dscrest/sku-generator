"use strict";
/**
 * Price ladder (Product Configurator, CR-220): Base → OH → Margin → P&F →
 * Other → Disc → unit price. Each step = previous ÷ (1 − pct/100) — margin on
 * selling price, the convention in Ricon's costing sheet (7800 → 8667 at 10 %),
 * NOT cost-plus (recipe/calc.js stays cost-plus for the design costing).
 *
 * A line's class picks the % set: Mfg (SKUItem.type Manufacturing) or BO
 * (bought-out, Trading). The sets live in OrgSetting `priceLadder` as JSON
 * `{"mfg":{"oh":10,"margin":11,"pf":12,"other":13,"disc":14},"bo":{…}}`.
 *
 * Pure — no I/O, no rounding (round at display). `node recipe/ladder.js --selftest`.
 * ponytail: the widget carries a copy of applyLadder/classOf (configurator.html
 * stays a single self-contained file); keep the three in step.
 */

const STEPS = ["oh", "margin", "pf", "other", "disc"];
const CLASSES = ["mfg", "bo"];

const zeros = () => Object.fromEntries(STEPS.map((k) => [k, 0]));

// 0 ≤ pct < 100 — a 100 % step would divide by zero.
function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99.99, n);
}

function applyLadder(base, pcts) {
  const p = pcts || {};
  let v = Number(base) || 0;
  const out = { base: v };
  for (const k of STEPS) {
    v = v / (1 - clampPct(p[k]) / 100);
    out[k] = v;
  }
  out.unit = v;
  return out;
}

// Tolerant parse of the stored setting (or a request body): always both
// classes, every step a clamped number; garbage → zeros.
function parseLadder(input) {
  let obj = input;
  if (typeof input === "string") {
    try { obj = JSON.parse(input); } catch { obj = null; }
  }
  const out = {};
  for (const c of CLASSES) {
    const src = (obj && typeof obj === "object" && obj[c] && typeof obj[c] === "object") ? obj[c] : {};
    out[c] = zeros();
    for (const k of STEPS) out[c][k] = clampPct(src[k]);
  }
  return out;
}

const classOf = (type) => (type === "Manufacturing" ? "mfg" : "bo");

module.exports = { STEPS, CLASSES, applyLadder, parseLadder, classOf };

if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const r = (v) => Math.round(v);
  // Sheet / screenshot numbers: Mfg 10/11/12/13/14 → 111,125,142,163,190; BO 2/3/4/5/6 → 102,105,110,115,123
  const mfg = applyLadder(100, { oh: 10, margin: 11, pf: 12, other: 13, disc: 14 });
  assert.deepStrictEqual([mfg.oh, mfg.margin, mfg.pf, mfg.other, mfg.disc].map(r), [111, 125, 142, 163, 190]);
  assert.strictEqual(mfg.unit, mfg.disc);
  const bo = applyLadder(100, { oh: 2, margin: 3, pf: 4, other: 5, disc: 6 });
  assert.deepStrictEqual([bo.oh, bo.margin, bo.pf, bo.other, bo.disc].map(r), [102, 105, 110, 115, 123]);
  // line total uses the unrounded unit: 15 × 122.7 → 1841 (sheet), not 15 × 123
  assert.strictEqual(r(bo.unit * 15), 1841);
  // Ricon casting sheet: 7800 at 10/15/5/0/10 → 8667, 10196, 10733, 11925
  const cast = applyLadder(7800, { oh: 10, margin: 15, pf: 5, other: 0, disc: 10 });
  assert.deepStrictEqual([cast.oh, cast.margin, cast.pf, cast.other, cast.disc].map(r), [8667, 10196, 10733, 10733, 11925]);
  // no percentages = base passes through; 100 % clamps instead of Infinity
  assert.strictEqual(applyLadder(50, {}).unit, 50);
  assert.ok(Number.isFinite(applyLadder(100, { oh: 100 }).unit));
  // tolerant parse: string JSON, partial keys, garbage, negative
  assert.deepStrictEqual(parseLadder('{"mfg":{"oh":10},"bo":"x"}'), {
    mfg: { oh: 10, margin: 0, pf: 0, other: 0, disc: 0 }, bo: { oh: 0, margin: 0, pf: 0, other: 0, disc: 0 },
  });
  assert.deepStrictEqual(parseLadder("not json").mfg, zeros());
  assert.strictEqual(parseLadder({ bo: { disc: -5 } }).bo.disc, 0);
  assert.strictEqual(classOf("Manufacturing"), "mfg");
  assert.strictEqual(classOf("Trading"), "bo");
  assert.strictEqual(classOf(undefined), "bo");
  console.log("ladder selftest ok");
}
