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
// Custom fields are never pushed — the client maintains them in Books by hand.
// Tracking method + inventory account are immutable once the item has transactions,
// so they're only set here (create), never in updateItem.
// opts: { tracking: 'none'|'serial'|'batch', inventoryAccountId } from the push
// dialog; defaults (serial + Finished Goods) keep non-dialog paths unchanged.
// ponytail: serial/batch keys are `track_serial_number`/`track_batch_number` per
// Books v3; verify against the org on first live push.
async function createItem(catalyst, name, sku, description, opts = {}) {
  const inventoryAccountId = opts.inventoryAccountId || (await getFinishedGoodsAccountId(catalyst));
  const tracking = opts.tracking || "serial";
  // Default tax so India-GST orgs get a line-level tax on every transaction built
  // from this item (null on non-GST orgs → field omitted). See getGstTaxId.
  const taxId = await getDefaultTaxId(catalyst);
  const data = await apiRequest(catalyst, "POST", "/items", {
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
  });
  return data.item;
}

async function updateItem(catalyst, zohoItemId, name, sku, description) {
  const body = { name, sku, unit: "pcs" };
  if (description !== undefined) {
    body.description = description;
    body.purchase_description = description;
  }
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
// field-mapping screen.
async function listItemCustomFields(catalyst) {
  const data = await apiRequest(catalyst, "GET", "/settings/fields?entity=item");
  const fields = data.fields || data.customfields || [];
  return fields.map((f) => ({ api_name: f.api_name, label: f.label, data_type: f.data_type }));
}

// ---- reserve add-on reads ----

async function getSalesOrder(catalyst, soId) {
  const data = await apiRequest(catalyst, "GET", `/salesorders/${soId}`);
  return data.salesorder;
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
 * One draft PO per vendor (BRD FR-PRQ-001). Every line is tagged with the
 * originating Sales Order and delivered into the Reserve warehouse, so received
 * stock lands already allocated to the project.
 *
 * lines: [{ rmItemId, qty, rate?, description?, soId? }] — soId lands on the
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

module.exports = {
  apiRequest,
  getStockAccountId,
  listStockAccounts,
  createItem,
  updateItem,
  getOrganizations,
  listItems,
  searchItems,
  findItemByName,
  findItemBySku,
  createComponentItem,
  getItem,
  deleteItem,
  listItemCustomFields,
  getSalesOrder,
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
  console.log("zoho/booksApi.js self-check passed");
}
