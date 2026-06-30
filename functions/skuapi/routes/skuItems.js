"use strict";
const express = require("express");
const { rowList, out, idOk } = require("../store");
const { pushToZoho } = require("../zoho/push");

const router = express.Router();
const TABLE = "SKUItem";

function isDup(err) {
  return /unique|duplicate|already exist/i.test((err && err.message) || "");
}

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
    let q = `SELECT * FROM ${TABLE}`;
    if (industryId) {
      if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
      q += ` WHERE industryId = ${industryId}`;
    }
    q += " ORDER BY CREATEDTIME DESC";
    const items = rowList(await req.catalyst.zcql().executeZCQLQuery(q)).map(out);
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
    const row = await req.catalyst.datastore().table(TABLE).insertRow({
      name,
      sku,
      description: description || null,
      type,
      industryId: String(industryId),
    });
    const item = out(row);
    pushToZoho(req.catalyst, item, description).catch((err) => console.error("[Zoho] push failed:", err.message));
    const [withInd] = await withIndustry(req.catalyst, [item]);
    res.status(201).json(withInd);
  } catch (err) {
    if (isDup(err)) return res.status(409).json({ error: "SKU already exists" });
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
    const row = await req.catalyst.datastore().table(TABLE).updateRow(data);
    const item = out(row);
    pushToZoho(req.catalyst, item, description).catch((err) => console.error("[Zoho] push failed:", err.message));
    const [withInd] = await withIndustry(req.catalyst, [item]);
    res.json(withInd);
  } catch (err) {
    if (isDup(err)) return res.status(409).json({ error: "SKU already exists" });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  try {
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
    const rows = rowList(await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id}`));
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
