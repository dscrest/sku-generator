"use strict";

/**
 * App-level auth: password hashing, signed session cookies, the requireAuth
 * middleware, and AppUser Data Store helpers. No external deps — Node's crypto
 * does scrypt (passwords) and HMAC-SHA256 (session signatures).
 *
 * Session = base64url(JSON{uid,iat}) + "." + HMAC. Stateless, so no session
 * table; verify recomputes the HMAC and checks age.
 */
const crypto = require("crypto");
const { rowList, zStr } = require("./store");

// Reuse the Zoho client secret as the signing key if no dedicated one is set —
// it is already a stable per-deployment secret. ponytail: set SESSION_SECRET to
// rotate independently of Zoho creds.
const SECRET = process.env.SESSION_SECRET || process.env.ZOHO_CLIENT_SECRET || "dev-insecure-secret";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const COOKIE = "sku_session";

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

// ---- passwords (scrypt) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, saltHex, hashHex] = stored.split("$");
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

// ---- session token ----
function sign(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

function makeSession(userId) {
  const payload = b64url(JSON.stringify({ uid: String(userId), iat: Date.now() }));
  return `${payload}.${sign(payload)}`;
}

function readSession(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  const expected = sign(payload);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const { uid, iat } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!uid || !iat || Date.now() - iat > MAX_AGE_MS) return null;
    return String(uid);
  } catch {
    return null;
  }
}

// ---- cookies ----
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, userId) {
  const attrs = [
    `${COOKIE}=${makeSession(userId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
    "Secure", // prod is https; harmless on localhost over http-in-modern-browsers, and dev proxies same-origin
  ];
  res.append("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(res) {
  res.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function currentUserId(req) {
  return readSession(parseCookies(req)[COOKIE]);
}

// Gate + stash: verified user id goes on req.userId AND on the per-request
// catalyst instance, so downstream Zoho helpers read it without signature churn.
function requireAuth(req, res, next) {
  const uid = currentUserId(req);
  if (!uid) return res.status(401).json({ error: "Not authenticated" });
  req.userId = uid;
  if (req.catalyst) req.catalyst.__userId = uid;
  next();
}

// ---- AppUser Data Store helpers ----
async function findUserByEmail(catalyst, email) {
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(`SELECT * FROM AppUser WHERE email = ${zStr(email.toLowerCase())} LIMIT 1`),
  );
  return rows[0] || null;
}

async function findUserByZuid(catalyst, zuid) {
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(`SELECT * FROM AppUser WHERE zuid = ${zStr(String(zuid))} LIMIT 1`),
  );
  return rows[0] || null;
}

async function getUserById(catalyst, id) {
  const rows = rowList(await catalyst.zcql().executeZCQLQuery(`SELECT * FROM AppUser WHERE ROWID = ${id} LIMIT 1`));
  return rows[0] || null;
}

async function createUser(catalyst, { email, name, password, zuid }) {
  const fields = { email: email.toLowerCase(), name: name || null, zuid: zuid ? String(zuid) : null };
  if (password) fields.passwordHash = hashPassword(password);
  const row = await catalyst.datastore().table("AppUser").insertRow(fields);
  return row;
}

module.exports = {
  hashPassword,
  verifyPassword,
  requireAuth,
  currentUserId,
  setSessionCookie,
  clearSessionCookie,
  findUserByEmail,
  findUserByZuid,
  getUserById,
  createUser,
};

// ponytail self-check: `node session.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const h = hashPassword("hunter2");
  console.assert(verifyPassword("hunter2", h), "correct password must verify");
  console.assert(!verifyPassword("wrong", h), "wrong password must fail");
  const t = makeSession("12345");
  console.assert(readSession(t) === "12345", "session round-trips uid");
  console.assert(readSession(t + "x") === null, "tampered session rejected");
  console.assert(readSession("garbage") === null, "garbage session rejected");
  console.log("session.js self-check passed");
}
