"use strict";

/** Shared Data Store helpers. */

// ZCQL returns each row keyed by its table name; unwrap to a flat object.
function rowList(zcqlRows) {
  return zcqlRows.map((r) => r[Object.keys(r)[0]]);
}

// Columns that must surface as JS numbers (Data Store may hand them back as strings).
const NUM_COLS = new Set(["skuPosition", "rangeMin", "rangeMax"]);
// Columns that must surface as JS booleans (Data Store may hand them back as "true"/"false").
const BOOL_COLS = new Set(["required", "createAsItem", "createValuesAsItems"]);
// Tri-state booleans: null stays null so callers can tell "never set" from "set false".
// Properties that predate CR-009 have null here and must keep their old behaviour.
const TRIBOOL_COLS = new Set(["activeInSku", "includeInName"]);
// Null = active, so nothing vanishes from an existing industry's SKU.
const isActive = (prop) => prop.activeInSku !== false;

// Predicate for "this property's value belongs in the item name". Until any
// property of the industry is flagged (or if every flag is cleared again) all of
// them do — the pre-CR-009 behaviour, so names never silently go empty.
function nameFilter(properties) {
  const anyFlagged = properties.some((p) => p.includeInName === true);
  return (prop) => !anyFlagged || prop.includeInName === true;
}

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
    if (k === "MODIFIEDTIME") { o.updatedAt = v; continue; }
    if (k === "CREATORID") continue;
    if (NUM_COLS.has(k)) { o[k] = v === null || v === "" || v === undefined ? null : Number(v); continue; }
    if (BOOL_COLS.has(k)) { o[k] = v === true || v === "true"; continue; }
    if (TRIBOOL_COLS.has(k)) { o[k] = v === null || v === "" || v === undefined ? null : v === true || v === "true"; continue; }
    o[k] = v;
  }
  return o;
}

// ROWIDs / FK ids are always all-digits; reject anything else before it reaches ZCQL.
function idOk(v) {
  return /^\d+$/.test(String(v));
}

// ZCQL string literals are single-quoted; escape embedded quotes.
function zStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

// The tenant key: the logged-in user's Zoho org, stashed on the request's
// catalyst instance by the /api requireOrg middleware. Throwing here is a
// safety net — no data query should run without an org scope.
function reqOrg(catalyst) {
  const org = catalyst.__orgId;
  if (!org) throw new Error("No org scope on request");
  return String(org);
}

// SQL fragment scoping a query to the current org, e.g.
//   `SELECT * FROM Industry WHERE ${orgClause(catalyst)}`
function orgClause(catalyst) {
  return `orgId = ${zStr(reqOrg(catalyst))}`;
}

// Ownership guard for update/delete-by-ROWID: true iff the row exists AND
// belongs to the current org. Blocks cross-tenant edits via a guessed id.
async function ownsRow(catalyst, table, id) {
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(`SELECT orgId FROM ${table} WHERE ROWID = ${id}`),
  );
  return rows.length > 0 && String(rows[0].orgId) === reqOrg(catalyst);
}

// SKUItem.sku has a DB unique constraint, but Data Store surfaces a violation as
// a generic error our handlers would turn into a 500. This explicit lookup lets
// us return a friendly 409 and flag dupes at preview time; the DB constraint is
// still the race-condition backstop. Returns the existing ROWID (string) or null.
// Pass excludeId to ignore self on update. Scoped to the current org — SKUs are
// only unique within an org (each org has its own Books catalog).
async function findSkuRowId(catalyst, sku, excludeId) {
  let q = `SELECT ROWID FROM SKUItem WHERE sku = ${zStr(sku)} AND ${orgClause(catalyst)}`;
  if (excludeId) q += ` AND ROWID != ${excludeId}`;
  const rows = rowList(await catalyst.zcql().executeZCQLQuery(q));
  return rows.length ? String(rows[0].ROWID) : null;
}

module.exports = { rowList, out, idOk, zStr, reqOrg, orgClause, ownsRow, findSkuRowId, isActive, nameFilter };
