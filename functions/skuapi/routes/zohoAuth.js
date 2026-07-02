"use strict";
const express = require("express");
const { rowList } = require("../store");
const { getAuthUrl, exchangeCode, saveToken, getProfile, saveOrg, loadToken } = require("../zoho/auth");
const { getOrganizations } = require("../zoho/booksApi");
const {
  requireAuth,
  currentUserId,
  setSessionCookie,
  findUserByEmail,
  findUserByZuid,
  createUser,
} = require("../session");

const router = express.Router();
const FRONTEND = process.env.FRONTEND_URL || "http://localhost:5173";

// Public: kick off the OAuth consent flow.
router.get("/", (_req, res) => {
  try {
    res.redirect(getAuthUrl());
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// Exchange the code, identify the user (linking to an existing session, or
// find-or-create from the Zoho profile), store the per-user token, set the
// session cookie, and auto-pick the org if there's exactly one. Shared by the
// GET redirect callback and the SPA's POST /exchange. Returns { orgSelected }.
async function completeZohoLogin(req, res, code) {
  const tokenData = await exchangeCode(code);
  const profile = await getProfile(tokenData.access_token);

  let userId = currentUserId(req);
  if (userId) {
    // Linking to an existing session — stamp the Zoho identity on that user.
    await linkZuid(req.catalyst, userId, profile.zuid);
  } else {
    const user =
      (await findUserByZuid(req.catalyst, profile.zuid)) || (await findUserByEmail(req.catalyst, profile.email));
    if (user) {
      userId = user.ROWID;
      if (!user.zuid) await linkZuid(req.catalyst, userId, profile.zuid);
    } else {
      const created = await createUser(req.catalyst, {
        email: profile.email,
        name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email,
        zuid: profile.zuid,
      });
      userId = created.ROWID;
    }
    setSessionCookie(res, userId);
  }

  req.catalyst.__userId = String(userId);
  const prior = await loadToken(req.catalyst, userId);
  await saveToken(req.catalyst, userId, tokenData);

  // Returning user who already picked an org: keep it, skip re-selection.
  if (prior && prior.orgId) return { orgSelected: true };

  const orgs = await getOrganizations(req.catalyst);
  if (orgs.length === 1) {
    await saveOrg(req.catalyst, userId, orgs[0].organization_id, orgs[0].name);
    return { orgSelected: true };
  }
  return { orgSelected: false };
}

// The registered redirect URI is the SPA (/app/), so Zoho hands the code to the
// browser; the SPA immediately POSTs it here for the secure server-side exchange.
// Public (no requireAuth) — this is itself part of logging in.
router.post("/exchange", async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "no_code" });
  try {
    const result = await completeZohoLogin(req, res, code);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Zoho exchange error:", err);
    res.status(400).json({ error: err.message });
  }
});

// Kept for the backend-callback style (unused while redirect URI = /app/, but
// harmless and lets us switch back by only changing ZOHO_REDIRECT_URI).
router.get("/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect(`${FRONTEND}/#/connect?error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect(`${FRONTEND}/#/connect?error=no_code`);
  try {
    const { orgSelected } = await completeZohoLogin(req, res, code);
    return res.redirect(`${FRONTEND}/#/${orgSelected ? "?zoho=connected" : "connect?zoho=select_org"}`);
  } catch (err) {
    console.error("Zoho callback error:", err);
    res.redirect(`${FRONTEND}/#/connect?error=${encodeURIComponent(err.message)}`);
  }
});

async function linkZuid(catalyst, userId, zuid) {
  if (!zuid) return;
  await catalyst.datastore().table("AppUser").updateRow({ ROWID: userId, zuid: String(zuid) });
}

// Everything below acts on the logged-in user's own Zoho connection.
router.use(requireAuth);

router.post("/select-org", async (req, res) => {
  const { orgId, orgName } = req.body;
  if (!orgId) return res.status(400).json({ error: "orgId required" });
  try {
    await saveOrg(req.catalyst, req.userId, orgId, orgName || null);
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
    const token = await loadToken(req.catalyst, req.userId);
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
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT ROWID FROM ZohoToken WHERE userId = '${req.userId}'`),
    );
    for (const r of rows) await ds.deleteRow(r.ROWID);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
