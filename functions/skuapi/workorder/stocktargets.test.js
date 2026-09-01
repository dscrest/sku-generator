"use strict";
// Run: node functions/skuapi/workorder/stocktargets.test.js
// stockTargets: shape a Zoho item payload into stock rows — index 0 is the org
// total (warehouseId ""), then one row per warehouse/location. Powers both the
// snapshot write and the per-item refresh's in-place row patch.
// writeStock: prunes stale per-warehouse rows ONLY when the payload carries a
// breakdown — a total-only bulk payload must never delete the Main baseline
// (that deletion is how WO-0008 showed In stock −2).
const assert = require("assert");
const { stockTargets, writeStock } = require("./sync");

// Locations-enabled org: breakdown as locations[] with location_* fields.
const loc = stockTargets({
  stock_on_hand: 3, available_stock: 2,
  locations: [
    { location_id: "L1", location_stock_on_hand: 3, location_available_stock: 2 },
    { location_id: "L2", location_stock_on_hand: 0, location_available_stock: 0 },
  ],
});
assert.deepStrictEqual(loc[0], { warehouseId: "", stockOnHand: 3, availableStock: 2 }, "org total is first");
assert.deepStrictEqual(loc.slice(1), [
  { warehouseId: "L1", stockOnHand: 3, availableStock: 2 },
  { warehouseId: "L2", stockOnHand: 0, availableStock: 0 },
], "one row per location");

// Legacy inventory org: breakdown as warehouses[] with warehouse_* fields.
const wh = stockTargets({
  stock_on_hand: 5, available_stock: 4,
  warehouses: [{ warehouse_id: "W1", warehouse_stock_on_hand: 5, warehouse_available_stock: 4 }],
});
assert.deepStrictEqual(wh.slice(1), [{ warehouseId: "W1", stockOnHand: 5, availableStock: 4 }]);

// No breakdown → just the org total row.
assert.deepStrictEqual(stockTargets({ stock_on_hand: 7, available_stock: 7 }),
  [{ warehouseId: "", stockOnHand: 7, availableStock: 7 }]);

// writeStock prune rules, against a fake catalyst holding one org-total row
// and one Main-warehouse row for the item.
(async () => {
  const existing = [
    { ROWID: "1", orgId: "o", itemId: "9", warehouseId: "" },
    { ROWID: "2", orgId: "o", itemId: "9", warehouseId: "W1" },
  ];
  const deleted = [];
  const fake = {
    zcql: () => ({ executeZCQLQuery: async () => existing.map((r) => ({ ItemStockSnapshot: { ...r } })) }),
    datastore: () => ({ table: () => ({
      updateRow: async () => {},
      insertRow: async () => {},
      deleteRow: async (id) => deleted.push(String(id)),
    }) }),
  };

  await writeStock(fake, "o", { item_id: "9", stock_on_hand: 25 }, "cron");
  assert.deepStrictEqual(deleted, [], "total-only payload leaves per-warehouse rows alone");

  await writeStock(fake, "o",
    { item_id: "9", stock_on_hand: 25, locations: [{ location_id: "W2", location_stock_on_hand: 25 }] }, "cron");
  assert.deepStrictEqual(deleted, ["2"], "breakdown payload prunes rows it no longer carries");

  console.log("stockTargets + writeStock ok");
})().catch((err) => { console.error(err); process.exit(1); });
