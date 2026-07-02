"use strict";

/**
 * Zoho OAuth + token storage, backed by the ZohoToken Data Store table
 * (single row). Every function takes the per-request `catalyst` app instance.
 * Until ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET are set as function env vars these
 * throw "Zoho not configured" — callers treat the push as best-effort.
 */
const { rowList } = require("../store");

const DC = process.env.ZOHO_DC || "com";
const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI || "http://localhost:3001/auth/zoho/callback";

// profile.READ → Sign-in-with-Zoho identity; the rest are the data apps we sync.
const SCOPES = [
  "AaaServer.profile.READ",
  "ZohoBooks.fullaccess.all",
  "ZohoInventory.fullaccess.all",
  "ZohoCRM.modules.ALL",
].join(",");

function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function assertConfigured() {
  if (!isConfigured()) throw new Error("Zoho not configured (set ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET)");
}

// Catalyst datetime wants "yyyy-MM-dd HH:mm:ss", not ISO with T/Z.
function dsDate(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function getAuthUrl() {
  assertConfigured();
  // No prompt=consent: Zoho shows consent only on the FIRST authorization; a
  // returning user (still signed into Zoho, grant already given) is bounced
  // straight back with no login/consent screen. access_type=offline still yields
  // the refresh token on that first grant.
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    response_type: "code",
    access_type: "offline",
  });
  return `https://accounts.zoho.${DC}/oauth/v2/auth?${params}`;
}

// Tokens are per app-user. userId falls back to the id stashed on the request's
// catalyst instance by requireAuth, so data-sync helpers need no signature change.
function uid(catalyst, userId) {
  const id = userId || catalyst.__userId;
  if (!id) throw new Error("No user context for Zoho token");
  return String(id);
}

async function loadToken(catalyst, userId) {
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(`SELECT * FROM ZohoToken WHERE userId = '${uid(catalyst, userId)}'`),
  );
  return rows.length ? rows[0] : null;
}

// Fetch the Zoho account profile (needs AaaServer.profile.READ) — used to
// identify the app user during Sign-in-with-Zoho.
async function getProfile(accessToken) {
  const res = await fetch(`https://accounts.zoho.${DC}/oauth/user/info`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data = await res.json();
  if (!data.Email) throw new Error(`Zoho profile fetch failed: ${JSON.stringify(data)}`);
  return { email: data.Email, firstName: data.First_Name, lastName: data.Last_Name, zuid: data.ZUID };
}

// Exchange the auth code for tokens WITHOUT persisting — the caller identifies
// the user (via getProfile or session) first, then calls saveToken(userId).
async function exchangeCode(code) {
  assertConfigured();
  const params = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const res = await fetch(`https://accounts.zoho.${DC}/oauth/v2/token`, { method: "POST", body: params });
  const data = await res.json();
  // A returning user (no prompt=consent) gets an access token but NO new refresh
  // token — that's fine, we keep the one already stored. Only a hard failure has
  // no access token at all.
  if (!data.access_token) throw new Error(`Zoho token exchange failed: ${JSON.stringify(data)}`);
  return data;
}

async function saveToken(catalyst, userId, data) {
  const ds = catalyst.datastore().table("ZohoToken");
  const existing = await loadToken(catalyst, userId);
  const fields = {
    userId: String(userId),
    accessToken: data.access_token,
    expiresAt: dsDate(Date.now() + data.expires_in * 1000),
  };
  // Only overwrite the refresh token when Zoho actually returned a new one;
  // otherwise the previously stored token stands.
  if (data.refresh_token) fields.refreshToken = data.refresh_token;
  if (existing) {
    await ds.updateRow({ ROWID: existing.ROWID, ...fields });
  } else {
    if (!data.refresh_token) throw new Error("Zoho did not return a refresh token on first connect — retry with consent.");
    await ds.insertRow(fields);
  }
}

async function getAccessToken(catalyst, userId) {
  assertConfigured();
  const token = await loadToken(catalyst, userId);
  if (!token) throw new Error("Zoho not connected. Visit /auth/zoho to connect.");

  if (token.accessToken && token.expiresAt && new Date(token.expiresAt).getTime() > Date.now() + 30000) {
    return token.accessToken;
  }

  const params = new URLSearchParams({
    refresh_token: token.refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const res = await fetch(`https://accounts.zoho.${DC}/oauth/v2/token`, { method: "POST", body: params });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Zoho token refresh failed: ${JSON.stringify(data)}`);

  await catalyst.datastore().table("ZohoToken").updateRow({
    ROWID: token.ROWID,
    accessToken: data.access_token,
    expiresAt: dsDate(Date.now() + data.expires_in * 1000),
  });
  return data.access_token;
}

async function getOrgId(catalyst, userId) {
  const token = await loadToken(catalyst, userId);
  return (token && token.orgId) || process.env.ZOHO_ORG_ID || null;
}

async function saveOrg(catalyst, userId, orgId, orgName) {
  const token = await loadToken(catalyst, userId);
  if (!token) throw new Error("Zoho not connected.");
  await catalyst.datastore().table("ZohoToken").updateRow({ ROWID: token.ROWID, orgId, orgName: orgName || null });
}

module.exports = {
  isConfigured,
  getAuthUrl,
  exchangeCode,
  saveToken,
  getProfile,
  getAccessToken,
  getOrgId,
  saveOrg,
  loadToken,
};
