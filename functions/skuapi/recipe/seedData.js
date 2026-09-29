"use strict";

/** Recipe Engine / Product Configurator seed data. The RAVS150 demo recipe (CR-104) was removed in CR-196. */

const DEFAULT_COST_ELEMENTS = [
  { code: "CASTING", label: "CS Cost", calcType: "RATE_QTY", sequence: 1 },
  { code: "MACHINING", label: "M/C", calcType: "FIXED", sequence: 2 },
  { code: "DRILLING", label: "Drill Etc", calcType: "FIXED", sequence: 3 },
  { code: "ASSEMBLY", label: "Assembly", calcType: "FIXED", sequence: 4 },
];

// ---------- Product Configurator starter data (CR-181) ----------
// RAV volume sheet: one row per filled cell. [series, group (RAV type answer), [[modelCode, ltr/rev], …]]
const SIZING_MODELS = [
  ["Square", "Drop through", [["RAVH 100", 1.81], ["RAVH 150", 3.8], ["RAVH 200", 7.35], ["RAVH 250", 17], ["RAVH 300", 32],
    ["RAVH 350", 46], ["RAVH 400", 59], ["RAVH 450", 80], ["RAVH 500", 100], ["RAVH 550", 121], ["RAVH 750", 310]]],
  ["RAVH-S Square", "Drop through", [["RAVH 150S", 1.81], ["RAVH 200S", 3.8], ["RAVH 250S", 7.35], ["RAVH 300S", 17], ["RAVH 400S", 32]]],
  ["Round", "Drop through", [["RAVH 150", 3.8], ["RAVH 200", 7.35], ["RAVH 250", 17], ["RAVH 300", 32]]],
  ["Round Old", "Drop through", [["RAVH 150", 3.8], ["RAVH 200", 7.35], ["RAVH 250D", 7.35], ["RAVH 300D", 17]]],
  ["RAVH-S IC", "IC", [["RAVH 150S", 1.81], ["RAVH 200S", 3.8]]],
  // Sheet prints "RAVH 150" in the sanitary column at 3.80; the costing sheet calls it RAVS 150.
  ["RAVS", "Sanitary", [["RAVS 150", 3.8], ["RAVS 200", 7.35], ["RAVS 250", 17], ["RAVS 300", 32], ["RAVS 350", 46]]],
  // CB cells carry no size on the sheet — capacity is the only distinguisher; rename in the grid.
  ["CB", "CB", [["RAVH CB 7.35", 7.35], ["RAVH CB 17", 17], ["RAVH CB 32", 32], ["RAVH CB 46", 46], ["RAVH CB 59", 59],
    ["RAVH CB 121", 121], ["RAVH CB 156", 156], ["RAVH 900.70", 590]]],
  ["RAVB Square", "Blow Through", [["RAVB 150", 3.8], ["RAVB 200", 7.35], ["RAVB 250", 17], ["RAVB 300", 32]]],
].flatMap(([series, groupValue, rows]) => rows.map(([modelCode, capacity]) => ({ series, groupValue, modelCode, capacity, status: "Active" })));

// Quotation question sheet. Values: "Display" or ["Display", "SKU"]; SKU defaults
// to the display text upper-cased without spaces. `sku: false` keeps the answer
// off the SKU (duty data — it rides on the quote line, not the item).
// `widget: false` (CR-223) keeps the question in the bank but off the configurator.
const uniq = (a) => [...new Set(a)];
const YN = [["Y", "Y"], ["N", "N"]];
const RAV_QUESTIONS = [
  { caption: "Capacity", unit: "TPH", range: true, sku: false, role: "capacity", required: true },
  { caption: "Bulk Density", unit: "kg/ltr", range: true, sku: false, role: "density", required: true },
  { caption: "Speed", unit: "RPM", range: true, sku: false, role: "speed", required: true },
  { caption: "RAV type", sku: false, role: "group", required: true,
    values: ["Drop through", "Blow Through", "Sanitary", "IC", "CB"] },
  { caption: "Series", role: "series", required: true,
    values: [["Square", "SQ"], ["RAVH-S Square", "SSQ"], ["Round", "RD"], ["Round Old", "RDO"], ["RAVH-S IC", "SIC"], ["RAVS", "SAN"], ["CB", "CB"], ["RAVB Square", "BSQ"]] },
  { caption: "Model", role: "model", required: true, inName: true, values: uniq(SIZING_MODELS.map((m) => m.modelCode)) },
  { caption: "No of blade", widget: false, values: [["Default", "BD"], ["8", "B8"], ["10", "B10"]] },
  { caption: "MOC", required: true, inName: true,
    values: ["CI", "WCB", ["MS Fab", "MSF"], ["SS304", "S304"], ["SS304L", "S304L"], ["SS316", "S316"], ["SS316L", "S316L"], ["H Alloy", "HAL"]] },
  // Sheet says only "HP / Bare Shaft" — the HP ladder is a starter guess; edit in Properties.
  // "Bare Shaft" is the widget's Motor Operated / Bare Shaft radio (CR-223), not an HP value.
  { caption: "Motor HP", values: [["0.5 HP", "H05"], ["1 HP", "H1"], ["1.5 HP", "H15"], ["2 HP", "H2"], ["3 HP", "H3"], ["5 HP", "H5"], ["7.5 HP", "H75"], ["10 HP", "H10"]] },
  { caption: "Motor Make", values: ["BBL", "CG", "ABB", "HM", ["Elmech", "ELM"]] },
  { caption: "Motor Type", values: [["IP55 IE2", "IE2"], ["IP55 IE3", "IE3"], ["IP55 IE4", "IE4"], "FLP"] },
  { caption: "Gear Make", values: [["Elmech", "ELM"], "SEW", ["Bonfiglioli", "BON"], "PBL", ["Nord", "NRD"]] },
  { caption: "Gear type", values: [["Inline Helical", "IH"], "NMRV", ["Warm", "WRM"]] },
  { caption: "Drive", values: [["Chain", "CH"], ["Direct", "DR"], ["Couple", "CP"]] },
  // Gear Model is "can change manually" with no list on the sheet — add values in Properties.
  { caption: "Gear Model", widget: false, values: [["Standard", "GS"]] },
  { caption: "Rotor", widget: false, values: [["0", "R0"]] },
  { caption: "Coating", widget: false, values: ["TC"] },
  // Sheet cell is cut off after "Brass Tippi…" — check for further values.
  { caption: "Rotor Strip", widget: false, values: [["3-Side Rubber Strip", "RS3"], ["Spring steel", "SST"], "PTFE", ["Brass Tipping", "BRT"]] },
  { caption: "Shaft Air Purging", values: YN },
  { caption: "Shaft Air Purge SOV", widget: false, values: YN },
  { caption: "Gear Mounting Connector", widget: false, values: YN },
  { caption: "Proximity sensor", values: YN },
  { caption: "Inlet Companion flange", unit: "Nos", range: true },
  { caption: "Outlet Companion flange", unit: "Nos", range: true },
];

// CR-195: Ricon's sample sheet (RAVH 100 S-Square, CI) as Component Map rows,
// by question caption / answer text and Books item NAME — resolved to ids by
// POST /seed-rav-map. `question` is added to the RAV question bank when absent:
// Motor supply = Fitted (BOM line) / Loose (its own quote & SO line). Off the
// widget since CR-223 — the Motor rows below only match once it is answered
// elsewhere (or the map is re-keyed in the grid).
const RAV_MAP_SAMPLE = {
  question: { caption: "Motor supply", widget: false, values: [["Fitted", "MF"], ["Loose", "ML"]] },
  rows: (() => {
    const cast = { Model: "RAVH 100", Series: "RAVH-S Square", MOC: "CI" };
    const motor = { "Motor HP": "0.5 HP", "Motor Make": "BBL", "Motor Type": "IP55 IE2" };
    return [
      { component: "Casing", when: cast, item: "Casing CI", qty: 55, required: true },
      { component: "Side Cover", when: cast, item: "Side Cover CI", qty: 23, required: true },
      { component: "Brg Cover", when: cast, item: "Brg Cover CI", qty: 1, required: true },
      { component: "Gland", when: cast, item: "Gland CI", qty: 1, required: true },
      { component: "Motor", when: { ...motor, "Motor supply": "Fitted" }, item: "Motor HP BBL IP IE2 0.5", qty: 1 },
      { component: "Motor", when: { ...motor, "Motor supply": "Loose" }, item: "Motor HP BBL IP IE2 0.5", qty: 1, asQuoteLine: true },
      // Sheet shows Gear type "Inline Helical" next to item "Gear Elmech NMRV" — mapped on NMRV; edit in the grid if wrong.
      { component: "Gear", when: { "Gear Make": "Elmech", "Gear type": "NMRV" }, item: "Gear Elmech NMRV", qty: 1 },
    ];
  })(),
};

module.exports = { DEFAULT_COST_ELEMENTS, SIZING_MODELS, RAV_QUESTIONS, RAV_MAP_SAMPLE };
