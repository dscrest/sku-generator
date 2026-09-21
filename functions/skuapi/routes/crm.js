"use strict";
const express = require("express");
const { getDeal, getQuote, getDealQuotes, getAccount, getContact } = require("../zoho/crmApi");

const { rowList, zStr, idOk } = require("../store");
const { requirePerm } = require("../perms");

const router = express.Router();

// Read-only Deal lookup for the "CRM Info" card on the SKU generator page.
// Opened via a Zoho CRM custom link button: /#/sku/generator?dealId=<id>.
router.get("/deal/:id", async (req, res, next) => {
  try {
    const deal = await getDeal(req.catalyst, req.params.id);
    if (!deal) return res.status(404).json({ error: "not_found" });
    res.json(deal);
  } catch (err) {
    if (err.reauth) return res.status(409).json({ error: "reauth_required" });
    next(err);
  }
});

// Quotes related to a deal, for the estimate page's picker. Empty array is a
// valid state (deal with no quotes), not a 404.
router.get("/deal/:id/quotes", async (req, res, next) => {
  try {
    res.json(await getDealQuotes(req.catalyst, req.params.id));
  } catch (err) {
    if (err.reauth) return res.status(409).json({ error: "reauth_required" });
    next(err);
  }
});

// Full quote (with Quoted_Items) for the estimate sheet, plus the raw Account
// and Contact records behind its lookups (underscore keys so they can't
// collide with CRM quote fields). A broken lookup never kills the quote.
router.get("/quote/:id", async (req, res, next) => {
  try {
    const quote = await getQuote(req.catalyst, req.params.id);
    if (!quote) return res.status(404).json({ error: "not_found" });
    const [account, contact] = await Promise.all([
      quote.Account_Name?.id ? getAccount(req.catalyst, quote.Account_Name.id).catch(() => null) : null,
      quote.Contact_Name?.id ? getContact(req.catalyst, quote.Contact_Name.id).catch(() => null) : null,
    ]);
    res.json({ ...quote, _account: account, _contact: contact });
  } catch (err) {
    if (err.reauth) return res.status(409).json({ error: "reauth_required" });
    next(err);
  }
});

// Org-wide quote T&C (CR-192), managed in Settings → Quote T&C. Customers get
// different terms, so there are N named templates ({ name, terms[] }, one
// OrgSetting row each, id = ROWID) plus one shared bank/contact table. JSON
// lives in settingText — it overflows settingValue's varchar(255), and blank
// settingValue keeps these rows out of settings().
const TPL_KEY = "estimateTpl";
const BANK_KEY = "estimateBank";
const canEdit = requirePerm("estimate");
const termRows = async (req, key, extra = "") => rowList(await req.catalyst.zcql().executeZCQLQuery(
  `SELECT ROWID, settingText FROM OrgSetting WHERE orgId = ${zStr(String(req.orgId))} AND settingKey = ${zStr(key)}${extra} ORDER BY CREATEDTIME`,
));
const parse = (t) => { try { return JSON.parse(t); } catch { return null; } };
// Catalyst silently truncates text at 10000 — refuse rather than corrupt the JSON.
function packed(res, obj) {
  const t = JSON.stringify(obj);
  if (t.length <= 9500) return t;
  res.status(413).json({ error: "Too long — shorten the text and save again" });
  return null;
}
const tplBody = (b) => (b && typeof b.name === "string" && b.name.trim() && Array.isArray(b.terms)
  ? { name: b.name.trim().slice(0, 80), terms: b.terms } : null);

router.get("/estimate-terms", async (req, res, next) => {
  try {
    const templates = (await termRows(req, TPL_KEY))
      .map((r) => ({ id: String(r.ROWID), ...parse(r.settingText) })).filter((t) => t.name);
    const bank = parse((await termRows(req, BANK_KEY))[0]?.settingText);
    res.json({ templates, bank: Array.isArray(bank) ? bank : null });
  } catch (err) { next(err); }
});

router.post("/estimate-terms/templates", canEdit, async (req, res, next) => {
  try {
    const body = tplBody(req.body);
    if (!body) return res.status(400).json({ error: "Template needs a name and terms" });
    const settingText = packed(res, body);
    if (!settingText) return;
    const row = await req.catalyst.datastore().table("OrgSetting")
      .insertRow({ orgId: String(req.orgId), settingKey: TPL_KEY, settingText });
    res.json({ id: String(row.ROWID) });
  } catch (err) { next(err); }
});

// :id is only trusted after the org+key lookup finds it.
async function ownTpl(req, res) {
  const row = idOk(req.params.id) && (await termRows(req, TPL_KEY, ` AND ROWID = ${req.params.id}`))[0];
  if (!row) res.status(404).json({ error: "Template not found" });
  return row;
}

router.put("/estimate-terms/templates/:id", canEdit, async (req, res, next) => {
  try {
    const body = tplBody(req.body);
    if (!body) return res.status(400).json({ error: "Template needs a name and terms" });
    const row = await ownTpl(req, res);
    if (!row) return;
    const settingText = packed(res, body);
    if (!settingText) return;
    await req.catalyst.datastore().table("OrgSetting").updateRow({ ROWID: row.ROWID, settingText });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete("/estimate-terms/templates/:id", canEdit, async (req, res, next) => {
  try {
    const row = await ownTpl(req, res);
    if (!row) return;
    await req.catalyst.datastore().table("OrgSetting").deleteRow(row.ROWID);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put("/estimate-terms/bank", canEdit, async (req, res, next) => {
  try {
    if (!Array.isArray(req.body?.bank)) return res.status(400).json({ error: "Invalid bank table" });
    const settingText = packed(res, req.body.bank);
    if (!settingText) return;
    const table = req.catalyst.datastore().table("OrgSetting");
    const row = (await termRows(req, BANK_KEY))[0];
    if (row) await table.updateRow({ ROWID: row.ROWID, settingText });
    else await table.insertRow({ orgId: String(req.orgId), settingKey: BANK_KEY, settingText });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
