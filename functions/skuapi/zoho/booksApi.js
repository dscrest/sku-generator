"use strict";
const { getAccessToken, getOrgId } = require("./auth");

const DC = process.env.ZOHO_DC || "com";

async function apiRequest(catalyst, method, path, body) {
  const [accessToken, orgId] = await Promise.all([getAccessToken(catalyst), getOrgId(catalyst)]);
  if (!orgId) throw new Error("Zoho org ID not set. Set ZOHO_ORG_ID or reconnect via /auth/zoho.");

  const url = `https://www.zohoapis.${DC}/books/v3${path}?organization_id=${orgId}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Zoho Books API error: ${data.message} (code ${data.code})`);
  return data;
}

async function createItem(catalyst, name, sku, description) {
  const data = await apiRequest(catalyst, "POST", "/items", {
    name,
    sku,
    description: description || undefined,
    item_type: "inventory",
    rate: 0,
  });
  return data.item;
}

async function updateItem(catalyst, zohoItemId, name, sku, description) {
  const body = { name, sku };
  if (description !== undefined) body.description = description;
  const data = await apiRequest(catalyst, "PUT", `/items/${zohoItemId}`, body);
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

module.exports = { createItem, updateItem, getOrganizations };
