"use strict";

/**
 * Recipe Engine costing (CR-104). Pure math — the single source of pricing
 * truth shared by /calculate, quotation creation and the builder's Test tab.
 * No formula engine: three calc types cover the costing-sheet model.
 *   RATE_QTY   material.rate × option.castWeight
 *   FIXED      per component-material value from fixedCosts[element.code]
 *   PERCENTAGE fixedCosts[element.code] % of the running subtotal
 * Value precedence per element: fixedCosts[code] (recipe/quote override) →
 * element.rate (cost-master default) → 0. RATE_QTY computes from the material
 * unless an explicit override value is present.
 */

// fixedCosts entry wins only when actually set; blank means "use default".
function pick(override, dflt) {
  if (override === undefined || override === null || override === "") return Number(dflt) || 0;
  return Number(override) || 0;
}

// Cost of ONE unit of a component made from `option`, broken down by element.
// `material` may be null (missing/inactive) — casting cost then reads 0.
function optionCost(option, material, costElements) {
  const fixed = option.fixedCosts || {};
  const elements = {};
  let total = 0;
  const ordered = [...costElements].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  for (const el of ordered) {
    const ov = fixed[el.code];
    let v = 0;
    if (el.calcType === "RATE_QTY") {
      v = ov === undefined || ov === null || ov === ""
        ? (material ? Number(material.rate) || 0 : 0) * (Number(option.castWeight) || 0)
        : Number(ov) || 0;
    } else if (el.calcType === "PERCENTAGE") v = total * (pick(ov, el.rate) / 100);
    else v = pick(ov, el.rate); // FIXED
    elements[el.code] = round2(v);
    total += v;
  }
  return { elements, total: round2(total) };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Full quote for a recipe. `selections` maps componentId -> optionId for
 * components with allowMaterial; fixed components take their single enabled
 * option automatically. Throws {status:400} on an invalid/missing selection
 * for a required configurable component.
 */
function computeQuote({ components, options, materials, costElements, selections, overrides, qty, marginPct, discountPct, gstPct }) {
  const q = Math.max(1, Number(qty) || 1);
  const matById = new Map(materials.map((m) => [String(m.id), m]));
  const optsByComp = new Map();
  for (const o of options) {
    if (o.enabled === false) continue;
    const k = String(o.componentId);
    if (!optsByComp.has(k)) optsByComp.set(k, []);
    optsByComp.get(k).push(o);
  }

  const lines = [];
  let unitCost = 0;
  const sorted = [...components].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  for (const c of sorted) {
    const opts = optsByComp.get(String(c.id)) || [];
    let opt = null;
    if (c.allowMaterial) {
      const chosen = selections && selections[String(c.id)];
      opt = opts.find((o) => String(o.id) === String(chosen)) || null;
      if (!opt) {
        const err = new Error(`No material selected for component "${c.name}"`);
        err.status = 400;
        throw err;
      }
    } else {
      opt = opts[0] || null;
      if (!opt) continue; // component with no option contributes nothing
    }
    const material = matById.get(String(opt.materialId)) || null;
    // Quote-time overrides: {componentId: {CODE: value}} merged over the
    // option's stored values — frozen in the snapshot like everything else.
    const ov = overrides && overrides[String(c.id)];
    const k = optionCost(ov ? { ...opt, fixedCosts: { ...(opt.fixedCosts || {}), ...ov } } : opt, material, costElements);
    const componentCost = round2(k.total * (Number(c.qty) || 1));
    unitCost += componentCost;
    lines.push({
      componentId: String(c.id),
      componentCode: c.code || "",
      componentName: c.name || "",
      qty: Number(c.qty) || 1,
      uom: c.uom || "",
      configurable: c.allowMaterial === true,
      materialCode: opt.materialCode || (material && material.code) || "",
      rateFrozen: material ? Number(material.rate) || 0 : 0,
      castWeight: Number(opt.castWeight) || 0,
      elements: k.elements,
      optionCost: k.total,
      componentCost,
    });
  }
  unitCost = round2(unitCost);
  const unitPrice = round2(
    unitCost * (1 + (Number(marginPct) || 0) / 100) * (1 - (Number(discountPct) || 0) / 100) * (1 + (Number(gstPct) || 0) / 100),
  );
  return { lines, qty: q, unitCost, unitPrice, orderValue: round2(unitPrice * q) };
}

module.exports = { optionCost, computeQuote, round2 };

// ponytail self-check: `node recipe/calc.js --selftest` — RAVS150 costing-sheet figures.
if (require.main === module && process.argv.includes("--selftest")) {
  const ELS = [
    { code: "CASTING", calcType: "RATE_QTY", sequence: 1 },
    { code: "MACHINING", calcType: "FIXED", sequence: 2 },
    { code: "DRILLING", calcType: "FIXED", sequence: 3 },
    { code: "ASSEMBLY", calcType: "FIXED", sequence: 4 },
  ];
  // Note: the legacy costing sheet's CI/WCB "CS Cost" rows (4400/6600) contradict
  // its own rate master (70×55=3850, 100×55=5500); RATE × castWeight is the spec.
  const ci = optionCost({ castWeight: 55, fixedCosts: { MACHINING: 2000, DRILLING: 1000, ASSEMBLY: 400 } }, { rate: 70 }, ELS);
  console.assert(ci.total === 7250, `CI casing 7250, got ${ci.total}`);
  const wcb = optionCost({ castWeight: 55, fixedCosts: { MACHINING: 2000, DRILLING: 1000, ASSEMBLY: 500 } }, { rate: 100 }, ELS);
  console.assert(wcb.total === 9000, `WCB casing 9000, got ${wcb.total}`);
  const cf8 = optionCost({ castWeight: 55, fixedCosts: { MACHINING: 4000, DRILLING: 1200, ASSEMBLY: 600 } }, { rate: 280 }, ELS);
  console.assert(cf8.total === 21200, `CF8 casing 21200, got ${cf8.total}`);
  const sc = optionCost({ castWeight: 46, fixedCosts: { MACHINING: 850, DRILLING: 250 } }, { rate: 280 }, ELS);
  console.assert(sc.total === 13980, `CF8 side cover 13980, got ${sc.total}`);
  // PERCENTAGE applies to the running subtotal before it.
  const pct = optionCost(
    { castWeight: 10, fixedCosts: { OVERHEAD: 10 } },
    { rate: 100 },
    [{ code: "CASTING", calcType: "RATE_QTY", sequence: 1 }, { code: "OVERHEAD", calcType: "PERCENTAGE", sequence: 2 }],
  );
  console.assert(pct.total === 1100, `10% overhead on 1000 -> 1100, got ${pct.total}`);
  // Full quote: casing WCB + 2× side cover CF8, qty 10, margin 18 / gst 18.
  const quote = computeQuote({
    components: [
      { id: "1", code: "CASING", name: "Casing", qty: 1, uom: "Nos", allowMaterial: true, sequence: 1 },
      { id: "2", code: "SIDE_COVER", name: "Side Cover", qty: 2, uom: "Nos", allowMaterial: true, sequence: 2 },
      { id: "3", code: "FASTENERS", name: "Fasteners", qty: 1, uom: "Set", allowMaterial: false, sequence: 3 },
    ],
    options: [
      { id: "o1", componentId: "1", materialId: "m1", materialCode: "WCB", castWeight: 55, fixedCosts: { MACHINING: 2000, DRILLING: 1000, ASSEMBLY: 500 }, enabled: true },
      { id: "o2", componentId: "2", materialId: "m2", materialCode: "CF8", castWeight: 46, fixedCosts: { MACHINING: 850, DRILLING: 250 }, enabled: true },
      { id: "o3", componentId: "3", materialId: "m3", materialCode: "HRS", castWeight: 1.2, fixedCosts: { ASSEMBLY: 150 }, enabled: true },
    ],
    materials: [{ id: "m1", code: "WCB", rate: 100 }, { id: "m2", code: "CF8", rate: 280 }, { id: "m3", code: "HRS", rate: 160 }],
    costElements: ELS,
    selections: { 1: "o1", 2: "o2" },
    qty: 10, marginPct: 18, discountPct: 0, gstPct: 18,
  });
  // 9000 + 2×13980 + (160×1.2+150) = 9000+27960+342 = 37302
  console.assert(quote.unitCost === 37302, `unitCost 37302, got ${quote.unitCost}`);
  console.assert(quote.orderValue === round2(quote.unitPrice * 10), "orderValue = unitPrice × qty");
  console.assert(quote.lines.length === 3, "3 lines incl. fixed component");
  let threw = false;
  try { computeQuote({ components: [{ id: "1", name: "Casing", allowMaterial: true }], options: [], materials: [], costElements: ELS, selections: {}, qty: 1 }); }
  catch (e) { threw = e.status === 400; }
  console.assert(threw, "missing selection -> 400");
  // Cost-master defaults: element.rate fills FIXED/PERCENTAGE when no override.
  const dflt = optionCost(
    { castWeight: 10, fixedCosts: { MACHINING: 500 } },
    { rate: 100 },
    [
      { code: "CASTING", calcType: "RATE_QTY", sequence: 1 },
      { code: "MACHINING", calcType: "FIXED", rate: 2000, sequence: 2 }, // overridden -> 500
      { code: "DRILLING", calcType: "FIXED", rate: 300, sequence: 3 },   // default -> 300
      { code: "OVERHEAD", calcType: "PERCENTAGE", rate: 10, sequence: 4 }, // 10% of 1800 -> 180
    ],
  );
  console.assert(dflt.total === 1000 + 500 + 300 + 180, `defaults 1980, got ${dflt.total}`);
  console.assert(dflt.elements.DRILLING === 300, "FIXED falls back to element.rate");
  // Quote-time overrides replace any element value, incl. RATE_QTY.
  const oq = computeQuote({
    components: [{ id: "1", code: "CASING", name: "Casing", qty: 1, allowMaterial: true, sequence: 1 }],
    options: [{ id: "o1", componentId: "1", materialId: "m1", materialCode: "WCB", castWeight: 55, fixedCosts: { MACHINING: 2000, DRILLING: 1000, ASSEMBLY: 500 }, enabled: true }],
    materials: [{ id: "m1", code: "WCB", rate: 100 }],
    costElements: ELS,
    selections: { 1: "o1" },
    overrides: { 1: { CASTING: 6000, MACHINING: 2500 } },
    qty: 1,
  });
  console.assert(oq.unitCost === 6000 + 2500 + 1000 + 500, `override quote 10000, got ${oq.unitCost}`);
  console.log("recipe/calc.js self-check passed");
}
