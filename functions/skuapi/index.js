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

// CORS — same-origin in prod; permissive so dev proxy / probes never trip.
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
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

// Auth: custom email/password login + Zoho OAuth (both set the session cookie).
app.use("/auth", require("./routes/auth"));
app.use("/auth/zoho", require("./routes/zohoAuth"));

// Everything under /api requires a logged-in app user (sets req.userId +
// req.catalyst.__userId so per-user Zoho tokens resolve downstream) AND a
// selected Zoho org — the catalog is shared per org, so req.orgId /
// req.catalyst.__orgId scope every data query to that tenant.
const { requireAuth, requireAdmin } = require("./session");
const { requireAddon } = require("./addons");
const { loadToken } = require("./zoho/auth");
async function requireOrg(req, res, next) {
  try {
    const token = await loadToken(req.catalyst, req.userId);
    const orgId = token && token.orgId;
    if (!orgId) return res.status(400).json({ error: "No Zoho organization selected" });
    req.orgId = String(orgId);
    req.catalyst.__orgId = req.orgId;
    next();
  } catch (err) {
    next(err);
  }
}
app.use("/api", requireAuth, requireOrg);

// Super-admin (OCTFIS staff): entitlement management. Spans orgs, so it sits
// outside the /api requireOrg chain.
app.use("/admin", requireAuth, requireAdmin, require("./routes/admin"));

// Reserve add-on. Mounted BEFORE the bare "/api" mounts below: their
// requireAddon("sku-generator") middleware runs on any /api path that reaches
// it, so reserve must claim its requests first.
app.use("/api/reserve", requireAddon("reserve"), require("./routes/reserve"));

// SKU generator add-on — everything below is gated per-org.
const skuGen = requireAddon("sku-generator");
app.use("/api/industries", skuGen, require("./routes/industries"));
app.use("/api", skuGen, require("./routes/properties"));
app.use("/api", skuGen, require("./routes/propertyValues"));
app.use("/api/sku", skuGen, require("./routes/sku"));
app.use("/api/sku-items", skuGen, require("./routes/skuItems"));

// Cron entry (Catalyst URL-type cron, Phase 4): refresh stock snapshots for
// every org with reserve enabled. Shared-secret guarded — no user session.
app.post("/internal/sync-stock", async (req, res) => {
  if (!process.env.SYNC_SECRET || req.get("X-Sync-Secret") !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const result = await require("./reserve/sync").syncAllOrgs(req.catalyst);
    res.json({ ok: true, ...result });
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
