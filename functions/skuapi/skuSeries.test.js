"use strict";
// Run: node functions/skuapi/skuSeries.test.js
// Per-industry numerical series (CR-089, rescoped): pure suffix math.
// Signature is (existingSkus, sep, pad) — series always starts at 1, pad is
// the total digit width (default 4).
const assert = require("assert");
const { nextSuffix, stripSuffix } = require("./skuSeries");

// Fresh industry starts at 1, padded to the configured width.
assert.strictEqual(nextSuffix([], "-", 4), "0001");
assert.strictEqual(nextSuffix([], "-", 3), "001");
assert.strictEqual(nextSuffix([], "-", 1), "1");
assert.strictEqual(nextSuffix([], "-"), "0001", "pad defaults to 4");

// Increments past the existing max.
assert.strictEqual(nextSuffix(["FAB-RED-0001", "FAB-RED-0002"], "-", 4), "0003");
assert.strictEqual(nextSuffix(["FAB-001", "FAB-009"], "-", 3), "010");

// Industry-wide: other combination bases DO count.
assert.strictEqual(nextSuffix(["FAB-RED-0001", "FAB-BLU-0009"], "-", 4), "0010");

// Padding rolls over cleanly.
assert.strictEqual(nextSuffix(["FAB-RED-0099"], "-", 4), "0100");
assert.strictEqual(nextSuffix(["FAB-099"], "-", 3), "100");

// Suffixes of a different width are ignored — changing pad restarts the series.
assert.strictEqual(nextSuffix(["FAB-RED-0001"], "-", 3), "001", "4-digit suffix ignored at pad 3");
assert.strictEqual(nextSuffix(["FAB-RED-01", "FAB-RED-ABCD"], "-", 4), "0001");

// Case-insensitive, matching the unique constraint.
assert.strictEqual(nextSuffix(["fab-red-0004"], "-", 4), "0005");

// Empty separator: bare trailing digits count across bases.
assert.strictEqual(nextSuffix(["PKNAAA0001", "PKNMULA0002"], "", 4), "0003");

// Regex specials in sep are escaped.
assert.strictEqual(nextSuffix(["A.B*C-0003"], "-", 4), "0004");

// Base-anchored (params mode, CR-136): only exactly base+sep+digits counts.
assert.strictEqual(nextSuffix(["Chair-Red-001", "Chair-Red-002", "Chair-Blue-001"], "-", 3, "Chair-Red"), "003");
assert.strictEqual(nextSuffix(["Chair-Red-001"], "-", 3, "Chair-Blue"), "001", "other base ignored");
assert.strictEqual(nextSuffix(["Chair-Red-Deluxe-003"], "-", 3, "Chair-Red"), "001", "longer base sharing the prefix ignored");
assert.strictEqual(nextSuffix(["chair-red-004"], "-", 3, "Chair-Red"), "005", "case-insensitive");
assert.strictEqual(nextSuffix(["A.B*C0007"], "", 4, "A.B*C"), "0008", "regex specials in base escaped, empty sep");

// stripSuffix recovers the base at the given width, and leaves non-matching skus alone.
assert.strictEqual(stripSuffix("FAB-RED-0012", "-", 4), "FAB-RED");
assert.strictEqual(stripSuffix("FAB-RED-012", "-", 3), "FAB-RED");
assert.strictEqual(stripSuffix("FAB-RED-0012", "-", 3), "FAB-RED-0012", "wrong width leaves sku unchanged");
assert.strictEqual(stripSuffix("FAB-RED", "-", 4), "FAB-RED");
assert.strictEqual(stripSuffix("FABRED0002", "", 4), "FABRED");

console.log("skuSeries ok");
