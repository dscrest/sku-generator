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

module.exports = { MATERIALS, DEMO_RECIPE, DEFAULT_COST_ELEMENTS };
