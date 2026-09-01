"use strict";

/**
 * Per-org add-on entitlements, backed by the OrgAddon table
 * (orgId, addonKey, enabled). Explicit rows win; DEFAULT_ON fills the gaps so
 * legacy orgs need no seed rows.
 */
const { rowList, zStr } = require("./store");

// All known add-ons — admin UI + upsert validation use this list.
const ADDON_KEYS = ["sku-generator", "work-order", "reserve", "cheque-printing", "label-printing"];
// ponytail: sku-generator defaults ON so existing orgs keep working with zero
// migration; every new add-on is opt-in via an explicit OrgAddon row.
const DEFAULT_ON = new Set(["sku-generator"]);

// Pure merge: OrgAddon rows -> enabled key list (kept separate for the self-check).
function mergeEnabled(rows) {
  const explicit = new Map(rows.map((r) => [r.addonKey, r.enabled === true || r.enabled === "true"]));
  return ADDON_KEYS.filter((k) => (explicit.has(k) ? explicit.get(k) : DEFAULT_ON.has(k)));
}

// ponytail: 60s in-memory cache — requireAddon runs one ZCQL on EVERY /api
// request, which held function-concurrency slots and helped trip the Dev-env
// 429 cap. Entitlement toggles take ≤60s to show; cache dies with the instance.
const addonCache = new Map(); // orgId -> { keys, t }

async function enabledAddons(catalyst, orgId) {
  const hit = addonCache.get(String(orgId));
  if (hit && Date.now() - hit.t < 60_000) return hit.keys;
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT addonKey, enabled FROM OrgAddon WHERE orgId = ${zStr(String(orgId))}`,
    ),
  );
  const keys = mergeEnabled(rows);
  addonCache.set(String(orgId), { keys, t: Date.now() });
  return keys;
}

// Middleware factory: 403 unless the request's org (set by requireOrg) has the
// add-on enabled. ponytail: one ZCQL per request; cache per-org if it ever shows.
function requireAddon(key) {
  return async (req, res, next) => {
    try {
      const keys = await enabledAddons(req.catalyst, req.orgId);
      if (!keys.includes(key)) return res.status(403).json({ error: "Add-on not enabled", addon: key });
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Admin toggles call this so the change shows immediately (same instance).
function clearAddonCache(orgId) {
  addonCache.delete(String(orgId));
}

module.exports = { ADDON_KEYS, DEFAULT_ON, mergeEnabled, enabledAddons, requireAddon, clearAddonCache };

// ponytail self-check: `node addons.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  console.assert(eq(mergeEnabled([]), ["sku-generator"]), "no rows -> default-on only");
  console.assert(eq(mergeEnabled([{ addonKey: "sku-generator", enabled: "false" }]), []), "explicit off beats default");
  console.assert(eq(mergeEnabled([{ addonKey: "reserve", enabled: true }]), ["sku-generator", "reserve"]), "explicit on adds to defaults");
  console.assert(eq(mergeEnabled([{ addonKey: "bogus", enabled: true }]), ["sku-generator"]), "unknown keys ignored");
  console.log("addons.js self-check passed");
}
