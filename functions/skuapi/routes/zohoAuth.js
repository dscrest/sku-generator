"use strict";
const express = require("express");
const { rowList } = require("../store");
const { getAuthUrl, exchangeCode, saveOrg, loadToken } = require("../zoho/auth");
const { getOrganizations } = require("../zoho/booksApi");

const router = express.Router();
const FRONTEND = process.env.FRONTEND_URL || "http://localhost:5173";

router.get("/", (_req, res) => {
  try {
    res.redirect(getAuthUrl());
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

router.get("/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect(`${FRONTEND}/connect?error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect(`${FRONTEND}/connect?error=no_code`);

  try {
    await exchangeCode(req.catalyst, code);
    const orgs = await getOrganizations(req.catalyst);
    if (orgs.length === 1) {
      await saveOrg(req.catalyst, orgs[0].organization_id, orgs[0].name);
      return res.redirect(`${FRONTEND}?zoho=connected`);
    }
    return res.redirect(`${FRONTEND}/connect?zoho=select_org`);
  } catch (err) {
    console.error("Zoho callback error:", err);
    res.redirect(`${FRONTEND}/connect?error=${encodeURIComponent(err.message)}`);
  }
});

router.post("/select-org", async (req, res) => {
  const { orgId, orgName } = req.body;
  if (!orgId) return res.status(400).json({ error: "orgId required" });
  try {
    await saveOrg(req.catalyst, orgId, orgName || null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/orgs", async (req, res) => {
  try {
    res.json(await getOrganizations(req.catalyst));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/status", async (req, res) => {
  try {
    const token = await loadToken(req.catalyst);
    res.json({
      connected: Boolean(token && token.refreshToken),
      orgId: (token && token.orgId) || null,
      orgName: (token && token.orgName) || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/disconnect", async (req, res) => {
  try {
    const ds = req.catalyst.datastore().table("ZohoToken");
    const rows = rowList(await req.catalyst.zcql().executeZCQLQuery("SELECT ROWID FROM ZohoToken"));
    for (const r of rows) await ds.deleteRow(r.ROWID);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
