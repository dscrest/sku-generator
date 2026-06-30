"use strict";
const express = require("express");
const { rowList, out, idOk } = require("../store");
const { pushToZoho } = require("../zoho/push");

const router = express.Router();

function isDup(err) {
  return /unique|duplicate|already exist/i.test((err && err.message) || "");
}

router.post("/generate", async (req, res) => {
  const { industryId, selectedValues } = req.body;
  if (!industryId || !selectedValues) {
    return res.status(400).json({ error: "industryId and selectedValues are required" });
  }
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });

  try {
    const zcql = req.catalyst.zcql();
    const inds = rowList(await zcql.executeZCQLQuery(`SELECT * FROM Industry WHERE ROWID = ${industryId}`));
    if (!inds.length) return res.status(404).json({ error: "Industry not found" });
    const industry = out(inds[0]);

    const properties = rowList(
      await zcql.executeZCQLQuery(`SELECT * FROM Property WHERE industryId = ${industryId} ORDER BY skuPosition`),
    ).map(out);

    const skuParts = [];
    const nameParts = [];
    const descParts = [];

    for (const prop of properties) {
      const rawValue = selectedValues[prop.id];
      if (rawValue === undefined || rawValue === null || rawValue === "") continue;

      if (prop.valueType === "Range") {
        const num = parseFloat(rawValue);
        if (isNaN(num)) return res.status(400).json({ error: `${prop.caption} must be a number` });
        if (prop.rangeMin !== null && num < prop.rangeMin)
          return res.status(400).json({ error: `${prop.caption} must be >= ${prop.rangeMin}` });
        if (prop.rangeMax !== null && num > prop.rangeMax)
          return res.status(400).json({ error: `${prop.caption} must be <= ${prop.rangeMax}` });
        skuParts.push(String(rawValue));
        nameParts.push(String(rawValue));
        descParts.push(`${prop.caption}: ${rawValue}${prop.unit ? " " + prop.unit : ""}`);
      } else {
        if (!idOk(rawValue)) return res.status(400).json({ error: `Invalid value for ${prop.caption}` });
        const pvs = rowList(await zcql.executeZCQLQuery(`SELECT * FROM PropertyValue WHERE ROWID = ${rawValue}`));
        if (!pvs.length) return res.status(404).json({ error: `Value ${rawValue} not found` });
        const pv = out(pvs[0]);
        skuParts.push(pv.sku);
        nameParts.push(pv.name);
        descParts.push(pv.description || pv.displayValue || pv.name);
      }
    }

    const sep = industry.skuSeparator || "";
    res.json({
      sku: skuParts.join(sep),
      name: nameParts.join(", "),
      description: descParts.join(" | "),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/create-item", async (req, res) => {
  const { name, sku, description, type, industryId } = req.body;
  if (!name || !sku || !type || !industryId)
    return res.status(400).json({ error: "name, sku, type, industryId are required" });
  if (!["Trading", "Manufacturing"].includes(type))
    return res.status(400).json({ error: "type must be Trading or Manufacturing" });
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });

  try {
    const row = await req.catalyst.datastore().table("SKUItem").insertRow({
      name,
      sku,
      description: description || null,
      type,
      industryId: String(industryId),
    });
    const item = out(row);

    // Push to Zoho Books — non-blocking, best-effort.
    pushToZoho(req.catalyst, item, description).catch((err) =>
      console.error("[Zoho] push failed for SKU", sku, ":", err.message),
    );

    res.status(201).json(item);
  } catch (err) {
    if (isDup(err)) return res.status(409).json({ error: "SKU already exists" });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
