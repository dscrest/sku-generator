"use strict";
// node functions/skuapi/workorder/serial.test.js
const assert = require("assert");
const { formatSerials, advanceSeq, normalizePrefix, prefixFromItem } = require("./serial");

// CR-177: prefix from the Books item's cf_valve_type ("CODE-Name").
assert.strictEqual(prefixFromItem({ custom_fields: [{ api_name: "cf_valve_type", value: "KGV-Knife Edge Gate Valve" }] }), "KGV");
assert.strictEqual(prefixFromItem({ custom_fields: [{ api_name: "cf_valve_type", value: " bv - Ball Valve" }] }), "BV");
assert.strictEqual(prefixFromItem({ custom_fields: [{ api_name: "cf_valve_type", value: "123", value_formatted: "GV-Gate Valve" }] }), "GV", "lookup shape");
assert.strictEqual(prefixFromItem({ custom_fields: [{ api_name: "cf_x", label: "Valve Type", value: "BFV-Butterfly Valve" }] }), "BFV", "label fallback");
assert.strictEqual(prefixFromItem({ custom_fields: [{ api_name: "cf_valve_type", value: "Gate Valve" }] }), "", "no dash");
assert.strictEqual(prefixFromItem({ custom_fields: [{ api_name: "cf_size", value: "50-MM" }] }), "", "other CF ignored");
assert.strictEqual(prefixFromItem(null), "");

assert.strictEqual(normalizePrefix(" kgv "), "KGV");
assert.strictEqual(normalizePrefix("bv2"), "BV2");
for (const bad of ["", "   ", "K-G", "ABCDEFGHIJK", null]) assert.throws(() => normalizePrefix(bad), /1–10/, `rejects ${JSON.stringify(bad)}`);

assert.deepStrictEqual(formatSerials("KGV", 2026, 1, 2), ["KGV2026001", "KGV2026002"]);
assert.deepStrictEqual(formatSerials("BV", 2025, 2, 2), ["BV2025002", "BV2025003"]);
assert.deepStrictEqual(formatSerials("X", 2026, 999, 2), ["X2026999", "X20261000"], "widens past 999");

assert.deepStrictEqual(advanceSeq("", 2026, 1), { from: 1, next: "2026:1" });
assert.deepStrictEqual(advanceSeq(undefined, 2026, 3), { from: 1, next: "2026:3" });
assert.deepStrictEqual(advanceSeq("2025:3", 2025, 2), { from: 4, next: "2025:5" });
assert.deepStrictEqual(advanceSeq("2025:3", 2026, 1), { from: 1, next: "2026:1" }, "new year restarts");
assert.deepStrictEqual(advanceSeq("garbage", 2026, 1), { from: 1, next: "2026:1" });

console.log("workorder/serial.js self-check passed");
