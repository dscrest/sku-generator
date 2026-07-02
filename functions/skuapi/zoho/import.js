"use strict";
const { rowList, out, idOk, reqOrg, orgClause } = require("../store");
const { isConfigured } = require("./auth");
const { listItems, getItem } = require("./booksApi");

/**
 * Import items from Zoho Books into a chosen industry. Create-only: items already
 * linked locally (by zohoItemId, then by sku) are skipped, never overwritten.
 * For each new item, custom fields whose api_name matches a Property.zohoCfApiName
 * in this industry are reverse-mapped into SKUItemValue (valueText only — there's
 * no PropertyValue ROWID to recover from a free-text Books value).
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

  // This industry's custom-field map: Books api_name -> propertyId.
  const props = rowList(
    await zcql.executeZCQLQuery(
      `SELECT ROWID, zohoCfApiName FROM Property WHERE industryId = ${industryId} AND ${orgClause(catalyst)}`,
    ),
  ).map(out);
  const propByCf = Object.fromEntries(props.filter((p) => p.zohoCfApiName).map((p) => [p.zohoCfApiName, String(p.id)]));

  const books = await listItems(catalyst);
  const report = { total: books.length, imported: 0, skipped: 0, valuesMapped: 0, errors: [] };

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
          const propertyId = propByCf[cf.api_name];
          if (!propertyId || cf.value === undefined || cf.value === null || cf.value === "") continue;
          await ds.table("SKUItemValue").insertRow({
            skuItemId: String(item.id),
            propertyId,
            valueId: null,
            valueText: String(cf.value),
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
