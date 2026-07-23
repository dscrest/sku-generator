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

// Public: kick off the OAuth consent flow. ?consent=1 forces the Zoho consent
// screen (needed to re-obtain a refresh token).
router.get("/", (req, res) => {
  try {
    res.redirect(getAuthUrl(req.query.consent === "1"));
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// Exchange the code, identify the user (linking to an existing session, or
// find-or-create from the Zoho profile), store the per-user token, set the
// session cookie, and auto-pick the org if there's exactly one. Shared by the
// GET redirect callback and the SPA's POST /exchange. Returns { orgSelected }.
// `dc` is the callback's `location` param — the Zoho DC that issued the code.
async function completeZohoLogin(req, res, code, dc) {
  const tokenData = await exchangeCode(code, dc);
  const profile = await getProfile(tokenData.access_token, dc);

  let userId = currentUserId(req);
  if (userId) {
    // Linking to an existing session — stamp the Zoho identity on that user.
    await linkZuid(req.catalyst, userId, profile.zuid);
  } else {
    const user =
      (await findUserByZuid(req.catalyst, profile.zuid)) ||
      (profile.email ? await findUserByEmail(req.catalyst, profile.email) : null);
    if (user) {
      userId = user.ROWID;
      if (!user.zuid) await linkZuid(req.catalyst, userId, profile.zuid);
    } else {
      const created = await createUser(req.catalyst, {
        // AppUser.email is mandatory+unique; phone-registered Zoho accounts
        // have none, so fall back to a stable per-ZUID placeholder.
        email: profile.email || `zuid-${profile.zuid}@zoho.invalid`,
        name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email,
        zuid: profile.zuid,
      });
      userId = created.ROWID;
    }
    setSessionCookie(res, userId);
  }

  req.catalyst.__userId = String(userId);
  const prior = await loadToken(req.catalyst, userId);
  // Zoho returns a refresh token only on a consent grant. Grant already on
  // file at Zoho but nothing stored here (failed first exchange, disconnect)
  // → the no-prompt flow would loop forever; bounce through consent instead.
  // The session cookie is already set, so the user stays logged in.
  if (!tokenData.refresh_token && !(prior && prior.refreshToken)) {
    return { needsConsent: true };
  }
  await saveToken(req.catalyst, userId, tokenData, dc);

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
  const { code, location } = req.body || {};
  if (!code) return res.status(400).json({ error: "no_code" });
  try {
    const result = await completeZohoLogin(req, res, code, location);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Zoho exchange error:", err);
    res.status(400).json({ error: err.message });
  }
});

// Kept for the backend-callback style (unused while redirect URI = /app/, but
// harmless and lets us switch back by only changing ZOHO_REDIRECT_URI).
router.get("/callback", async (req, res) => {
  const { code, error, location } = req.query;
  if (error) return res.redirect(`${FRONTEND}/#/connect?error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect(`${FRONTEND}/#/connect?error=no_code`);
  try {
    const { orgSelected, needsConsent } = await completeZohoLogin(req, res, code, location);
    if (needsConsent) return res.redirect(getAuthUrl(true));
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
