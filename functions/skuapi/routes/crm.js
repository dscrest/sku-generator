"use strict";
const express = require("express");
const { getDeal, getQuote, getDealQuotes, getAccount, getContact } = require("../zoho/crmApi");

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

module.exports = router;
