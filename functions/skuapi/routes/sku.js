"use strict";
const express = require("express");
const { rowList, out, idOk, orgClause, findSkuRowId, isActive } = require("../store");
const { saveItemValues, deleteItemValues, missingRequired } = require("../itemValues");
const { nextSeriesSku, stripSuffix, escRe } = require("../skuSeries");
const { assemble } = require("../skuBuild");
const { pushToZoho } = require("../zoho/push");

const router = express.Router();

router.post("/generate", async (req, res) => {
  // excludeItemId: set while editing an existing item (CR-030) so its own SKU
  // doesn't flag as a duplicate when unchanged.
  const { industryId, selectedValues, excludeItemId } = req.body;
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

    const getPv = async (rowid) => {
      const pvs = rowList(
        await zcql.executeZCQLQuery(`SELECT * FROM PropertyValue WHERE ROWID = ${rowid} AND ${orgClause(req.catalyst)}`),
      );
      return pvs.length ? out(pvs[0]) : null;
    };

    const sep = industry.skuSeparator || "";
    let asm;
    try {
      asm = await assemble(properties, selectedValues, sep, getPv);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const { name: asmName, description: asmDescription, missingRequired } = asm;
    let sku = asm.sku;
    if (sku && Number(industry.seriesStart) > 0) {
      // Numerical series (CR-089). Preview computes but never consumes a
      // number. Editing keeps the item's existing suffix while its property
      // combination is unchanged; a changed combination gets a fresh number.
      const pad = Number(industry.seriesPad) || 4;
      let kept = null;
      if (idOk(excludeItemId)) {
        const cur = rowList(
          await zcql.executeZCQLQuery(
            `SELECT sku FROM SKUItem WHERE ROWID = ${excludeItemId} AND ${orgClause(req.catalyst)}`,
          ),
        )[0];
        const m = cur && new RegExp(`^${escRe(sku + sep)}(\\d{${pad}})$`, "i").exec(cur.sku);
        if (m) kept = m[1];
      }
      sku = kept ? sku + sep + kept : await nextSeriesSku(req.catalyst, industryId, sku, sep, pad);
    }
    res.json({
      sku,
      name: asmName,
      // One "Caption: Value" line per filled property — this block is what lands
      // in the Books item (sales) and purchase descriptions.
      description: asmDescription,
      missingRequired,
      duplicate: sku ? Boolean(await findSkuRowId(req.catalyst, sku, idOk(excludeItemId) ? excludeItemId : undefined)) : false,
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
    // Loading the industry IS the ownership check (replaces ownsRow) — its
    // seriesStart drives the suffix recompute below.
    const inds = rowList(
      await req.catalyst.zcql().executeZCQLQuery(
        `SELECT * FROM Industry WHERE ROWID = ${industryId} AND ${orgClause(req.catalyst)}`,
      ),
    );
    if (!inds.length) return res.status(404).json({ error: "Industry not found" });
    const industry = out(inds[0]);
    const missing = await missingRequired(req.catalyst, industryId, selectedValues);
    if (missing.length) {
      return res.status(400).json({ error: `Required fields missing: ${missing.join(", ")}` });
    }
    // Series suffix is recomputed server-side at save time so two users racing
    // on the same combination converge on fresh numbers (the client sends the
    // preview's sku, which may be stale by now).
    let finalSku = sku;
    if (Number(industry.seriesStart) > 0) {
      const sep = industry.skuSeparator || "";
      const pad = Number(industry.seriesPad) || 4;
      finalSku = await nextSeriesSku(req.catalyst, industryId, stripSuffix(sku, sep, pad), sep, pad);
    }
    if (await findSkuRowId(req.catalyst, finalSku)) {
      return res.status(409).json({ error: "SKU already exists" });
    }
    const row = await req.catalyst.datastore().table("SKUItem").insertRow({
      name,
      sku: finalSku,
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

// Edit-in-generator save (CR-030): regenerated name/sku/description + the new
// property selections replace the item's stored values. Type is not editable
// here. Items already linked to Books auto-push — the one deliberate exception
// to CR-021's manual-only rule ("edit should effect the same in Books"); a
// Books failure never fails the save, it comes back as zohoWarning.
router.post("/update-item", async (req, res) => {
  const { itemId, name, sku, description, selectedValues } = req.body;
  if (!idOk(itemId)) return res.status(400).json({ error: "Invalid itemId" });
  if (!name || !sku) return res.status(400).json({ error: "name and sku are required" });

  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM SKUItem WHERE ROWID = ${itemId} AND ${orgClause(req.catalyst)}`),
    );
    if (!rows.length) return res.status(404).json({ error: "SKU item not found" });
    const existing = out(rows[0]);

    const missing = await missingRequired(req.catalyst, existing.industryId, selectedValues);
    if (missing.length) return res.status(400).json({ error: `Required fields missing: ${missing.join(", ")}` });
    if (await findSkuRowId(req.catalyst, sku, itemId)) {
      return res.status(409).json({ error: "SKU already exists" });
    }

    await req.catalyst.datastore().table("SKUItem").updateRow({
      ROWID: itemId, name, sku, description: description || null,
    });
    await deleteItemValues(req.catalyst, itemId);
    await saveItemValues(req.catalyst, itemId, existing.industryId, selectedValues);

    const item = { ...existing, name, sku, description: description || null };
    let zohoWarning;
    if (existing.zohoItemId) {
      try {
        await pushToZoho(req.catalyst, item, item.description);
      } catch (e) {
        console.error("[Zoho] auto-push on edit failed:", e.message);
        zohoWarning = e.message;
      }
    }
    res.json({ ...item, ...(zohoWarning ? { zohoWarning } : {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
