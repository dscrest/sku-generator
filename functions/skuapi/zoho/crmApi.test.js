"use strict";
// Run: node functions/skuapi/zoho/crmApi.test.js
const assert = require("assert");
const { crmReauthNeeded } = require("./crmApi");

// Missing/expired grant -> reconnect prompt.
assert.strictEqual(crmReauthNeeded(401, { code: "OAUTH_SCOPE_MISMATCH" }), true);
assert.strictEqual(crmReauthNeeded(401, {}), true);
assert.strictEqual(crmReauthNeeded(200, { code: "INVALID_TOKEN" }), true); // code wins even off 401
// Healthy responses -> no reconnect.
assert.strictEqual(crmReauthNeeded(200, { data: [{ id: "1" }] }), false);
assert.strictEqual(crmReauthNeeded(404, { code: "INVALID_DATA" }), false);

console.log("crmApi crmReauthNeeded: ok");
