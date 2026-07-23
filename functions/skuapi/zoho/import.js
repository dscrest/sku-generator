"use strict";
const { rowList, out, idOk, reqOrg, orgClause } = require("../store");
const { isConfigured } = require("./auth");
const { listItems, getItem } = require("./booksApi");

// Auto SKU code for an imported value: first 4 uppercase alphanumerics of the
// text, numeric suffix on collision within the property. Editable later in
// Property Manager.
function autoCode(text, used) {
  const base = String(text).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "VAL";
  let code = base;
  let n = 2;
  while (used.has(code)) code = `${base}${n++}`;
  used.add(code);
  return code;
}

/**
 * Import items from Zoho Books into a chosen industry. Create-only: items already
 * linked locally (by zohoItemId, then by sku) are skipped, never overwritten.
 * For each new item, custom fields whose api_name matches a Property.zohoCfApiName
 * in this industry are reverse-mapped into SKUItemValue. For Manual properties the
 * value is matched (case-insensitive) to a PropertyValue, creating one with an
 * auto-generated SKU code when missing; Range properties stay free-text.
 * ponytail: one detail fetch per imported item to read custom_fields (the list
 * endpoint omits them); fine for the create-only path.
 */
async function importFromBooks(catalyst, industryId) {
  if (!isConfigured()) throw new Error("Zoho not configured");
  if (!idOk(industryId)) throw new Error("Invalid industryId");

  const zcql = catalyst.zcql();
  const ds = catalyst.datastore();

  // The target industry must belong to this org.
  const owned = rowList(await zcql.executeZCQLQuery(`SELECT ROWID FROM Industry WHERE ROWID = ${industryId} AND ${orgClause(catalyst)}`));
  if (!owned.length) throw new Error("Industry not found");

  // Existing links (this org only) — match priority is zohoItemId, then sku.
  const existing = rowList(
    await zcql.executeZCQLQuery(`SELECT sku, zohoItemId FROM SKUItem WHERE ${orgClause(catalyst)}`),
  ).map(out);
  const knownSkus = new Set(existing.map((r) => r.sku));
  const knownZohoIds = new Set(existing.map((r) => r.zohoItemId).filter(Boolean).map(String));

  // This industry's custom-field map: Books api_name -> { id, valueType }.
  const props = rowList(
    await zcql.executeZCQLQuery(
      `SELECT ROWID, zohoCfApiName, valueType FROM Property WHERE industryId = ${industryId} AND ${orgClause(catalyst)}`,
    ),
  ).map(out);
  const mapped = props.filter((p) => p.zohoCfApiName);
  const propByCf = Object.fromEntries(mapped.map((p) => [p.zohoCfApiName, { id: String(p.id), valueType: p.valueType }]));

  // Existing values of the mapped Manual properties, for find-or-create:
  // propertyId -> { byName: Map<lowercased displayValue, valueId>, codes: Set<sku> }.
  const valuesByProp = {};
  for (const p of mapped) {
    if (p.valueType === "Range") continue;
    const vals = rowList(
      await zcql.executeZCQLQuery(`SELECT ROWID, displayValue, sku FROM PropertyValue WHERE propertyId = ${p.id}`),
    ).map(out);
    valuesByProp[String(p.id)] = {
      byName: new Map(vals.map((v) => [String(v.displayValue).toLowerCase(), String(v.id)])),
      codes: new Set(vals.map((v) => v.sku)),
    };
  }

  const books = await listItems(catalyst);
  const report = { total: books.length, imported: 0, skipped: 0, valuesMapped: 0, valuesCreated: 0, errors: [] };

  for (const b of books) {
    const sku = b.sku || "";
    if (knownZohoIds.has(String(b.item_id)) || (sku && knownSkus.has(sku))) { report.skipped++; continue; }
    if (!sku) { report.skipped++; continue; } // a SKU is required locally

    try {
      const row = await ds.table("SKUItem").insertRow({
        name: b.name || sku,
        sku,
        description: b.description || null,
        type: "Trading", // Books has no item-type concept; default, edit later
        industryId: String(industryId),
        zohoItemId: String(b.item_id),
        orgId: reqOrg(catalyst),
      });
      const item = out(row);
      knownSkus.add(sku);
      knownZohoIds.add(String(b.item_id));
      report.imported++;

      // Reverse-map custom fields -> SKUItemValue (detail fetch; list omits them).
      if (Object.keys(propByCf).length) {
        const detail = await getItem(catalyst, b.item_id);
        for (const cf of detail.custom_fields || []) {
          const prop = propByCf[cf.api_name];
          if (!prop || cf.value === undefined || cf.value === null || cf.value === "") continue;
          const text = String(cf.value);

          // Manual properties: link (or create) the PropertyValue for this text.
          let valueId = null;
          const vals = valuesByProp[prop.id];
          if (vals) {
            valueId = vals.byName.get(text.toLowerCase()) || null;
            if (!valueId) {
              const created = await ds.table("PropertyValue").insertRow({
                displayValue: text,
                name: text,
                sku: autoCode(text, vals.codes),
                description: null,
                propertyId: prop.id,
                orgId: reqOrg(catalyst),
              });
              valueId = String(created.ROWID);
              vals.byName.set(text.toLowerCase(), valueId);
              report.valuesCreated++;
            }
          }

          await ds.table("SKUItemValue").insertRow({
            skuItemId: String(item.id),
            propertyId: prop.id,
            valueId,
            valueText: text,
            orgId: reqOrg(catalyst),
          });
          report.valuesMapped++;
        }
      }
    } catch (err) {
      report.errors.push({ sku, message: err.message });
    }
  }
  return report;
}

module.exports = { importFromBooks };
