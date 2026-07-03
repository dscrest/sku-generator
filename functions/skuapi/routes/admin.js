"use strict";

/** OCTFIS super-admin: per-customer-org add-on entitlements. */
const express = require("express");
const { rowList, zStr } = require("../store");
const { ADDON_KEYS, DEFAULT_ON } = require("../addons");

const router = express.Router();

// Every org we've ever seen (distinct orgs across ZohoToken rows) merged with
// its OrgAddon rows -> [{ orgId, orgName, addons: { key: bool } }]
router.get("/orgs", async (req, res) => {
  try {
    const tokens = rowList(await req.catalyst.zcql().executeZCQLQuery("SELECT orgId, orgName FROM ZohoToken"));
    const orgs = new Map();
    for (const t of tokens) {
      if (t.orgId) orgs.set(String(t.orgId), t.orgName || null);
    }
    const rows = rowList(await req.catalyst.zcql().executeZCQLQuery("SELECT orgId, addonKey, enabled FROM OrgAddon"));
    const explicit = new Map(); // orgId -> Map(addonKey -> bool)
    for (const r of rows) {
      const per = explicit.get(String(r.orgId)) || new Map();
      per.set(r.addonKey, r.enabled === true || r.enabled === "true");
      explicit.set(String(r.orgId), per);
    }
    res.json(
      [...orgs.entries()].map(([orgId, orgName]) => {
        const per = explicit.get(orgId) || new Map();
        const addons = {};
        for (const k of ADDON_KEYS) addons[k] = per.has(k) ? per.get(k) : DEFAULT_ON.has(k);
        return { orgId, orgName, addons };
      }),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upsert one entitlement. Body: { orgId, addonKey, enabled }
router.post("/org-addons", async (req, res) => {
  const { orgId, addonKey, enabled } = req.body || {};
  if (!orgId || !/^\d+$/.test(String(orgId))) return res.status(400).json({ error: "valid orgId required" });
  if (!ADDON_KEYS.includes(addonKey)) return res.status(400).json({ error: "unknown addonKey" });
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(
        `SELECT ROWID FROM OrgAddon WHERE orgId = ${zStr(String(orgId))} AND addonKey = ${zStr(addonKey)}`,
      ),
    );
    const table = req.catalyst.datastore().table("OrgAddon");
    if (rows.length) {
      await table.updateRow({ ROWID: rows[0].ROWID, enabled: Boolean(enabled) });
    } else {
      await table.insertRow({ orgId: String(orgId), addonKey, enabled: Boolean(enabled) });
    }
    res.json({ ok: true, orgId: String(orgId), addonKey, enabled: Boolean(enabled) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Every table carrying org data. ZohoToken last: deleting it disconnects the
// org's users (their AppUser logins survive; they can reconnect elsewhere).
const ORG_TABLES = [
  "OrgAddon",
  "SKUItemValue",
  "SKUItem",
  "PropertyValue",
  "Property",
  "Industry",
  "ReservationLine",
  "ItemStockSnapshot",
  "ZohoToken",
];

// Permanently remove a customer org: all its rows across every org-scoped table.
router.delete("/orgs/:orgId", async (req, res) => {
  const { orgId } = req.params;
  if (!/^\d+$/.test(orgId)) return res.status(400).json({ error: "valid orgId required" });
  try {
    const deleted = {};
    for (const table of ORG_TABLES) {
      let n = 0;
      // ponytail: per-row deletes in 200-row pages, same as the existing
      // cascade deletes; fine at catalog scale.
      for (;;) {
        const rows = rowList(
          await req.catalyst.zcql().executeZCQLQuery(
            `SELECT ROWID FROM ${table} WHERE orgId = ${zStr(String(orgId))} LIMIT 200`,
          ),
        );
        if (!rows.length) break;
        for (const r of rows) await req.catalyst.datastore().table(table).deleteRow(r.ROWID);
        n += rows.length;
      }
      deleted[table] = n;
    }
    res.json({ ok: true, orgId: String(orgId), deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
