"use strict";

/**
 * Audit trail reader (CR-233): the History tab of every record type.
 * GET /api/activity?entityType=RecipeTemplate&entityId=123 → ActivityLog rows
 * for that record, newest first, actor names resolved. Org-scoped by the
 * query; no addon gate — every module's details page uses it.
 */
const express = require("express");
const { idOk, zStr } = require("../store");
const { auditRows } = require("../workorder/reports");

const router = express.Router();
const TYPE_RE = /^[A-Za-z]{1,40}$/;

router.get("/", async (req, res, next) => {
  try {
    const { entityType, entityId } = req.query;
    if (!TYPE_RE.test(String(entityType || "")) || !idOk(entityId)) {
      return res.status(400).json({ error: "entityType and entityId are required" });
    }
    res.json(await auditRows(req.catalyst, req.orgId, `entityType = ${zStr(entityType)} AND entityId = ${zStr(String(entityId))}`));
  } catch (err) { next(err); }
});

module.exports = router;
