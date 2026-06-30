"use strict";
const express = require("express");
const { rowList, out, idOk } = require("../store");

const router = express.Router();
const TABLE = "Industry";

router.get("/", async (req, res) => {
  try {
    const rows = rowList(await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} ORDER BY name`));
    res.json(rows.map(out));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  const { name, skuSeparator = "" } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  try {
    const row = await req.catalyst.datastore().table(TABLE).insertRow({ name, skuSeparator });
    res.status(201).json(out(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  const { name, skuSeparator } = req.body;
  const data = { ROWID: id };
  if (name) data.name = name;
  if (skuSeparator !== undefined) data.skuSeparator = skuSeparator;
  try {
    const row = await req.catalyst.datastore().table(TABLE).updateRow(data);
    res.json(out(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const ds = req.catalyst.datastore();
    const zcql = req.catalyst.zcql();
    // No DB cascade in Data Store: delete this industry's properties + their values by hand.
    const props = rowList(await zcql.executeZCQLQuery(`SELECT ROWID FROM Property WHERE industryId = ${id}`));
    for (const p of props) {
      const vals = rowList(await zcql.executeZCQLQuery(`SELECT ROWID FROM PropertyValue WHERE propertyId = ${p.ROWID}`));
      for (const v of vals) await ds.table("PropertyValue").deleteRow(v.ROWID);
      await ds.table("Property").deleteRow(p.ROWID);
    }
    await ds.table(TABLE).deleteRow(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
