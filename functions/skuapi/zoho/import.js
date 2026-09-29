"use strict";
const { rowList, out, idOk, reqOrg, orgClause } = require("../store");
const { isConfigured } = require("./auth");
const { listItems, getItem } = require("./booksApi");
const { listCompositeItems } = require("./inventoryApi");
const { mergeBooksData } = require("../itemFields");

// Books `product_type` (goods / service) kept on the item (CR-254): the
// Components page files a service under Associated Services, like Books.
const typeData = (b) => mergeBooksData(null, { product_type: b.product_type || "" });

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
        booksData: typeData(b),
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

/**
 * Refresh the SKU master from Zoho Books (CR-226). Books is the truth: every
 * Books item with a SKU is matched locally (zohoItemId, then sku) and its
 * name / sku / zohoItemId re-synced; composites become Manufacturing (never
 * demoted); unmatched items are created in `industryId`. Items without a SKU
 * are skipped. Custom fields are not re-mapped (that is the import's job).
 * ponytail: sequential updateRow; ≤ ~300 changed rows per run before the
 * 30 s function limit — a Catalyst Job if a catalog ever needs more.
 */
async function refreshFromBooks(catalyst, industryId) {
  if (!isConfigured()) throw new Error("Zoho not configured");
  if (!idOk(industryId)) throw new Error("Invalid industryId");
  const zcql = catalyst.zcql();
  const ds = catalyst.datastore();
  const owned = rowList(await zcql.executeZCQLQuery(`SELECT ROWID FROM Industry WHERE ROWID = ${industryId} AND ${orgClause(catalyst)}`));
  if (!owned.length) throw new Error("Industry not found");

  const local = rowList(await zcql.executeZCQLQuery(`SELECT ROWID, sku, name, type, zohoItemId, booksData FROM SKUItem WHERE ${orgClause(catalyst)}`)).map(out);
  const byZoho = new Map(local.filter((r) => r.zohoItemId).map((r) => [String(r.zohoItemId), r]));
  const bySku = new Map(local.filter((r) => r.sku).map((r) => [String(r.sku).trim().toLowerCase(), r]));
  const [books, composites] = await Promise.all([listItems(catalyst), listCompositeItems(catalyst)]);
  const compositeIds = new Set(composites.map((c) => String(c.composite_item_id)));
  const report = { total: books.length, updated: 0, created: 0, composites: 0, skipped: 0, errors: [] };

  for (const b of books) {
    const sku = String(b.sku || "").trim();
    if (!sku) { report.skipped++; continue; }
    const zid = String(b.item_id);
    const isComposite = compositeIds.has(zid);
    if (isComposite) report.composites++;
    try {
      const row = byZoho.get(zid) || bySku.get(sku.toLowerCase());
      if (row) {
        const patch = {};
        if ((b.name || sku) !== row.name) patch.name = b.name || sku;
        if (sku !== row.sku) patch.sku = sku;
        if (!row.zohoItemId) patch.zohoItemId = zid;
        if (isComposite && row.type !== "Manufacturing") patch.type = "Manufacturing";
        if (b.product_type && !String(row.booksData || "").includes('"product_type"')) patch.booksData = mergeBooksData(row.booksData, { product_type: b.product_type });
        if (Object.keys(patch).length) { await ds.table("SKUItem").updateRow({ ROWID: row.id, ...patch }); report.updated++; }
      } else {
        const created = out(await ds.table("SKUItem").insertRow({
          name: b.name || sku, sku, description: b.description || null, type: isComposite ? "Manufacturing" : "Trading",
          industryId: String(industryId), zohoItemId: zid, booksData: typeData(b), orgId: reqOrg(catalyst),
        }));
        byZoho.set(zid, created);
        bySku.set(sku.toLowerCase(), created);
        report.created++;
      }
    } catch (err) {
      report.errors.push({ sku, message: err.message });
    }
  }
  return report;
}

// Books composites vs the org's SKU master (CR-264). Pure. Match by zohoItemId,
// then SKU — the order refreshFromBooks uses. A matched row is promoted to
// Manufacturing (never demoted); an unknown composite becomes a new row.
// `matched` and `inserts` together are the list, in Books order.
function planCompositeSync(composites, localRows) {
  const byZoho = new Map(localRows.filter((r) => r.zohoItemId).map((r) => [String(r.zohoItemId), r]));
  const bySku = new Map(localRows.filter((r) => r.sku).map((r) => [String(r.sku).trim().toLowerCase(), r]));
  const plan = { updates: [], inserts: [], matched: [] };
  const seen = new Set();
  for (const c of composites) {
    if (String(c.status || "").toLowerCase() === "inactive") continue;
    const zid = String(c.composite_item_id);
    const sku = String(c.sku || "").trim() || String(c.name || "").trim();
    if (!sku || seen.has(zid)) continue;
    seen.add(zid);
    const row = byZoho.get(zid) || bySku.get(sku.toLowerCase());
    if (!row) {
      plan.inserts.push({ name: c.name || sku, sku, type: "Manufacturing", zohoItemId: zid, booksData: typeData(c) });
      continue;
    }
    const patch = {};
    if (row.type !== "Manufacturing") patch.type = "Manufacturing";
    if (!row.zohoItemId) patch.zohoItemId = zid;
    if (Object.keys(patch).length) plan.updates.push({ id: String(row.id), patch });
    plan.matched.push({ id: String(row.id), sku: row.sku, name: row.name });
  }
  return plan;
}

/**
 * The Books org's active composite items as SKU-master rows — the Product
 * Design form's Main product list (CR-264). Writes only what Books changed.
 * ponytail: sequential writes; a first run over a few hundred composites
 * needs a Catalyst Job (30 s function limit).
 */
async function syncComposites(catalyst, orgId) {
  if (!isConfigured()) throw new Error("Zoho not configured");
  const ds = catalyst.datastore();
  const composites = await listCompositeItems(catalyst);
  const local = rowList(await catalyst.zcql().executeZCQLQuery(`SELECT ROWID, sku, name, type, zohoItemId FROM SKUItem WHERE ${orgClause(catalyst)}`)).map(out);
  const plan = planCompositeSync(composites, local);
  for (const u of plan.updates) await ds.table("SKUItem").updateRow({ ROWID: u.id, ...u.patch });
  const list = [...plan.matched];
  if (plan.inserts.length) {
    // same landing rule as the service-item create (CR-254)
    const industries = rowList(await catalyst.zcql().executeZCQLQuery(`SELECT ROWID, name FROM Industry WHERE ${orgClause(catalyst)}`)).map(out);
    const ind = industries.find((i) => /books items/i.test(i.name || "")) || industries[0];
    for (const it of ind ? plan.inserts : []) {
      const row = out(await ds.table("SKUItem").insertRow({ ...it, description: null, industryId: String(ind.id), orgId }));
      list.push({ id: String(row.id), sku: it.sku, name: it.name });
    }
  }
  return list.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}

module.exports = { importFromBooks, refreshFromBooks, autoCode, planCompositeSync, syncComposites };

// ponytail self-check: `node functions/skuapi/zoho/import.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const local = [
    { id: "1", sku: "RAVB 150 S", name: "RAVB 150 S", type: "Trading", zohoItemId: "900" },
    { id: "2", sku: "ravh 100", name: "RAVH 100", type: "Trading", zohoItemId: null },
    { id: "3", sku: "OK", name: "Ok", type: "Manufacturing", zohoItemId: "902" },
  ];
  const plan = planCompositeSync([
    { composite_item_id: 900, name: "RAVB 150 S", sku: "RAVB 150 S", status: "active" },
    { composite_item_id: 901, name: "RAVH 100", sku: " RAVH 100 " },
    { composite_item_id: 902, name: "Ok", sku: "OK" },
    { composite_item_id: 903, name: "DHIRAJ COMP 1", sku: "" },
    { composite_item_id: 904, name: "Old", sku: "OLD", status: "inactive" },
    { composite_item_id: 903, name: "DHIRAJ COMP 1", sku: "" },
  ], local);
  assert.deepStrictEqual(plan.updates, [
    { id: "1", patch: { type: "Manufacturing" } },
    { id: "2", patch: { type: "Manufacturing", zohoItemId: "901" } },
  ]);
  assert.deepStrictEqual(plan.matched.map((m) => m.id), ["1", "2", "3"]);
  assert.strictEqual(plan.inserts.length, 1);
  assert.deepStrictEqual(
    { ...plan.inserts[0], booksData: undefined },
    { name: "DHIRAJ COMP 1", sku: "DHIRAJ COMP 1", type: "Manufacturing", zohoItemId: "903", booksData: undefined },
  );
  console.log("import selftest ok");
}
