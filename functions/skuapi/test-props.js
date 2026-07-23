"use strict";
// Self-check for the CR-009 property gates. Run: node test-props.js
const assert = require("assert");
const { isActive, nameFilter, out } = require("./store");

// --- isActive: null (pre-CR-009 rows) must stay in the SKU -------------------
assert.strictEqual(isActive({ activeInSku: null }), true, "null = active");
assert.strictEqual(isActive({}), true, "missing = active");
assert.strictEqual(isActive({ activeInSku: true }), true);
assert.strictEqual(isActive({ activeInSku: false }), false, "only an explicit false drops it");

// out() must give real booleans, or "false" (a truthy string) would keep the
// property in the SKU forever.
assert.strictEqual(out({ activeInSku: "false" }).activeInSku, false);
assert.strictEqual(out({ activeInSku: "true" }).activeInSku, true);
assert.strictEqual(out({ activeInSku: null }).activeInSku, null);
assert.strictEqual(out({ includeInName: "false" }).includeInName, false);

// --- nameFilter: nothing flagged -> every property is in the name ------------
const none = [{ caption: "A" }, { caption: "B", includeInName: false }];
assert.deepStrictEqual(none.filter(nameFilter(none)).map((p) => p.caption), ["A", "B"]);

// --- nameFilter: some flagged -> only those ---------------------------------
const some = [
  { caption: "Wall Type", includeInName: true },
  { caption: "Screw Size", includeInName: false },
  { caption: "Legacy", includeInName: null },
];
assert.deepStrictEqual(some.filter(nameFilter(some)).map((p) => p.caption), ["Wall Type"]);

console.log("test-props: ok");
