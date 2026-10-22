"use strict";

/**
 * Work order BOM from a Product Design (CR-270). A configurator org sells a
 * few dummy finished goods — one Books composite per model, placeholder raw
 * material — instead of one Books item per MOC / option permutation. The real
 * items live on the design whose Main product is the FG: component → material
 * → the material's Books item.
 *
 * FG → design: SO line item_id = SKUItem.zohoItemId → RecipeTemplate.productItemId.
 * Second in the source order (quoteBom.resolve): saved quote + Components rows,
 * then the design, then the Books composite.
 *
 * `node workorder/designBom.js --selftest`
 */
const { out, idOk, zStr } = require("../store");
const { byOrg, byOrgAll, inList } = require("./store");

const n = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const norm = (s) => String(s ?? "").trim().toLowerCase();
const isServiceItem = (it) => { try { return JSON.parse(it.booksData || "{}").product_type === "service"; } catch { return false; } };

/**
 * Pure: design + answers → WO requirement lines. A component that points at a
 * SKU-master item (Product Designs v2, CR-271) is that item × qty, whatever
 * materials it also lists. Otherwise material per component = the enabled
 * option an answer names (MOC: CI), else its only enabled option, else — for a
 * fixed component — the first (the recipe/calc.js rule). The material's item =
 * the option's own SKU-master item (RecipeComponentOption.skuItemId, item per
 * material), else the material's Materials-page Books link. Qty per FG unit =
 * component qty × cast weight; a part with no cast weight (counted in Nos) is
 * the component qty. A component that cannot be resolved is named in
 * `problems`, never guessed and never silently dropped.
 */
function designLines({ components, options, materials, items }, answers, fgQty) {
  const want = new Set((answers || []).map(norm).filter(Boolean));
  const matById = new Map((materials || []).map((m) => [String(m.id), m]));
  const itemById = new Map((items || []).map((it) => [String(it.id), it]));
  const merged = new Map();
  const problems = [];
  const add = (id, name, sku, uom, qty) => {
    const cur = merged.get(id);
    if (cur) cur.perUnitQty = round2(cur.perUnitQty + qty);
    else merged.set(id, { rmItemId: id, rmName: name || "", rmSku: sku || "", uom: uom || "", perUnitQty: qty });
  };
  const sorted = [...(components || [])].sort((a, b) => n(a.sequence) - n(b.sequence));
  for (const c of sorted) {
    const name = c.name || c.code || String(c.id);
    const qty = n(c.qty) || 1;
    const it = itemById.get(String(c.skuItemId));
    if (it) {
      if (isServiceItem(it)) continue; // services are never WO lines (CR-149)
      if (!it.zohoItemId) { problems.push(`${name}: item ${it.sku || it.name} is not in Zoho Books yet — push it first`); continue; }
      add(String(it.zohoItemId), it.name, it.sku, it.uom || c.uom, round2(qty));
      continue;
    }
    const opts = (options || []).filter((o) => String(o.componentId) === String(c.id) && o.enabled !== false);
    const opt = opts.find((o) => want.has(norm(o.materialCode)))
      || (opts.length === 1 ? opts[0] : null)
      || (c.allowMaterial === false ? opts[0] || null : null);
    if (!opt) {
      if (opts.length > 1) {
        problems.push(`${name}: ${opts.length} materials on the design and no answer names one`);
      } else if (c.required !== false) {
        problems.push(`${name}: no material on the design`);
      }
      continue;
    }
    const mat = matById.get(String(opt.materialId)) || null;
    const cast = n(opt.castWeight);
    const perUnit = round2(cast > 0 ? qty * cast : qty);
    const oit = itemById.get(String(opt.skuItemId));
    if (oit) {
      if (!oit.zohoItemId) { problems.push(`${name}: item ${oit.sku || oit.name} is not in Zoho Books yet — push it first`); continue; }
      add(String(oit.zohoItemId), oit.name, oit.sku, oit.uom || (mat && mat.uom) || c.uom, perUnit);
      continue;
    }
    if (!mat || !mat.zohoItemId) {
      problems.push(`${name}: material ${(mat && mat.code) || opt.materialCode || opt.materialId} is not linked to a Books item`);
      continue;
    }
    add(String(mat.zohoItemId), mat.zohoItemName || mat.name, "", mat.uom || c.uom, perUnit);
  }
  const lines = [...merged.values()].map((l) => ({ ...l, requiredQty: round2(l.perUnitQty * n(fgQty)), source: "design" }));
  return { lines, problems };
}

// Pure: the design to use among those whose Main product is the FG — the
// active one; inactive and pre-CR-266 old copies never feed a work order.
function pickDesign(rows) {
  return (rows || []).find((r) => r.status === "Published") || null;
}

async function findDesign(catalyst, orgId, fgItemId) {
  if (!idOk(fgItemId)) return null;
  const items = await byOrg(catalyst, orgId, "SKUItem", `zohoItemId = ${zStr(String(fgItemId))}`);
  const ids = inList(items.map((i) => i.ROWID));
  if (!ids) return null;
  return pickDesign((await byOrg(catalyst, orgId, "RecipeTemplate", `productItemId IN (${ids})`, "MODIFIEDTIME DESC")).map(out));
}

// Components, their materials and linked items — not the costing (attributes,
// cost elements): a work order needs what to pick, not what it costs.
async function loadDesign(catalyst, orgId, design) {
  const where = `recipeId = ${zStr(String(design.id))}`;
  const components = (await byOrgAll(catalyst, orgId, "RecipeComponent", where)).map(out);
  const options = (await byOrgAll(catalyst, orgId, "RecipeComponentOption", where)).map(out);
  const materials = (await byOrgAll(catalyst, orgId, "MaterialType")).map(out);
  const ids = [...new Set([...components, ...options].map((c) => c.skuItemId).filter((v) => idOk(v)))];
  const items = ids.length ? (await byOrg(catalyst, orgId, "SKUItem", `ROWID IN (${ids.join(",")})`)).map(out) : [];
  return { components, options, materials, items };
}

// FG → its design's lines; null when the FG is no design's Main product.
async function linesForFg(catalyst, orgId, fgItemId, answers, fgQty) {
  const design = await findDesign(catalyst, orgId, fgItemId);
  if (!design) return null;
  const r = designLines(await loadDesign(catalyst, orgId, design), answers, fgQty);
  return { design: { id: String(design.id), code: design.code || "", name: design.name || "" }, ...r };
}

module.exports = { designLines, pickDesign, findDesign, loadDesign, linesForFg, isServiceItem };

// ponytail self-check: `node functions/skuapi/workorder/designBom.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");

  // The Ricon test design: two Nos parts, cast weight 0 → the component qty.
  const one = designLines({
    components: [{ id: "2", name: "RM2", qty: 1, uom: "Nos", sequence: 2 }, { id: "1", name: "RM1", qty: 1, uom: "Nos", sequence: 1 }],
    options: [
      { componentId: "1", materialId: "m1", materialCode: "TST1", castWeight: 0, enabled: true },
      { componentId: "2", materialId: "m2", materialCode: "TST2", castWeight: 0, enabled: true },
    ],
    materials: [
      { id: "m1", code: "TST1", uom: "pcs", zohoItemId: "901", zohoItemName: "Dhiraj RM 1" },
      { id: "m2", code: "TST2", uom: "pcs", zohoItemId: "902", zohoItemName: "Dhiraj RM 2" },
    ],
  }, [], 3);
  assert.deepStrictEqual(one.problems, []);
  assert.deepStrictEqual(one.lines, [
    { rmItemId: "901", rmName: "Dhiraj RM 1", rmSku: "", uom: "pcs", perUnitQty: 1, requiredQty: 3, source: "design" },
    { rmItemId: "902", rmName: "Dhiraj RM 2", rmSku: "", uom: "pcs", perUnitQty: 1, requiredQty: 3, source: "design" },
  ], "sequence order, cast weight 0 → component qty, × FG qty");

  // MOC answer picks the material; cast weight → kg; shared Books item summed.
  const bundle = {
    components: [
      { id: "1", name: "Casing", qty: 1, allowMaterial: true, sequence: 1 },
      { id: "2", name: "Side Cover", qty: 2, allowMaterial: true, sequence: 2 },
      { id: "3", name: "Bolts", qty: 8, uom: "Nos", allowMaterial: false, sequence: 3 },
      { id: "4", name: "Coating", qty: 1, skuItemId: "s1", sequence: 4 },
      { id: "5", name: "Motor", qty: 1, skuItemId: "s2", sequence: 5 },
      { id: "6", name: "Gland", qty: 1, sequence: 6 },
      { id: "7", name: "Label", qty: 1, required: false, sequence: 7 },
      { id: "8", name: "Shaft", qty: 1, sequence: 8 },
      { id: "9", name: "Gasket", qty: 2, uom: "Nos", skuItemId: "s3", allowMaterial: true, sequence: 9 }, // v2: item + a material listed
    ],
    options: [
      { componentId: "1", materialId: "ci", materialCode: "CI", castWeight: 55, enabled: true },
      { componentId: "1", materialId: "wcb", materialCode: "WCB", castWeight: 58, enabled: true },
      { componentId: "2", materialId: "ci", materialCode: "CI", castWeight: 10, enabled: true },
      { componentId: "2", materialId: "wcb", materialCode: "WCB", castWeight: 46, enabled: true },
      { componentId: "3", materialId: "b1", materialCode: "B-8.8", castWeight: 0, enabled: true },
      { componentId: "3", materialId: "b2", materialCode: "B-SS", castWeight: 0, enabled: true },
      { componentId: "8", materialId: "en8", materialCode: "EN8", castWeight: 12, enabled: true },
      { componentId: "8", materialId: "wcb", materialCode: "WCB", castWeight: 12, enabled: false },
      { componentId: "9", materialId: "ci", materialCode: "CI", castWeight: 3, enabled: true },
    ],
    materials: [
      { id: "ci", code: "CI", uom: "KG", zohoItemId: "1", zohoItemName: "CI casting" },
      { id: "wcb", code: "WCB", uom: "KG", zohoItemId: "2", zohoItemName: "WCB casting" },
      { id: "b1", code: "B-8.8", uom: "Nos", zohoItemId: "3", zohoItemName: "Bolt 8.8" },
      { id: "b2", code: "B-SS", uom: "Nos", zohoItemId: "4", zohoItemName: "Bolt SS" },
      { id: "en8", code: "EN8", name: "EN8 bar" }, // not linked to Books
    ],
    items: [
      { id: "s1", sku: "COAT", name: "Coating", zohoItemId: "9", booksData: "{\"product_type\":\"service\"}" },
      { id: "s2", sku: "MTR", name: "Motor 3HP", zohoItemId: "8", uom: "Nos" },
      { id: "s3", sku: "GSK-4", name: "Gasket 4in", zohoItemId: "7", uom: "Nos" },
    ],
  };
  const wcb = designLines(bundle, ["Blow Through", " wcb "], 2);
  assert.deepStrictEqual(wcb.lines, [
    { rmItemId: "2", rmName: "WCB casting", rmSku: "", uom: "KG", perUnitQty: 58 + 2 * 46, requiredQty: 300, source: "design" },
    { rmItemId: "3", rmName: "Bolt 8.8", rmSku: "", uom: "Nos", perUnitQty: 8, requiredQty: 16, source: "design" },
    { rmItemId: "8", rmName: "Motor 3HP", rmSku: "MTR", uom: "Nos", perUnitQty: 1, requiredQty: 2, source: "design" },
    { rmItemId: "7", rmName: "Gasket 4in", rmSku: "GSK-4", uom: "Nos", perUnitQty: 2, requiredQty: 4, source: "design" },
  ], "answer picks WCB, fixed component takes its first option, service dropped, linked item kept, item beats a listed material (v2)");
  assert.deepStrictEqual(wcb.problems, [
    "Gland: no material on the design",
    "Shaft: material EN8 is not linked to a Books item",
  ], "optional Label with nothing is skipped; disabled option ignored");

  // No answer (SO with no saved quote): a multi-material component is reported, not guessed.
  const none = designLines(bundle, [], 1);
  assert.deepStrictEqual(none.lines.map((l) => l.rmItemId), ["3", "8", "7"]);
  assert.deepStrictEqual(none.problems.slice(0, 2), [
    "Casing: 2 materials on the design and no answer names one",
    "Side Cover: 2 materials on the design and no answer names one",
  ]);

  // Item per material: the option's own item beats the material's Books link;
  // an option item not pushed to Books is a problem, not a guess.
  const perMat = {
    ...bundle,
    components: [...bundle.components, { id: "10", name: "Gland Ring", qty: 1, sequence: 10 }],
    options: bundle.options.map((o) => (o.componentId === "1" && o.materialCode === "CI" ? { ...o, skuItemId: "s4" } : o))
      .concat([{ componentId: "10", materialId: "ci", materialCode: "CI", castWeight: 1, enabled: true, skuItemId: "s5" }]),
    items: [...bundle.items,
      { id: "s4", sku: "CSG-CI", name: "Casing CI", zohoItemId: "11", uom: "Nos" },
      { id: "s5", sku: "GR-CI", name: "Gland ring CI", zohoItemId: "" }],
  };
  const ci = designLines(perMat, ["CI"], 1);
  assert.deepStrictEqual(ci.lines.slice(0, 2), [
    { rmItemId: "11", rmName: "Casing CI", rmSku: "CSG-CI", uom: "Nos", perUnitQty: 55, requiredQty: 55, source: "design" },
    { rmItemId: "1", rmName: "CI casting", rmSku: "", uom: "KG", perUnitQty: 20, requiredQty: 20, source: "design" },
  ], "Casing CI takes the option's item × cast weight; Side Cover CI still the material's link");
  assert.ok(ci.problems.includes("Gland Ring: item GR-CI is not in Zoho Books yet — push it first"));
  assert.deepStrictEqual(designLines(perMat, ["WCB"], 1).lines[0].rmItemId, "2", "WCB answer: the CI option item is not consulted");

  assert.deepStrictEqual(designLines({}, null, 1), { lines: [], problems: [] });

  assert.strictEqual(pickDesign([{ id: "1", status: "Superseded" }, { id: "2", status: "Published" }]).id, "2");
  assert.strictEqual(pickDesign([{ id: "1", status: "Archived" }, { id: "3", status: "Draft" }]), null, "inactive / draft never feeds a WO");
  assert.strictEqual(pickDesign([]), null);
  console.log("designBom: ok");
}
