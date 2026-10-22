"use strict";
/**
 * Books category → PropertyValue sync plan (CR-286). A property flagged
 * "Values are Zoho Books items" names a Books item category; every active item
 * in that category is a value of the property. Books is the truth for the item
 * list, the app owns the SKU code, nothing is ever deleted.
 *
 * Pure — no I/O. `node zoho/valueSync.js --selftest`.
 */
const { autoCode } = require("./import");

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Next code in the property's own series: one-letter codes continue A→Z,
// numeric codes continue counting, anything else falls back to autoCode.
function nextCode(name, used) {
  const codes = [...used].map((c) => String(c || "").trim()).filter(Boolean);
  const letters = codes.length === 0 || codes.every((c) => /^[A-Z]$/i.test(c));
  if (letters) {
    const free = [...LETTERS].find((l) => !codes.some((c) => c.toUpperCase() === l));
    if (free) { used.add(free); return free; }
  } else if (codes.every((c) => /^\d+$/.test(c))) {
    const n = String(Math.max(...codes.map(Number)) + 1);
    used.add(n);
    return n;
  }
  return autoCode(name, used);
}

// items: Books items [{ item_id, name, description, status }]
// values: PropertyValue rows [{ id, displayValue, sku, zohoItemId }]
function planValueSync(items, values) {
  const byZoho = new Map(values.filter((v) => v.zohoItemId).map((v) => [String(v.zohoItemId), v]));
  const byName = new Map(values.map((v) => [String(v.displayValue || "").trim().toLowerCase(), v]));
  const used = new Set(values.map((v) => v.sku));
  const plan = { create: [], link: [], rename: [], unchanged: 0 };
  for (const it of items) {
    if (it.status && it.status !== "active") continue;
    const name = String(it.name || "").trim();
    if (!name) continue;
    const zid = String(it.item_id);
    const row = byZoho.get(zid);
    if (row) {
      if (String(row.displayValue).trim() !== name) plan.rename.push({ id: row.id, displayValue: name, name });
      else plan.unchanged++;
      continue;
    }
    const twin = byName.get(name.toLowerCase());
    if (twin) { plan.link.push({ id: twin.id, zohoItemId: zid }); continue; }
    plan.create.push({ displayValue: name, name, sku: nextCode(name, used), description: it.description || null, zohoItemId: zid });
  }
  return plan;
}

// Options of a Books dropdown custom field → values (CR-288). No id on an
// option, so the match is the name (case-insensitive); nothing renames or deletes.
// names: ["Flanged", "Threaded"]; values: PropertyValue rows [{ displayValue, sku }]
function planOptionSync(names, values) {
  const have = new Set(values.map((v) => String(v.displayValue || "").trim().toLowerCase()));
  const used = new Set(values.map((v) => v.sku));
  const plan = { create: [], unchanged: 0 };
  for (const n of names) {
    const name = String(n || "").trim();
    if (!name) continue;
    if (have.has(name.toLowerCase())) { plan.unchanged++; continue; }
    have.add(name.toLowerCase());
    plan.create.push({ displayValue: name, name, sku: nextCode(name, used), description: null });
  }
  return plan;
}

module.exports = { nextCode, planValueSync, planOptionSync };

if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  assert.strictEqual(nextCode("Foo", new Set()), "A");
  assert.strictEqual(nextCode("Foo", new Set(["A", "B", "D"])), "C");
  assert.strictEqual(nextCode("Foo", new Set(["1", "2", "3"])), "4");
  assert.strictEqual(nextCode("Hastelloy", new Set(["A", "12"])), "HAST");
  const p = planValueSync(
    [
      { item_id: "10", name: "ROTEX - MECHANICAL", status: "active" },        // linked, unchanged
      { item_id: "20", name: "ROTEX - PROXIMITY SENSOR", status: "active" },  // linked, renamed in Books
      { item_id: "30", name: "Honeywell - Mechanical", status: "active" },    // same name, not yet linked
      { item_id: "40", name: "AUTONICS - PROXIMITY", status: "active" },      // new
      { item_id: "50", name: "OLD ONE", status: "inactive" },                 // skipped
    ],
    [
      { id: "1", displayValue: "ROTEX - MECHANICAL", sku: "1", zohoItemId: "10" },
      { id: "2", displayValue: "ROTEX - PROXIMITY", sku: "2", zohoItemId: "20" },
      { id: "3", displayValue: "HONEYWELL - MECHANICAL", sku: "3", zohoItemId: null },
    ],
  );
  assert.strictEqual(p.unchanged, 1);
  assert.deepStrictEqual(p.rename, [{ id: "2", displayValue: "ROTEX - PROXIMITY SENSOR", name: "ROTEX - PROXIMITY SENSOR" }]);
  assert.deepStrictEqual(p.link, [{ id: "3", zohoItemId: "30" }]);
  assert.deepStrictEqual(p.create, [{ displayValue: "AUTONICS - PROXIMITY", name: "AUTONICS - PROXIMITY", sku: "4", description: null, zohoItemId: "40" }]);
  const o = planOptionSync(["Flanged", "threaded", "", "Welded", "Flanged"], [{ displayValue: "Threaded", sku: "T" }]);
  assert.strictEqual(o.unchanged, 2);
  assert.deepStrictEqual(o.create.map((c) => [c.displayValue, c.sku]), [["Flanged", "A"], ["Welded", "B"]]);
  console.log("valueSync selftest ok");
}
