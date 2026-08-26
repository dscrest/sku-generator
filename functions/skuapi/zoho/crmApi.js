"use strict";
const { getAccessToken, dcHosts } = require("./auth");

// A CRM grant issued before the ZohoCRM scope was added (or an expired one)
// comes back as 401 with one of these codes. The route turns a reauth error
// into 409 reauth_required so the UI can prompt a one-time reconnect — same
// pattern Inventory uses. Pure so it can be self-checked without a live call.
function crmReauthNeeded(status, body) {
  if (status === 401) return true;
  const code = body && body.code;
  return code === "OAUTH_SCOPE_MISMATCH" || code === "INVALID_TOKEN" || code === "AUTHENTICATION_FAILURE";
}

// CRM v6 REST. Unlike Books/Inventory, CRM is scoped by the token's own CRM org
// (no organization_id param). Success GET-one is 200 { data: [ {...} ] };
// an empty record is 204 (no body).
async function crmRequest(catalyst, path) {
  const { accessToken, dc } = await getAccessToken(catalyst);
  const res = await fetch(`https://${dcHosts(dc).api}/crm/v6/${path}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (crmReauthNeeded(res.status, body)) {
    const err = new Error(`Zoho CRM not authorized: ${(body && body.message) || res.status}`);
    err.reauth = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Zoho CRM API error: ${(body && body.message) || res.status}`);
  return body;
}

async function getDeal(catalyst, id) {
  const data = await crmRequest(catalyst, `Deals/${encodeURIComponent(id)}`);
  return (data && data.data && data.data[0]) || null;
}

// Full quote record — GET-one includes the Quoted_Items subform (product,
// Quantity, List_Price, Total, per-line Description) plus quote-level Discount.
async function getQuote(catalyst, id) {
  const data = await crmRequest(catalyst, `Quotes/${encodeURIComponent(id)}`);
  return (data && data.data && data.data[0]) || null;
}

// Account/Contact records backing the quote's lookups — the estimate's "To"
// section picks billing address / phone / GSTIN / mobile out of the raw record.
async function getAccount(catalyst, id) {
  const data = await crmRequest(catalyst, `Accounts/${encodeURIComponent(id)}`);
  return (data && data.data && data.data[0]) || null;
}

async function getContact(catalyst, id) {
  const data = await crmRequest(catalyst, `Contacts/${encodeURIComponent(id)}`);
  return (data && data.data && data.data[0]) || null;
}

// The related-records API requires an explicit fields param; these are just
// enough for the estimate page's quote picker.
const QUOTE_LIST_FIELDS = "Subject,Quote_No,Quote_Number,Grand_Total,Quote_Stage,Created_Time";

async function getDealQuotes(catalyst, id) {
  const data = await crmRequest(catalyst, `Deals/${encodeURIComponent(id)}/Quotes?fields=${QUOTE_LIST_FIELDS}`);
  return (data && data.data) || [];
}

module.exports = { crmReauthNeeded, getDeal, getQuote, getDealQuotes, getAccount, getContact };
