"use strict";
const express = require("express");
const { rowList, out, idOk } = require("../store");

const router = express.Router();
const TABLE = "PropertyValue";

router.get("/properties/:id/values", async (req, res) => {
  const propertyId = req.params.id;
  if (!idOk(propertyId)) return res.status(400).json({ error: "Invalid id" });
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLE} WHERE propertyId = ${propertyId} ORDER BY displayValue`,
      ),
    );
    res.json(rows.map(out));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/property-values", async (req, res) => {
  const { displayValue, name, sku, description, propertyId } = req.body;
  if (!displayValue || !name || !sku || !propertyId) {
    return res.status(400).json({ error: "displayValue, name, sku, propertyId are required" });
  }
  if (!idOk(propertyId)) return res.status(400).json({ error: "Invalid propertyId" });
  try {
    const row = await req.catalyst.datastore().table(TABLE).insertRow({
      displayValue,
      name,
      sku,
      description: description || null,
      propertyId: String(propertyId),
    });
    res.status(201).json(out(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/property-values/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  const { displayValue, name, sku, description } = req.body;
  const data = { ROWID: id };
  if (displayValue) data.displayValue = displayValue;
  if (name) data.name = name;
  if (sku) data.sku = sku;
  if (description !== undefined) data.description = description;
  try {
    const row = await req.catalyst.datastore().table(TABLE).updateRow(data);
    res.json(out(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/property-values/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await req.catalyst.datastore().table(TABLE).deleteRow(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
