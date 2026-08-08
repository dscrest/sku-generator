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

module.exports = { crmReauthNeeded, getDeal };
