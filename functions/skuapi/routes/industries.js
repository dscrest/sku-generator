"use strict";
const express = require("express");
const { rowList, out, idOk, orgClause, ownsRow } = require("../store");

const router = express.Router();
const TABLE = "Industry";

router.get("/", async (req, res) => {
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ${orgClause(req.catalyst)} ORDER BY name`),
    );
    res.json(rows.map(out));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Every property's values for an industry in one response ({propertyId: [values]}).
// The generator page used to fire one /properties/:id/values request per property
// in parallel — the burst saturated the Dev environment's function-concurrency
// cap and the whole API started returning 429s.
router.get("/:id/property-values", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const zcql = req.catalyst.zcql();
    const props = rowList(
      await zcql.executeZCQLQuery(`SELECT ROWID FROM Property WHERE industryId = ${id} AND ${orgClause(req.catalyst)}`),
    );
    const byProp = {};
    if (props.length) {
      // ZCQL pages at 300 rows — loop until a short page. ~200 rows today.
      for (let offset = 0; ; offset += 300) {
        const page = rowList(
          await zcql.executeZCQLQuery(
            `SELECT * FROM PropertyValue WHERE propertyId IN (${props.map((p) => p.ROWID).join(",")}) AND ${orgClause(req.catalyst)} ORDER BY displayValue LIMIT 300 OFFSET ${offset}`,
          ),
        ).map(out);
        for (const v of page) (byProp[v.propertyId] ||= []).push(v);
        if (page.length < 300) break;
      }
    }
    res.json(byProp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  const { name, skuSeparator = "", seriesStart } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  try {
    const row = await req.catalyst.datastore().table(TABLE).insertRow({
      name,
      skuSeparator,
      seriesStart: seriesStart ? Number(seriesStart) : null,
      orgId: req.orgId,
    });
    res.status(201).json(out(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  if (!(await ownsRow(req.catalyst, TABLE, id))) return res.status(404).json({ error: "Not found" });
  const { name, skuSeparator, seriesStart } = req.body;
  const data = { ROWID: id };
  if (name) data.name = name;
  if (skuSeparator !== undefined) data.skuSeparator = skuSeparator;
  if (seriesStart !== undefined) data.seriesStart = seriesStart === "" || seriesStart === null ? null : Number(seriesStart);
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
  if (!(await ownsRow(req.catalyst, TABLE, id))) return res.status(404).json({ error: "Not found" });
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
