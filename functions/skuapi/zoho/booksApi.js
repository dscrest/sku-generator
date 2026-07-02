"use strict";
const { getAccessToken, getOrgId } = require("./auth");

const DC = process.env.ZOHO_DC || "com";

async function apiRequest(catalyst, method, path, body) {
  const [accessToken, orgId] = await Promise.all([getAccessToken(catalyst), getOrgId(catalyst)]);
  if (!orgId) throw new Error("Zoho org ID not set. Set ZOHO_ORG_ID or reconnect via /auth/zoho.");

  const sep = path.includes("?") ? "&" : "?";
  const url = `https://www.zohoapis.${DC}/books/v3${path}${sep}organization_id=${orgId}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Zoho Books API error: ${data.message} (code ${data.code})`);
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

async function getOrganizations(catalyst) {
  const accessToken = await getAccessToken(catalyst);
  const res = await fetch(`https://www.zohoapis.${DC}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data = await res.json();
  return data.organizations || [];
}

module.exports = { createItem, updateItem, getOrganizations, listItems, getItem };
