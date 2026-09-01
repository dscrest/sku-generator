"use strict";
// Run: node functions/skuapi/zoho/booksApi.test.js
// CR-087: plain-item create maps the push dialog's tracking + inventory
// account; custom fields are never pushed (client maintains them in Books).
const assert = require("assert");

// Patch auth BEFORE requiring booksApi so its destructured refs capture the stubs.
const auth = require("./auth");
let orgId = "org1";
auth.getOrgId = async () => orgId;
auth.getAccessToken = async () => ({ accessToken: "tok", dc: "com" });

// Route stubbed fetches by URL: chart of accounts, taxes, item create.
let capturedItem = null;
global.fetch = async (url, { body } = {}) => ({
  status: 200,
  json: async () => {
    if (url.includes("/chartofaccounts")) {
      return { code: 0, chartofaccounts: [
        { account_id: 1, account_name: "Finished Goods", account_type: "stock" },
        { account_id: 2, account_name: "Inventory Asset", account_type: "stock" },
        { account_id: 3, account_name: "Sales", account_type: "income" },
      ] };
    }
    if (url.includes("/settings/taxes")) return { code: 0, taxes: [] };
    if (url.includes("/items")) {
      capturedItem = JSON.parse(body);
      return { code: 0, item: { item_id: "55" } };
    }
    throw new Error(`unexpected fetch: ${url}`);
  },
});

const { createItem, listStockAccounts } = require("./booksApi");

(async () => {
  // --- defaults: serial tracking, Finished Goods account, no custom fields ---
  await createItem(null, "Valve A", "V-A", "Size: 100 MM");
  assert.strictEqual(capturedItem.track_serial_number, true);
  assert.strictEqual(capturedItem.track_batch_number, false);
  assert.strictEqual(capturedItem.inventory_account_id, "1");
  assert.strictEqual(capturedItem.custom_fields, undefined);
  assert.strictEqual(capturedItem.item_type, "inventory");

  // --- dialog options: batch + explicit account win ---
  await createItem(null, "Valve A", "V-A", null, { tracking: "batch", inventoryAccountId: "2" });
  assert.strictEqual(capturedItem.track_serial_number, false);
  assert.strictEqual(capturedItem.track_batch_number, true);
  assert.strictEqual(capturedItem.inventory_account_id, "2");

  // --- tracking "none" → neither flag ---
  await createItem(null, "Valve A", "V-A", null, { tracking: "none" });
  assert.strictEqual(capturedItem.track_serial_number, false);
  assert.strictEqual(capturedItem.track_batch_number, false);

  // --- stock-accounts list for the dialog dropdown: stock type only ---
  assert.deepStrictEqual(await listStockAccounts(null), [
    { id: "1", name: "Finished Goods" },
    { id: "2", name: "Inventory Asset" },
  ]);

  console.log("booksApi CR-087 tracking/account mapping: ok");
})();
