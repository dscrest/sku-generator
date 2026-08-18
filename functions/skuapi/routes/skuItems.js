"use strict";
const express = require("express");
const { rowList, out, idOk, zStr, orgClause, ownsRow, findSkuRowId } = require("../store");
const { pushToZoho } = require("../zoho/push");
const { importFromBooks } = require("../zoho/import");
const { searchItemIds, deleteItemValues, backfillItemValues } = require("../itemValues");

const router = express.Router();
const TABLE = "SKUItem";

// Attach { industry: { name } } to each item (replaces Prisma's include).
async function withIndustry(catalyst, items) {
  const ids = [...new Set(items.map((i) => i.industryId).filter(Boolean))];
  let nameMap = {};
  if (ids.length) {
    const inds = rowList(
      await catalyst.zcql().executeZCQLQuery(`SELECT ROWID, name FROM Industry WHERE ROWID IN (${ids.join(",")})`),
    );
    nameMap = Object.fromEntries(inds.map((r) => [String(r.ROWID), r.name]));
  }
  return items.map((i) => ({ ...i, industry: { name: nameMap[i.industryId] || null } }));
}

router.get("/", async (req, res) => {
  const { industryId } = req.query;
  try {
    const where = [orgClause(req.catalyst)];
    if (industryId) {
      if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
      where.push(`industryId = ${industryId}`);
    }
    const q = `SELECT * FROM ${TABLE} WHERE ${where.join(" AND ")} ORDER BY CREATEDTIME DESC`;
    const items = rowList(await req.catalyst.zcql().executeZCQLQuery(q)).map(out);
    res.json(await withIndustry(req.catalyst, items));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// One-shot backfill of structured values for pre-existing items. Idempotent.
router.post("/backfill-values", async (req, res) => {
  try {
    res.json(await backfillItemValues(req.catalyst));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import new items from Zoho Books into an industry. Body: { industryId }.
// Create-only: items already linked (by zohoItemId or sku) are skipped.
router.post("/import-zoho", async (req, res) => {
  const { industryId } = req.body || {};
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  try {
    res.json(await importFromBooks(req.catalyst, industryId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search. Body: { industryId?, q?, sku?, type?, filters: [{ propertyId, valueId?, text? }] }.
// q = free-text LIKE on sku/name; sku = LIKE on sku only; type = exact match;
// filters = property-based. All present clauses are AND-ed. Nothing set ->
// plain list (optionally by industry).
// NB: ZCQL's LIKE wildcard is * (case-insensitive), not SQL's %.
// ponytail: LIKE '*q*' is a table scan and pulls one 300-row ZCQL page; fine for
// the internal app. Swap the q path to Catalyst Search (app.search()) for CRM/scale.
const TYPES = ["Trading", "Manufacturing"];
router.post("/search", async (req, res) => {
  const { industryId, filters, q, sku, type } = req.body || {};
  if (industryId && !idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  if (type && !TYPES.includes(type)) return res.status(400).json({ error: "Invalid type" });
  try {
    const zcql = req.catalyst.zcql();
    const ids = await searchItemIds(req.catalyst, filters);
    if (ids !== null && ids.size === 0) return res.json([]);

    const where = [orgClause(req.catalyst)];
    if (ids !== null) where.push(`ROWID IN (${[...ids].join(",")})`);
    if (industryId) where.push(`industryId = ${industryId}`);
    if (q && q.trim()) {
      const like = zStr("*" + q.trim() + "*"); // zStr escapes quotes — injection guard
      where.push(`(sku LIKE ${like} OR name LIKE ${like})`);
    }
    if (sku && sku.trim()) where.push(`sku LIKE ${zStr("*" + sku.trim() + "*")}`);
    if (type) where.push(`type = ${zStr(type)}`);

    let sql = `SELECT * FROM ${TABLE}`;
    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
    sql += " ORDER BY CREATEDTIME DESC";
    const items = rowList(await zcql.executeZCQLQuery(sql)).map(out);
    res.json(await withIndustry(req.catalyst, items));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  const { name, sku, description, type, industryId } = req.body;
  if (!name || !sku || !type || !industryId) {
    return res.status(400).json({ error: "name, sku, type, industryId required" });
  }
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  try {
    if (!(await ownsRow(req.catalyst, "Industry", industryId))) return res.status(404).json({ error: "Industry not found" });
    if (await findSkuRowId(req.catalyst, sku)) {
      return res.status(409).json({ error: "SKU already exists" });
    }
    const row = await req.catalyst.datastore().table(TABLE).insertRow({
      name,
      sku,
      description: description || null,
      type,
      industryId: String(industryId),
      orgId: req.orgId,
    });
    const item = out(row);
    // Zoho Books sync is manual only (CR-021) — user clicks Push (/:id/push-zoho).
    const [withInd] = await withIndustry(req.catalyst, [item]);
    res.status(201).json(withInd);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  const { name, sku, description, type } = req.body;
  const data = { ROWID: id };
  if (name !== undefined) data.name = name;
  if (sku !== undefined) data.sku = sku;
  if (description !== undefined) data.description = description;
  if (type !== undefined) data.type = type;
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`),
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const existing = out(rows[0]);
    // Trading ↔ Manufacturing decides which Books API (item vs composite) the
    // stored zohoItemId belongs to — Books can't convert in place, so the type
    // locks once the item has been pushed (CR-029).
    if (type !== undefined && type !== existing.type && existing.zohoItemId) {
      return res.status(400).json({ error: "Item type is locked after pushing to Zoho Books" });
    }
    if (sku !== undefined && (await findSkuRowId(req.catalyst, sku, id))) {
      return res.status(409).json({ error: "SKU already exists" });
    }
    const row = await req.catalyst.datastore().table(TABLE).updateRow(data);
    const item = out(row);
    // Zoho Books sync is manual only (CR-021) — user clicks Push (/:id/push-zoho).
    const [withInd] = await withIndustry(req.catalyst, [item]);
    res.json(withInd);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  if (!(await ownsRow(req.catalyst, TABLE, id))) return res.status(404).json({ error: "Not found" });
  try {
    await deleteItemValues(req.catalyst, id);
    await req.catalyst.datastore().table(TABLE).deleteRow(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/push-zoho", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`),
    );
    if (!rows.length) return res.status(404).json({ error: "SKU item not found" });
    const item = out(rows[0]);
    const result = await pushToZoho(req.catalyst, item, item.description);
    const updated = rowList(await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id}`));
    res.json({ success: true, zohoItemId: out(updated[0]).zohoItemId, item: result });
  } catch (err) {
    console.error("[Zoho] manual push error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
