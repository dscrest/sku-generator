"use strict";
const express = require("express");
const { rowList, out, idOk } = require("../store");

const router = express.Router();
const TABLE = "Property";

router.get("/industries/:id/properties", async (req, res) => {
  const industryId = req.params.id;
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid id" });
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLE} WHERE industryId = ${industryId} ORDER BY skuPosition`,
      ),
    );
    res.json(rows.map(out));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/properties", async (req, res) => {
  const { name, caption, unit, valueType, skuPosition, industryId, rangeMin, rangeMax } = req.body;
  if (!name || !caption || !valueType || skuPosition === undefined || !industryId) {
    return res.status(400).json({ error: "name, caption, valueType, skuPosition, industryId are required" });
  }
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  try {
    const row = await req.catalyst.datastore().table(TABLE).insertRow({
      name,
      caption,
      unit: unit || null,
      valueType,
      skuPosition: parseInt(skuPosition),
      industryId: String(industryId),
      rangeMin: rangeMin !== undefined && rangeMin !== null ? parseFloat(rangeMin) : null,
      rangeMax: rangeMax !== undefined && rangeMax !== null ? parseFloat(rangeMax) : null,
    });
    res.status(201).json(out(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/properties/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  const { name, caption, unit, valueType, skuPosition, rangeMin, rangeMax } = req.body;
  const data = { ROWID: id };
  if (name) data.name = name;
  if (caption) data.caption = caption;
  if (unit !== undefined) data.unit = unit;
  if (valueType) data.valueType = valueType;
  if (skuPosition !== undefined) data.skuPosition = parseInt(skuPosition);
  if (rangeMin !== undefined) data.rangeMin = rangeMin === null ? null : parseFloat(rangeMin);
  if (rangeMax !== undefined) data.rangeMax = rangeMax === null ? null : parseFloat(rangeMax);
  try {
    const row = await req.catalyst.datastore().table(TABLE).updateRow(data);
    res.json(out(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/properties/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const ds = req.catalyst.datastore();
    const vals = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT ROWID FROM PropertyValue WHERE propertyId = ${id}`),
    );
    for (const v of vals) await ds.table("PropertyValue").deleteRow(v.ROWID);
    await ds.table(TABLE).deleteRow(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
