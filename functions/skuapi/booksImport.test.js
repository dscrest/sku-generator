"use strict";
// Run: node functions/skuapi/booksImport.test.js
// Zoho Books item-sheet import: row splitting + push field whitelist.
const assert = require("assert");
const { splitBooksRow, pushableBooksFields } = require("./booksImport");

// --- splitBooksRow: fixed headers route to the right places ---
{
  const r = splitBooksRow({
    "Item Name": "Recliner Chair",
    SKU: "FB-CT-01",
    "HSN/SAC": "6789",
    "Sales Description": "Recliner chair with 6 levels",
    "Selling Price": "1349",
    "Purchase Price": "1300",
    Unit: "pcs",
    "Product Type": "goods",
    "Item Type": "Inventory",
    "Is Returnable Item": "FALSE",
    Brand: "EZ Chairs",
    "Part Number": "HSC0428PP",
    "Reorder Level": "50",
    "Package Weight": "5.67",
    "Weight unit": "kg",
    "Material(Custom Feild)": "Cotton",
    "GSM(custom feild)": "500",
  });
  assert.strictEqual(r.name, "Recliner Chair");
  assert.strictEqual(r.sku, "FB-CT-01");
  assert.strictEqual(r.description, "Recliner chair with 6 levels");
  assert.strictEqual(r.booksData.rate, 1349);
  assert.strictEqual(r.booksData.purchase_rate, 1300);
  assert.strictEqual(r.booksData.hsn_or_sac, "6789");
  assert.strictEqual(r.booksData.unit, "pcs");
  assert.strictEqual(r.booksData.product_type, "goods");
  assert.strictEqual(r.booksData.item_type, "inventory");
  assert.strictEqual(r.booksData.is_returnable, false);
  assert.strictEqual(r.booksData.brand, "EZ Chairs");
  assert.strictEqual(r.booksData.part_number, "HSC0428PP");
  assert.strictEqual(r.booksData.reorder_level, 50);
  assert.deepStrictEqual(r.booksData.package_details, { weight: 5.67, weight_unit: "kg" });
  // Custom-field columns (typo variants included) land in propRow, stripped.
  assert.deepStrictEqual(r.propRow, { Material: "Cotton", GSM: "500" });
  // The extracted trio never leaks into booksData.
  assert.strictEqual(r.booksData.name, undefined);
  assert.strictEqual(r.booksData.sku, undefined);
}

// Item Type / Product Type normalization.
assert.strictEqual(splitBooksRow({ "Item Type": "Sales and Purchases" }).booksData.item_type, "sales_and_purchases");
assert.strictEqual(splitBooksRow({ "Item Type": "sales" }).booksData.item_type, "sales");
assert.strictEqual(splitBooksRow({ "Product Type": "Service" }).booksData.product_type, "service");
assert.throws(() => splitBooksRow({ "Item Type": "Widget" }), /Unknown Item Type: Widget/);

// Numbers must parse; blanks are dropped entirely.
assert.throws(() => splitBooksRow({ "Selling Price": "abc" }), /Selling Price must be a number/);
{
  const r = splitBooksRow({ "Item Name": "X", "Selling Price": "", SKU: "  " });
  assert.strictEqual(r.sku, "");
  assert.deepStrictEqual(r.booksData, {});
}

// Tax/account/stock columns are stored under "_" keys (reference only).
{
  const { booksData } = splitBooksRow({
    "Intra State Tax Rate": "5",
    "Intra State Tax Name": "GST5",
    "Taxability Type": "Out Of Scope",
    "Sales Account": "Sales",
    "Opening Stock": "500",
    "Warehouse Name": "warehouse1",
  });
  assert.strictEqual(booksData._gstRate, 5);
  assert.strictEqual(booksData._taxName, "GST5");
  assert.strictEqual(booksData._taxabilityType, "Out Of Scope");
  assert.strictEqual(booksData._salesAccount, "Sales");
  assert.strictEqual(booksData._openingStock, 500);
  assert.strictEqual(booksData._warehouse, "warehouse1");
}

// "(Custom Field)" spelling variants all strip.
for (const h of ["Material(Custom Feild)", "Material (custom field)", "Material( Custom Fild )"]) {
  assert.deepStrictEqual(splitBooksRow({ [h]: "Cotton" }).propRow, { Material: "Cotton" });
}

// Oversize Books payload refuses the row (10k text column cap).
assert.throws(() => splitBooksRow({ Brand: "x".repeat(9600) }), /too large/);

// --- pushableBooksFields ---
{
  const stored = { rate: 5, item_type: "inventory", _gstRate: 5, _salesAccount: "Sales", unit: "pcs" };
  assert.deepStrictEqual(pushableBooksFields(stored), { rate: 5, item_type: "inventory", unit: "pcs" });
  // Update path drops create-only keys too.
  assert.deepStrictEqual(pushableBooksFields(stored, { update: true }), { rate: 5, unit: "pcs" });
  assert.deepStrictEqual(pushableBooksFields(null), {});
}

console.log("booksImport.test.js OK");
