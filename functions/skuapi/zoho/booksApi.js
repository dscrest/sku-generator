"use strict";
const { getAccessToken, getOrgId, dcHosts } = require("./auth");

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

// customFields: [{ api_name, value }] — property values destined for Books item custom fields.
// The generated property breakdown goes into both description boxes Books shows on
// an item: `description` (Sales Information) and `purchase_description` (Purchase).
async function createItem(catalyst, name, sku, description, customFields) {
  const data = await apiRequest(catalyst, "POST", "/items", {
    name,
    sku,
    description: description || undefined,
    purchase_description: description || undefined,
    item_type: "inventory",
    rate: 0,
    custom_fields: customFields && customFields.length ? customFields : undefined,
  });
  return data.item;
}

async function updateItem(catalyst, zohoItemId, name, sku, description, customFields) {
  const body = { name, sku };
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
  return vendors.map((v) => ({ id: String(v.contact_id), name: v.contact_name, status: v.status }));
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
    line_items: lines.map((l) => ({
      item_id: String(l.rmItemId),
      quantity: Number(l.qty) || 0,
      rate: l.rate === undefined || l.rate === null ? undefined : Number(l.rate),
      description: l.description || undefined,
      warehouse_id: warehouseId ? String(warehouseId) : undefined,
    })),
  });
  return data.purchaseorder;
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
  getItem,
  listItemCustomFields,
  getSalesOrder,
  listSalesOrders,
  listPurchaseOrdersForItem,
  getPurchaseOrder,
};
