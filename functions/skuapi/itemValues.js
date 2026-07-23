"use strict";
const { rowList, out, idOk, zStr, reqOrg, orgClause, isActive } = require("./store");

const TABLE = "SKUItemValue";

/**
 * Persist the structured property selections for a freshly-created SKU item so
 * they can be searched later (the SKUItem row only keeps the joined strings).
 * `selectedValues` is { propertyId: value } where value is a PropertyValue ROWID
 * (list props) or a raw number string (Range props). Best-effort per row.
 */
async function saveItemValues(catalyst, skuItemId, industryId, selectedValues) {
  if (!selectedValues || !idOk(industryId)) return;
  const zcql = catalyst.zcql();
  const props = rowList(
    await zcql.executeZCQLQuery(`SELECT * FROM Property WHERE industryId = ${industryId} AND ${orgClause(catalyst)}`),
  ).map(out).filter(isActive);

  const table = catalyst.datastore().table(TABLE);
  for (const prop of props) {
    const raw = selectedValues[prop.id];
    if (raw === undefined || raw === null || raw === "") continue;

    let valueId = null;
    let valueText;
    if (prop.valueType === "Range") {
      valueText = String(raw);
    } else {
      if (!idOk(raw)) continue;
      const pvs = rowList(
        await zcql.executeZCQLQuery(`SELECT * FROM PropertyValue WHERE ROWID = ${raw} AND ${orgClause(catalyst)}`),
      );
      if (!pvs.length) continue;
      const pv = out(pvs[0]);
      valueId = String(raw);
      valueText = pv.displayValue || pv.name;
    }
    await table.insertRow({
      skuItemId: String(skuItemId),
      propertyId: String(prop.id),
      valueId,
      valueText,
      orgId: reqOrg(catalyst),
    });
  }
}

// Required-property captions for an industry that have no value in selectedValues.
// Empty array = all required props are satisfied. The hard gate for SKU creation.
// Properties moved out of SKU generation can't be filled in, so they can't gate it.
async function missingRequired(catalyst, industryId, selectedValues) {
  if (!idOk(industryId)) return [];
  const sv = selectedValues || {};
  const props = rowList(
    await catalyst.zcql().executeZCQLQuery(`SELECT * FROM Property WHERE industryId = ${industryId} AND ${orgClause(catalyst)}`),
  ).map(out);
  return props
    .filter(isActive)
    .filter((p) => p.required)
    .filter((p) => { const v = sv[p.id]; return v === undefined || v === null || v === ""; })
    .map((p) => p.caption);
}

// Delete all stored values for a SKU item (manual cascade — matches the
// PropertyValue cleanup pattern in routes/properties.js).
async function deleteItemValues(catalyst, skuItemId) {
  const ds = catalyst.datastore();
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(`SELECT ROWID FROM ${TABLE} WHERE skuItemId = ${skuItemId} AND ${orgClause(catalyst)}`),
  );
  for (const r of rows) await ds.table(TABLE).deleteRow(r.ROWID);
}

/**
 * SKU-item ROWIDs matching all of `filters`, AND-combined. Each filter is
 * { propertyId, valueId? , text? }: valueId = exact match, text = LIKE on
 * valueText. Returns a Set of id strings, or null if no filters were given.
 * ponytail: in-memory intersection over per-filter ZCQL; fine until an item
 * type has thousands of rows (ZCQL pages at 300 — add paging then).
 */
async function searchItemIds(catalyst, filters) {
  if (!filters || !filters.length) return null;
  const zcql = catalyst.zcql();
  let ids = null;
  for (const f of filters) {
    if (!idOk(f.propertyId)) continue;
    let q = `SELECT skuItemId FROM SKUItemValue WHERE propertyId = ${f.propertyId} AND ${orgClause(catalyst)}`;
    if (f.valueId !== undefined && f.valueId !== null && f.valueId !== "") {
      if (!idOk(f.valueId)) continue;
      q += ` AND valueId = ${f.valueId}`;
    } else if (f.text) {
      q += ` AND valueText LIKE ${zStr("*" + f.text + "*")}`; // ZCQL wildcard is *, not %
    }
    const got = new Set(rowList(await zcql.executeZCQLQuery(q)).map((r) => String(r.skuItemId)));
    ids = ids === null ? got : new Set([...ids].filter((x) => got.has(x)));
    if (ids.size === 0) break;
  }
  return ids;
}

/**
 * One-shot backfill of SKUItemValue for items created before structured values
 * were stored. Reconstructs list-type selections by splitting each item's SKU on
 * its industry separator and matching tokens against each property's value codes.
 * Idempotent: items that already have rows are skipped. Range values can't be
 * reversed from a bare number, so they're left out.
 * ponytail: single-page reads (ZCQL caps at 300 rows); add paging if any table grows past that.
 */
async function backfillItemValues(catalyst) {
  const zcql = catalyst.zcql();
  const table = catalyst.datastore().table(TABLE);

  const items = rowList(await zcql.executeZCQLQuery(`SELECT * FROM SKUItem WHERE ${orgClause(catalyst)}`)).map(out);
  const seps = {}; // industryId -> separator
  for (const ind of rowList(await zcql.executeZCQLQuery(`SELECT ROWID, skuSeparator FROM Industry WHERE ${orgClause(catalyst)}`))) {
    seps[String(ind.ROWID)] = ind.skuSeparator || "";
  }

  const propsByInd = {}; // industryId -> Property[]
  const valsByProp = {}; // propertyId -> PropertyValue[]
  async function props(industryId) {
    if (!propsByInd[industryId]) {
      propsByInd[industryId] = rowList(
        await zcql.executeZCQLQuery(`SELECT * FROM Property WHERE industryId = ${industryId} AND ${orgClause(catalyst)}`),
      ).map(out);
    }
    return propsByInd[industryId];
  }
  async function vals(propertyId) {
    if (!valsByProp[propertyId]) {
      valsByProp[propertyId] = rowList(
        await zcql.executeZCQLQuery(`SELECT * FROM PropertyValue WHERE propertyId = ${propertyId} AND ${orgClause(catalyst)}`),
      ).map(out);
    }
    return valsByProp[propertyId];
  }

  const report = { items: items.length, backfilled: 0, valuesInserted: 0, skipped: [] };

  for (const item of items) {
    const existing = rowList(
      await zcql.executeZCQLQuery(`SELECT ROWID FROM ${TABLE} WHERE skuItemId = ${item.id} AND ${orgClause(catalyst)}`),
    );
    if (existing.length) { report.skipped.push({ id: item.id, reason: "already has values" }); continue; }

    const sep = seps[item.industryId];
    if (!sep) { report.skipped.push({ id: item.id, sku: item.sku, reason: "no separator — cannot split" }); continue; }
    const tokens = new Set(item.sku.split(sep));

    let inserted = 0;
    for (const prop of await props(item.industryId)) {
      if (prop.valueType === "Range") continue;
      const matched = (await vals(prop.id)).filter((v) => v.sku && tokens.has(v.sku));
      if (matched.length !== 1) continue; // 0 = not selected; >1 = ambiguous, skip
      const v = matched[0];
      await table.insertRow({
        skuItemId: String(item.id),
        propertyId: String(prop.id),
        valueId: String(v.id),
        valueText: v.displayValue || v.name,
      });
      inserted++;
    }
    if (inserted) { report.backfilled++; report.valuesInserted += inserted; }
    else report.skipped.push({ id: item.id, sku: item.sku, reason: "no list values matched" });
  }
  return report;
}

/**
 * Build Zoho Books custom_fields for a SKU item from its stored property values:
 * [{ api_name, value }] for every property that has a zohoCfApiName set. Returns []
 * when nothing maps. valueText is already the human display value.
 */
async function buildZohoCustomFields(catalyst, skuItemId) {
  const zcql = catalyst.zcql();
  const vals = rowList(
    await zcql.executeZCQLQuery(`SELECT propertyId, valueText FROM ${TABLE} WHERE skuItemId = ${skuItemId} AND ${orgClause(catalyst)}`),
  ).map(out);
  if (!vals.length) return [];

  const propIds = [...new Set(vals.map((v) => v.propertyId).filter((id) => idOk(id)))];
  if (!propIds.length) return [];
  const props = rowList(
    await zcql.executeZCQLQuery(`SELECT ROWID, zohoCfApiName FROM Property WHERE ROWID IN (${propIds.join(",")})`),
  ).map(out);
  const cfByProp = Object.fromEntries(props.filter((p) => p.zohoCfApiName).map((p) => [String(p.id), p.zohoCfApiName]));

  return vals
    .filter((v) => cfByProp[v.propertyId])
    .map((v) => ({ api_name: cfByProp[v.propertyId], value: v.valueText }));
}

module.exports = { saveItemValues, deleteItemValues, searchItemIds, backfillItemValues, missingRequired, buildZohoCustomFields };
