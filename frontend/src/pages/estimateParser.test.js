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

// 5. One-CRM-line-per-size: same product repeated with `Size:` in each
// description → one item, one size row per line, sectioned by Design Type.
const sizeDesc = (design, size) => `Valve Type: Ball Valve
Design Type: ${design}
Size: ${size}
Connection Type : Flangend
Body Material: ASTM A105`;
const sizeQuote = {
  Quoted_Items: [
    { Product_Name: "Ball Valve ASTM A105 Chain Operated", Quantity: 1, List_Price: 0, Description: sizeDesc("Control Type", '1-1/4" | DN 32') },
    { Product_Name: "Ball Valve ASTM A105 Chain Operated", Quantity: 1, List_Price: 10, Description: sizeDesc("Control Type", '1-1/2" | DN 40') },
    { Product_Name: "Ball Valve ASTM A105 Chain Operated", Quantity: 2, List_Price: 5, Description: sizeDesc("Bi-Directional", '1" | DN25') },
    { Product_Name: "Gasket Set", Quantity: 10, List_Price: 250, Description: "Standard gasket set, nitrile." },
  ],
};
const mergedEst = buildEstimate(sizeQuote);
assert.strictEqual(mergedEst.items.length, 2, "3 same-product lines merge into 1 item");
const mi = mergedEst.items[0];
assert.strictEqual(mi.flat, false);
assert.strictEqual(mi.sr, 1);
assert(!mi.specs.some(([k]) => /^size$/i.test(k)), "Size spec removed from description block");
assert.strictEqual(mi.groups.length, 2, "sections by Design Type");
assert.strictEqual(mi.groups[0].design, "CONTROL TYPE");
assert.deepStrictEqual(mi.groups[0].rows[1], { size: '1-1/2"', mm: "DN 40", qty: 1, rate: 10 });
assert.deepStrictEqual(mi.groups[1].rows[0], { size: '1"', mm: "DN25", qty: 2, rate: 5 });
assert.strictEqual(mergedEst.items[1].flat, true, "no-Size line stays flat");
assert.strictEqual(mergedEst.items[1].sr, 2, "sr renumbered after merge");
const mt = computeTotals(mergedEst.items, null);
assert.strictEqual(mt.totalQty, 14);
assert.strictEqual(mt.totalA, 1 * 0 + 1 * 10 + 2 * 5 + 10 * 250);

// 5b. merge: false (All Item - Trading version) → no same-name collapsing,
// one item per CRM line in original order.
const tradingEst = buildEstimate(sizeQuote, { merge: false });
assert.strictEqual(tradingEst.items.length, 4, "merge:false keeps one item per line");
assert(tradingEst.items.slice(0, 3).every((it) => !it.flat && it.groups.length === 1 && it.groups[0].rows.length === 1),
  "each size line becomes its own single-row item");
assert.deepStrictEqual(tradingEst.items.map((it) => it.sr), [1, 2, 3, 4]);
const tt = computeTotals(tradingEst.items, null);
assert.strictEqual(tt.totalQty, 14, "totals unchanged by merge:false");
assert.strictEqual(tt.totalA, mt.totalA);

// 6. Select_discount custom field wins over standard Discount; % strings parse.
assert.strictEqual(buildEstimate({ ...quote, Select_discount: "25%" }).header.discountPct, 25);
assert.strictEqual(buildEstimate({ ...quote, Select_discount: "12.5" }).header.discountPct, 12.5);
assert.strictEqual(buildEstimate({ ...quote, Select_discount: "-None-" }).header.discountPct, 30, "unparsable picklist falls back to Discount");
assert.strictEqual(buildEstimate({ ...quote, Select_discount: null }).header.discountPct, 30);

// 7. "To" section from the embedded _account/_contact records; lookup-name
// fallback when they're absent (e.g. lookup fetch failed → null).
const withAccount = buildEstimate({
  ...quote,
  _account: {
    Account_Name: "PHOENIX VALSTEER PVT. LTD.",
    Billing_Street: "12 Industrial Estate", Billing_City: "Kochi",
    Billing_State: "Kerala", Billing_Code: "682001",
    Phone: "0484-1234567", Email: "purchase@phoenix.example",
    GST_No: "32AAACP1234A1Z5",
  },
  _contact: { Full_Name: "Thulaseedharan T K", Mobile: "+91 98765 43210" },
});
assert.strictEqual(withAccount.header.to.address, "12 Industrial Estate, Kochi, Kerala, 682001");
assert.strictEqual(withAccount.header.to.phone, "0484-1234567");
assert.strictEqual(withAccount.header.to.email, "purchase@phoenix.example");
assert.strictEqual(withAccount.header.to.gstin, "32AAACP1234A1Z5");
assert.strictEqual(withAccount.header.to.contact, "Thulaseedharan T K");
assert.strictEqual(withAccount.header.to.mobile, "+91 98765 43210");
assert.strictEqual(est.header.to.name, "PHOENIX VALSTEER PVT. LTD.", "no _account → lookup name");
assert.strictEqual(est.header.to.contact, "Thulaseedharan T K");
assert.strictEqual(est.header.to.address, "");
assert.strictEqual(est.header.to.gstin, "");

// 8. Empty / null description → flat, not a crash.
assert.strictEqual(parseLineDescription(""), null);
assert.strictEqual(parseLineDescription(null), null);

console.log("estimateParser: all checks passed");
