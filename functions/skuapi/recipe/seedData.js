"use strict";

/** RAVS150 demo data (CR-104) — from the legacy costing sheet / design reference. */

const MATERIALS = [
  ["CI", 70], ["FG260", 80], ["WCB", 100], ["SGI", 120], ["CF8", 280], ["CF3", 300],
  ["CF8M", 430], ["CF3M", 480], ["HRS", 160], ["IC WCB", 250], ["IC CF8", 340], ["IC CF8M", 480],
].map(([code, rate]) => ({ code, name: code, rate, uom: "KG", effectiveFrom: "2026-04-01", status: "Active" }));

const DEMO_RECIPE = {
  code: "RCP-RAVS150-STD",
  name: "RAVS150 Standard",
  productCode: "RAVS150",
  productName: "Rotary airlock valve, 150 mm",
  effectiveFrom: "2026-04-01",
  changeReason: "Initial recipe from costing sheet",
  components: [
    {
      code: "CASING", name: "Casing", question: "What material should the casing be made from?",
      qty: 1, uom: "Nos", required: true, allowMaterial: true,
      options: [
        { mat: "CI", castWeight: 55, fixedCosts: { MACHINING: 2000, DRILLING: 1000, ASSEMBLY: 400 } },
        { mat: "WCB", castWeight: 55, fixedCosts: { MACHINING: 2000, DRILLING: 1000, ASSEMBLY: 500 } },
        { mat: "CF8", castWeight: 55, fixedCosts: { MACHINING: 4000, DRILLING: 1200, ASSEMBLY: 600 } },
        { mat: "FG260", castWeight: 55, fixedCosts: { MACHINING: 2000, DRILLING: 1000, ASSEMBLY: 400 } },
        { mat: "SGI", castWeight: 55, fixedCosts: { MACHINING: 2200, DRILLING: 1000, ASSEMBLY: 450 } },
        { mat: "CF8M", castWeight: 55, fixedCosts: { MACHINING: 4000, DRILLING: 1200, ASSEMBLY: 600 } },
      ],
    },
    {
      code: "SIDE_COVER", name: "Side Cover", question: "What material should the side cover be made from?",
      qty: 2, uom: "Nos", required: true, allowMaterial: true,
      options: [
        { mat: "CI", castWeight: 23, fixedCosts: { MACHINING: 600, DRILLING: 200 } },
        { mat: "WCB", castWeight: 23, fixedCosts: { MACHINING: 700, DRILLING: 200 } },
        { mat: "CF8", castWeight: 46, fixedCosts: { MACHINING: 850, DRILLING: 250 } },
      ],
    },
    {
      code: "SHAFT", name: "Shaft", question: "Shaft material",
      qty: 1, uom: "Nos", required: true, allowMaterial: true,
      options: [
        { mat: "HRS", castWeight: 12, fixedCosts: { MACHINING: 900, DRILLING: 150, ASSEMBLY: 200 } },
        { mat: "CF8", castWeight: 12, fixedCosts: { MACHINING: 1400, DRILLING: 200, ASSEMBLY: 200 } },
      ],
    },
    {
      code: "FASTENERS", name: "Fasteners", question: "",
      qty: 1, uom: "Set", required: true, allowMaterial: false,
      options: [{ mat: "HRS", castWeight: 1.2, fixedCosts: { ASSEMBLY: 150 } }],
    },
  ],
};

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
const uniq = (a) => [...new Set(a)];
const YN = [["Y", "Y"], ["N", "N"]];
const RAV_QUESTIONS = [
  { caption: "Prod. Type", sku: false, values: ["Powder", "Granule", "Fiber"] },
  { caption: "Application", sku: false, values: ["Pressure Conv", "Vac Conv", "Bag Filter", "Hoper discharge", "Silo discharge"] },
  { caption: "Capacity", unit: "TPH", range: true, sku: false, role: "capacity", required: true },
  { caption: "Bulk Density", unit: "kg/ltr", range: true, sku: false, role: "density", required: true },
  { caption: "Speed", unit: "RPM", range: true, sku: false, role: "speed", required: true },
  { caption: "RAV type", sku: false, role: "group", required: true,
    values: ["Drop through", "Blow Through", "Sanitary", "IC", "CB"] },
  { caption: "Series", role: "series", required: true,
    values: [["Square", "SQ"], ["RAVH-S Square", "SSQ"], ["Round", "RD"], ["Round Old", "RDO"], ["RAVH-S IC", "SIC"], ["RAVS", "SAN"], ["CB", "CB"], ["RAVB Square", "BSQ"]] },
  { caption: "Model", role: "model", required: true, inName: true, values: uniq(SIZING_MODELS.map((m) => m.modelCode)) },
  { caption: "No of blade", values: [["Default", "BD"], ["8", "B8"], ["10", "B10"]] },
  { caption: "MOC", required: true, inName: true,
    values: ["CI", "WCB", ["MS Fab", "MSF"], ["SS304", "S304"], ["SS304L", "S304L"], ["SS316", "S316"], ["SS316L", "S316L"], ["H Alloy", "HAL"]] },
  // Sheet says only "HP / Bare Shaft" — the HP ladder is a starter guess; edit in Properties.
  { caption: "Motor HP", values: [["Bare Shaft", "BS"], ["0.5 HP", "H05"], ["1 HP", "H1"], ["1.5 HP", "H15"], ["2 HP", "H2"], ["3 HP", "H3"], ["5 HP", "H5"], ["7.5 HP", "H75"], ["10 HP", "H10"]] },
  { caption: "Motor Make", values: ["BBL", "CG", "ABB", "HM", ["Elmech", "ELM"]] },
  { caption: "Motor Type", values: [["IP55 IE2", "IE2"], ["IP55 IE3", "IE3"], ["IP55 IE4", "IE4"], "FLP"] },
  { caption: "Gear Make", values: [["Elmech", "ELM"], "SEW", ["Bonfiglioli", "BON"], "PBL", ["Nord", "NRD"]] },
  { caption: "Gear type", values: [["Inline Helical", "IH"], "NMRV", ["Warm", "WRM"]] },
  { caption: "Drive", values: [["Chain", "CH"], ["Direct", "DR"], ["Couple", "CP"]] },
  // Gear Model is "can change manually" with no list on the sheet — add values in Properties.
  { caption: "Gear Model", values: [["Standard", "GS"]] },
  { caption: "Rotor", values: [["0", "R0"]] },
  { caption: "Coating", values: ["TC"] },
  // Sheet cell is cut off after "Brass Tippi…" — check for further values.
  { caption: "Rotor Strip", values: [["3-Side Rubber Strip", "RS3"], ["Spring steel", "SST"], "PTFE", ["Brass Tipping", "BRT"]] },
  { caption: "Shaft Air Purging", values: YN },
  { caption: "Shaft Air Purge SOV", values: YN },
  { caption: "Gear Mounting Connector", values: YN },
  { caption: "Proximity sensor", values: YN },
  { caption: "Inlet Companion flange", unit: "Nos", range: true },
  { caption: "Outlet Companion flange", unit: "Nos", range: true },
];

module.exports = { MATERIALS, DEMO_RECIPE, DEFAULT_COST_ELEMENTS, SIZING_MODELS, RAV_QUESTIONS };
