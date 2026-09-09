"use strict";

/**
 * SKU Generator API — Advanced I/O Function (Node.js + Express).
 * Data layer is Catalyst Data Store (no Postgres/Prisma). Reachable at:
 *   https://<project-domain>/server/skuapi/...
 */
const express = require("express");
const catalystSDK = require("zcatalyst-sdk-node");

const app = express();
app.use(express.json());
// The CRM widget sends JSON as text/plain to keep requests "simple" (no CORS
// preflight — Catalyst's gateway answers OPTIONS itself without CORS headers,
// so any preflighted request dies in the browser). Parse it back to JSON.
app.use(express.text({ type: "text/plain" }));
app.use((req, _res, next) => {
  if (typeof req.body === "string" && req.body) {
    try { req.body = JSON.parse(req.body); } catch { /* not JSON — leave as-is */ }
  }
  next();
});

// CORS — the CRM widget runs on a Zoho-hosted domain and sends the session
// cookie cross-origin, so reflect the Origin + allow credentials. Suffix
// allowlist, NOT reflect-everything: the API is cookie-authed, so open
// reflection would let any website ride the user's session.
// ponytail: extend the suffix list if the packed widget's real Origin (DevTools) differs.
const CORS_SUFFIXES = [
  ".catalystserverless.com",
  // Zoho family — CRM itself plus the domains Zoho serves hosted widgets from
  // (zohopublic = internally-hosted CRM widgets), across DCs.
  ".zoho.com", ".zoho.in", ".zoho.eu", ".zoho.com.au", ".zoho.jp", ".zoho.sa", ".zoho.com.cn",
  ".zohopublic.com", ".zohopublic.in", ".zohopublic.eu", ".zohopublic.com.au", ".zohopublic.jp",
  // Hosted-widget content domains also vary by DC (the packed widget serves
  // from <uuid>.zappsusercontent.in on the IN DC).
  ".zohousercontent.com", ".zohousercontent.in", ".zohousercontent.eu",
  ".zappsusercontent.com", ".zappsusercontent.in", ".zappsusercontent.eu",
  ".zohostatic.com", ".zohostatic.in", ".zwidgets.com",
];
function corsOk(origin) {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (!origin.startsWith("https://")) return false;
  const host = origin.slice("https://".length);
  return CORS_SUFFIXES.some((s) => host.endsWith(s));
}
// ponytail: temp CORS debug — records origins seen so the widget's real Origin
// can be read from GET /cors-debug. Remove once the widget allowlist is settled.
const seenOrigins = [];
app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (origin) {
    const entry = `${corsOk(origin) ? "OK " : "BLOCKED "}${origin} ${req.method} ${req.url}`;
    if (seenOrigins.length < 50 && !seenOrigins.includes(entry)) seenOrigins.push(entry);
  }
  if (origin && corsOk(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Catalyst delivers Advanced I/O requests under /server/skuapi — strip it so
// route matching is identical to local dev.
app.use((req, _res, next) => {
  req.url = req.url.replace(/^\/server\/skuapi/, "") || "/";
  next();
});

// One Catalyst app instance per request, used by every route for Data Store.
app.use((req, _res, next) => {
  req.catalyst = catalystSDK.initialize(req);
  next();
});

app.get("/", (_req, res) => res.json({ status: "ok", service: "skuapi" }));
app.get("/cors-debug", (_req, res) => res.json(seenOrigins)); // ponytail: temp, remove with seenOrigins

// CRM widget page (Setup → Widgets → hosting "External" → this URL). Served
// from a function (not the web client) because Catalyst stamps
// X-Frame-Options: DENY on static hosting with no way to change it; a
// frame-ancestors CSP set here overrides XFO in modern browsers, letting only
// Zoho CRM iframe it.
app.get("/widget", (_req, res) => {
  res.set(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://*.zoho.com https://*.zoho.in https://*.zoho.eu " +
      "https://*.zoho.com.au https://*.zoho.jp https://*.zoho.sa https://*.zoho.com.cn"
  );
  res.set("Cache-Control", "no-cache"); // widget updates land on next reload after deploy
  res.sendFile(require("path").join(__dirname, "widget.html"));
});

// Auth: custom email/password login + Zoho OAuth (both set the session cookie).
app.use("/auth", require("./routes/auth"));
app.use("/auth/zoho", require("./routes/zohoAuth"));

// Everything under /api requires a logged-in app user (sets req.userId +
// req.catalyst.__userId so per-user Zoho tokens resolve downstream) AND a
// selected Zoho org — the catalog is shared per org, so req.orgId /
// req.catalyst.__orgId scope every data query to that tenant.
const { requireAuth, requireAdmin } = require("./session");
const { requireAddon } = require("./addons");
const { loadToken, cachedOrgId, rememberOrgId } = require("./zoho/auth");
async function requireOrg(req, res, next) {
  try {
    // 60s cache: most requests skip the ZohoToken query entirely (CR-088).
    let orgId = cachedOrgId(req.userId);
    if (!orgId) {
      const token = await loadToken(req.catalyst, req.userId);
      orgId = token && token.orgId;
      if (orgId) rememberOrgId(req.userId, orgId);
    }
    if (!orgId) return res.status(400).json({ error: "No Zoho organization selected" });
    req.orgId = String(orgId);
    req.catalyst.__orgId = req.orgId;
    next();
  } catch (err) {
    next(err);
  }
}
app.use("/api", requireAuth, requireOrg);

// CRM Deal read (for the "CRM Info" card on the generator page). Not an add-on:
// available to any Books-connected org; the token needs the ZohoCRM.modules.READ
// scope, otherwise the route returns 409 reauth_required.
app.use("/api/crm", require("./routes/crm"));

// Super-admin (OCTFIS staff): entitlement management. Spans orgs, so it sits
// outside the /api requireOrg chain.
app.use("/admin", requireAuth, requireAdmin, require("./routes/admin"));

// Work-order + reserve add-ons. Mounted BEFORE the bare "/api" mounts below:
// their requireAddon("sku-generator") middleware runs on any /api path that
// reaches it, so these must claim their requests first.
app.use("/api/wo", requireAddon("work-order"), require("./routes/workorder"));
// Superseded by /api/wo — kept one release so the Books custom button and any
// saved /#/reserve?soId= deep links keep working.
app.use("/api/reserve", requireAddon("reserve"), require("./routes/reserve"));
// Recipe Engine add-on (CR-104): recipe templates, materials master, quotations.
app.use("/api/recipe", requireAddon("recipe-engine"), require("./routes/recipe"));

// SKU generator add-on — everything below is gated per-org.
const skuGen = requireAddon("sku-generator");
app.use("/api/industries", skuGen, require("./routes/industries"));
app.use("/api", skuGen, require("./routes/properties"));
app.use("/api", skuGen, require("./routes/propertyValues"));
app.use("/api/sku", skuGen, require("./routes/sku"));
app.use("/api/sku-items", skuGen, require("./routes/skuItems"));

// ---- internal endpoints: no user session, shared-secret guarded ----
function internalAuth(req, res) {
  // Header is the norm (cron sends it). Books workflow-rule webhooks can't always
  // set a custom header, so a `?secret=` query param is accepted as a fallback —
  // the rule authenticates from its URL alone. Same shared secret either way.
  const supplied = req.get("X-Sync-Secret") || req.query.secret;
  if (!process.env.SYNC_SECRET || supplied !== process.env.SYNC_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

// Cron entry (Catalyst URL-type cron): refresh stock snapshots for every org
// with reserve enabled. Superseded by /internal/reconcile for work-order orgs.
app.post("/internal/sync-stock", async (req, res) => {
  if (!internalAuth(req, res)) return;
  try {
    const result = await require("./reserve/sync").syncAllOrgs(req.catalyst);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err && (err.stack || err.message));
    res.status(500).json({ error: err.message });
  }
});

// Nightly cron: reconcile the work-order read model (bounded by open work
// orders, not catalog size) and then evaluate the shortfall / cost alerts.
app.post("/internal/reconcile", async (req, res) => {
  if (!internalAuth(req, res)) return;
  try {
    const result = await require("./workorder/sync").reconcileAllOrgs(req.catalyst);
    const alerts = {};
    for (const orgId of Object.keys(result.synced)) {
      req.catalyst.__orgId = orgId;
      delete req.catalyst.__woSettings;
      try {
        alerts[orgId] = await require("./workorder/alerts").evaluateOrg(req.catalyst, orgId);
      } catch (err) {
        alerts[orgId] = `error: ${err.message}`;
      }
    }
    res.json({ ok: true, ...result, alerts });
  } catch (err) {
    console.error(err && (err.stack || err.message));
    res.status(500).json({ error: err.message });
  }
});

// Zoho Books workflow-rule webhook sink. The rule's URL carries ?type=&orgId=
// because Books payloads have no consistent envelope — setup procedure is in
// WORKORDER.md. Unknown event types are acknowledged, never rejected, so a
// client's Books console never shows failures for a rule we do not handle.
app.post("/internal/zoho-event", async (req, res) => {
  if (!internalAuth(req, res)) return;
  const { type, orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: "orgId query parameter is required" });
  try {
    const tokens = await require("./workorder/sync").tokenForOrg(req.catalyst, orgId);
    if (!tokens) return res.status(409).json({ error: "no connected Zoho user for this org" });
    res.json({ ok: true, ...(await require("./workorder/sync").handleZohoEvent(req.catalyst, orgId, type, req.body)) });
  } catch (err) {
    console.error(err && (err.stack || err.message));
    res.status(500).json({ error: err.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err && (err.stack || err.message || err));
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
