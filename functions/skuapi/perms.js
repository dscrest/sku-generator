"use strict";

/**
 * Per-user module permissions (Users & Roles). Role { orgId, name, perms:JSON }
 * defines a named set of permission keys; UserRole { orgId, userId, roleId }
 * assigns roles. A user's effective perms = union of their roles' keys.
 * Mirrors addons.js — requireAddon gates the org (add-on bought), these gate
 * the user within the org. Middleware order on every mount: addon first,
 * perm second, so effective access = org addons ∩ user grants.
 *
 * Key shape (CR-239): a MODULE key alone = view (page access — every older
 * `has(perms, "wo.orders")` gate keeps meaning "can open it"); `<mod>.create`,
 * `<mod>.edit`, `<mod>.delete`, `<mod>.export` are the verbs; `wo.action.*`
 * are WO action grants (CR-125). requirePerm/prefixPerm derive the verb from
 * the HTTP method (verbFor). A role named "Admin" is reserved per org: full
 * access, locked server-side (routes/access.js).
 *
 * Lockout protection, in userPerms itself so no middleware path can 403 it:
 *   - ADMIN_EMAILS super-admins always get ["*"].
 *   - An org with ZERO roles gets ["*"]: deploy changes nothing until the
 *     first role is created (same rollout trick as addons DEFAULT_ON).
 *   - access.js bootstraps an Admin role (assigned to everyone already in the
 *     org) before the first role write, so creating a role never locks anyone.
 */
const { rowList, zStr } = require("./store");
const { getUserById, isAdmin } = require("./session");

// Page/module keys — the rows of the role matrix. Labels live in the frontend.
const MODULES = [
  "wo.orders", "wo.purchase", "wo.bom", "wo.defects", "wo.reports", "wo.settings",
  "sku", "reserve", "estimate",
  "recipe.recipes", "recipe.materials", "recipe.costs", "recipe.sizing", "recipe.configure", "recipe.quotations",
  "users.manage",
];
const VERBS = ["create", "edit", "delete", "export"]; // + implicit "view" = bare key
// WO action-level grants (CR-125): which users may move stock, approve,
// close, assemble, and raise/edit POs.
const ACTIONS = [
  "wo.action.reserve", "wo.action.dereserve", "wo.action.issue", "wo.action.return",
  "wo.action.assemble", "wo.action.approve", "wo.action.close",
  "wo.action.po.create", "wo.action.po.modify",
];
const PERM_KEYS = MODULES.flatMap((m) => [m, ...VERBS.map((v) => `${m}.${v}`)]).concat(ACTIONS);

const has = (perms, key) => perms.includes("*") || perms.includes(key);
const hasVerb = (perms, key, verb) => (verb === "view" ? has(perms, key) : has(perms, `${key}.${verb}`));
const isAdminName = (name) => String(name || "").trim().toLowerCase() === "admin";

// ponytail: roles saved before CR-239 hold bare module keys only; treat them
// as full-verb grants so nobody loses write access on deploy. Drop once every
// org's roles have been re-saved from the new editor.
const VERB_RE = /\.(create|edit|delete|export)$/;
function expandLegacy(keys) {
  if (keys.some((k) => VERB_RE.test(k))) return keys;
  return keys.flatMap((k) => (MODULES.includes(k) ? [k, ...VERBS.map((v) => `${k}.${v}`)] : [k]));
}

// Pure: UserRole+Role rows -> union of perm keys (kept separate for the self-check).
// Any assigned role named Admin = ["*"].
function mergePerms(roleRows) {
  if (roleRows.some((r) => isAdminName(r.name))) return ["*"];
  const set = new Set();
  for (const r of roleRows) {
    let keys = [];
    try { keys = JSON.parse(r.perms || "[]"); } catch { /* corrupt role = no grants */ }
    for (const k of expandLegacy(keys)) if (PERM_KEYS.includes(k)) set.add(k);
  }
  return [...set];
}

// HTTP method -> verb. ponytail: a heuristic, not a per-route table — POST on
// a path with a record id is an edit of that record, otherwise a create;
// READ_POST are read-only computations the configurator/BOM screens POST.
// Add a route here when a real case shows.
const READ_POST = /\/(resolve|select|price|bom|calculate|preview|shortfall-by-item)$/;
function verbFor(method, path) {
  switch (method) {
    case "GET": case "HEAD": case "OPTIONS": return "view";
    case "DELETE": return "delete";
    case "PUT": case "PATCH": return "edit";
    default:
      if (READ_POST.test(path)) return "view";
      return /\/\d+(\/|$)/.test(path) ? "edit" : "create";
  }
}

const MODULE_LABEL = {
  "wo.orders": "Work Orders", "wo.purchase": "Purchase", "wo.bom": "BOM", "wo.defects": "Store issues",
  "wo.reports": "WO Reports", "wo.settings": "WO Settings", sku: "SKU Generator", reserve: "Reserve",
  estimate: "Estimates", "recipe.recipes": "Product Designs", "recipe.materials": "Materials",
  "recipe.costs": "Cost Master", "recipe.sizing": "Sizing Models", "recipe.configure": "Configure & Quote",
  "recipe.quotations": "Quotations", "users.manage": "Users & Roles",
};
const denied = (key, verb) => ({ error: `Your role cannot ${verb} ${MODULE_LABEL[key] || key}`, perm: verb === "view" ? key : `${key}.${verb}` });

// ponytail: 60s in-memory cache, same shape/justification as addonCache —
// these run on every /api request. Role edits show within 60s (or instantly
// on the instance that wrote, via clearPermCache).
const permCache = new Map(); // `${orgId}:${userId}` -> { keys, t }

const orgRoles = async (catalyst, orgId) => rowList(await catalyst.zcql().executeZCQLQuery(
  `SELECT ROWID, name, perms FROM Role WHERE orgId = ${zStr(String(orgId))}`,
));

const parsePerms = (text) => {
  try { return expandLegacy(JSON.parse(text || "[]")); } catch { return []; }
};

// One-time per org: an org that has roles but no Admin role gets one, handed
// to whoever already holds users.manage — or, if nobody does (fresh org, or
// the CR-120 first-role lockout), to everyone who has selected the org. Runs
// from userPerms on any request, so a locked-out user repairs the org just by
// loading the app; access.js also calls it before role writes. Returns roles.
async function ensureAdmin(catalyst, orgId, roles) {
  if (roles.some((r) => isAdminName(r.name))) return roles;
  const org = zStr(String(orgId));
  const assigns = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT userId, roleId FROM UserRole WHERE orgId = ${org}`,
  ));
  const managerRoles = new Set(roles.filter((r) => parsePerms(r.perms).includes("users.manage")).map((r) => String(r.ROWID)));
  let holders = [...new Set(assigns.filter((a) => managerRoles.has(String(a.roleId))).map((a) => String(a.userId)))];
  if (!holders.length) {
    holders = rowList(await catalyst.zcql().executeZCQLQuery(`SELECT userId FROM ZohoToken WHERE orgId = ${org}`))
      .map((t) => String(t.userId));
  }
  const row = await catalyst.datastore().table("Role").insertRow({ orgId: String(orgId), name: "Admin", perms: "[]" });
  const table = catalyst.datastore().table("UserRole");
  for (const userId of holders) await table.insertRow({ orgId: String(orgId), userId, roleId: String(row.ROWID) });
  clearPermCache(orgId);
  console.log(`[perms] bootstrapped Admin role for org ${orgId}: ${holders.length} holder(s)`);
  return [...roles, { ROWID: row.ROWID, name: "Admin", perms: "[]" }];
}

async function userPerms(catalyst, orgId, userId) {
  const ck = `${orgId}:${userId}`;
  const hit = permCache.get(ck);
  if (hit && Date.now() - hit.t < 60_000) return hit.keys;

  let keys;
  const user = await getUserById(catalyst, userId);
  if (user && isAdmin(user.email)) {
    keys = ["*"]; // super-admin bypass — the lockout backstop
  } else {
    let roles = await orgRoles(catalyst, orgId);
    if (!roles.length) {
      keys = ["*"]; // unconfigured org = full access until the first role exists
    } else {
      roles = await ensureAdmin(catalyst, orgId, roles);
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

// 403 unless the current user holds `key` for the request's verb.
// Requires requireAuth + requireOrg upstream.
function requirePerm(key) {
  return async (req, res, next) => {
    try {
      const verb = verbFor(req.method, req.path);
      const perms = await userPerms(req.catalyst, req.orgId, req.userId);
      if (!hasVerb(perms, key, verb)) return res.status(403).json(denied(key, verb));
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Sub-path granularity for a big router mount: ordered [regex, keys[]] table
// matched against req.path; first match wins; the request passes if the user
// holds ANY of the matched keys for the request's verb (any-of sets per prefix).
function matchPerms(map, fallbackKeys, path) {
  for (const [re, keys] of map) if (re.test(path)) return keys;
  return fallbackKeys;
}

function prefixPerm(map, fallbackKeys) {
  return async (req, res, next) => {
    try {
      const wanted = matchPerms(map, fallbackKeys, req.path);
      const verb = verbFor(req.method, req.path);
      const perms = await userPerms(req.catalyst, req.orgId, req.userId);
      if (!wanted.some((k) => hasVerb(perms, k, verb))) {
        return res.status(403).json(denied(wanted[0], verb));
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
  // The defect photo upload is part of raising a defect from the WO grid, so
  // any WO user may reach it; the Store issues list/actions need wo.defects.
  [/^\/defects\/photo$/, ["wo.orders", "wo.defects"]],
  [/^\/defects/, ["wo.defects"]],
  [/^\/(purchase|purchase-requests|purchase-orders|pr-line|pr\/|po\/)/, ["wo.purchase"]],
  [/^\/reports\//, ["wo.reports"]],
  [/^\/composites/, ["wo.bom", "wo.orders"]],
  [/^\/(sales-orders|so\/|items|vendors|next-number|refresh)/, ["wo.orders", "wo.purchase", "wo.bom"]],
];
const RECIPE_MAP = [
  [/^\/materials/, ["recipe.materials"]],
  // the widget reads the material list (CR-281); the master stays with recipe.sizing
  [/^\/sizing-materials/, ["recipe.sizing", "recipe.configure"]],
  // the widget reads the geared-motor sheet (CR-284); the master stays with recipe.sizing
  [/^\/geared-motors/, ["recipe.sizing", "recipe.configure"]],
  [/^\/(sizing-models|seed-rav)/, ["recipe.sizing"]],
  [/^\/component-map\/resolve/, ["recipe.configure"]],
  // the widget never reads the grid, only /resolve — the master stays with recipe.sizing
  [/^\/component-map/, ["recipe.sizing"]],
  [/^\/sizing\//, ["recipe.configure"]],
  [/^\/config-quote/, ["recipe.configure"]], // saved configurator cart (CR-246)
  [/^\/cost-elements/, ["recipe.costs", "recipe.recipes"]],
  [/^\/quotations/, ["recipe.quotations", "recipe.configure"]],
  [/^\/category-items/, ["recipe.configure"]],
  [/^\/books-items/, ["recipe.materials", "recipe.recipes"]],
  [/^\/books-composites/, ["recipe.recipes", "recipe.configure"]],
  // the Component Map grid (recipe.sizing) picks its items from /products
  [/^\/products/, ["recipe.recipes", "recipe.configure", "recipe.sizing"]],
  [/^\/service-items/, ["recipe.recipes", "recipe.sizing"]], // create a Books service item from either form (CR-254)
  [/^\/(recipes|components|options|products|properties|property-values)/, ["recipe.recipes", "recipe.configure"]],
];

module.exports = {
  PERM_KEYS, MODULES, VERBS, ACTIONS, has, hasVerb, isAdminName, expandLegacy, parsePerms, verbFor,
  orgRoles, ensureAdmin, mergePerms, userPerms, requirePerm, prefixPerm, assertAction, clearPermCache, WO_MAP, RECIPE_MAP,
};

// ponytail self-check: `node perms.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // mergePerms: union, dedupe, unknown keys and corrupt JSON ignored
  console.assert(eq(mergePerms([]), []), "no roles -> no perms");
  console.assert(
    eq(mergePerms([{ perms: '["wo.orders.edit","sku"]' }, { perms: '["sku","reserve.create"]' }]).sort(),
      ["reserve.create", "sku", "wo.orders.edit"]),
    "union + dedupe",
  );
  console.assert(eq(mergePerms([{ perms: '["bogus"]' }]), []), "unknown keys ignored");
  console.assert(eq(mergePerms([{ perms: "not json" }]), []), "corrupt JSON = no grants");
  // legacy roles (bare keys only) expand to every verb; mixed roles don't
  console.assert(
    eq(mergePerms([{ perms: '["wo.orders","wo.action.issue"]' }]).sort(),
      ["wo.action.issue", "wo.orders", "wo.orders.create", "wo.orders.delete", "wo.orders.edit", "wo.orders.export"]),
    "legacy role expands verbs, action key untouched",
  );
  console.assert(eq(mergePerms([{ perms: '["wo.orders","sku.edit"]' }]), ["wo.orders", "sku.edit"]), "new-shape role not expanded");
  // Admin role name = wildcard
  console.assert(eq(mergePerms([{ name: " ADMIN ", perms: "[]" }, { perms: '["sku"]' }]), ["*"]), "Admin role = *");
  console.assert(isAdminName("admin") && !isAdminName("Administrator"), "isAdminName exact");
  // has / hasVerb: wildcard, view = bare key, verbs suffixed
  console.assert(has(["*"], "anything"), "wildcard grants all");
  console.assert(!has(["sku"], "wo.orders"), "no cross-grant");
  console.assert(hasVerb(["sku"], "sku", "view") && !hasVerb(["sku"], "sku", "edit"), "view-only role");
  console.assert(hasVerb(["sku", "sku.delete"], "sku", "delete"), "verb key");
  // verbFor: method heuristic
  console.assert(verbFor("GET", "/123") === "view", "GET = view");
  console.assert(verbFor("DELETE", "/po/5") === "delete", "DELETE = delete");
  console.assert(verbFor("PUT", "/settings") === "edit", "PUT = edit");
  console.assert(verbFor("POST", "/") === "create", "POST root = create");
  console.assert(verbFor("POST", "/purchase/raise") === "create", "POST no id = create");
  console.assert(verbFor("POST", "/123/status") === "edit", "POST on record = edit");
  console.assert(verbFor("POST", "/txn/77/confirm") === "edit", "POST nested id = edit");
  console.assert(verbFor("POST", "/sizing/select") === "view", "read-only POST = view");
  console.assert(verbFor("POST", "/123/bom/preview") === "view", "preview POST = view");
  // route maps: expected classification
  const cls = (map, fb, p) => matchPerms(map, fb, p);
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/settings"), ["wo.settings"]), "wo settings");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/warehouses"), ["wo.orders"]), "warehouse picker open to WO users");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/purchase-requests"), ["wo.purchase"]), "wo PRs");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/po/123/receive"), ["wo.purchase"]), "wo PO");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/reports/stock"), ["wo.reports"]), "wo reports");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/defects/photo"), ["wo.orders", "wo.defects"]), "defect photo open to WO users");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/defects"), ["wo.defects"]), "store issues list");
  console.assert(eq(cls(WO_MAP, ["wo.orders"], "/defects/12/action"), ["wo.defects"]), "store issues action");
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
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/sizing-models/4"), ["recipe.sizing"]), "recipe sizing master");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/seed-rav-materials"), ["recipe.sizing"]), "material seed = sizing master");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/geared-motors/4"), ["recipe.sizing", "recipe.configure"]), "geared motors: widget reads, master edits");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/seed-rav-motors"), ["recipe.sizing"]), "motor seed = sizing master");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/service-items"), ["recipe.recipes", "recipe.sizing"]), "recipe service item create");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/sizing/select"), ["recipe.configure"]), "recipe sizing select");
  console.assert(eq(cls(RECIPE_MAP, ["recipe.recipes"], "/config-quote/quotes:1"), ["recipe.configure"]), "saved configurator cart");
  console.log("perms.js self-check passed");
}
