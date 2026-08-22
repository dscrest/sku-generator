"use strict";
// Run: node functions/skuapi/zoho/booksApi.test.js
// Custom fields unknown to the connected Books org are dropped, not sent —
// other clients' orgs won't have our default cf_* fields or every mapping.
const assert = require("assert");

// Patch auth BEFORE requiring booksApi so its destructured refs capture the stubs.
const auth = require("./auth");
let orgId = "org1";
auth.getOrgId = async () => orgId;
auth.getAccessToken = async () => ({ accessToken: "tok", dc: "com" });

let fetchImpl;
global.fetch = (...args) => fetchImpl(...args);

const { buildItemCfs } = require("./booksApi");

(async () => {
  // Org has cf_item_type (dropdown) and cf_colour only.
  fetchImpl = async () => ({
    status: 200,
    json: async () => ({
      code: 0,
      fields: [
        { api_name: "cf_item_type", values: [{ name: "Finished Goods" }, { name: "Raw Material" }] },
        { api_name: "cf_colour" },
      ],
    }),
  });
  const cfs = await buildItemCfs(null, [
    { api_name: "cf_colour", value: "Red" },
    { api_name: "cf_size", value: "100 MM" }, // not in org → dropped
  ]);
  assert.deepStrictEqual(cfs, [
    { api_name: "cf_item_type", value: "Finished Goods" }, // default, exists in org
    { api_name: "cf_colour", value: "Red" },
  ]);

  // Metadata fetch failure → degrade to unfiltered (fresh org so no cache hit).
  orgId = "org2";
  fetchImpl = async () => ({ status: 500, json: async () => ({ code: 57, message: "not authorized" }) });
  const unfiltered = await buildItemCfs(null, [{ api_name: "cf_size", value: "100 MM" }]);
  assert.strictEqual(unfiltered.length, 4); // 3 defaults + cf_size, nothing dropped
  assert.ok(unfiltered.some((cf) => cf.api_name === "cf_size"));

  console.log("booksApi custom-field org filtering: ok");
})();
