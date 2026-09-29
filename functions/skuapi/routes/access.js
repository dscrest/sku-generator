"use strict";

/**
 * Users & Roles (per-org). Mounted at /api/access behind requirePerm("users.manage").
 * Roles are named permission sets (Role.perms = JSON array of PERM_KEYS —
 * module keys, `<mod>.<verb>` keys, `wo.action.*`); users get roles per org
 * via UserRole. A user's access = union of their roles.
 *
 * "Admin" is a reserved role name per org (CR-239): full access, cannot be
 * edited/deleted/renamed-into, and the org must always keep ≥1 Admin holder.
 * ensureAdmin() bootstraps it before anything else is read or written, so a
 * role edit never changes anyone's access until it is assigned. ADMIN_EMAILS
 * super-admins still bypass everything (perms.js), so a locked org is
 * repairable through this same UI.
 */
const express = require("express");
const { rowList, zStr, idOk, orgClause, ownsRow } = require("../store");
const { inList } = require("../workorder/store");
const { PERM_KEYS, isAdminName, parsePerms, orgRoles, ensureAdmin: bootstrapAdmin, clearPermCache } = require("../perms");

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
  if (isAdminName(name)) return { error: '"Admin" is a reserved role name' };
  if (!Array.isArray(perms) || !perms.every((p) => PERM_KEYS.includes(p))) {
    return { error: "perms must be an array of known permission keys" };
  }
  return { name, perms };
}

const roleOut = (r, users = 0) => ({
  id: String(r.ROWID), name: r.name, users,
  locked: isAdminName(r.name),
  perms: isAdminName(r.name) ? ["*"] : parsePerms(r.perms),
});

const orgAssigns = async (req) => rowList(await req.catalyst.zcql().executeZCQLQuery(
  `SELECT ROWID, userId, roleId FROM UserRole WHERE ${orgClause(req.catalyst)}`,
));
// Everyone who has ever selected this org (ZohoToken.orgId).
const orgUserIds = async (req) => rowList(await req.catalyst.zcql().executeZCQLQuery(
  `SELECT userId FROM ZohoToken WHERE ${orgClause(req.catalyst)}`,
)).map((t) => String(t.userId));

// Org roles with the Admin role guaranteed (perms.js ensureAdmin bootstraps it
// — here it also runs for an org with zero roles, since the user is explicitly
// setting roles up). Sorted by name.
async function ensureAdmin(req) {
  const roles = await bootstrapAdmin(req.catalyst, req.orgId, await orgRoles(req.catalyst, req.orgId));
  return roles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function loadRole(req) {
  if (!idOk(req.params.id) || !(await ownsRow(req.catalyst, "Role", req.params.id))) return null;
  return rowList(await req.catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID, name, perms FROM Role WHERE ROWID = ${zStr(req.params.id)}`,
  ))[0] || null;
}

// ---- roles ----------------------------------------------------------------

router.get("/roles", ok(async (req, res) => {
  const [roles, assigns] = await Promise.all([ensureAdmin(req), orgAssigns(req)]);
  const counts = new Map();
  for (const a of assigns) counts.set(String(a.roleId), (counts.get(String(a.roleId)) || 0) + 1);
  res.json(roles.map((r) => roleOut(r, counts.get(String(r.ROWID)) || 0)));
}));

router.post("/roles", ok(async (req, res) => {
  const v = validRole(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  await ensureAdmin(req);
  const row = await req.catalyst.datastore().table("Role")
    .insertRow({ orgId: req.orgId, name: v.name, perms: JSON.stringify(v.perms) });
  clearPermCache(req.orgId);
  res.json({ id: String(row.ROWID), name: v.name, perms: v.perms, users: 0, locked: false });
}));

router.put("/roles/:id", ok(async (req, res) => {
  const role = await loadRole(req);
  if (!role) return res.status(404).json({ error: "Role not found" });
  if (isAdminName(role.name)) return res.status(403).json({ error: "The Admin role cannot be edited" });
  const v = validRole(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  await req.catalyst.datastore().table("Role")
    .updateRow({ ROWID: req.params.id, name: v.name, perms: JSON.stringify(v.perms) });
  clearPermCache(req.orgId);
  res.json({ id: String(req.params.id), name: v.name, perms: v.perms, locked: false });
}));

router.delete("/roles/:id", ok(async (req, res) => {
  const role = await loadRole(req);
  if (!role) return res.status(404).json({ error: "Role not found" });
  if (isAdminName(role.name)) return res.status(403).json({ error: "The Admin role cannot be deleted" });
  // Deleting an assigned role would change those users' access — refuse.
  const assigned = (await orgAssigns(req)).filter((a) => String(a.roleId) === String(req.params.id));
  if (assigned.length) {
    return res.status(409).json({ error: `Role is assigned to ${assigned.length} user(s) — unassign them first` });
  }
  await req.catalyst.datastore().table("Role").deleteRow(req.params.id);
  clearPermCache(req.orgId);
  res.json({ ok: true });
}));

// ---- users ----------------------------------------------------------------

// Everyone who has ever selected this org (ZohoToken.orgId) plus anyone already
// holding a role here — no separate invite flow needed.
router.get("/users", ok(async (req, res) => {
  const [tokenIds, assigns] = await Promise.all([orgUserIds(req), orgAssigns(req)]);
  const ids = [...new Set([...tokenIds, ...assigns.map((a) => String(a.userId))])];
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
  const roles = await ensureAdmin(req);
  const valid = new Set(roles.map((r) => String(r.ROWID)));
  if (!roleIds.every((id) => valid.has(String(id)))) {
    return res.status(400).json({ error: "Unknown role for this organization" });
  }
  // Gate: the org must always keep at least one Admin holder.
  const adminId = String(roles.find((r) => isAdminName(r.name)).ROWID);
  const assigns = await orgAssigns(req);
  const userId = String(req.params.userId);
  const adminHolders = new Set(assigns.filter((a) => String(a.roleId) === adminId).map((a) => String(a.userId)));
  if (adminHolders.has(userId) && !roleIds.map(String).includes(adminId) && adminHolders.size <= 1) {
    return res.status(400).json({ error: "At least one Admin user is required — make someone else Admin first" });
  }
  const table = req.catalyst.datastore().table("UserRole");
  for (const e of assigns) if (String(e.userId) === userId) await table.deleteRow(e.ROWID);
  for (const roleId of roleIds) {
    await table.insertRow({ orgId: req.orgId, userId, roleId: String(roleId) });
  }
  clearPermCache(req.orgId);
  res.json({ ok: true, roleIds: roleIds.map(String) });
}));

module.exports = router;
