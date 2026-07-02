"use strict";

/** Custom (email + password) login against the AppUser table. */
const express = require("express");
const {
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  findUserByEmail,
  createUser,
  getUserById,
} = require("../session");
const { loadToken } = require("../zoho/auth");

const router = express.Router();
const shape = (u) => ({ id: String(u.ROWID), email: u.email, name: u.name || null });

router.post("/register", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  if (String(password).length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });
  try {
    if (await findUserByEmail(req.catalyst, email)) return res.status(409).json({ error: "email already registered" });
    const user = await createUser(req.catalyst, { email, password, name });
    setSessionCookie(res, user.ROWID);
    res.status(201).json(shape(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  try {
    const user = await findUserByEmail(req.catalyst, email);
    // Same response for missing user and bad password — no account enumeration.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    setSessionCookie(res, user.ROWID);
    res.json(shape(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.catalyst, req.userId);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const token = await loadToken(req.catalyst, req.userId);
    res.json({
      ...shape(user),
      zohoConnected: Boolean(token && token.refreshToken),
      orgId: (token && token.orgId) || null,
      orgName: (token && token.orgName) || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
