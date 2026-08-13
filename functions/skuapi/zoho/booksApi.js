"use strict";
const { getAccessToken, getOrgId, dcHosts } = require("./auth");

// Finished Goods inventory account id, resolved per Books org (account named
// "Finished Goods", type "stock") and cached — the id differs per org and the app
// is multi-tenant, so a single env value can't serve every connected org.
// ponytail: in-memory cache, warm-instance only; a cold start re-fetches once.
const _fgAccountCache = new Map(); // orgId -> account_id | null
async function getFinishedGoodsAccountId(catalyst) {
  const orgId = await getOrgId(catalyst);
  if (_fgAccountCache.has(orgId)) return _fgAccountCache.get(orgId);
  const data = await apiRequest(catalyst, "GET", "/chartofaccounts");
  const fg = (data.chartofaccounts || []).find(
    (a) => a.account_type === "stock" && String(a.account_name || "").trim().toLowerCase() === "finished goods",
  );
  const id = fg ? String(fg.account_id) : null;
  _fgAccountCache.set(orgId, id);
  return id;
}

// api_name -> [option label] for item dropdown custom fields, cached per org.
const _itemCfOptionsCache = new Map(); // orgId -> Map(api_name -> string[])
async function getItemCfOptions(catalyst) {
  const orgId = await getOrgId(catalyst);
  if (_itemCfOptionsCache.has(orgId)) return _itemCfOptionsCache.get(orgId);
  const data = await apiRequest(catalyst, "GET", "/settings/fields?entity=item");
  const fields = data.fields || data.customfields || [];
  const map = new Map();
  for (const f of fields) {
    if (f.api_name && Array.isArray(f.values) && f.values.length) {
      map.set(f.api_name, f.values.map((v) => v.name).filter(Boolean));
    }
  }
  _itemCfOptionsCache.set(orgId, map);
  return map;
}

// Books rejects a dropdown value that isn't byte-identical to an option, and options
// already used by transactions can't be renamed to match — so map each pushed value
// to the exact option label, matched loosely (case + all whitespace ignored). This
// keeps app data clean while absorbing Books' label quirks (typos, stray spaces).
// Unmatched or ambiguous values pass through unchanged so Books surfaces a real error
// rather than us silently sending the wrong option.
const _loose = (s) => String(s).toLowerCase().replace(/\s+/g, "");
async function normalizeCustomFields(catalyst, customFields) {
  if (!customFields || !customFields.length) return customFields;
  const options = await getItemCfOptions(catalyst);
  return customFields.map((cf) => {
    const opts = options.get(cf.api_name);
    if (!opts || opts.includes(cf.value)) return cf; // non-dropdown, or already exact
    const hit = opts.filter((o) => _loose(o) === _loose(cf.value));
    return hit.length === 1 ? { ...cf, value: hit[0] } : cf;
  });
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

// §3 constants (field-mapping spec). Books custom-field *default values* only fire on
// UI creation, not API create, so we push these explicitly. Values must equal the
// dropdown option labels exactly ("In-House", not "In-house").
const ITEM_DEFAULT_CFS = [
  { api_name: "cf_item_type", value: "Finished Goods" },
  { api_name: "cf_item_criticality", value: "Critical" },
  { api_name: "cf_item_source", value: "In-House Manufacturing" },
];

// customFields: [{ api_name, value }] — property values destined for Books item custom fields.
// The generated property breakdown goes into both description boxes Books shows on
// an item: `description` (Sales Information) and `purchase_description` (Purchase).
// Field-mapping spec defaults: §1 Units=Pcs, §2 Inventory Tracking (serial + Finished
// Goods + FIFO), §3 constants (ITEM_DEFAULT_CFS), §4 params ride in `customFields`.
// Tracking method + inventory account are immutable once the item has transactions,
// so they're only set here (create), never in updateItem.
// ponytail: serial key is `track_serial_number` per Books v3; verify against the org
// on first live push and adjust if the response omits it.
async function createItem(catalyst, name, sku, description, customFields) {
  const inventoryAccountId = await getFinishedGoodsAccountId(catalyst);
  const cfs = await normalizeCustomFields(catalyst, [...ITEM_DEFAULT_CFS, ...(customFields || [])]);
  const data = await apiRequest(catalyst, "POST", "/items", {
    name,
    sku,
    description: description || undefined,
    purchase_description: description || undefined,
    item_type: "inventory",
    product_type: "goods",
    unit: "pcs",
    track_serial_number: true,
    inventory_valuation_method: "fifo",
    inventory_account_id: inventoryAccountId || undefined,
    rate: 0,
    custom_fields: cfs,
  });
  return data.item;
}

async function updateItem(catalyst, zohoItemId, name, sku, description, customFields) {
  const body = { name, sku, unit: "pcs" };
  if (description !== undefined) {
    body.description = description;
    body.purchase_description = description;
  }
  if (customFields && customFields.length) body.custom_fields = await normalizeCustomFields(catalyst, customFields);
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

// Item detail — the list endpoint omits custom_fields, so import fetches per-item.
async function getItem(catalyst, zohoItemId) {
  const data = await apiRequest(catalyst, "GET", `/items/${zohoItemId}`);
  return data.item;
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

async function listSalesOrders(catalyst, q) {
  const filter = q ? `&salesorder_number_contains=${encodeURIComponent(q)}` : "";
  const data = await apiRequest(catalyst, "GET", `/salesorders?per_page=50&sort_column=date&sort_order=D${filter}`);
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
 * lines: [{ rmItemId, qty, rate?, description? }]
 */
async function createPurchaseOrder(catalyst, { vendorId, date, referenceNumber, warehouseId, lines, notes }) {
  const data = await apiRequest(catalyst, "POST", "/purchaseorders", {
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
    })),
  });
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
  createItem,
  updateItem,
  getOrganizations,
  listItems,
  findItemByName,
  getItem,
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
};
