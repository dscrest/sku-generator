"use strict";
// Run: node functions/skuapi/itemFields.test.js
const assert = require("assert");
const { enabledKeys, pickItemFields, itemFieldError, mergeBooksData, catalogueFields } = require("./itemFields");

// Setting → enabled keys: unknown keys and blanks dropped.
assert.deepStrictEqual(enabledKeys({ skuItemFields: "hsn_or_sac,manufacturer" }), ["hsn_or_sac", "manufacturer"]);
assert.deepStrictEqual(enabledKeys({ skuItemFields: "rate,,hsn_or_sac" }), ["hsn_or_sac"]);
assert.deepStrictEqual(enabledKeys({}), []);

// Only enabled keys survive; trimmed and capped; blank kept (= clear).
assert.deepStrictEqual(
  pickItemFields(["hsn_or_sac"], { hsn_or_sac: " 84818090 ", manufacturer: "Acme" }),
  { hsn_or_sac: "84818090" },
);
assert.deepStrictEqual(pickItemFields(["hsn_or_sac"], { hsn_or_sac: "123456789" }), { hsn_or_sac: "12345678" });
assert.deepStrictEqual(pickItemFields(["manufacturer"], { manufacturer: "" }), { manufacturer: "" });
assert.deepStrictEqual(pickItemFields([], { hsn_or_sac: "1" }), {});
assert.deepStrictEqual(pickItemFields(["hsn_or_sac"], undefined), {});

// HSN (CR-230): digits only, then 4 / 6 / 8 long; blank clears without complaint.
assert.deepStrictEqual(pickItemFields(["hsn_or_sac"], { hsn_or_sac: "84-81 80a90" }), { hsn_or_sac: "84818090" });
assert.strictEqual(itemFieldError({ hsn_or_sac: "8481" }), null);
assert.strictEqual(itemFieldError({ hsn_or_sac: "848180" }), null);
assert.strictEqual(itemFieldError({ hsn_or_sac: "84818090" }), null);
assert.strictEqual(itemFieldError({ hsn_or_sac: "" }), null);
assert.strictEqual(itemFieldError({ manufacturer: "Acme" }), null);
assert.strictEqual(itemFieldError({ hsn_or_sac: "123" }), "HSN Code must be 4, 6 or 8 digits");
assert.strictEqual(itemFieldError({ hsn_or_sac: "12345" }), "HSN Code must be 4, 6 or 8 digits");

// Merge keeps sheet-import keys, blank deletes, empty result → null, nothing → undefined.
assert.strictEqual(mergeBooksData(null, {}), undefined);
assert.strictEqual(mergeBooksData('{"rate":10}', undefined), undefined);
assert.deepStrictEqual(
  JSON.parse(mergeBooksData('{"rate":10,"_gstRate":"18%"}', { hsn_or_sac: "8481", manufacturer: "Acme" })),
  { rate: 10, _gstRate: "18%", hsn_or_sac: "8481", manufacturer: "Acme" },
);
assert.deepStrictEqual(JSON.parse(mergeBooksData('{"hsn_or_sac":"8481","rate":10}', { hsn_or_sac: "" })), { rate: 10 });
assert.strictEqual(mergeBooksData('{"hsn_or_sac":"8481"}', { hsn_or_sac: "" }), null);
assert.deepStrictEqual(JSON.parse(mergeBooksData("not json", { hsn_or_sac: "8481" })), { hsn_or_sac: "8481" });

// Composite push carries only catalogue keys.
assert.deepStrictEqual(
  catalogueFields({ rate: 10, hsn_or_sac: "8481", manufacturer: "", unit: "pcs" }),
  { hsn_or_sac: "8481" },
);

console.log("itemFields.test.js ok");
