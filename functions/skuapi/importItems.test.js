"use strict";
// Run: node functions/skuapi/importItems.test.js
// Bulk-import row resolution + shared SKU assembly (CR-092).
const assert = require("assert");
const { buildResolver } = require("./importItems");
const { assemble } = require("./skuBuild");

// --- Fixtures: a mini Yarn industry (Category list, Ply range, Color list) ---
const properties = [
  { id: "1", caption: "Category", valueType: "List", clubKey: null, includeInName: null, required: true },
  { id: "2", caption: "Ply", valueType: "Range", clubKey: null, includeInName: null, rangeMin: 1, rangeMax: 20 },
  { id: "3", caption: "Color Family", valueType: "List", clubKey: null, includeInName: null },
];
const pvByProp = {
  "1": [{ id: "10", displayValue: "Yarn", name: "Yarn", sku: "YN" }],
  "3": [{ id: "30", displayValue: "Red", name: "Red", sku: "RD" }],
};
const resolve = buildResolver(properties, pvByProp);

// --- resolveRow ---

// Exact list match → PropertyValue ROWID; Range passthrough; Item Type default.
{
  const { selectedValues, type } = resolve({ Category: "Yarn", Ply: "10", "Color Family": "Red" });
  assert.deepStrictEqual(selectedValues, { "1": "10", "2": "10", "3": "30" });
  assert.strictEqual(type, "Trading");
}

// Case-insensitive header + value matching.
{
  const { selectedValues } = resolve({ category: "yarn", "COLOR FAMILY": "  RED  " });
  assert.strictEqual(selectedValues["1"], "10");
  assert.strictEqual(selectedValues["3"], "30");
}

// Unknown list value → throws, naming the property and offending value.
assert.throws(() => resolve({ Category: "Cotton" }), /Unknown value for Category: Cotton/);

// Blank optional cell is omitted (not sent to the engine).
{
  const { selectedValues } = resolve({ Category: "Yarn", "Color Family": "" });
  assert.deepStrictEqual(selectedValues, { "1": "10" });
}

// Unknown/extra columns are ignored (blank Suffix, notes, etc.).
{
  const { selectedValues } = resolve({ Category: "Yarn", Suffix: "", Notes: "whatever" });
  assert.deepStrictEqual(selectedValues, { "1": "10" });
}

// Item Type mapping.
assert.strictEqual(resolve({ Category: "Yarn", "Item Type": "Manufacturing" }).type, "Manufacturing");
assert.strictEqual(resolve({ Category: "Yarn", "Item Type": "Composite" }).type, "Manufacturing");
assert.throws(() => resolve({ Category: "Yarn", "Item Type": "Widget" }), /Unknown Item Type: Widget/);

// --- assemble (shared engine) ---

const getPv = async (id) => {
  for (const list of Object.values(pvByProp)) {
    const hit = list.find((v) => v.id === String(id));
    if (hit) return hit;
  }
  return null;
};

(async () => {
  // Full row, empty separator → concatenated codes + raw range value.
  const a = await assemble(properties, { "1": "10", "2": "10", "3": "30" }, "", getPv);
  assert.strictEqual(a.sku, "YN10RD");
  assert.strictEqual(a.name, "Yarn 10 Red");
  assert.deepStrictEqual(a.missingRequired, []);

  // Missing required Category is reported, not thrown.
  const b = await assemble(properties, { "2": "10" }, "", getPv);
  assert.deepStrictEqual(b.missingRequired, ["Category"]);

  // Out-of-range Ply throws.
  await assert.rejects(assemble(properties, { "1": "10", "2": "99" }, "", getPv), /Ply must be <= 20/);

  console.log("importItems.test.js: all assertions passed");
})();
