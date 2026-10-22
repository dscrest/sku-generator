"use strict";
const { getAccessToken, getOrgId, dcHosts } = require("./auth");

// Stock account ids by name, resolved per Books org and cached — the id differs
// per org and the app is multi-tenant, so a single env value can't serve every
// connected org.
// ponytail: in-memory cache, warm-instance only; a cold start re-fetches once.
const _stockAccountCache = new Map(); // `${orgId}:${name}` -> account_id | null
async function getStockAccountId(catalyst, accountName) {
  const orgId = await getOrgId(catalyst);
  const key = `${orgId}:${accountName}`;
  if (_stockAccountCache.has(key)) return _stockAccountCache.get(key);
  const data = await apiRequest(catalyst, "GET", "/chartofaccounts");
  const hit = (data.chartofaccounts || []).find(
    (a) => a.account_type === "stock" && String(a.account_name || "").trim().toLowerCase() === accountName.toLowerCase(),
  );
  const id = hit ? String(hit.account_id) : null;
  _stockAccountCache.set(key, id);
  return id;
}
const getFinishedGoodsAccountId = (catalyst) => getStockAccountId(catalyst, "finished goods");

// All stock accounts in the org — the push dialog's Inventory Account dropdown.
async function listStockAccounts(catalyst) {
  const data = await apiRequest(catalyst, "GET", "/chartofaccounts");
  return (data.chartofaccounts || [])
    .filter((a) => a.account_type === "stock")
    .map((a) => ({ id: String(a.account_id), name: a.account_name }));
}

// GST tax id by percentage, resolved per Books org and cached. In the India GST
// edition every transaction *line* needs its own tax (else Books rejects the whole
// doc with 110802 "Specify either a Tax or Tax Exemption or Reverse Charge" — the
// header tax dropdown does not back-fill lines). We look up the org's tax whose
// percentage matches and apply its id to items and PO lines.
// Returns null when the org has no such tax (e.g. a non-GST edition) so callers
// simply omit tax_id and keep working — only India GST orgs need it.
// ponytail: prefers a plain GST "tax" over a "tax_group"; if an org only groups
// its GST, drop the tax_type filter.
// Pure: choose the right GST tax row for a transaction from a Books
// /settings/taxes list already filtered to the target percentage. India GST
// splits by place of supply — inter-state uses a single IGST tax, intra-state
// uses the CGST+SGST *group*. Sending the wrong one is rejected (3032 IGST on
// intrastate / 3033 CGST-SGST on interstate), so pick per direction.
function pickGstTax(taxes, interState) {
  const single = (re) => taxes.find((t) => t.tax_type !== "tax_group" && re.test(t.tax_name || ""));
  if (interState) {
    return single(/igst/i) || single(/gst/i) || taxes.find((t) => t.tax_type !== "tax_group") || taxes[0] || null;
  }
  // Intra-state: the CGST+SGST group; fall back to a non-IGST single GST tax,
  // then anything at the rate.
  return taxes.find((t) => t.tax_type === "tax_group")
    || taxes.find((t) => t.tax_type !== "tax_group" && !/igst/i.test(t.tax_name || "") && /gst/i.test(t.tax_name || ""))
    || taxes.find((t) => t.tax_type !== "tax_group")
    || taxes[0] || null;
}

const _taxIdCache = new Map(); // `${orgId}:${pct}:${dir}` -> tax_id | null
async function getGstTaxId(catalyst, percentage, { interState = false } = {}) {
  const orgId = await getOrgId(catalyst);
  const key = `${orgId}:${percentage}:${interState ? "inter" : "intra"}`;
  if (_taxIdCache.has(key)) return _taxIdCache.get(key);
  let id = null;
  try {
    const data = await apiRequest(catalyst, "GET", "/settings/taxes");
    const taxes = (data.taxes || []).filter((t) => Number(t.tax_percentage) === Number(percentage));
    const hit = pickGstTax(taxes, interState);
    id = hit ? String(hit.tax_id) : null;
  } catch (err) {
    // Missing scope or non-GST org — don't fail the push over tax lookup.
    console.warn(`GST tax lookup failed, sending without line tax: ${err.message}`);
  }
  _taxIdCache.set(key, id);
  return id;
}
// Default tax for item create — a single GST tax (Books auto-bifurcates an
// item's default tax by place of supply on transactions). 110802 fix.
const getDefaultTaxId = (catalyst) => getGstTaxId(catalyst, 18, { interState: true });

// GST state code = first two digits of the GSTIN. Used to tell inter- from
// intra-state so POs carry the correct GST (see createPurchaseOrder).
const _orgStateCache = new Map(); // orgId -> stateCode | null
async function getOrgGstStateCode(catalyst) {
  const orgId = await getOrgId(catalyst);
  if (_orgStateCache.has(orgId)) return _orgStateCache.get(orgId);
  let code = null;
  try {
    const data = await apiRequest(catalyst, "GET", `/organizations/${orgId}`);
    const gstin = (data.organization && (data.organization.gst_no || data.organization.gstin)) || "";
    code = gstin ? String(gstin).slice(0, 2) : null;
  } catch (err) {
    console.warn(`Org GST state lookup failed: ${err.message}`);
  }
  _orgStateCache.set(orgId, code);
  return code;
}
async function getContactGstStateCode(catalyst, contactId) {
  try {
    const data = await apiRequest(catalyst, "GET", `/contacts/${contactId}`);
    const gstin = (data.contact && data.contact.gst_no) || "";
    return gstin ? String(gstin).slice(0, 2) : null;
  } catch (err) {
    console.warn(`Contact GST state lookup failed: ${err.message}`);
    return null;
  }
}

// service: "books" (v3) | "inventory" (v1) — both APIs share auth, org param
// and the { code, message } response envelope.
async function apiRequest(catalyst, method, path, body, service = "books") {
  const [{ accessToken, dc }, orgId] = await Promise.all([getAccessToken(catalyst), getOrgId(catalyst)]);
  if (!orgId) throw new Error("Zoho org ID not set. Set ZOHO_ORG_ID or reconnect via /auth/zoho.");

  const api = dcHosts(dc).api;
  const base = service === "inventory" ? `https://${api}/inventory/v1` : `https://${api}/books/v3`;
  const sep = path.includes("?") ? "&" : "?";
  const url = `${base}${path}${sep}organization_id=${orgId}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (data.code !== 0) {
    const err = new Error(`Zoho ${service} API error: ${data.message} (code ${data.code})`);
    err.zohoCode = data.code;      // 57 = not authorized (e.g. token predates a scope)
    err.httpStatus = res.status;
    throw err;
  }
  return data;
}

// The generated property breakdown goes into both description boxes Books shows on
// an item: `description` (Sales Information) and `purchase_description` (Purchase).
// `customFields` ([{api_name, value}], from Property.zohoCfApiName mappings) go
// into the Books item's custom fields; omitted when empty.
// Tracking method + inventory account are immutable once the item has transactions,
// so they're only set here (create), never in updateItem.
// opts: { tracking: 'none'|'serial'|'batch', inventoryAccountId } from the push
// dialog; defaults (serial + Finished Goods) keep non-dialog paths unchanged.
// ponytail: serial/batch keys are `track_serial_number`/`track_batch_number` per
// Books v3; verify against the org on first live push.
// `extra` (optional): imported Books fields (booksImport.pushableBooksFields
// shape — rate, hsn_or_sac, unit, product_type, item_type, tax_id, ...) spread
// over the defaults so a sheet-supplied value wins; absent keys keep behaving
// exactly as before. custom_fields is applied after the spread — it never
// comes from `extra`.
async function createItem(catalyst, name, sku, description, opts = {}, customFields, extra) {
  const inventoryAccountId = opts.inventoryAccountId || (await getFinishedGoodsAccountId(catalyst));
  const tracking = opts.tracking || "serial";
  // Default tax so India-GST orgs get a line-level tax on every transaction built
  // from this item (null on non-GST orgs → field omitted). See getGstTaxId.
  const taxId = await getDefaultTaxId(catalyst);
  const body = {
    name,
    sku,
    description: description || undefined,
    purchase_description: description || undefined,
    item_type: "inventory",
    product_type: "goods",
    unit: "pcs",
    is_taxable: true,
    tax_id: taxId || undefined,
    track_serial_number: tracking === "serial",
    track_batch_number: tracking === "batch",
    inventory_valuation_method: "fifo",
    inventory_account_id: inventoryAccountId || undefined,
    rate: 0,
    ...(extra || {}),
    custom_fields: customFields && customFields.length ? customFields : undefined,
  };
  // Books rejects inventory-only fields on non-inventory items (sales/purchase-only).
  if (body.item_type !== "inventory") {
    delete body.track_serial_number;
    delete body.track_batch_number;
    delete body.inventory_valuation_method;
    delete body.inventory_account_id;
    delete body.reorder_level;
  }
  const data = await apiRequest(catalyst, "POST", "/items", body);
  return data.item;
}

async function updateItem(catalyst, zohoItemId, name, sku, description, customFields, extra) {
  const body = { name, sku, unit: "pcs", ...(extra || {}) };
  if (description !== undefined) {
    body.description = description;
    body.purchase_description = description;
  }
  if (customFields && customFields.length) body.custom_fields = customFields;
  const data = await apiRequest(catalyst, "PUT", `/items/${zohoItemId}`, body);
  return data.item;
}

// All active items, paged (Books returns 200/page, flags has_more_page).
// ponytail: sequential paging; fine for catalogs in the low thousands.
async function listItems(catalyst) {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await apiRequest(catalyst, "GET", `/items?page=${page}&per_page=200`);
    items.push(...(data.items || []));
    if (!data.page_context || !data.page_context.has_more_page) break;
    page++;
  }
  return items;
}

// Find an existing Books item by exact (case-insensitive) name — used to dedupe
// before creating a property value as a standalone item. Books `search_text`
// matches broadly, so we filter down to an exact name match.
async function findItemByName(catalyst, name) {
  if (!name) return null;
  const data = await apiRequest(catalyst, "GET", `/items?search_text=${encodeURIComponent(name)}&per_page=200`);
  const wanted = String(name).trim().toLowerCase();
  return (data.items || []).find((i) => String(i.name || "").trim().toLowerCase() === wanted) || null;
}

// Typeahead search over the Books catalog — one page is plenty for a picker.
async function searchItems(catalyst, q) {
  const data = await apiRequest(catalyst, "GET", `/items?search_text=${encodeURIComponent(q)}&per_page=50`);
  return data.items || [];
}

// Item categories (CR-223): Books keeps them as a tree (parent_category_id /
// parent_category_name). Cached per org like the stock accounts — the tree
// rarely changes and the configurator asks on every MOC pick.
const _categoryCache = new Map(); // orgId -> categories[]
async function listCategories(catalyst, { fresh = false } = {}) {
  const orgId = await getOrgId(catalyst);
  if (!fresh && _categoryCache.has(orgId)) return _categoryCache.get(orgId);
  const data = await apiRequest(catalyst, "GET", "/categories");
  const list = data.categories || [];
  _categoryCache.set(orgId, list);
  return list;
}

// Items under one category, paged like listItems (CR-286).
async function listItemsByCategory(catalyst, categoryId) {
  const items = [];
  for (let page = 1; ; page++) {
    const data = await apiRequest(catalyst, "GET", `/items?category_id=${encodeURIComponent(categoryId)}&page=${page}&per_page=200`);
    items.push(...(data.items || []));
    if (!data.page_context || !data.page_context.has_more_page) break;
  }
  return items;
}

// Find an existing Books item by exact (case-insensitive) SKU — `search_text`
// matches SKUs too, so one call plus an exact filter suffices.
async function findItemBySku(catalyst, sku) {
  if (!sku) return null;
  const data = await apiRequest(catalyst, "GET", `/items?search_text=${encodeURIComponent(sku)}&per_page=200`);
  const wanted = String(sku).trim().toLowerCase();
  return (data.items || []).find((i) => String(i.sku || "").trim().toLowerCase() === wanted) || null;
}

// Minimal raw-material item for a BOM component (CR-028). Deliberately NOT
// createItem: that one stamps serial tracking and the Finished Goods account —
// all wrong for a component. Uses the Books
// default "Inventory Asset" stock account; if the org lacks it, Books' own
// error names the missing field.
async function createComponentItem(catalyst, name, sku) {
  const inventoryAccountId = await getStockAccountId(catalyst, "inventory asset");
  const data = await apiRequest(catalyst, "POST", "/items", {
    name,
    sku: sku || undefined,
    item_type: "inventory",
    product_type: "goods",
    unit: "pcs",
    rate: 0,
    inventory_account_id: inventoryAccountId || undefined,
  });
  return data.item;
}

// Item detail — the list endpoint omits custom_fields, so import fetches per-item.
async function getItem(catalyst, zohoItemId) {
  const data = await apiRequest(catalyst, "GET", `/items/${zohoItemId}`);
  return data.item;
}

// Books refuses deletion of an item with transactions — that error surfaces
// verbatim to the caller (used by the plain-item → composite migration heal).
async function deleteItem(catalyst, zohoItemId) {
  await apiRequest(catalyst, "DELETE", `/items/${zohoItemId}`);
}

// Custom-field definitions configured on Books items — the source list for the
// property form + mapping view (CR-288). `values` = option names of a dropdown /
// multiselect field (`fields[].values[].name`, proven live), `[]` otherwise.
// `raw` is the field as Books sent it — addCustomFieldOption writes it back.
async function listItemCustomFields(catalyst) {
  const data = await apiRequest(catalyst, "GET", "/settings/fields?entity=item");
  const fields = data.fields || data.customfields || [];
  return fields.map((f) => ({
    customfield_id: f.customfield_id ? String(f.customfield_id) : null,
    api_name: f.api_name,
    label: f.label,
    data_type: f.data_type,
    values: Array.isArray(f.values) ? f.values.map((v) => v.name).filter(Boolean) : [],
    raw: f,
  }));
}

const _loose = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
const OPTION_TYPES = /^(dropdown|multiselect|multi_select|multiselect_dropdown)$/i;
const isOptionField = (f) => !!f && OPTION_TYPES.test(String(f.data_type || ""));

// Append one option to a dropdown custom field (CR-288): `PUT /settings/fields/
// {customfield_id}` with the field as Books sent it plus the new value. ⚠ The
// endpoint is undocumented — shape taken from the Books UI; a refusal surfaces
// as the Books error text (callers treat it as best-effort). No-op when an
// option already matches loosely (case + whitespace): Books rejects duplicates.
async function addCustomFieldOption(catalyst, field, name) {
  const want = String(name || "").trim();
  if (!want) return { added: false };
  if (!isOptionField(field)) throw new Error(`Books field ${field && field.api_name} is not a dropdown`);
  if (field.values.some((v) => _loose(v) === _loose(want))) return { added: false, exists: true };
  const raw = field.raw || {};
  const values = [...(raw.values || []), { name: want, order: (raw.values || []).length + 1 }];
  await apiRequest(catalyst, "PUT", `/settings/fields/${field.customfield_id}`, { ...raw, values });
  field.values.push(want);
  return { added: true };
}

// Manufacturer master (Books → Settings → Items → Manufacturers), names only —
// the dropdown source for the org-wise Manufacturer item field (CR-210).
// Probed live on Fotedar (CR-231): undocumented `GET /books/v3/manufacturers`
// → { manufacturers: [{ manufacturer_id, name, address }] }. `/settings/
// manufacturers` is 404 on both APIs and Inventory v1 is refused outright
// (6018) for Books-only orgs, so Books v3 only. Also present as
// `manufacturers[].manufacturer` (+ `brands[]`) on `GET /books/v3/items/editpage`.
const _manufacturerCache = new Map(); // orgId -> { at, names }
async function listManufacturers(catalyst) {
  const orgId = await getOrgId(catalyst);
  const hit = _manufacturerCache.get(orgId);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.names;
  const data = await apiRequest(catalyst, "GET", "/manufacturers");
  const names = (data.manufacturers || []).map((m) => m.name || m.manufacturer).filter(Boolean);
  _manufacturerCache.set(orgId, { at: Date.now(), names });
  return names;
}

// ---- reserve add-on reads ----

async function getSalesOrder(catalyst, soId) {
  const data = await apiRequest(catalyst, "GET", `/salesorders/${soId}`);
  return data.salesorder;
}

// The org's "Work Order No and Date" SO custom field (CR-173): carries the
// active WO on that SO. Uses the custom-fields endpoint so a confirmed/invoiced
// SO is otherwise untouched. Books docs (CR-247): the path is the SINGULAR
// `/salesorder/{id}/customfields` and the body a bare array — the plural path
// is "Invalid URL Passed (code 5)". If Books still refuses the body shape, the
// plain SO update with `custom_fields` is the fallback.
//
// CR-268: the field is the org's own — MSUN's Books has it, Ricon's does not.
// Books answers 120138 ("custom field … doesnot exist") for an org without it;
// that org simply does not use the stamp, so it is skipped, not reported.
// ponytail: in-memory, warm-instance only — a field added in Books later is
// picked up on the next cold start. Per-org setting if an org names it differently.
const SO_WO_CF = "cf_work_order_no_and_date";
const NO_SUCH_CF = 120138;
const _noWoCf = new Set(); // Books org ids without the field
async function stampWith(request, orgId, soId, value) {
  if (_noWoCf.has(orgId)) return;
  const cf = { api_name: SO_WO_CF, value: String(value ?? "") };
  try {
    try {
      await request("PUT", `/salesorder/${soId}/customfields`, [cf]);
    } catch (err) {
      // not authorized / no such field — the fallback would fail the same way
      if (err.zohoCode === 57 || err.zohoCode === NO_SUCH_CF) throw err;
      await request("PUT", `/salesorders/${soId}`, { custom_fields: [cf] });
    }
  } catch (err) {
    if (err.zohoCode !== NO_SUCH_CF) throw err;
    _noWoCf.add(orgId);
  }
}
async function stampSalesOrderWo(catalyst, soId, value) {
  const request = (method, path, body) => apiRequest(catalyst, method, path, body);
  return stampWith(request, await getOrgId(catalyst), soId, value);
}

// Invoice detail (packing-list widget: resolves the linked SO for line items).
async function getInvoice(catalyst, invoiceId) {
  const data = await apiRequest(catalyst, "GET", `/invoices/${invoiceId}`);
  return data.invoice;
}

// The 50 most recent SOs (optionally number-searched). Confirmed-only gating is
// done by the caller on the status field — Zoho's salesorders filter_by enum
// silently matches nothing for Status.Confirmed, so it can't be used here.
async function listSalesOrders(catalyst, q) {
  const search = q ? `&salesorder_number_contains=${encodeURIComponent(q)}` : "";
  const data = await apiRequest(catalyst, "GET", `/salesorders?per_page=50&sort_column=date&sort_order=D${search}`);
  return data.salesorders || [];
}

// POs that contain an item (header rows only — line quantities need the detail).
async function listPurchaseOrdersForItem(catalyst, itemId) {
  const data = await apiRequest(catalyst, "GET", `/purchaseorders?item_id=${itemId}`);
  return data.purchaseorders || [];
}

// Every PO in the Books org (header rows) — the app's Orders grid (CR-020).
async function listPurchaseOrders(catalyst) {
  const pos = [];
  let page = 1;
  for (;;) {
    const data = await apiRequest(catalyst, "GET", `/purchaseorders?page=${page}&per_page=200`);
    pos.push(...(data.purchaseorders || []));
    if (!data.page_context || !data.page_context.has_more_page) break;
    page++;
  }
  return pos;
}

async function getPurchaseOrder(catalyst, poId) {
  const data = await apiRequest(catalyst, "GET", `/purchaseorders/${poId}`);
  return data.purchaseorder;
}

// ---- work-order add-on ----

// Vendors for the Purchase Request screen (BRD §6.6: a vendor must be picked
// per item before confirm).
async function listVendors(catalyst) {
  const vendors = [];
  let page = 1;
  for (;;) {
    const data = await apiRequest(catalyst, "GET", `/contacts?contact_type=vendor&page=${page}&per_page=200`);
    vendors.push(...(data.contacts || []));
    if (!data.page_context || !data.page_context.has_more_page) break;
    page++;
  }
  // Only active vendors: an inactive contact is rejected at PO time with the
  // misleading "The Customer is inactive" (code 3021), so never offer one.
  return vendors
    .filter((v) => v.status === "active")
    .map((v) => ({ id: String(v.contact_id), name: v.contact_name, status: v.status }));
}

/**
 * One draft PO per vendor (BRD FR-PRQ-001). Required lines are tagged with the
 * originating Sales Order; delivery goes to the Main warehouse (CR-170) so the
 * received stock is reservable from the grid.
 *
 * lines: [{ rmItemId, name?, qty, rate?, description?, soId? }] — soId lands on the
 * line's cf_so_no item custom field so each line names its Sales Order. The
 * field is a LOOKUP to Sales Orders: the value must be the salesorder_id, a
 * plain SO number string is silently dropped by Zoho.
 */
async function createPurchaseOrder(catalyst, { vendorId, date, referenceNumber, warehouseId, lines, notes }) {
  // India GST edition rejects a line without its own tax (110802); the header tax
  // does not back-fill lines. It also rejects the wrong GST direction — IGST on an
  // intrastate PO (3032) or CGST+SGST on an interstate one (3033) — so pick by the
  // vendor's state vs the org's. Unknown (missing GSTIN) → intra, the common
  // local-vendor case and the reported failure.
  const [orgState, vendorState] = await Promise.all([
    getOrgGstStateCode(catalyst),
    getContactGstStateCode(catalyst, vendorId),
  ]);
  const interState = !!(orgState && vendorState && orgState !== vendorState);
  const body = (taxId, withCfs = true) => ({
    vendor_id: String(vendorId),
    date,
    // The SO number, so the PO is traceable back to the project from Books.
    reference_number: referenceNumber || undefined,
    // Draft: the org's own approval process takes over from here (§6.6.6).
    status: "draft",
    notes: notes || undefined,
    // This Books org tracks locations at Item level, so the delivery location
    // rides on each line item as location_id — a header location_id is rejected
    // ("cannot associate an Item-Level location at a transaction level", code
    // 27520). Our warehouse settings are location ids (see listWarehouses /
    // createTransferOrder). ponytail: item-level only; if a transaction-level
    // org ever connects, move location_id back to the header for it.
    line_items: lines.map((l) => ({
      item_id: String(l.rmItemId),
      // Books can leave the display name blank when only item_id is sent —
      // pass the item name explicitly (and mirror it into the description in
      // createPoForLines) so the PO line is readable.
      name: l.name || undefined,
      quantity: Number(l.qty) || 0,
      rate: l.rate === undefined || l.rate === null ? undefined : Number(l.rate),
      description: l.description || undefined,
      location_id: warehouseId ? String(warehouseId) : undefined,
      tax_id: taxId || undefined,
      // SO per line via the org's cf_so_no item custom field (SO lookup — value
      // is the salesorder_id). Orgs lacking the field get a retry without CFs
      // below — a missing field must not block a PO.
      item_custom_fields: withCfs && l.soId
        ? [{ api_name: "cf_so_no", value: String(l.soId) }]
        : undefined,
    })),
  });
  const hasCfs = lines.some((l) => l.soId);
  const post = async (withCfs) => {
    try {
      return await apiRequest(catalyst, "POST", "/purchaseorders",
        body(await getGstTaxId(catalyst, 18, { interState }), withCfs));
    } catch (err) {
      // Books decides place of supply from the vendor's address; our GSTIN-only
      // guess can point the wrong way (a vendor with no GSTIN reads as intra).
      // 3032 = needs IGST, 3033 = needs CGST+SGST — retry once, flipped.
      if (err.zohoCode !== 3032 && err.zohoCode !== 3033) throw err;
      return apiRequest(catalyst, "POST", "/purchaseorders",
        body(await getGstTaxId(catalyst, 18, { interState: err.zohoCode === 3032 }), withCfs));
    }
  };
  let data;
  try {
    data = await post(true);
  } catch (err) {
    if (!hasCfs) throw err;
    data = await post(false);
  }
  return data.purchaseorder;
}

// PUT replaces the PO wholesale — callers must echo back every line they keep
// (see purchase.js poPutBody), or Books drops rate/warehouse/description.
async function updatePurchaseOrder(catalyst, poId, body) {
  const data = await apiRequest(catalyst, "PUT", `/purchaseorders/${poId}`, body);
  return data.purchaseorder;
}

async function deletePurchaseOrder(catalyst, poId) {
  await apiRequest(catalyst, "DELETE", `/purchaseorders/${poId}`);
}

// status: "issued" | "cancelled" — Books enforces what transitions are legal.
async function setPurchaseOrderStatus(catalyst, poId, status) {
  await apiRequest(catalyst, "POST", `/purchaseorders/${poId}/status/${status}`);
}

async function getOrganizations(catalyst) {
  const { accessToken, dc } = await getAccessToken(catalyst);
  const res = await fetch(`https://${dcHosts(dc).api}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data = await res.json();
  return data.organizations || [];
}

// Books item weight → kg. A "Weight" custom field wins (label match like
// bom.itemSize; value "205 kg" / "500 g" / 205), else the built-in package
// weight. Lived in routes/packing until CR-285 made purchase share it.
const KG_PER = { g: 0.001, gm: 0.001, gms: 0.001, lb: 0.45359, lbs: 0.45359, oz: 0.02835 };
function weightKg(item) {
  const cf = ((item && item.custom_fields) || []).find((c) => /^weight\b/i.test(String(c.label || "").trim()));
  if (cf && cf.value != null && cf.value !== "") {
    const m = String(cf.value).trim().match(/^([\d.]+)\s*([a-z]*)/i);
    if (m) return (Number(m[1]) || 0) * (KG_PER[m[2].toLowerCase()] || 1);
  }
  const pd = (item && item.package_details) || {};
  return (Number(pd.weight) || 0) * (KG_PER[String(pd.weight_unit || "").toLowerCase()] || 1);
}

// CR-285 (MSUN): a raw material flagged "Unit Conversion Item" is bought as its
// "Convert Item", qty × weight. Both custom fields matched by label, like
// weightKg. The lookup's `value` is either the Books item id or the display
// name ("SG Iron-(Pcs)") — resolveConvertItem settles whichever it is.
function itemConversion(item) {
  const cfs = (item && item.custom_fields) || [];
  const lbl = (c) => String(c.label || "").trim();
  const flag = cfs.find((c) => /^unit conversion/i.test(lbl(c)));
  const on = !!flag && (flag.value === true || String(flag.value).trim().toLowerCase() === "true");
  const look = cfs.find((c) => /^convert item/i.test(lbl(c)));
  const raw = look && look.value != null ? String(look.value).trim() : "";
  const isId = /^\d{15,}$/.test(raw);
  return {
    on,
    convertItemId: isId ? raw : "",
    convertItemName: isId ? String((look && look.value_formatted) || "").trim() : raw,
    weight: weightKg(item),
  };
}

// Name → id when the lookup gave only the display name; id → name when it gave
// only the id. The "-(unit)" suffix Books appends is not part of the item name.
async function resolveConvertItem(catalyst, conv) {
  if (conv.convertItemId) {
    if (conv.convertItemName) return conv;
    const it = await getItem(catalyst, conv.convertItemId).catch(() => null);
    return { ...conv, convertItemName: it ? String(it.name || "") : conv.convertItemId };
  }
  if (!conv.convertItemName) return conv;
  const name = conv.convertItemName.replace(/\s*-\s*\([^)]*\)\s*$/, "").trim();
  const items = await searchItems(catalyst, name);
  const hit = items.find((i) => String(i.name || "").trim().toLowerCase() === name.toLowerCase())
    || (items.length === 1 ? items[0] : null);
  return hit ? { ...conv, convertItemId: String(hit.item_id), convertItemName: String(hit.name || name) } : conv;
}

module.exports = {
  apiRequest,
  getStockAccountId,
  listStockAccounts,
  createItem,
  updateItem,
  getOrganizations,
  listItems,
  searchItems,
  listCategories,
  listItemsByCategory,
  findItemByName,
  findItemBySku,
  createComponentItem,
  getItem,
  deleteItem,
  listItemCustomFields,
  addCustomFieldOption,
  isOptionField,
  weightKg,
  itemConversion,
  resolveConvertItem,
  listManufacturers,
  getSalesOrder,
  stampSalesOrderWo,
  SO_WO_CF,
  getInvoice,
  listSalesOrders,
  listPurchaseOrdersForItem,
  listPurchaseOrders,
  getPurchaseOrder,
  listVendors,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  setPurchaseOrderStatus,
  pickGstTax,
  getGstTaxId,
};

// ponytail self-check: `node functions/skuapi/zoho/booksApi.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  const taxes = [
    { tax_id: "1", tax_name: "IGST18", tax_type: "tax", tax_percentage: 18 },
    { tax_id: "2", tax_name: "GST18", tax_type: "tax_group", tax_percentage: 18 },
  ];
  // Intra-state → the CGST+SGST group (fixes IGST-on-intrastate, code 3032).
  assert.strictEqual(pickGstTax(taxes, false).tax_id, "2");
  // Inter-state → the single IGST tax.
  assert.strictEqual(pickGstTax(taxes, true).tax_id, "1");
  // Only IGST configured → intra still returns something (never null when a rate
  // matches) so the line always carries a tax (avoids 110802).
  assert.strictEqual(pickGstTax([taxes[0]], false).tax_id, "1");
  assert.strictEqual(pickGstTax([], false), null);

  // SO WO stamp (CR-268): an org without the field is skipped quietly and not
  // asked again; any other Books error still surfaces.
  (async () => {
    const zohoErr = (code) => Object.assign(new Error(`code ${code}`), { zohoCode: code });
    let calls = 0;
    const noField = async () => { calls += 1; throw zohoErr(NO_SUCH_CF); };
    await stampWith(noField, "ricon", "so1", "WO-1");
    assert.strictEqual(calls, 1, "no such field → no fallback call");
    await stampWith(noField, "ricon", "so1", "WO-1");
    assert.strictEqual(calls, 1, "org remembered → no Books call at all");

    // First endpoint refuses the body, the fallback finds no field → still quiet.
    const paths = [];
    await stampWith(async (_m, path) => { paths.push(path); throw zohoErr(paths.length === 1 ? 5 : NO_SUCH_CF); }, "ricon2", "so1", "WO-1");
    assert.strictEqual(paths.length, 2, "other error → fallback tried");

    const sent = [];
    await stampWith(async (...a) => { sent.push(a); }, "msun", "so9", "WO-7 / 01/09/2026");
    assert.deepStrictEqual(sent, [["PUT", "/salesorder/so9/customfields", [{ api_name: SO_WO_CF, value: "WO-7 / 01/09/2026" }]]]);

    await assert.rejects(stampWith(async () => { throw zohoErr(57); }, "msun", "so9", "x"), /code 57/, "not authorized still throws");
    await assert.rejects(stampWith(async () => { throw zohoErr(1002); }, "msun", "so9", "x"), /code 1002/, "other errors still throw");
    console.log("zoho/booksApi.js self-check passed");
  })();
}
