"use strict";
const express = require("express");
const { rowList, out, idOk, orgClause, ownsRow } = require("../store");

const router = express.Router();
const TABLE = "Property";

router.get("/industries/:id/properties", async (req, res) => {
  const industryId = req.params.id;
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid id" });
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLE} WHERE industryId = ${industryId} AND ${orgClause(req.catalyst)} ORDER BY skuPosition`,
      ),
    );
    res.json(rows.map(out));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All properties of the org (the Properties tab grid), with industry names.
router.get("/properties", async (req, res) => {
  try {
    const zcql = req.catalyst.zcql();
    const props = rowList(
      await zcql.executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ${orgClause(req.catalyst)} ORDER BY skuPosition`),
    );
    const inds = rowList(
      await zcql.executeZCQLQuery(`SELECT ROWID, name FROM Industry WHERE ${orgClause(req.catalyst)}`),
    );
    const nameById = new Map(inds.map((i) => [String(i.ROWID), i.name]));
    res.json(props.map((p) => ({ ...out(p), industryName: nameById.get(String(p.industryId)) || null })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/properties", async (req, res) => {
  const { name, caption, unit, valueType, skuPosition, industryId, rangeMin, rangeMax, required, zohoCfApiName } = req.body;
  if (!name || !caption || !valueType || skuPosition === undefined || !industryId) {
    return res.status(400).json({ error: "name, caption, valueType, skuPosition, industryId are required" });
  }
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  // The parent industry must belong to this org, or you could graft a property onto another tenant's industry.
  if (!(await ownsRow(req.catalyst, "Industry", industryId))) return res.status(404).json({ error: "Industry not found" });
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
      required: required ? "true" : "false",
      zohoCfApiName: zohoCfApiName || null,
      orgId: req.orgId,
    });
    res.status(201).json(out(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/properties/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  if (!(await ownsRow(req.catalyst, TABLE, id))) return res.status(404).json({ error: "Not found" });
  const { name, caption, unit, valueType, skuPosition, rangeMin, rangeMax, required, zohoCfApiName } = req.body;
  const data = { ROWID: id };
  if (name) data.name = name;
  if (caption) data.caption = caption;
  if (unit !== undefined) data.unit = unit;
  if (valueType) data.valueType = valueType;
  if (skuPosition !== undefined) data.skuPosition = parseInt(skuPosition);
  if (rangeMin !== undefined) data.rangeMin = rangeMin === null ? null : parseFloat(rangeMin);
  if (rangeMax !== undefined) data.rangeMax = rangeMax === null ? null : parseFloat(rangeMax);
  if (required !== undefined) data.required = required ? "true" : "false";
  if (zohoCfApiName !== undefined) data.zohoCfApiName = zohoCfApiName || null;
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
  if (!(await ownsRow(req.catalyst, TABLE, id))) return res.status(404).json({ error: "Not found" });
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
