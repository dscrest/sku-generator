"use strict";

/**
 * Per-user module permissions (Users & Roles). Role { orgId, name, perms:JSON }
 * defines a named set of permission keys; UserRole { orgId, userId, roleId }
 * assigns roles. A user's effective perms = union of their roles' keys.
 * Mirrors addons.js — requireAddon gates the org (add-on bought), these gate
 * the user within the org. Middleware order on every mount: addon first,
 * perm second, so effective access = org addons ∩ user grants.
 *
 * Lockout protection, in userPerms itself so no middleware path can 403 it:
 *   - ADMIN_EMAILS super-admins always get ["*"].
 *   - An org with ZERO roles gets ["*"]: deploy changes nothing until the
 *     first role is created (same rollout trick as addons DEFAULT_ON).
 */
const { rowList, zStr } = require("./store");
const { getUserById, isAdmin } = require("./session");

const PERM_KEYS = [
  "wo.orders", "wo.purchase", "wo.bom", "wo.reports", "wo.settings",
  // WO action-level grants (CR-125): which users may move stock, approve,
  // close, assemble, and raise/edit POs. Same lockout rules as page keys —
  // an org with zero roles is wide open, super-admins always pass.
  "wo.action.reserve", "wo.action.dereserve", "wo.action.issue", "wo.action.return",
  "wo.action.assemble", "wo.action.approve", "wo.action.close",
  "wo.action.po.create", "wo.action.po.modify",
  "sku", "reserve", "estimate",
  "recipe.recipes", "recipe.materials", "recipe.costs", "recipe.configure", "recipe.quotations",
  "users.manage",
];

const has = (perms, key) => perms.includes("*") || perms.includes(key);

// Pure: UserRole+Role rows -> union of perm keys (kept separate for the self-check).
function mergePerms(roleRows) {
  const set = new Set();
  for (const r of roleRows) {
    let keys = [];
    try { keys = JSON.parse(r.perms || "[]"); } catch { /* corrupt role = no grants */ }
    for (const k of keys) if (PERM_KEYS.includes(k)) set.add(k);
  }
  return [...set];
}

// ponytail: 60s in-memory cache, same shape/justification as addonCache —
// these run on every /api request. Role edits show within 60s (or instantly
// on the instance that wrote, via clearPermCache).
const permCache = new Map(); // `${orgId}:${userId}` -> { keys, t }

async function userPerms(catalyst, orgId, userId) {
  const ck = `${orgId}:${userId}`;
  const hit = permCache.get(ck);
  if (hit && Date.now() - hit.t < 60_000) return hit.keys;

  let keys;
  const user = await getUserById(catalyst, userId);
  if (user && isAdmin(user.email)) {
    keys = ["*"]; // super-admin bypass — the lockout backstop
  } else {
    const roles = rowList(await catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID, perms FROM Role WHERE orgId = ${zStr(String(orgId))}`,
    ));
    if (!roles.length) {
      keys = ["*"]; // unconfigured org = full access until the first role exists
    } else {
      const assigned = rowList(await catalyst.zcql().executeZCQLQuery(
        `SELECT roleId FROM UserRole WHERE orgId = ${zStr(String(orgId))} AND userId = ${zStr(String(userId))}`,
      ));
      const mine = new Set(assigned.map((a) => String(a.roleId)));
      keys = mergePerms(roles.filter((r) => mine.has(String(r.ROWID))));
    }
  }
  permCache.set(ck, { keys, t: Date.now() });
  return keys;
}

// In-route variant of requirePerm for handlers that derive the key from the
// body (txn type, target status) — throws 403 instead of responding (CR-125).
async function assertAction(catalyst, orgId, userId, key) {
  const perms = await userPerms(catalyst, orgId, userId);
  if (!has(perms, key)) {
    const e = new Error("You don't have permission for this action — ask an administrator");
    e.status = 403;
    e.perm = key;
    throw e;
  }
}

// 403 unless the current user holds `key`. Requires requireAuth + requireOrg upstream.
function requirePerm(key) {
  return async (req, res, next) => {
    try {
      const perms = await userPerms(req.catalyst, req.orgId, req.userId);
      if (!has(perms, key)) return res.status(403).json({ error: "Permission required", perm: key });
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Sub-path granularity for a big router mount: ordered [regex, keys[]] table
// matched against req.path; first match wins; the request passes if the user
// holds ANY of the matched keys. ponytail: any-of sets per prefix, not
// per-verb; split read/write keys if a real leak shows.
function matchPerms(map, fallbackKeys, path) {
  for (const [re, keys] of map) if (re.test(path)) return keys;
  return fallbackKeys;
}

function prefixPerm(map, fallbackKeys) {
  return async (req, res, next) => {
    try {
      const wanted = matchPerms(map, fallbackKeys, req.path);
      const perms = await userPerms(req.catalyst, req.orgId, req.userId);
      if (!wanted.some((k) => has(perms, k))) {
        return res.status(403).json({ error: "Permission required", perm: wanted[0] });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

function clearPermCache(orgId) {
  const prefix = `${orgId}:`;
  for (const k of permCache.keys()) if (k.startsWith(prefix)) permCache.delete(k);
}

// Route maps used by index.js (kept here so the self-check covers them).
const WO_MAP = [
  [/^\/settings/, ["wo.settings"]],
  [/^\/(purchase|purchase-requests|purchase-orders|pr-line|pr\/|po\/)/, ["wo.purchase"]],
  [/^\/reports\//, ["wo.reports"]],
  [/^\/composites/, ["wo.bom", "wo.orders"]],
  [/^\/(sales-orders|so\/|items|vendors|next-number|refresh)/, ["wo.orders", "wo.purchase", "wo.bom"]],
];
const RECIPE_MAP = [
  [/^\/materials/, ["recipe.materials"]],
  [/^\/cost-elements/, ["recipe.costs", "recipe.recipes"]],
  [/^\/quotations/, ["recipe.quotations", "recipe.configure"]],
  [/^\/books-items/, ["recipe.materials", "recipe.recipes"]],
  [/^\/books-composites/, ["recipe.recipes", "recipe.configure"]],
  [/^\/(recipes|components|options|products|properties|property-values)/, ["recipe.recipes", "recipe.configure"]],
];

module.exports = { PERM_KEYS, has, mergePerms, userPerms, requirePerm, prefixPerm, assertAction, clearPermCache, WO_MAP, RECIPE_MAP };

// ponytail self-check: `node perms.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // mergePerms: union, dedupe, unknown keys and corrupt JSON ignored
  console.assert(eq(mergePerms([]), []), "no roles -> no perms");
  console.assert(
    eq(mergePerms([{ perms: '["wo.orders","sku"]' }, { perms: '["sku","reserve"]' }]).sort(),
      ["reserve", "sku", "wo.orders"]),
    "union + dedupe",
  );
  console.assert(eq(mergePerms([{ perms: '["bogus"]' }]), []), "unknown keys ignored");
  console.assert(eq(mergePerms([{ perms: "not json" }]), []), "corrupt JSON = no grants");
  // has: wildcard
  console.assert(has(["*"], "anything"), "wildcard grants all");
  console.assert(!has(["sku"], "wo.orders"), "no cross-grant");
  // route maps: expected classification
  const cls = (map, fb, p) => matchPerms(map, fb, p);
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/settings"), ["wo.settings"]), "wo settings");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/purchase-requests"), ["wo.purchase"]), "wo PRs");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/po/123/receive"), ["wo.purchase"]), "wo PO");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/reports/stock"), ["wo.reports"]), "wo reports");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/composites"), ["wo.bom", "wo.orders"]), "wo bom");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/sales-orders"), ["wo.orders", "wo.purchase", "wo.bom"]), "wo shared lookups");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/"), ["wo.orders"]), "wo root fallback");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/123/approve"), ["wo.orders"]), "wo detail fallback");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/materials"), ["recipe.materials"]), "recipe materials");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/quotations/9"), ["recipe.quotations", "recipe.configure"]), "recipe quotes");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/recipes/1"), ["recipe.recipes", "recipe.configure"]), "recipe read");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/books-items"), ["recipe.materials", "recipe.recipes"]), "recipe books items");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/books-composites"), ["recipe.recipes", "recipe.configure"]), "recipe books composites");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/recipes/1/push-books"), ["recipe.recipes", "recipe.configure"]), "recipe push");
  console.log("perms.js self-check passed");
}
