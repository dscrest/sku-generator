// Self-check for the estimate parser. Run: node frontend/src/pages/estimateParser.test.js
import assert from "node:assert";
import { parseLineDescription, buildEstimate, computeTotals } from "./estimateParser.js";

// 1. Prototype-style description → specs + 2 design groups with size rows.
const desc = `
MAKE:- MARUTI
BRAND:- MSUN
BODY:- ASTM A351 Gr.CF8
UNI - DIRECTIONAL
DESIGN:- WAFER SEMI LUG TYPE
4" / 100MM QTY 4 @ 10650
6" / 150MM QTY 4 @ 15750
8" / 200MM QTY 4 @ 23600
10" / 250MM QTY 4 @ 35200
12" / 300MM QTY 4 @ 44250
16" / 400MM QTY 2 @ 89500
DESIGN:- FULL FLANGE TYPE
20" / 450MM QTY 2 @ 185500
24" / 500MM QTY 1 @ 245000
`;
const parsed = parseLineDescription(desc);
assert(parsed, "prototype-style description should parse");
assert.deepStrictEqual(parsed.specs[0], ["MAKE", "MARUTI"]);
assert.deepStrictEqual(parsed.specs[3], ["", "UNI - DIRECTIONAL"]);
assert.strictEqual(parsed.groups.length, 2);
assert.strictEqual(parsed.groups[0].design, "WAFER SEMI LUG TYPE");
assert.strictEqual(parsed.groups[0].rows.length, 6);
assert.deepStrictEqual(parsed.groups[0].rows[0], { size: '4"', mm: "100MM", qty: 4, rate: 10650 });
assert.deepStrictEqual(parsed.groups[1].rows[1], { size: '24"', mm: "500MM", qty: 1, rate: 245000 });

// 2. Totals reproduce the prototype's asserted numbers (13,12,800 / 3,93,840 / 9,18,960 / qty 25).
const quote = {
  Quote_Number: "MVPL-01344/NR/BK/25-26",
  Created_Time: "2026-01-05T10:00:00+05:30",
  Discount: 30,
  Account_Name: { name: "PHOENIX VALSTEER PVT. LTD." },
  Contact_Name: { name: "Thulaseedharan T K" },
  Quoted_Items: [{ Product_Name: { name: "SS 304 - KNIFE EDGE GATE VALVE - MANUAL" }, Quantity: 25, List_Price: 0, Description: desc }],
};
const est = buildEstimate(quote);
assert.strictEqual(est.header.offerNo, "MVPL-01344/NR/BK/25-26");
assert.strictEqual(est.header.date, "05-01-2026");
assert.strictEqual(est.header.discountPct, 30);
const t = computeTotals(est.items, est.header.discountPct);
assert.strictEqual(Math.round(t.totalA), 1312800, `totalA drift: ${t.totalA}`);
assert.strictEqual(Math.round(t.disc), 393840, `disc drift: ${t.disc}`);
assert.strictEqual(Math.round(t.net), 918960, `net drift: ${t.net}`);
assert.strictEqual(t.totalQty, 25, `qty drift: ${t.totalQty}`);

// 3. Free-text garbage → flat fallback carrying the CRM line's qty/price.
const flatEst = buildEstimate({
  Quoted_Items: [{ Product_Name: "Gasket Set", Quantity: 10, List_Price: 250, Description: "Standard gasket set, nitrile." }],
});
assert.strictEqual(flatEst.items[0].flat, true);
assert.strictEqual(flatEst.items[0].qty, 10);
assert.strictEqual(flatEst.items[0].total, 2500);
assert.strictEqual(flatEst.header.discountPct, null);

// 4. Missing Discount → no disc row, net === totalA.
const t2 = computeTotals(flatEst.items, flatEst.header.discountPct);
assert.strictEqual(t2.disc, 0);
assert.strictEqual(t2.net, t2.totalA);

// 5. Empty / null description → flat, not a crash.
assert.strictEqual(parseLineDescription(""), null);
assert.strictEqual(parseLineDescription(null), null);

console.log("estimateParser: all checks passed");
