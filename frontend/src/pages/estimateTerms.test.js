// Self-check for the T&C normalize/merge logic. Run: node frontend/src/pages/estimateTerms.test.js
import assert from "node:assert";
import { normalizeTerms, sanitizeHtml, DEFAULT_TERMS } from "./estimateTerms.js";

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

// 4. Server-shared HTML: formatting survives, scripts/handlers/unclosed tags don't.
assert.strictEqual(sanitizeHtml('<b>Hi</b> <font color="#C0392B">red</font>'), '<b>Hi</b> <font style="color:#C0392B">red</font>');
assert.strictEqual(sanitizeHtml('<img src=x onerror=alert(1)>a<script>x</script>'), 'ax');
assert.strictEqual(sanitizeHtml('<b onclick="x()" style="color:red;background:url(j)">k</b>'), '<b style="color:red">k</b>');
assert.strictEqual(sanitizeHtml('ok <img src=x onerror=alert(1)'), 'ok ');
assert.strictEqual(sanitizeHtml('5 &lt; 6 &amp; GST @18%'), '5 &lt; 6 &amp; GST @18%');
for (const t of DEFAULT_TERMS.terms) assert.strictEqual(sanitizeHtml(t.text), t.text); // seeds pass untouched

console.log("estimateTerms: all checks passed");
