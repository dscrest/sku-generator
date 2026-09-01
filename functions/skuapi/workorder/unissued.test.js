"use strict";
// Run: node functions/skuapi/workorder/unissued.test.js
// unissuedRows: the Close gate — rows whose net issued (D) is below required (A).
const assert = require("assert");
const { unissuedRows } = require("./reports");
const { gridRow } = require("./formulas");

const row = (requiredQty, bal) => gridRow({ rmItemId: "1", rmName: "Shaft", requiredQty }, { stockOnHand: 99 }, bal, {});

// Fully issued → not flagged; partially issued → flagged.
assert.deepStrictEqual(unissuedRows([row(4, { issuedQty: 4 })]), []);
assert.strictEqual(unissuedRows([row(4, { issuedQty: 3 })]).length, 1);

// Reserved does not count as issued (unlike rollUp's `complete`).
assert.strictEqual(unissuedRows([row(4, { reservedQty: 4 })]).length, 1);

// Returns net out of issued: 5 issued − 2 returned = 3 < 4 → flagged.
assert.strictEqual(unissuedRows([row(4, { issuedQty: 5, returnedQty: 2 })]).length, 1);

// Over-issue is fine, empty grid is fine.
assert.deepStrictEqual(unissuedRows([row(4, { issuedQty: 6 })]), []);
assert.deepStrictEqual(unissuedRows([]), []);

console.log("workorder/unissued.test.js passed");
