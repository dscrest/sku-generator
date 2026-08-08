"use strict";
const express = require("express");
const { getDeal } = require("../zoho/crmApi");

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

module.exports = router;
