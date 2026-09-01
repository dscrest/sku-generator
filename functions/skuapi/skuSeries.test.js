"use strict";
// Run: node functions/skuapi/skuSeries.test.js
// Per-combination numerical series (CR-089): pure suffix math.
const assert = require("assert");
const { nextSuffix, stripSuffix } = require("./skuSeries");

// Fresh combination starts at 1 (or seriesStart).
assert.strictEqual(nextSuffix([], "FAB-RED", "-", 1), "0001");
assert.strictEqual(nextSuffix([], "FAB-RED", "-", 5), "0005");
assert.strictEqual(nextSuffix([], "FAB-RED", "-", 0), "0001", "start 0 degrades to 1");

// Increments past the existing max.
assert.strictEqual(nextSuffix(["FAB-RED-0001", "FAB-RED-0002"], "FAB-RED", "-", 1), "0003");

// Combination isolation: longer combinations and other bases don't count.
assert.strictEqual(nextSuffix(["FAB-RED-X-0007", "FAB-BLU-0009"], "FAB-RED", "-", 1), "0001");

// Padding rolls over cleanly.
assert.strictEqual(nextSuffix(["FAB-RED-0099"], "FAB-RED", "-", 1), "0100");

// Junk suffixes are ignored (not 4 digits).
assert.strictEqual(nextSuffix(["FAB-RED-01", "FAB-RED-ABCD"], "FAB-RED", "-", 1), "0001");

// Case-insensitive, matching ZCQL LIKE + the unique constraint.
assert.strictEqual(nextSuffix(["fab-red-0004"], "FAB-RED", "-", 1), "0005");

// An existing sequence beats a later, higher seriesStart.
assert.strictEqual(nextSuffix(["FAB-RED-0002"], "FAB-RED", "-", 10), "0003");

// Empty separator: bare digits append/strip correctly.
assert.strictEqual(nextSuffix(["FABRED0001"], "FABRED", "", 1), "0002");

// Regex specials in base/sep are escaped.
assert.strictEqual(nextSuffix(["A.B*C-0003"], "A.B*C", "-", 1), "0004");

// stripSuffix recovers the base, and leaves suffix-less skus alone.
assert.strictEqual(stripSuffix("FAB-RED-0012", "-"), "FAB-RED");
assert.strictEqual(stripSuffix("FAB-RED", "-"), "FAB-RED");
assert.strictEqual(stripSuffix("FABRED0002", ""), "FABRED");

console.log("skuSeries ok");
