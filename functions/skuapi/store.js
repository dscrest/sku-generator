"use strict";

/** Shared Data Store helpers. */

// ZCQL returns each row keyed by its table name; unwrap to a flat object.
function rowList(zcqlRows) {
  return zcqlRows.map((r) => r[Object.keys(r)[0]]);
}

// Columns that must surface as JS numbers (Data Store may hand them back as strings).
const NUM_COLS = new Set(["skuPosition", "rangeMin", "rangeMax"]);

/**
 * Map a Data Store / ZCQL row to the API shape the frontend expects:
 *   ROWID -> id (string — 17-digit, must stay a string to avoid precision loss)
 *   CREATEDTIME -> createdAt
 * FK columns (industryId, propertyId) are left as strings on purpose.
 */
function out(row) {
  if (!row) return null;
  const o = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "ROWID") { o.id = String(v); continue; }
    if (k === "CREATEDTIME") { o.createdAt = v; continue; }
    if (k === "MODIFIEDTIME" || k === "CREATORID") continue;
    if (NUM_COLS.has(k)) { o[k] = v === null || v === "" || v === undefined ? null : Number(v); continue; }
    o[k] = v;
  }
  return o;
}

// ROWIDs / FK ids are always all-digits; reject anything else before it reaches ZCQL.
function idOk(v) {
  return /^\d+$/.test(String(v));
}

module.exports = { rowList, out, idOk };
