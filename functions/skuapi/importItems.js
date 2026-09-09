"use strict";
const { rowList, out, orgClause, reqOrg, isActive, findSkuRowId } = require("./store");
const { assemble } = require("./skuBuild");
const { nextSeriesSku } = require("./skuSeries");
const { saveItemValues } = require("./itemValues");

const TABLE = "SKUItem";
const MAX_ROWS = 500; // ponytail: batch ceiling; sequential inserts, fine for the internal app.

const norm = (v) => (v === undefined || v === null ? "" : String(v).trim());

/**
 * Build a per-row resolver. A sheet row is { "<column header>": "<cell>" } — the
 * headers are property captions (case-insensitive) plus an optional "Item Type"
 * column. Turns a row into the { propertyId: ROWID|number } shape the SKU engine
 * consumes, resolving list-value display strings to their PropertyValue ROWID.
 *
 * `properties`: active Property[]; `pvByProp`: { propertyId: PropertyValue[] }.
 * Throws Error(message) on an unrecognised list value or Item Type (row fails).
 */
function buildResolver(properties, pvByProp) {
  const propByCaption = new Map(properties.map((p) => [norm(p.caption).toLowerCase(), p]));
  return function resolveRow(row) {
    const selectedValues = {};
    let type = "Trading";
    for (const [header, rawCell] of Object.entries(row)) {
      const key = norm(header).toLowerCase();
      if (!key) continue;
      if (key === "item type" || key === "type") {
        const t = norm(rawCell).toLowerCase();
        if (t === "" || t === "trading" || t === "item") type = "Trading";
        else if (t === "manufacturing" || t === "composite") type = "Manufacturing";
        else throw new Error(`Unknown Item Type: ${rawCell}`);
        continue;
      }
      const prop = propByCaption.get(key);
      if (!prop) continue; // unknown/extra column (notes, blank suffix, etc.) — ignore
      const cell = norm(rawCell);
      if (cell === "") continue; // blank optional cell — engine treats missing as empty
      if (prop.valueType === "Range") {
        selectedValues[prop.id] = cell; // assemble() validates min/max
      } else {
        const want = cell.toLowerCase();
        const pv = (pvByProp[prop.id] || []).find(
          (v) => norm(v.displayValue).toLowerCase() === want || norm(v.name).toLowerCase() === want,
        );
        if (!pv) throw new Error(`Unknown value for ${prop.caption}: ${rawCell}`);
        selectedValues[prop.id] = pv.id;
      }
    }
    return { selectedValues, type };
  };
}

/**
 * Process a parsed import sheet into local SKUItem rows. Reuses the exact manual
 * engine (assemble + series + dup check + saveItemValues). Rows are processed
 * SEQUENTIALLY so each insert advances the industry series max the next row reads
 * (the series max-scan is non-atomic — sequential avoids the 409 collisions a
 * parallel bulk create would hit). Push to Books stays manual (CR-021).
 *
 * Returns { total, succeeded, failed, results:[{ row, status, sku?, name?, itemId?, error? }] }.
 */
async function processImport(catalyst, industryId, rows) {
  if (rows.length > MAX_ROWS) {
    const e = new Error(`Max ${MAX_ROWS} rows per import`);
    e.status = 400;
    throw e;
  }
  const zcql = catalyst.zcql();
  const inds = rowList(
    await zcql.executeZCQLQuery(`SELECT * FROM Industry WHERE ROWID = ${industryId} AND ${orgClause(catalyst)}`),
  );
  if (!inds.length) {
    const e = new Error("Industry not found");
    e.status = 404;
    throw e;
  }
  const industry = out(inds[0]);
  const sep = industry.skuSeparator || "";

  const properties = rowList(
    await zcql.executeZCQLQuery(
      `SELECT * FROM Property WHERE industryId = ${industryId} AND ${orgClause(catalyst)} ORDER BY skuPosition`,
    ),
  ).map(out).filter(isActive);

  // Preload list values once (not per row). Range props have none.
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
  const getPv = async (rowid) => pvById.get(String(rowid)) || null;
  const resolveRow = buildResolver(properties, pvByProp);
  const table = catalyst.datastore().table(TABLE);
  const orgId = reqOrg(catalyst);

  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    try {
      const { selectedValues, type } = resolveRow(rows[i]);
      const asm = await assemble(properties, selectedValues, sep, getPv);
      if (asm.missingRequired.length)
        throw new Error(`Required fields missing: ${asm.missingRequired.join(", ")}`);
      if (!asm.sku) throw new Error("No SKU produced — every property cell is blank");

      let finalSku = asm.sku;
      if (Number(industry.seriesStart) > 0) {
        finalSku = await nextSeriesSku(catalyst, industryId, asm.sku, sep, Number(industry.seriesPad) || 4);
      }
      if (await findSkuRowId(catalyst, finalSku)) throw new Error(`Duplicate SKU: ${finalSku}`);

      const item = out(
        await table.insertRow({
          name: asm.name,
          sku: finalSku,
          description: asm.description || null,
          type,
          industryId: String(industryId),
          orgId,
        }),
      );
      await saveItemValues(catalyst, item.id, industryId, selectedValues);
      results.push({ row: rowNum, status: "success", sku: finalSku, name: asm.name, itemId: item.id });
    } catch (e) {
      results.push({ row: rowNum, status: "failed", error: e.message });
    }
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  return { total: rows.length, succeeded, failed: rows.length - succeeded, results };
}

module.exports = { buildResolver, processImport };
