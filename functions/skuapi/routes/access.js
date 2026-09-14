"use strict";

/**
 * Users & Roles (per-org). Mounted at /api/access behind requirePerm("users.manage").
 * Roles are named permission sets (Role.perms = JSON array of PERM_KEYS);
 * users get roles per org via UserRole. A user's access = union of their roles.
 * An org's "Admin" is just a role with users.manage ticked; ADMIN_EMAILS
 * super-admins always pass, so a locked org is repairable through this same UI.
 */
const express = require("express");
const { rowList, zStr, idOk, orgClause, ownsRow } = require("../store");
const { inList } = require("../workorder/store");
const { PERM_KEYS, clearPermCache } = require("../perms");

const router = express.Router();

const ok = (handler) => async (req, res) => {
  try { await handler(req, res); } catch (err) {
    console.error(err && (err.stack || err.message));
    res.status(err.status || 500).json({ error: err.message });
  }
};

function validRole(body) {
  const name = String(body?.name || "").trim();
  const perms = body?.perms;
  if (!name || name.length > 100) return { error: "Role name required (max 100 chars)" };
  if (!Array.isArray(perms) || !perms.every((p) => PERM_KEYS.includes(p))) {
    return { error: "perms must be an array of known permission keys" };
  }
  return { name, perms };
}

const roleOut = (r) => {
  let perms = [];
  try { perms = JSON.parse(r.perms || "[]"); } catch { /* corrupt = empty */ }
  return { id: String(r.ROWID), name: r.name, perms };
};

// ---- roles ----------------------------------------------------------------

router.get("/roles", ok(async (req, res) => {
  const rows = rowList(await req.catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID, name, perms FROM Role WHERE ${orgClause(req.catalyst)} ORDER BY name`,
  ));
  res.json(rows.map(roleOut));
}));

router.post("/roles", ok(async (req, res) => {
  const v = validRole(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const row = await req.catalyst.datastore().table("Role")
    .insertRow({ orgId: req.orgId, name: v.name, perms: JSON.stringify(v.perms) });
  clearPermCache(req.orgId);
  res.json({ id: String(row.ROWID), name: v.name, perms: v.perms });
}));

router.put("/roles/:id", ok(async (req, res) => {
  if (!idOk(req.params.id) || !(await ownsRow(req.catalyst, "Role", req.params.id))) {
    return res.status(404).json({ error: "Role not found" });
  }
  const v = validRole(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  await req.catalyst.datastore().table("Role")
    .updateRow({ ROWID: req.params.id, name: v.name, perms: JSON.stringify(v.perms) });
  clearPermCache(req.orgId);
  res.json({ id: String(req.params.id), name: v.name, perms: v.perms });
}));

router.delete("/roles/:id", ok(async (req, res) => {
  if (!idOk(req.params.id) || !(await ownsRow(req.catalyst, "Role", req.params.id))) {
    return res.status(404).json({ error: "Role not found" });
  }
  // Hand-cascade the assignments (no FK constraints in Data Store).
  const assigned = rowList(await req.catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID FROM UserRole WHERE roleId = ${zStr(req.params.id)} AND ${orgClause(req.catalyst)}`,
  ));
  const table = req.catalyst.datastore().table("UserRole");
  for (const a of assigned) await table.deleteRow(a.ROWID);
  await req.catalyst.datastore().table("Role").deleteRow(req.params.id);
  clearPermCache(req.orgId);
  res.json({ ok: true });
}));

// ---- users ----------------------------------------------------------------

// Everyone who has ever selected this org (ZohoToken.orgId) plus anyone already
// holding a role here — no separate invite flow needed.
router.get("/users", ok(async (req, res) => {
  const [tokens, assigns] = await Promise.all([
    req.catalyst.zcql().executeZCQLQuery(
      `SELECT userId FROM ZohoToken WHERE ${orgClause(req.catalyst)}`,
    ).then(rowList),
    req.catalyst.zcql().executeZCQLQuery(
      `SELECT userId, roleId FROM UserRole WHERE ${orgClause(req.catalyst)}`,
    ).then(rowList),
  ]);
  const ids = [...new Set([...tokens.map((t) => String(t.userId)), ...assigns.map((a) => String(a.userId))])];
  const list = inList(ids);
  const users = list
    ? rowList(await req.catalyst.zcql().executeZCQLQuery(
        `SELECT ROWID, email, name FROM AppUser WHERE ROWID IN (${list})`,
      ))
    : [];
  const rolesByUser = new Map();
  for (const a of assigns) {
    const k = String(a.userId);
    if (!rolesByUser.has(k)) rolesByUser.set(k, []);
    rolesByUser.get(k).push(String(a.roleId));
  }
  res.json(users.map((u) => ({
    id: String(u.ROWID), email: u.email, name: u.name || "",
    roleIds: rolesByUser.get(String(u.ROWID)) || [],
  })));
}));

// Full-replace the user's role assignments for this org.
router.put("/users/:userId/roles", ok(async (req, res) => {
  if (!idOk(req.params.userId)) return res.status(400).json({ error: "Bad user id" });
  const roleIds = req.body?.roleIds;
  if (!Array.isArray(roleIds) || !roleIds.every(idOk)) {
    return res.status(400).json({ error: "roleIds must be an array of ids" });
  }
  // Only this org's roles are assignable.
  const orgRoles = rowList(await req.catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID FROM Role WHERE ${orgClause(req.catalyst)}`,
  ));
  const valid = new Set(orgRoles.map((r) => String(r.ROWID)));
  if (!roleIds.every((id) => valid.has(String(id)))) {
    return res.status(400).json({ error: "Unknown role for this organization" });
  }
  const existing = rowList(await req.catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID FROM UserRole WHERE userId = ${zStr(req.params.userId)} AND ${orgClause(req.catalyst)}`,
  ));
  const table = req.catalyst.datastore().table("UserRole");
  for (const e of existing) await table.deleteRow(e.ROWID);
  for (const roleId of roleIds) {
    await table.insertRow({ orgId: req.orgId, userId: req.params.userId, roleId: String(roleId) });
  }
  clearPermCache(req.orgId);
  res.json({ ok: true, roleIds: roleIds.map(String) });
}));

module.exports = router;
