"use strict";

/**
 * Product Configurator sizing (CR-181). Pure math — picks the model for a duty.
 *   Req. Cap (ltr/rev) = TPH × 1000 ÷ (RPM × 60 × BD kg/ltr)
 *   Required Speed     = Req. Cap × RPM ÷ model capacity
 * Always proposes the next size UP: per series within the asked group, the
 * smallest active model whose capacity ≥ Req. Cap. A series with a hole at
 * that size climbs to its next model; a series with nothing big enough lands
 * in `tooBig` so the UI can say so instead of showing nothing.
 */
// ponytail: one formula (volumetric rotary). Formula registry keyed per
// industry when DVT / Sifter need their own.
const { round2 } = require("./calc");

const EPS = 1e-9; // a duty landing exactly on a model's capacity still fits it

function selectModels({ tph, bd, rpm = 20, group, models }) {
  const [t, d, r] = [Number(tph), Number(bd), Number(rpm)];
  if (!(t > 0) || !(d > 0) || !(r > 0)) {
    throw Object.assign(new Error("Capacity, bulk density and speed must be greater than zero"), { status: 400 });
  }
  const need = (t * 1000) / (r * 60 * d);
  const bySeries = new Map();
  for (const m of models || []) {
    if (m.status === "Inactive" || !(Number(m.capacity) > 0)) continue;
    if (group && String(m.groupValue).trim().toLowerCase() !== String(group).trim().toLowerCase()) continue;
    if (!bySeries.has(m.series)) bySeries.set(m.series, []);
    bySeries.get(m.series).push(m);
  }
  const fit = (m) => ({
    modelCode: m.modelCode,
    capacity: Number(m.capacity),
    requiredRpm: Math.round((need * r * 10) / Number(m.capacity)) / 10,
    sparePct: Math.round((Number(m.capacity) / need - 1) * 100),
    recipeCode: m.recipeCode || "",
  });
  const options = [];
  const tooBig = [];
  for (const [series, list] of bySeries) {
    list.sort((a, b) => Number(a.capacity) - Number(b.capacity));
    const i = list.findIndex((m) => Number(m.capacity) >= need - EPS);
    if (i < 0) {
      const top = list[list.length - 1];
      tooBig.push({ series, largest: { modelCode: top.modelCode, capacity: Number(top.capacity) } });
      continue;
    }
    // "one size up" = the next model with a genuinely larger capacity; models
    // tied at the fitting capacity (RAVH 200 / RAVH 250D) are all offered.
    const up = list.slice(i + 1).find((m) => Number(m.capacity) > Number(list[i].capacity));
    for (const m of list.filter((x) => Number(x.capacity) === Number(list[i].capacity))) {
      options.push({ series, ...fit(m), next: up ? fit(up) : null });
    }
  }
  options.sort((a, b) => a.capacity - b.capacity);
  return { reqCap: round2(need), options, tooBig };
}

module.exports = { selectModels };

// ponytail self-check: `node recipe/sizing.js --selftest` — figures from the selection sheet.
if (require.main === module && process.argv.includes("--selftest")) {
  const { SIZING_MODELS } = require("./seedData");
  const dt = selectModels({ tph: 5, bd: 0.6, rpm: 20, group: "Drop through", models: SIZING_MODELS });
  console.assert(dt.reqCap === 6.94, `5 TPH / 0.6 / 20 RPM -> 6.94, got ${dt.reqCap}`);
  const sq = dt.options.find((o) => o.series === "Square");
  console.assert(sq && sq.modelCode === "RAVH 200" && sq.capacity === 7.35, `Square -> RAVH 200, got ${sq && sq.modelCode}`);
  console.assert(sq.requiredRpm === 18.9, `required speed 18.9, got ${sq.requiredRpm}`);
  console.assert(sq.next && sq.next.modelCode === "RAVH 250", `one size up RAVH 250, got ${sq.next && sq.next.modelCode}`);
  console.assert(new Set(dt.options.map((o) => o.series)).size === 4, "4 drop-through series");
  console.assert(dt.options.filter((o) => o.series === "Round Old").length === 2, "Round Old offers both 7.35 models");
  // Legacy sheet row: 1.81 × 20 × 60 × 0.3 = 651.6 kg/hr lands exactly on RAVH 100.
  const edge = selectModels({ tph: 0.6516, bd: 0.3, rpm: 20, group: "Drop through", models: SIZING_MODELS });
  console.assert(edge.options.find((o) => o.series === "Square").modelCode === "RAVH 100", "boundary fits RAVH 100");
  // Gap climb: Round has no 1.81 model -> climbs to RAVH 150 (3.80).
  console.assert(edge.options.find((o) => o.series === "Round").modelCode === "RAVH 150", "Round climbs over its gap");
  // Over-range: IC tops out at 3.80.
  const ic = selectModels({ tph: 5, bd: 0.6, rpm: 20, group: "IC", models: SIZING_MODELS });
  console.assert(!ic.options.length && ic.tooBig[0].largest.modelCode === "RAVH 200S", "IC over-range -> tooBig");
  let threw = false;
  try { selectModels({ tph: 0, bd: 0.6, models: [] }); } catch (e) { threw = e.status === 400; }
  console.assert(threw, "zero capacity -> 400");
  console.log("sizing.js self-check passed");
}
