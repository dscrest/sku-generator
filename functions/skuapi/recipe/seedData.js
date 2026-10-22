"use strict";

/** Recipe Engine / Product Configurator seed data. The RAVS150 demo recipe (CR-104) was removed in CR-196. */

const DEFAULT_COST_ELEMENTS = [
  { code: "CASTING", label: "CS Cost", calcType: "RATE_QTY", sequence: 1 },
  { code: "MACHINING", label: "M/C", calcType: "FIXED", sequence: 2 },
  { code: "DRILLING", label: "Drill Etc", calcType: "FIXED", sequence: 3 },
  { code: "ASSEMBLY", label: "Assembly", calcType: "FIXED", sequence: 4 },
];

// Material processed vs efficiency % (CR-281, Ricon "Product_vs_Efficiency" sheet, 83 rows):
// required volume × efficiency ÷ 100. [name, pct]
const RAV_MATERIALS = [
  ["Bolier Fly Ash", 80], ["Fiber Dust", 60], ["PVC Chips", 100], ["Wood Powder Dust", 50],
  ["Rice Husk", 70], ["Refined Sugar", 100], ["Iron Oxide", 100], ["Cement", 90],
  ["Maize Dust", 70], ["FeO Dust", 95], ["Rubber & Fibre Dust", 70], ["Bagasse Fine Dust", 50],
  ["Coal, Metal Dust", 95], ["Minerals, Refractory Dust", 95], ["Fine Coal", 85], ["Coal", 85],
  ["Furnace Fume Dust", 70], ["Mustard, Ground Nut Dust", 65], ["Lime Dust", 75], ["Foundry Sand Dust", 95],
  ["Sand Dust", 95], ["Carbon Fine Dust", 70], ["Metal Fines Dust", 85], ["Coal Powder", 75],
  ["Coal Granules", 90], ["Starch Powder", 75], ["Sludge Fine", 90], ["Carbon Black", 50],
  ["Rice, Corn, Besan Grits", 90], ["Sugar Powder", 75], ["Polyester Chips", 90], ["Crystal Sugar", 100],
  ["Wheat Floor", 80], ["Maida Powder", 80], ["Besan Powder", 80], ["Chana, Muth Dal", 95],
  ["Mix Dal", 95], ["Masala Powder", 70], ["Saw Dust", 60], ["PVC Resin", 90],
  ["Shreded Tyre Chips", 90], ["Hydrated Lime", 70], ["Wheat Grain", 95], ["Clay Powder", 85],
  ["Oats Husk", 75], ["Soda Ash", 80], ["Salt", 75], ["Feldspar", 95],
  ["Calcite", 80], ["Dolomite", 80], ["Quartz", 95], ["PVC Resin Powder", 85],
  ["Calcium Powder", 75], ["Wood Fine Powder Dust", 60], ["Pigment Powder", 75], ["Quartz Dust", 85],
  ["MDF, Wood Dust", 60], ["Al Fluoride", 80], ["Soya Grits", 85], ["PET Flakes", 80],
  ["Maize & Rice Powder", 75], ["Dhaniya Seeds", 95], ["Iron Dust", 95], ["China Clay", 70],
  ["Imported Coal", 90], ["Sand Fine", 100], ["Bran", 70], ["Milk Powder", 70],
  ["Ceramic Dust", 85], ["Cocoa, Custard Powder", 75], ["Flue Gas Dust", 70], ["Spices", 70],
  ["Zinc Dust", 85], ["Detergent Powder", 75], ["Suji", 85], ["Epoxy Powder", 80],
  ["Calcium Oxide", 75], ["Bentonite Powder", 75], ["Clinker Dust", 85], ["Starch", 75],
  ["Tobacco Dust", 65], ["Resin Dust", 80], ["Gypsum Dust", 80],
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
  { caption: "Gear type", values: [["Inline Helical", "IH"], "NMRV", ["Worm", "WRM"]] },
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

// Geared-motor selection sheet (CR-284, RAV_Geared_Motor_All_Brands_Consolidated,
// 107 rows): [brand, driveConfig, tphMin, tphMax, rpmMin, rpmMax, hp, model].
// Sheet bands made numeric: "Below 12" → 1–11, "12 to 25" → 12–25, a fixed RPM
// (direct drive) → min = max. HP stays text — the sheet says "1.5/2", "2 or 3".
// Geared RPM is not kept (user: ignore it).
const RAV_MOTORS = [
  ["Bonfiglioli", "Chain Drive Only", 0.1, 1, 12, 25, "0.5", "AS 20 P 44.77 P71 B5 B3"],
  ["Bonfiglioli", "Chain Drive + Coupling (Low RPM)", 0.1, 1, 1, 11, "0.5", "AS 25 DP69.6 P71 B5 B3"],
  ["Bonfiglioli", "Chain Drive Only", 1.1, 4, 12, 25, "1", "AS 25 P 40.29 P80 B5 B3"],
  ["Bonfiglioli", "Chain Drive + Coupling (Low RPM)", 1.1, 4, 1, 11, "1", "AS 30 DP65.8 P80 B5 B3"],
  ["Bonfiglioli", "Chain Drive Only", 4.1, 12, 15, 25, "1.5", "AS 30 P 36.82 P90 B5 B3"],
  ["Bonfiglioli", "Chain Drive + Coupling (Low RPM)", 4.1, 12, 1, 11, "1.5", "AS 35 DP73.3 P90 B5 B3"],
  ["Bonfiglioli", "Chain Drive Only", 12.1, 20, 15, 25, "2", "AS 30 P 36.82 P90 B5 B3"],
  ["Bonfiglioli", "Chain Drive + Coupling (Low RPM)", 12.1, 20, 1, 11, "2", "AS 35 DP73.3 P90 B5 B3"],
  ["Bonfiglioli", "Chain Drive Only", 20.1, 25, 15, 25, "2", "AS 35 P 36.82 P 90 B5 B3"],
  ["Bonfiglioli", "Chain Drive + Coupling (Low RPM)", 20.1, 25, 1, 11, "2", "AS 35 DP73.3 P90 B5 B3"],
  ["Bonfiglioli", "Chain Drive Only", 20.1, 25, 15, 25, "3", "AS 35 P 36.82 P 100 B5 B3"],
  ["Bonfiglioli", "Chain Drive + Coupling (Low RPM)", 20.1, 25, 1, 11, "3", "AS 55 DP68.6 P100 B5 B3"],
  ["Bonfiglioli", "Chain Drive Only", 25.1, 30, 15, 25, "3", "AS 35 P 36.82 P 100 B5 B3"],
  ["Bonfiglioli", "Chain Drive + Coupling (Low RPM)", 25.1, 30, 1, 11, "3", "AS 55 DP68.6 P100 B5 B3"],
  ["Bonfiglioli", "Chain Drive Only", 25.1, 30, 15, 25, "3", "AS 45 DP 42.7 P100 B5 B3"],
  ["Bonfiglioli", "Chain Drive + Coupling (Low RPM)", 25.1, 30, 1, 11, "3", "AS 55 DP68.6 P100 B5 B3"],
  ["Bonfiglioli", "Chain Drive Only", 25.1, 30, 15, 25, "5", "AS 45 DP 42.7 P112 B5 B3"],
  ["Bonfiglioli", "Chain Drive + Coupling (Low RPM)", 25.1, 30, 1, 11, "5", "AS 60 DP68.3 P112 B5 B3"],
  ["Bonfiglioli", "Chain Drive Only", 30.1, 50, 15, 25, "5", "AS 55 DP 37.2 P112 B5 B3"],
  ["Bonfiglioli", "Chain Drive + Coupling (Low RPM)", 30.1, 50, 1, 11, "5", "AS 60 DP68.3 P112 B5 B3"],
  ["Bonfiglioli", "Direct Drive", 0.1, 1, 21, 21, "0.5", "W63 U64 P71 B5 V6"],
  ["Bonfiglioli", "Direct Drive", 1.1, 2, 21, 21, "1", "W63 U64 P80 B5 V6"],
  ["Bonfiglioli", "Direct Drive", 2.1, 4, 22, 22, "1", "W75 U60 P80 B5 V6"],
  ["Bonfiglioli", "Direct Drive", 4.1, 5, 22, 22, "1.5", "W75 U60 P90 B5 V6"],
  ["Bonfiglioli", "Direct Drive", 5.1, 10, 22, 22, "1.5/2", "W86 U60 P90 B5 V6"],
  ["Bonfiglioli", "Direct Drive", 10.1, 15, 22, 22, "1.5/2", "W110 U64 P90 B5 V6"],
  ["PBL (Elecon)", "Chain Drive Only", 0.1, 1, 15, 25, "0.5", "M0122"],
  ["PBL (Elecon)", "Chain Drive + Coupling (Low RPM)", 0.1, 1, 1, 11, "0.5", "M0232"],
  ["PBL (Elecon)", "Chain Drive Only", 1.1, 4.5, 15, 25, "1", "M0222"],
  ["PBL (Elecon)", "Chain Drive + Coupling (Low RPM)", 1.1, 4.5, 1, 11, "1", "M0432"],
  ["PBL (Elecon)", "Chain Drive Only", 4.6, 12, 12, 25, "1.5", "M0422"],
  ["PBL (Elecon)", "Chain Drive + Coupling (Low RPM)", 4.6, 12, 1, 11, "1.5", "M0532"],
  ["PBL (Elecon)", "Chain Drive Only", 12.1, 20, 12, 25, "2", "M0422"],
  ["PBL (Elecon)", "Chain Drive + Coupling (Low RPM)", 12.1, 20, 1, 11, "2", "M0632"],
  ["PBL (Elecon)", "Chain Drive Only", 20.1, 25, 12, 25, "2", "M0422"],
  ["PBL (Elecon)", "Chain Drive + Coupling (Low RPM)", 20.1, 30, 1, 11, "3", "M0832"],
  ["PBL (Elecon)", "Chain Drive Only", 20.1, 25, 12, 25, "3", "M0622"],
  ["PBL (Elecon)", "Chain Drive + Coupling (Low RPM)", 30.1, 50, 1, 11, "5", "M0832"],
  ["PBL (Elecon)", "Chain Drive Only", 25.1, 30, 12, 25, "3", "M0622"],
  ["PBL (Elecon)", "Chain Drive + Coupling (Low RPM)", 50.1, 150, 1, 11, "7.5", "M0932"],
  ["PBL (Elecon)", "Chain Drive Only", 25.1, 50, 15, 25, "5", "M0722"],
  ["PBL (Elecon)", "Chain Drive + Coupling (Low RPM)", 150.1, 200, 1, 11, "10", "M0932"],
  ["PBL (Elecon)", "Chain Drive Only", 50.1, 100, 12, 25, "7.5", "M0822"],
  ["PBL (Elecon)", "Chain Drive Only", 100.1, 200, 12, 25, "10", "M0922"],
  ["PBL (Elecon)", "Direct Drive", 0.1, 1, 21.53, 21.53, "0.5", "F032363"],
  ["PBL (Elecon)", "Direct Drive", 1.1, 4.5, 22.59, 22.59, "1", "F042363"],
  ["PBL (Elecon)", "Direct Drive", 4.6, 12, 23, 23, "1.5", "F052363"],
  ["PBL (Elecon)", "Direct Drive", 12.1, 20, 23.51, 23.51, "2 or 3", "F062363"],
  ["PBL (Elecon)", "Direct Drive", 20.1, 25, 23.61, 23.61, "2 or 3", "F072363"],
  ["PBL (Elecon)", "Direct Drive", 0.1, 1, 23, 23, "0.5", "EMRV 063"],
  ["PBL (Elecon)", "Direct Drive", 1.1, 2, 23, 23, "1", "EMRV 075"],
  ["PBL (Elecon)", "Direct Drive", 2.1, 4, 23, 23, "1.5", "EMRV 090"],
  ["PBL (Elecon)", "Direct Drive", 4.1, 5, 23, 23, "2", "EMRV 090"],
  ["PBL (Elecon)", "Direct Drive", 5.1, 10, 23, 23, "3", "EMRV 0110"],
  ["PBL (Elecon)", "Direct Drive", 10.1, 15, 23, 23, "5", "EMRV 0150"],
  ["Elmech", "Chain Drive Only", 0.1, 1, 12, 25, "0.5", "E-1-32-71-4"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 0.1, 1, 1, 11, "0.5", "E-33-25-71-4"],
  ["Elmech", "Chain Drive Only", 0.1, 1, 12, 25, "0.5", "E-2-32-71-4"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 1.1, 4, 1, 11, "1", "E-33-25-80-4"],
  ["Elmech", "Chain Drive Only", 1.1, 2, 12, 25, "1", "E-2-32-80-4"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 5.1, 12, 1, 11, "1.5", "E-43-25-90-4"],
  ["Elmech", "Chain Drive Only", 2.1, 4, 12, 25, "1", "E-33-32-80-4"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 12.1, 20, 1, 11, "2", "E-43-25-90-4"],
  ["Elmech", "Chain Drive Only", 4.1, 10, 12, 25, "1.5", "E-43-32-90-4"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 20.1, 25, 1, 11, "3", "E-53-25-100-4"],
  ["Elmech", "Chain Drive Only", 4.1, 10, 12, 25, "2", "E-43-32-90-4"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 25.1, 50, 1, 11, "5", "E-63-25-112-4"],
  ["Elmech", "Chain Drive Only", 10.1, 20, 12, 25, "2", "E-53-32-90-4"],
  ["Elmech", "Chain Drive Only", 20.1, 30, 12, 25, "3", "E-63-32-100-4"],
  ["Elmech", "Chain Drive Only", 30.1, 50, 12, 25, "3 or 5", "E-63-32-112-4"],
  ["Elmech", "Direct Drive", 0.1, 1, 21.53, 21.53, "0.5", "F032363"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 0.1, 1, 20, 20, "0.5", "E-33-20-71-4"],
  ["Elmech", "Direct Drive", 1.1, 4.5, 22.59, 22.59, "1", "F042363"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 1.1, 4.5, 19, 19, "1", "E-33-19-80-4"],
  ["Elmech", "Direct Drive", 4.6, 12, 23, 23, "1.5", "F052363"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 4.6, 12, 19, 19, "1.5", "E-43-19-90-4"],
  ["Elmech", "Direct Drive", 12.1, 20, 23.51, 23.51, "2 or 3", "F062363"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 12.1, 20, 19, 19, "2", "E-43-19-90-4"],
  ["Elmech", "Direct Drive", 20.1, 25, 23.61, 23.61, "2 or 3", "F072363"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 20.1, 25, 19, 19, "3", "E-53-19-100-4"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 20.1, 30, 19, 19, "5", "E-53-19-112-4"],
  ["Elmech", "Chain Drive + Coupling (Low RPM)", 30.1, 50, 20, 20, "5", "E-63-20-112-4"],
  ["Elmech", "Direct Drive", 0.1, 1, 23, 23, "0.5", "NMRV-063-60-71"],
  ["Elmech", "Direct Drive", 1.1, 2, 23, 23, "1", "NMRV-075-60-80"],
  ["Elmech", "Direct Drive", 2.1, 4, 23, 23, "1.5", "NMRV-090-60-90"],
  ["Elmech", "Direct Drive", 4.1, 5, 23, 23, "2", "NMRV-090-60-90"],
  ["Elmech", "Direct Drive", 5.1, 10, 23, 23, "3", "NMRV-110-63-100"],
  ["Elmech", "Direct Drive", 10.1, 15, 23, 23, "5", "NMRV-150-63-112"],
  ["SEW", "Chain Drive Only", 0.1, 1, 15, 25, "0.5", "R27DIBE71M4"],
  ["SEW", "Chain Drive + Coupling (Low RPM)", 0.1, 1, 1, 11, "0.5", "R37DIBE71M4"],
  ["SEW", "Chain Drive Only", 1.1, 4.5, 15, 25, "1", "R37DIBE80M4"],
  ["SEW", "Chain Drive + Coupling (Low RPM)", 1.1, 4.5, 1, 11, "1", "R57DIBE80M4"],
  ["SEW", "Chain Drive Only", 4.6, 12, 12, 25, "1.5", "R47DIBE90S4"],
  ["SEW", "Chain Drive + Coupling (Low RPM)", 4.6, 12, 1, 11, "1.5", "R67DIBE90S4"],
  ["SEW", "Chain Drive Only", 12.1, 20, 12, 25, "2", "R47DIBE90M4"],
  ["SEW", "Chain Drive + Coupling (Low RPM)", 12.1, 20, 1, 11, "2", "R77DIBE90M4"],
  ["SEW", "Chain Drive Only", 20.1, 25, 12, 25, "2", "R57DIBE90M4"],
  ["SEW", "Chain Drive + Coupling (Low RPM)", 20.1, 30, 1, 11, "3", "R87DIBE100S4"],
  ["SEW", "Chain Drive Only", 20.1, 25, 12, 25, "3", "R57DIBE100S4"],
  ["SEW", "Chain Drive + Coupling (Low RPM)", 30.1, 50, 1, 11, "5", "R97DIBE112M4"],
  ["SEW", "Chain Drive Only", 25.1, 30, 12, 25, "3", "R67DIBE100S4"],
  ["SEW", "Chain Drive + Coupling (Low RPM)", 50.1, 150, 1, 11, "7.5", "R97DIBES132S4"],
  ["SEW", "Chain Drive Only", 25.1, 50, 15, 25, "5", "R67DIBE112M4"],
  ["SEW", "Chain Drive Only", 50.1, 100, 12, 25, "7.5", "R77DIBE132S4"],
  ["SEW", "Direct Drive", 0.1, 1, 23, 23, "0.5", "FAZ37 DIBE71M4"],
  ["SEW", "Direct Drive", 1.1, 4.5, 23, 23, "1", "FAZ47 DIBE80M4"],
  ["SEW", "Direct Drive", 4.6, 12, 23, 23, "1.5", "FAZ57 DIBE90S4"],
];

module.exports = { DEFAULT_COST_ELEMENTS, SIZING_MODELS, RAV_QUESTIONS, RAV_MAP_SAMPLE, RAV_MATERIALS, RAV_MOTORS };
