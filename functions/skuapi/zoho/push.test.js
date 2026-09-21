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
booksApi.findItemByName = async () => null; // no legacy RM1/RM2 in this fake org

const { createCompositeItem } = require("./inventoryApi");
const { buildAssociatedItems, mergeMappedLines, valueItemSku, requireBomLines } = require("./push");

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
    mappedItems: [{ rmItemId: "9", perUnitQty: 1 }],
  });
  assert.strictEqual(captured.service, "inventory");
  assert.strictEqual(captured.path, "/compositeitems");
  const b = captured.body;
  assert.strictEqual(b.purchase_description, "Size: 100 MM");
  assert.strictEqual(b.rate, 0);
  assert.strictEqual(b.is_taxable, true);
  // Serial by default; custom fields are never pushed (CR-087).
  assert.strictEqual(b.track_serial_number, true);
  assert.strictEqual(b.track_batch_number, false);
  assert.strictEqual(b.custom_fields, undefined);
  assert.strictEqual(b.inventory_valuation_method, "fifo");
  assert.strictEqual(b.inventory_account_id, "acc-fg");
  assert.deepStrictEqual(b.mapped_items, [{ item_id: "9", quantity: 1 }]);

  // --- CR-087 push dialog options: batch tracking + chosen account ---
  await createCompositeItem(catalystWith({}), {
    name: "Valve A", sku: "V-A", tracking: "batch", inventoryAccountId: "acc-x",
  });
  assert.strictEqual(captured.body.track_serial_number, false);
  assert.strictEqual(captured.body.track_batch_number, true);
  assert.strictEqual(captured.body.inventory_account_id, "acc-x");

  // --- tracking "none" → neither flag ---
  await createCompositeItem(catalystWith({}), { name: "Valve A", sku: "V-A", tracking: "none" });
  assert.strictEqual(captured.body.track_serial_number, false);
  assert.strictEqual(captured.body.track_batch_number, false);
  assert.strictEqual(captured.body.inventory_account_id, "acc-fg"); // falls back to Finished Goods

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

  // --- CR-163: value items carry a name-derived SKU (Books "SKU mandatory" orgs, code 2112) ---
  assert.strictEqual(valueItemSku("Handloom"), "HANDLOOM");
  assert.strictEqual(valueItemSku(" Cotton : Silk "), "COTTON-SILK");

  // --- CR-184: no more RM1/RM2 padding — a short BOM fails loudly (Zoho 2056); ≥2 lines pass through ---
  const two = [{ rmItemId: "a", perUnitQty: 1 }, { rmItemId: "b", perUnitQty: 1 }];
  assert.strictEqual(requireBomLines(two), two);
  assert.throws(() => requireBomLines([{ rmItemId: "h", perUnitQty: 1 }]), /at least 2 raw-material lines \(has 1\)/);
  assert.throws(() => requireBomLines([]), /has 0/);
  // A legacy placeholder line is dropped on re-push once it is in the pool (syncMappedItems adds it).
  const legacy = mergeMappedLines(
    [{ item_id: "r1", quantity: 1 }, { item_id: "r2", quantity: 1 }, { item_id: "900", quantity: 2 }],
    [{ rmItemId: "101", perUnitQty: 1 }, { rmItemId: "102", perUnitQty: 1 }],
    new Set(["101", "102", "r1", "r2"]),
  );
  assert.deepStrictEqual(legacy.lines.map((l) => l.rmItemId).sort(), ["101", "102", "900"], "placeholders out, manual line 900 kept");
  assert.strictEqual(legacy.changed, true);

  console.log("push CR-029/CR-030 composite payload + associated-items + merge + CR-163 value SKU + CR-184 BOM guard: ok");
})();
