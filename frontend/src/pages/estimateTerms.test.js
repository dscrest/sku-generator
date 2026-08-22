// Self-check for the T&C normalize/merge logic. Run: node frontend/src/pages/estimateTerms.test.js
import assert from "node:assert";
import { normalizeTerms, DEFAULT_TERMS } from "./estimateTerms.js";

// 1. Corrupt / missing input → full defaults.
assert.deepStrictEqual(normalizeTerms(null), DEFAULT_TERMS);
assert.deepStrictEqual(normalizeTerms("garbage"), DEFAULT_TERMS);

// 2. Partial old shape → missing sections fall back to defaults.
const partial = normalizeTerms({ footer: "New address" });
assert.strictEqual(partial.footer, "New address");
assert.deepStrictEqual(partial.terms, DEFAULT_TERMS.terms);
assert.deepStrictEqual(partial.bank, DEFAULT_TERMS.bank);

// 3. Malformed rows are coerced, never crash: bank rows padded to 4 string cells.
const weird = normalizeTerms({ terms: [{ label: 1 }], bank: [["a"], "junk"] });
assert.deepStrictEqual(weird.terms, [{ label: "1", text: "" }]);
assert.deepStrictEqual(weird.bank, [["a", "", "", ""], ["", "", "", ""]]);

console.log("estimateTerms: all checks passed");
