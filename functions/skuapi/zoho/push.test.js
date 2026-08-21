"use strict";
// Run: node functions/skuapi/zoho/push.test.js
// CR-029: composite create payload + associated-items validation.
const assert = require("assert");

// Patch booksApi BEFORE requiring inventoryApi/push so their destructured refs
// capture the stubs (no live Zoho calls).
const booksApi = require("./booksApi");
let captured = null;
booksApi.apiRequest = async (catalyst, method, path, body, service) => {
  captured = { method, path, body, service };
  return { composite_item: { composite_item_id: "77" } };
};
booksApi.getStockAccountId = async () => "acc-fg";
booksApi.buildItemCfs = async (c, cfs) => cfs || [];

const { createCompositeItem } = require("./inventoryApi");
const { buildAssociatedItems, mergeMappedLines } = require("./push");

// Stub catalyst: __orgId for orgClause, canned ZCQL rows keyed by table name.
const catalystWith = (rowsByTable) => ({
  __orgId: "org1",
  zcql: () => ({
    executeZCQLQuery: async (q) => {
      const table = Object.keys(rowsByTable).find((t) => q.includes(`FROM ${t} `) || q.includes(`FROM ${t}`));
      return (rowsByTable[table] || []).map((r) => ({ [table]: r }));
    },
  }),
});

(async () => {
  // --- composite create payload carries the full §3–§8 spec ---
  await createCompositeItem(catalystWith({}), {
    name: "Valve A", sku: "V-A", description: "Size: 100 MM",
    customFields: [{ api_name: "cf_size", value: "100 MM" }],
    mappedItems: [{ rmItemId: "9", perUnitQty: 1 }],
  });
  assert.strictEqual(captured.service, "inventory");
  assert.strictEqual(captured.path, "/compositeitems");
  const b = captured.body;
  assert.strictEqual(b.purchase_description, "Size: 100 MM");
  assert.strictEqual(b.rate, 0);
  assert.strictEqual(b.is_taxable, true);
  assert.strictEqual(b.track_serial_number, true);
  assert.strictEqual(b.inventory_valuation_method, "fifo");
  assert.strictEqual(b.inventory_account_id, "acc-fg");
  assert.deepStrictEqual(b.custom_fields, [{ api_name: "cf_size", value: "100 MM" }]);
  assert.deepStrictEqual(b.mapped_items, [{ item_id: "9", quantity: 1 }]);

  const item = { id: "1", industryId: "5" };

  // --- CR-030: an unselected flagged property is skipped, not an error ---
  assert.deepStrictEqual(
    await buildAssociatedItems(catalystWith({
      Property: [{ ROWID: "11", caption: "Body Material", createValuesAsItems: "true", industryId: "5" }],
      SKUItemValue: [],
    }), item),
    [],
  );

  // --- a Range selection (no valueId) can't be a Books item → also skipped ---
  assert.deepStrictEqual(
    await buildAssociatedItems(catalystWith({
      Property: [{ ROWID: "11", caption: "Body Material", createValuesAsItems: "true", industryId: "5" }],
      SKUItemValue: [{ ROWID: "21", propertyId: "11", valueId: null, valueText: "42" }],
    }), item),
    [],
  );

  // --- no flagged properties → no associated items, no error ---
  assert.deepStrictEqual(
    await buildAssociatedItems(catalystWith({
      Property: [{ ROWID: "11", caption: "Size", createValuesAsItems: "false", industryId: "5" }],
      SKUItemValue: [],
    }), item),
    [],
  );

  // --- CR-030 mergeMappedLines: manual lines survive, property lines swap ---
  const pool = new Set(["100", "101"]); // items the generator owns (Steel, Brass)
  // Steel (100, qty 1) was property-derived; bolt (500, qty 8) is manual.
  const existing = [
    { item_id: "100", quantity: 1 },
    { item_id: "500", quantity: 8 },
  ];
  // Selection changed Steel → Brass.
  const swapped = mergeMappedLines(existing, [{ rmItemId: "101", perUnitQty: 1 }], pool);
  assert.strictEqual(swapped.changed, true);
  assert.deepStrictEqual(swapped.lines.sort((a, b) => a.rmItemId - b.rmItemId), [
    { rmItemId: "101", perUnitQty: 1 },
    { rmItemId: "500", perUnitQty: 8 },
  ]);
  // Same selection again → quantity kept (even if user bumped it in Books), no write.
  const same = mergeMappedLines([{ item_id: "100", quantity: 3 }, { item_id: "500", quantity: 8 }],
    [{ rmItemId: "100", perUnitQty: 1 }], pool);
  assert.strictEqual(same.changed, false);
  assert.deepStrictEqual(same.lines.find((l) => l.rmItemId === "100").perUnitQty, 3);

  console.log("push CR-029/CR-030 composite payload + associated-items + merge: ok");
})();
