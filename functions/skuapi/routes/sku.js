"use strict";
const express = require("express");
const { rowList, out, idOk, orgClause, ownsRow, findSkuRowId, isActive, nameFilter } = require("../store");
const { saveItemValues, missingRequired } = require("../itemValues");

const router = express.Router();

router.post("/generate", async (req, res) => {
  const { industryId, selectedValues } = req.body;
  if (!industryId || !selectedValues) {
    return res.status(400).json({ error: "industryId and selectedValues are required" });
  }
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });

  try {
    const zcql = req.catalyst.zcql();
    const inds = rowList(
      await zcql.executeZCQLQuery(`SELECT * FROM Industry WHERE ROWID = ${industryId} AND ${orgClause(req.catalyst)}`),
    );
    if (!inds.length) return res.status(404).json({ error: "Industry not found" });
    const industry = out(inds[0]);

    const properties = rowList(
      await zcql.executeZCQLQuery(
        `SELECT * FROM Property WHERE industryId = ${industryId} AND ${orgClause(req.catalyst)} ORDER BY skuPosition`,
      ),
    ).map(out).filter(isActive);

    const inName = nameFilter(properties);

    const skuParts = [];
    const nameParts = [];
    const descParts = [];
    const missingRequired = [];

    for (const prop of properties) {
      const rawValue = selectedValues[prop.id];
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        if (prop.required) missingRequired.push(prop.caption);
        continue;
      }

      if (prop.valueType === "Range") {
        const num = parseFloat(rawValue);
        if (isNaN(num)) return res.status(400).json({ error: `${prop.caption} must be a number` });
        if (prop.rangeMin !== null && num < prop.rangeMin)
          return res.status(400).json({ error: `${prop.caption} must be >= ${prop.rangeMin}` });
        if (prop.rangeMax !== null && num > prop.rangeMax)
          return res.status(400).json({ error: `${prop.caption} must be <= ${prop.rangeMax}` });
        skuParts.push(String(rawValue));
        if (inName(prop)) nameParts.push(String(rawValue));
        descParts.push(`${prop.caption}: ${rawValue}${prop.unit ? " " + prop.unit : ""}`);
      } else {
        if (!idOk(rawValue)) return res.status(400).json({ error: `Invalid value for ${prop.caption}` });
        const pvs = rowList(
          await zcql.executeZCQLQuery(`SELECT * FROM PropertyValue WHERE ROWID = ${rawValue} AND ${orgClause(req.catalyst)}`),
        );
        if (!pvs.length) return res.status(404).json({ error: `Value ${rawValue} not found` });
        const pv = out(pvs[0]);
        skuParts.push(pv.sku);
        if (inName(prop)) nameParts.push(pv.name);
        descParts.push(`${prop.caption}: ${pv.displayValue || pv.name}${prop.unit ? " " + prop.unit : ""}`);
      }
    }

    const sep = industry.skuSeparator || "";
    const sku = skuParts.join(sep);
    res.json({
      sku,
      name: nameParts.join(" "),
      // One "Caption: Value" line per filled property — this block is what lands
      // in the Books item (sales) and purchase descriptions.
      description: descParts.join("\n"),
      missingRequired,
      duplicate: sku ? Boolean(await findSkuRowId(req.catalyst, sku)) : false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/create-item", async (req, res) => {
  const { name, sku, description, type, industryId, selectedValues } = req.body;
  if (!name || !sku || !type || !industryId)
    return res.status(400).json({ error: "name, sku, type, industryId are required" });
  if (!["Trading", "Manufacturing"].includes(type))
    return res.status(400).json({ error: "type must be Trading or Manufacturing" });
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });

  try {
    if (!(await ownsRow(req.catalyst, "Industry", industryId))) return res.status(404).json({ error: "Industry not found" });
    const missing = await missingRequired(req.catalyst, industryId, selectedValues);
    if (missing.length) {
      return res.status(400).json({ error: `Required fields missing: ${missing.join(", ")}` });
    }
    if (await findSkuRowId(req.catalyst, sku)) {
      return res.status(409).json({ error: "SKU already exists" });
    }
    const row = await req.catalyst.datastore().table("SKUItem").insertRow({
      name,
      sku,
      description: description || null,
      type,
      industryId: String(industryId),
      orgId: req.orgId,
    });
    const item = out(row);

    // Persist structured selections so the item is searchable by property.
    await saveItemValues(req.catalyst, item.id, industryId, selectedValues);

    // Zoho Books sync is manual only — user clicks "Push" on the SKU Items page
    // (POST /sku-items/:id/push-zoho). No automatic push on create (CR-021).
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
