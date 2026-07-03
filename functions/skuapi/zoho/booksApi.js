"use strict";
const { getAccessToken, getOrgId } = require("./auth");

const DC = process.env.ZOHO_DC || "com";

// service: "books" (v3) | "inventory" (v1) — both APIs share auth, org param
// and the { code, message } response envelope.
async function apiRequest(catalyst, method, path, body, service = "books") {
  const [accessToken, orgId] = await Promise.all([getAccessToken(catalyst), getOrgId(catalyst)]);
  if (!orgId) throw new Error("Zoho org ID not set. Set ZOHO_ORG_ID or reconnect via /auth/zoho.");

  const base = service === "inventory" ? `https://www.zohoapis.${DC}/inventory/v1` : `https://www.zohoapis.${DC}/books/v3`;
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
async function createItem(catalyst, name, sku, description, customFields) {
  const data = await apiRequest(catalyst, "POST", "/items", {
    name,
    sku,
    description: description || undefined,
    item_type: "inventory",
    rate: 0,
    custom_fields: customFields && customFields.length ? customFields : undefined,
  });
  return data.item;
}

async function updateItem(catalyst, zohoItemId, name, sku, description, customFields) {
  const body = { name, sku };
  if (description !== undefined) body.description = description;
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

async function getOrganizations(catalyst) {
  const accessToken = await getAccessToken(catalyst);
  const res = await fetch(`https://www.zohoapis.${DC}/books/v3/organizations`, {
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
  getSalesOrder,
  listSalesOrders,
  listPurchaseOrdersForItem,
  getPurchaseOrder,
};
