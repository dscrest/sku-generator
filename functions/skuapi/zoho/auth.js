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
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "ZohoBooks.fullaccess.all",
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.zoho.${DC}/oauth/v2/auth?${params}`;
}

async function loadToken(catalyst) {
  const rows = rowList(await catalyst.zcql().executeZCQLQuery("SELECT * FROM ZohoToken"));
  return rows.length ? rows[0] : null;
}

async function exchangeCode(catalyst, code) {
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
  if (!data.refresh_token) throw new Error(`Zoho token exchange failed: ${JSON.stringify(data)}`);

  const ds = catalyst.datastore().table("ZohoToken");
  const existing = await loadToken(catalyst);
  const fields = {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresAt: dsDate(Date.now() + data.expires_in * 1000),
  };
  if (existing) await ds.updateRow({ ROWID: existing.ROWID, ...fields });
  else await ds.insertRow(fields);
  return data;
}

async function getAccessToken(catalyst) {
  assertConfigured();
  const token = await loadToken(catalyst);
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

async function getOrgId(catalyst) {
  const token = await loadToken(catalyst);
  return (token && token.orgId) || process.env.ZOHO_ORG_ID || null;
}

async function saveOrg(catalyst, orgId, orgName) {
  const token = await loadToken(catalyst);
  if (!token) throw new Error("Zoho not connected.");
  await catalyst.datastore().table("ZohoToken").updateRow({ ROWID: token.ROWID, orgId, orgName: orgName || null });
}

module.exports = { isConfigured, getAuthUrl, exchangeCode, getAccessToken, getOrgId, saveOrg, loadToken };
