const { getAccessToken, getOrgId } = require('./auth');

const DC = process.env.ZOHO_DC || 'com';

async function apiRequest(method, path, body) {
  const [accessToken, orgId] = await Promise.all([getAccessToken(), getOrgId()]);
  if (!orgId) throw new Error('Zoho org ID not set. Set ZOHO_ORG_ID in .env or reconnect via /auth/zoho.');

  const url = `https://www.zohoapis.${DC}/books/v3${path}?organization_id=${orgId}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Zoho Books API error: ${data.message} (code ${data.code})`);
  return data;
}

async function createItem(name, sku, description) {
  const data = await apiRequest('POST', '/items', {
    name,
    sku,
    description: description || undefined,
    item_type: 'inventory',
    rate: 0,
  });
  return data.item;
}

async function updateItem(zohoItemId, name, sku, description) {
  const body = { name, sku };
  if (description !== undefined) body.description = description;
  const data = await apiRequest('PUT', `/items/${zohoItemId}`, body);
  return data.item;
}

async function findItemBySku(sku) {
  const data = await apiRequest('GET', `/items?search_text=${encodeURIComponent(sku)}`);
  return data.items?.find(i => i.sku === sku) || null;
}

async function getOrganizations() {
  const accessToken = await getAccessToken();
  const res = await fetch(`https://www.zohoapis.${DC}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data = await res.json();
  return data.organizations || [];
}

module.exports = { createItem, updateItem, findItemBySku, getOrganizations };
