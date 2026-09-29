"use strict";
const { rowList, out, orgClause, reqOrg, isActive, findSkuRowId, zStr } = require("./store");
const { assemble } = require("./skuBuild");
const { applySeries } = require("./skuSeries");
const { saveItemValues } = require("./itemValues");
const { buildResolver } = require("./importItems");
const { autoCode } = require("./zoho/import");

const TABLE = "SKUItem";
const MAX_ROWS = 500;
// Catalyst text columns silently truncate at 10000 — refuse a row whose Books
// payload would corrupt on insert instead of storing broken JSON.
const MAX_BOOKS_JSON = 9500;

const norm = (v) => (v === undefined || v === null ? "" : String(v).trim());

// "Material(Custom Feild)" / "GSM (custom field)" → "Material" / "GSM".
// Matches field/feild/fild — the Books sample sheet itself misspells it.
const CF_SUFFIX = /\s*\(\s*custom\s*fe?i?e?ld\s*\)\s*$/i;

const ITEM_TYPES = {
  sales: "sales",
  purchases: "purchases",
  inventory: "inventory",
  "sales and purchases": "sales_and_purchases",
};
const PRODUCT_TYPES = { goods: "goods", service: "service", services: "service" };

/**
 * Fixed Zoho Books item-sheet headers (normalized lowercase) → booksData key.
 * `num`/`bool` coerce the cell; `map` normalizes enumerations; `pkg` nests under
 * package_details. Keys starting with "_" are stored for reference but never
 * sent to the Books API (they'd need id lookups: accounts, taxes, warehouses).
 */
const BOOKS_FIELDS = {
  "hsn/sac": { key: "hsn_or_sac" },
  "selling price": { key: "rate", num: true },
  "purchase price": { key: "purchase_rate", num: true },
  "purchase description": { key: "purchase_description" },
  unit: { key: "unit" },
  "usage unit": { key: "unit" },
  "product type": { key: "product_type", map: PRODUCT_TYPES },
  "item type": { key: "item_type", map: ITEM_TYPES },
  "is returnable item": { key: "is_returnable", bool: true },
  brand: { key: "brand" },
  manufacturer: { key: "manufacturer" },
  upc: { key: "upc" },
  ean: { key: "ean" },
  isbn: { key: "isbn" },
  "part number": { key: "part_number" },
  "reorder level": { key: "reorder_level", num: true },
  "package weight": { key: "weight", pkg: true, num: true },
  "package length": { key: "length", pkg: true, num: true },
  "package width": { key: "width", pkg: true, num: true },
  "package height": { key: "height", pkg: true, num: true },
  "weight unit": { key: "weight_unit", pkg: true },
  "dimension unit": { key: "dimension_unit", pkg: true },
  // Stored-only (_-prefixed): opening stock needs a warehouse + per-unit rate
  // the sheet doesn't reliably carry; taxes/accounts/vendors need Books ids.
  "opening stock": { key: "_openingStock", num: true },
  "opening stock value": { key: "_openingStockValue", num: true },
  "intra state tax name": { key: "_taxName" },
  "intra state tax type": { key: "_taxType" },
  "intra state tax rate": { key: "_gstRate", num: true },
  "inter state tax name": { key: "_interTaxName" },
  "inter state tax type": { key: "_interTaxType" },
  "inter state tax rate": { key: "_interGstRate", num: true },
  "taxability type": { key: "_taxabilityType" },
  "exemption reason": { key: "_exemptionReason" },
  "sales account": { key: "_salesAccount" },
  "purchase account": { key: "_purchaseAccount" },
  "inventory account": { key: "_inventoryAccount" },
  "preferred vendor": { key: "_preferredVendor" },
  "warehouse name": { key: "_warehouse" },
};

// Books rejects these on item update (immutable after create).
const CREATE_ONLY = ["item_type"];

/**
 * Split one Books-sheet row into the local item fields, the Books API
 * passthrough (booksData) and the residue of unmatched columns (propRow) that
 * gets matched against Property captions. Custom-field suffixes are stripped
 * so "Material(Custom Feild)" resolves the "Material" property.
 */
function splitBooksRow(row) {
  let name = "";
  let sku = "";
  let description = "";
  let zohoItemId = "";
  let category = "";
  const booksData = {};
  const propRow = {};
  for (const [header, rawCell] of Object.entries(row)) {
    const cell = norm(rawCell);
    if (cell === "") continue;
    const stripped = norm(header.replace(CF_SUFFIX, ""));
    const key = stripped.toLowerCase();
    if (!key) continue;
    if (key === "item name") { name = cell; continue; }
    if (key === "sku") { sku = cell; continue; }
    if (key === "sales description") { description = cell; continue; }
    // Books export's link id. Excel mangles a numeric 19-digit id to 1.2E+18 —
    // anything not all-digits is ignored rather than stored as a bogus link.
    if (key === "item id") { if (/^\d+$/.test(cell)) zohoItemId = cell; continue; }
    // Picks the row's product type when the page says "From Category Name"
    // (pickIndustry); no `continue` — the cell still reaches propRow for a
    // property fed by this column.
    if (key === "category name") category = cell;
    const f = BOOKS_FIELDS[key];
    if (!f) { propRow[stripped] = cell; continue; }
    let v = cell;
    if (f.map) {
      v = f.map[cell.toLowerCase()];
      if (v === undefined) throw new Error(`Unknown ${stripped}: ${cell}`);
    } else if (f.num) {
      // Books exports money as "INR 1,200.00" — drop the currency prefix and
      // thousands commas (bare parseFloat reads "1,200" as 1).
      v = parseFloat(cell.replace(/^[^\d.-]+/, "").replace(/,/g, ""));
      if (isNaN(v)) throw new Error(`${stripped} must be a number: ${cell}`);
    } else if (f.bool) {
      v = /^(true|yes|1)$/i.test(cell);
    }
    if (f.pkg) (booksData.package_details = booksData.package_details || {})[f.key] = v;
    else booksData[f.key] = v;
  }
  if (JSON.stringify(booksData).length > MAX_BOOKS_JSON)
    throw new Error("Books fields too large for one row");
  return { name, sku, description, zohoItemId, category, booksData, propRow };
}

/**
 * The product type a row belongs to by its Books category: the industry named
 * like it (trimmed, case-insensitive). Returns the industry id as a string, or
 * null when the category is blank or matches none. Pure — the self-test shares it.
 */
function pickIndustry(industries, category) {
  const want = norm(category).toLowerCase();
  const hit = want && industries.find((i) => norm(i.name).toLowerCase() === want);
  return hit ? String(hit.id) : null;
}

/**
 * The subset of a stored booksData object that can go straight onto a Books
 * item create/update body: "_" reference keys dropped, create-only keys
 * dropped on update. Pure — push.js and the self-tests share it.
 */
function pushableBooksFields(booksData, { update = false } = {}) {
  const fields = {};
  for (const [k, v] of Object.entries(booksData || {})) {
    if (k.startsWith("_")) continue;
    if (update && CREATE_ONLY.includes(k)) continue;
    fields[k] = v;
  }
  return fields;
}

/**
 * Import Zoho-Books-format sheet rows as local SKUItems (always Trading).
 * `industryId` is the product type picked on the page and applies to every
 * row; without one ("From Category Name") each row goes to the product type
 * named like its Category Name and fails when none is. A row with an SKU keeps it
 * verbatim (no series suffix) and property columns resolve best-effort; a row
 * without one builds its SKU from whichever of the product type's properties
 * are filled, via the same assemble + series engine as the manual generator —
 * blank required properties are reported as a warning, not a failure.
 * Rows run SEQUENTIALLY — the series max-scan is non-atomic.
 */
async function processBooksImport(catalyst, industryId, rows) {
  if (rows.length > MAX_ROWS) {
    const e = new Error(`Max ${MAX_ROWS} rows per import`);
    e.status = 400;
    throw e;
  }
  const zcql = catalyst.zcql();
  const industries = rowList(
    await zcql.executeZCQLQuery(`SELECT * FROM Industry WHERE ${orgClause(catalyst)}`),
  ).map(out);
  const industryById = new Map(industries.map((i) => [String(i.id), i]));
  const forced = industryId ? String(industryId) : null;
  if (forced && !industryById.has(forced)) {
    const e = new Error("Industry not found");
    e.status = 404;
    throw e;
  }
  const table = catalyst.datastore().table(TABLE);
  const orgId = reqOrg(catalyst);
  let valuesCreated = 0;

  // Per-product-type setup, loaded on first use — only the product types the
  // rows actually reach are queried.
  const ctxCache = new Map();
  const ctxFor = async (id) => {
    if (ctxCache.has(id)) return ctxCache.get(id);
    const industry = industryById.get(id);
    const properties = rowList(
      await zcql.executeZCQLQuery(
        `SELECT * FROM Property WHERE industryId = ${id} AND ${orgClause(catalyst)} ORDER BY skuPosition`,
      ),
    ).map(out).filter(isActive);

    const pvByProp = {};
    const pvById = new Map();
    for (const p of properties) {
      if (p.valueType === "Range") continue;
      const vals = rowList(
        await zcql.executeZCQLQuery(`SELECT * FROM PropertyValue WHERE propertyId = ${p.id} AND ${orgClause(catalyst)}`),
      ).map(out);
      pvByProp[p.id] = vals;
      for (const v of vals) pvById.set(String(v.id), v);
    }

    // Unknown list values (a new Category etc.) are registered instead of failing
    // the row — same find-or-create + auto code as the Books API import.
    // buildResolver holds pvByProp by reference, so it sees the new value.
    // ponytail: values come from raw cells, a typo makes a junk value — fix/merge
    // it in Property Manager.
    const listPropByCaption = new Map(
      properties.filter((p) => p.valueType !== "Range").map((p) => [norm(p.caption).toLowerCase(), p]),
    );
    const ensureValues = async (propRow) => {
      for (const [header, cell] of Object.entries(propRow)) {
        const prop = listPropByCaption.get(header.toLowerCase());
        if (!prop) continue;
        const vals = pvByProp[prop.id];
        const want = cell.toLowerCase();
        if (vals.some((v) => norm(v.displayValue).toLowerCase() === want || norm(v.name).toLowerCase() === want)) continue;
        const created = out(
          await catalyst.datastore().table("PropertyValue").insertRow({
            displayValue: cell,
            name: cell,
            sku: autoCode(cell, new Set(vals.map((v) => v.sku))),
            description: null,
            propertyId: String(prop.id),
            orgId,
          }),
        );
        vals.push(created);
        pvById.set(String(created.id), created);
        valuesCreated++;
      }
    };

    const ctx = {
      industry,
      sep: industry.skuSeparator || "",
      properties,
      getPv: async (rowid) => pvById.get(String(rowid)) || null,
      resolveRow: buildResolver(properties, pvByProp),
      ensureValues,
    };
    ctxCache.set(id, ctx);
    return ctx;
  };

  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    try {
      const { name, sku, description, zohoItemId, category, booksData, propRow } = splitBooksRow(rows[i]);
      // Link priority matches zoho/import.js: Books item id first, then sku.
      if (zohoItemId) {
        const linked = rowList(
          await zcql.executeZCQLQuery(
            `SELECT ROWID FROM ${TABLE} WHERE zohoItemId = ${zStr(zohoItemId)} AND ${orgClause(catalyst)} LIMIT 1`,
          ),
        );
        if (linked.length) throw new Error(`Already imported (Item ID ${zohoItemId})`);
      }
      const indId = forced || pickIndustry(industries, category);
      if (!indId)
        throw new Error(
          category
            ? `Category "${category}" matches no product type — pick the product type above`
            : "Row has no Category Name — pick the product type above",
        );
      const { industry, sep, properties, getPv, resolveRow, ensureValues } = await ctxFor(indId);
      await ensureValues(propRow);
      let finalSku = sku;
      let finalName = name;
      let finalDesc = description;
      let selectedValues;
      let warning;

      if (sku) {
        // SKU given: property cells are extra detail — a typo in one must not
        // fail a row that already has its identity. Resolve column-by-column.
        selectedValues = {};
        for (const [h, c] of Object.entries(propRow)) {
          try { Object.assign(selectedValues, resolveRow({ [h]: c }).selectedValues); } catch { /* skip bad cell */ }
        }
        if (!finalName) throw new Error("Item Name is required");
      } else {
        // No SKU: build it like the manual generator would, from the filled
        // properties. Blank required ones don't fail the row here (the sheet
        // is a Books export, not a filled template) — they come back as a warning.
        selectedValues = resolveRow(propRow).selectedValues;
        const asm = await assemble(properties, selectedValues, sep, getPv);
        if (!asm.sku)
          throw new Error(
            `No SKU produced — product type "${industry.name}" got no property values; fill the SKU column or set up its properties`,
          );
        if (asm.missingRequired.length) warning = `Required fields left blank: ${asm.missingRequired.join(", ")}`;
        finalSku = await applySeries(catalyst, industry, asm.sku, selectedValues);
        if (!finalName) finalName = asm.name;
        if (!finalDesc) finalDesc = asm.description;
        if (!finalName) throw new Error("Item Name is required");
      }

      if (await findSkuRowId(catalyst, finalSku)) throw new Error(`Duplicate SKU: ${finalSku}`);

      const item = out(
        await table.insertRow({
          name: finalName,
          sku: finalSku,
          description: finalDesc || null,
          type: "Trading", // Books simple-item sheets never carry composites
          industryId: String(industry.id),
          zohoItemId: zohoItemId || null,
          booksData: Object.keys(booksData).length ? JSON.stringify(booksData) : null,
          orgId,
        }),
      );
      if (Object.keys(selectedValues).length) await saveItemValues(catalyst, item.id, industry.id, selectedValues);
      results.push({
        row: rowNum, status: "success", sku: finalSku, name: finalName, itemId: item.id,
        productType: industry.name, ...(warning && { warning }),
      });
    } catch (e) {
      results.push({ row: rowNum, status: "failed", error: e.message });
    }
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  return { total: rows.length, succeeded, failed: rows.length - succeeded, valuesCreated, results };
}

module.exports = { splitBooksRow, pickIndustry, pushableBooksFields, processBooksImport, CREATE_ONLY };
