"use strict";
const express = require("express");
const { rowList, out, idOk, orgClause, ownsRow } = require("../store");

const router = express.Router();
const TABLE = "Property";

// Books item custom-field definitions — source list for the Zoho mapping screen.
// Lives here (not zohoAuth) so it inherits the /api requireOrg + addon gates.
router.get("/zoho/item-custom-fields", async (req, res) => {
  try {
    res.json(await require("../zoho/booksApi").listItemCustomFields(req.catalyst));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

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
  const { name, caption, unit, valueType, skuPosition, industryId, rangeMin, rangeMax, required, zohoCfApiName, activeInSku, includeInName, clubKey, createValuesAsItems } = req.body;
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
      activeInSku: activeInSku === false ? "false" : "true", // new properties join the SKU by default
      includeInName: includeInName ? "true" : "false",
      zohoCfApiName: zohoCfApiName || null,
      clubKey: clubKey || null, // props sharing this club concatenate codes with no separator
      createValuesAsItems: createValuesAsItems ? "true" : "false", // gate: this property's values sync to Books as items
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
  const { name, caption, unit, valueType, skuPosition, rangeMin, rangeMax, required, zohoCfApiName, activeInSku, includeInName, clubKey, createValuesAsItems } = req.body;
  const data = { ROWID: id };
  if (name) data.name = name;
  if (caption) data.caption = caption;
  if (unit !== undefined) data.unit = unit;
  if (valueType) data.valueType = valueType;
  if (skuPosition !== undefined) data.skuPosition = parseInt(skuPosition);
  if (rangeMin !== undefined) data.rangeMin = rangeMin === null ? null : parseFloat(rangeMin);
  if (rangeMax !== undefined) data.rangeMax = rangeMax === null ? null : parseFloat(rangeMax);
  if (required !== undefined) data.required = required ? "true" : "false";
  if (activeInSku !== undefined) data.activeInSku = activeInSku ? "true" : "false";
  if (includeInName !== undefined) data.includeInName = includeInName ? "true" : "false";
  if (zohoCfApiName !== undefined) data.zohoCfApiName = zohoCfApiName || null;
  if (clubKey !== undefined) data.clubKey = clubKey || null; // empty string clears the club (un-club)
  if (createValuesAsItems !== undefined) data.createValuesAsItems = createValuesAsItems ? "true" : "false";
  try {
    const row = await req.catalyst.datastore().table(TABLE).updateRow(data);
    // Turning the gate ON backfills existing values into Books (best-effort,
    // idempotent — pushValueToZoho links/updates existing items, never dupes).
    if (createValuesAsItems === true) await backfillPropertyItems(req.catalyst, id);
    res.json(out(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push every value of a property to Books as an item. Best-effort: a Zoho
// failure is logged, never fails the property save.
async function backfillPropertyItems(catalyst, propertyId) {
  try {
    const { pushValueToZoho } = require("../zoho/push");
    const vals = rowList(
      await catalyst.zcql().executeZCQLQuery(
        `SELECT * FROM PropertyValue WHERE propertyId = ${propertyId} AND ${orgClause(catalyst)}`,
      ),
    ).map(out);
    for (const v of vals) {
      try { await pushValueToZoho(catalyst, v); } catch (e) { console.error("[Zoho] backfill value failed:", e.message); }
    }
  } catch (e) {
    console.error("[Zoho] backfill property items failed:", e.message);
  }
}

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
