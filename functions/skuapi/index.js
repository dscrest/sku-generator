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
const { requireAuth } = require("./session");
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

app.use("/api/industries", require("./routes/industries"));
app.use("/api", require("./routes/properties"));
app.use("/api", require("./routes/propertyValues"));
app.use("/api/sku", require("./routes/sku"));
app.use("/api/sku-items", require("./routes/skuItems"));

app.use((err, _req, res, _next) => {
  console.error(err && (err.stack || err.message || err));
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
