"use strict";

/**
 * Shared grid column layouts (CR: grid column chooser). One row per org × grid:
 * GridPref { orgId, gridKey, config } where config = JSON {order:[], hidden:[]}.
 * Org-wide on purpose — any user's Apply changes the layout for the whole org.
 * Mounted at /api/grid-prefs with NO addon gate: every module's grids use it.
 */
const express = require("express");
const { rowList, zStr } = require("../store");

const router = express.Router();
const KEY_RE = /^[a-z0-9.-]{1,50}$/;

router.get("/:gridKey", async (req, res, next) => {
  try {
    if (!KEY_RE.test(req.params.gridKey)) return res.status(400).json({ error: "Bad grid key" });
    const rows = rowList(await req.catalyst.zcql().executeZCQLQuery(
      `SELECT config FROM GridPref WHERE orgId = ${zStr(req.orgId)} AND gridKey = ${zStr(req.params.gridKey)}`,
    ));
    let cfg = null;
    try { cfg = rows.length ? JSON.parse(rows[0].config) : null; } catch { /* corrupt row = defaults */ }
    res.json({ order: cfg?.order || [], hidden: cfg?.hidden || [] });
  } catch (err) { next(err); }
});

router.put("/:gridKey", async (req, res, next) => {
  try {
    if (!KEY_RE.test(req.params.gridKey)) return res.status(400).json({ error: "Bad grid key" });
    const { order, hidden } = req.body || {};
    const strings = (a) => Array.isArray(a) && a.every((s) => typeof s === "string" && s.length <= 60);
    if (!strings(order) || !strings(hidden)) return res.status(400).json({ error: "order/hidden must be string arrays" });
    const config = JSON.stringify({ order, hidden });
    if (config.length > 9500) return res.status(400).json({ error: "Layout too large" }); // text column caps at 10000
    const rows = rowList(await req.catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID FROM GridPref WHERE orgId = ${zStr(req.orgId)} AND gridKey = ${zStr(req.params.gridKey)}`,
    ));
    const table = req.catalyst.datastore().table("GridPref");
    const fields = { orgId: req.orgId, gridKey: req.params.gridKey, config };
    if (rows.length) await table.updateRow({ ROWID: rows[0].ROWID, ...fields });
    else await table.insertRow(fields);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
