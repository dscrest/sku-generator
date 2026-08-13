"use strict";
const express = require("express");
const { rowList, out, idOk, orgClause, ownsRow } = require("../store");
const { pushValueToZoho } = require("../zoho/push");

const router = express.Router();
const TABLE = "PropertyValue";

router.get("/properties/:id/values", async (req, res) => {
  const propertyId = req.params.id;
  if (!idOk(propertyId)) return res.status(400).json({ error: "Invalid id" });
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(
        `SELECT * FROM ${TABLE} WHERE propertyId = ${propertyId} AND ${orgClause(req.catalyst)} ORDER BY displayValue`,
      ),
    );
    res.json(rows.map(out));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All property values linked to a Books item, with property + industry names —
// the read-only "Books-linked values" tracking grid (CR-026).
router.get("/property-values/linked", async (req, res) => {
  try {
    const zcql = req.catalyst.zcql();
    const vals = rowList(
      await zcql.executeZCQLQuery(
        `SELECT * FROM ${TABLE} WHERE zohoItemId IS NOT NULL AND ${orgClause(req.catalyst)} ORDER BY displayValue`,
      ),
    ).map(out);
    const props = rowList(await zcql.executeZCQLQuery(`SELECT ROWID, caption, industryId FROM Property WHERE ${orgClause(req.catalyst)}`));
    const propById = new Map(props.map((p) => [String(p.ROWID), p]));
    const inds = rowList(await zcql.executeZCQLQuery(`SELECT ROWID, name FROM Industry WHERE ${orgClause(req.catalyst)}`));
    const indName = new Map(inds.map((i) => [String(i.ROWID), i.name]));
    res.json(
      vals.map((v) => {
        const p = propById.get(String(v.propertyId));
        return {
          ...v,
          propertyCaption: p ? p.caption : null,
          industryId: p ? String(p.industryId) : null,
          industryName: p ? indName.get(String(p.industryId)) || null : null,
        };
      }),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/property-values", async (req, res) => {
  const { displayValue, name, sku, description, propertyId, createAsItem } = req.body;
  if (!displayValue || !name || !sku || !propertyId) {
    return res.status(400).json({ error: "displayValue, name, sku, propertyId are required" });
  }
  if (!idOk(propertyId)) return res.status(400).json({ error: "Invalid propertyId" });
  if (!(await ownsRow(req.catalyst, "Property", propertyId))) return res.status(404).json({ error: "Property not found" });
  try {
    const row = await req.catalyst.datastore().table(TABLE).insertRow({
      displayValue,
      name,
      sku,
      description: description || null,
      propertyId: String(propertyId),
      createAsItem: createAsItem ? "true" : "false",
      orgId: req.orgId,
    });
    const value = out(row);
    // Gate: a value becomes a Books item only when its parent property is
    // flagged. Best-effort — a Books failure must never fail the value save.
    if (await propertyMakesItems(req.catalyst, propertyId)) await createBooksItem(req.catalyst, value);
    res.status(201).json(value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Property-level gate (CR-026): true when this property's values should sync to
// Books as items. Replaces the old per-value createAsItem checkbox.
async function propertyMakesItems(catalyst, propertyId) {
  const rows = rowList(
    await catalyst.zcql().executeZCQLQuery(
      `SELECT createValuesAsItems FROM Property WHERE ROWID = ${propertyId} AND ${orgClause(catalyst)}`,
    ),
  ).map(out);
  return rows.length ? rows[0].createValuesAsItems === true : false;
}

// Push a value as a standalone Books item, mutating `value` with the resolved
// zohoItemId (or a zohoWarning). Swallows Zoho errors — the save already succeeded.
async function createBooksItem(catalyst, value) {
  try {
    const pushed = await pushValueToZoho(catalyst, value);
    if (pushed && pushed.item_id) value.zohoItemId = String(pushed.item_id);
  } catch (e) {
    console.error("[Zoho] value push failed:", e.message);
    value.zohoWarning = e.message;
  }
}

router.put("/property-values/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  if (!(await ownsRow(req.catalyst, TABLE, id))) return res.status(404).json({ error: "Not found" });
  const { displayValue, name, sku, description, createAsItem } = req.body;
  const data = { ROWID: id };
  if (displayValue) data.displayValue = displayValue;
  if (name) data.name = name;
  if (sku) data.sku = sku;
  if (description !== undefined) data.description = description;
  if (createAsItem !== undefined) data.createAsItem = createAsItem ? "true" : "false";
  try {
    await req.catalyst.datastore().table(TABLE).updateRow(data);
    // Re-read the full row so the Books push has name/description/existing link.
    const full = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`),
    ).map(out)[0];
    if (full && !full.zohoItemId && (await propertyMakesItems(req.catalyst, full.propertyId))) await createBooksItem(req.catalyst, full);
    res.json(full);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/property-values/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  if (!(await ownsRow(req.catalyst, TABLE, id))) return res.status(404).json({ error: "Not found" });
  try {
    await req.catalyst.datastore().table(TABLE).deleteRow(id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
