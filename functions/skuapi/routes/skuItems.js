"use strict";
const express = require("express");
const { rowList, out, idOk, zStr, orgClause, ownsRow, findSkuRowId } = require("../store");
const { pushToZoho, deleteFromZoho } = require("../zoho/push");
const { listStockAccounts, listManufacturers } = require("../zoho/booksApi");
const { importFromBooks, refreshFromBooks } = require("../zoho/import");
const { searchItemIds, deleteItemValues, backfillItemValues } = require("../itemValues");
const { processImport } = require("../importItems");
const { processBooksImport } = require("../booksImport");
// Generic OrgSetting helpers (not work-order-specific despite the home).
const { settings, setSetting, logActivity } = require("../workorder/store");
const { ITEM_FIELDS, enabledKeys, pickItemFields, itemFieldError, mergeBooksData } = require("../itemFields");
const { parseLadder } = require("../recipe/ladder");
const { parseUoms, uomsOf } = require("../recipe/componentMap");

const router = express.Router();
const TABLE = "SKUItem";
// Audit trail (CR-233) for the SKU item History tab.
const log = (req, id, action, detail) => logActivity(req.catalyst, req.orgId, TABLE, id, action, req.userId, detail);

// Attach { industry: { name } } to each item (replaces Prisma's include).
async function withIndustry(catalyst, items) {
  const ids = [...new Set(items.map((i) => i.industryId).filter(Boolean))];
  let nameMap = {};
  if (ids.length) {
    const inds = rowList(
      await catalyst.zcql().executeZCQLQuery(`SELECT ROWID, name FROM Industry WHERE ROWID IN (${ids.join(",")})`),
    );
    nameMap = Object.fromEntries(inds.map((r) => [String(r.ROWID), r.name]));
  }
  return items.map((i) => ({ ...i, industry: { name: nameMap[i.industryId] || null } }));
}

router.get("/", async (req, res) => {
  const { industryId } = req.query;
  try {
    const where = [orgClause(req.catalyst)];
    if (industryId) {
      if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
      where.push(`industryId = ${industryId}`);
    }
    const q = `SELECT * FROM ${TABLE} WHERE ${where.join(" AND ")} ORDER BY CREATEDTIME DESC`;
    const items = rowList(await req.catalyst.zcql().executeZCQLQuery(q)).map(out);
    res.json(await withIndustry(req.catalyst, items));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stock accounts for the push dialog's Inventory Account dropdown.
router.get("/stock-accounts", async (req, res) => {
  try {
    res.json(await listStockAccounts(req.catalyst));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Books Manufacturer master for the Manufacturer field dropdown (CR-210);
// fetched only by orgs that enabled the field (ITEM_FIELDS.source).
router.get("/manufacturers", async (req, res) => {
  try {
    res.json(await listManufacturers(req.catalyst));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SKU module org settings: auto-push imported items to Books + numerical
// series (CR-136: skuSeriesMode/skuSeriesPad OrgSettings; empty mode =
// legacy per-industry seriesStart fallback, see skuSeries.js).
const clampPad = (v) => Math.min(8, Math.max(1, Number(v) || 4));
const TYPES = ["Trading", "Manufacturing"];
const TRACKING = ["none", "serial", "batch"];
// Per-org display labels for the stored item types (CR-180). The label is also
// the value the CRM quote widget writes to Products.Item_Source, so it should
// match the org's CRM picklist. Stored values never change.
const TYPE_LABEL_DEFAULT = { Trading: "Direct Purchase", Manufacturing: "In-House Manufacturing" };
const labelKey = (t) => `skuTypeLabel${t}`;
const cleanLabel = (v) => String(v || "").trim().slice(0, 60);

function settingsOut(s) {
  return {
    autoPushImport: s.skuAutoPushImport === "true",
    seriesMode: s.skuSeriesMode || "",
    seriesPad: clampPad(s.skuSeriesPad),
    defaultItemType: TYPES.includes(s.skuDefaultItemType) ? s.skuDefaultItemType : "Trading",
    typeLabels: Object.fromEntries(TYPES.map((t) => [t, cleanLabel(s[labelKey(t)]) || TYPE_LABEL_DEFAULT[t]])),
    // Push-dialog defaults (CR-166): preselected in the dialog, still editable per push.
    pushTracking: TRACKING.includes(s.skuPushTracking) ? s.skuPushTracking : "serial",
    pushAccountId: s.skuPushAccountId || "",
    // CRM widgets (CR-184): a new item is always saved to the SKU master; this
    // decides whether it is also pushed to Books at once (else later, from the
    // SKU Items page). Stored inverted so blank = on.
    widgetAutoPush: s.cfgNoAutoPush !== "true",
    // Quote Maker widget, Books-first mode (CR-287, MSUN): the Books item
    // category whose items are the Finished Goods the widget looks up (blank =
    // whole catalog), and whether a miss shows "create it in Books" instead of
    // the in-widget create card.
    fgCategoryId: s.cfgFgCategoryId || "",
    widgetBooksOnly: s.cfgWidgetBooksOnly === "true",
    // Product Configurator (CR-211): fill the widget's Rate from the picked
    // model's product-design costing (SizingModel.recipeCode → computeQuote).
    designRate: s.cfgDesignRate === "true",
    // Price ladder % sets per line class (CR-220): Base → OH → Margin → P&F →
    // Other → Disc, each step ÷ (1 − pct). Always both classes, zeros when unset.
    priceLadder: parseLadder(s.priceLadder),
    // Units of measure (CR-216): the org's list for every UOM select (template
    // builder, Component Map, CRM Product Configurator); blank = default list.
    uoms: uomsOf(s),
    // Extra item fields (CR-209): the catalogue every org can pick from, and
    // the keys this org switched on. Forms render only the enabled ones.
    itemFieldCatalog: ITEM_FIELDS,
    itemFields: enabledKeys(s),
  };
}

router.get("/settings", async (req, res) => {
  try {
    const s = await settings(req.catalyst, req.orgId);
    const o = settingsOut(s);
    if (!s.skuSeriesMode) {
      // Legacy orgs configured the series per-industry (CR-089) — surface the
      // effective state so the settings UI preselects it; first save persists
      // it org-wide and the fallback stops mattering.
      const ind = rowList(
        await req.catalyst.zcql().executeZCQLQuery(
          `SELECT seriesStart, seriesPad FROM Industry WHERE ${orgClause(req.catalyst)} LIMIT 1`,
        ),
      )[0];
      if (ind && Number(ind.seriesStart) > 0) {
        o.seriesMode = "continuous";
        o.seriesPad = clampPad(ind.seriesPad);
      } else {
        o.seriesMode = "off";
      }
    }
    res.json(o);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const b = req.body || {};
    const mode = ["off", "continuous", "params"].includes(b.seriesMode) ? b.seriesMode : "";
    await setSetting(req.catalyst, req.orgId, "skuAutoPushImport", b.autoPushImport ? "true" : "");
    await setSetting(req.catalyst, req.orgId, "skuSeriesMode", mode);
    await setSetting(req.catalyst, req.orgId, "skuSeriesPad", String(clampPad(b.seriesPad)));
    await setSetting(req.catalyst, req.orgId, "skuDefaultItemType",
      TYPES.includes(b.defaultItemType) ? b.defaultItemType : "");
    for (const t of TYPES) {
      await setSetting(req.catalyst, req.orgId, labelKey(t), cleanLabel(b.typeLabels && b.typeLabels[t]));
    }
    await setSetting(req.catalyst, req.orgId, "skuPushTracking", TRACKING.includes(b.pushTracking) ? b.pushTracking : "");
    await setSetting(req.catalyst, req.orgId, "skuPushAccountId", b.pushAccountId ? String(b.pushAccountId) : "");
    // Absent from the payload (older client) = leave as is.
    if (b.widgetAutoPush !== undefined) {
      await setSetting(req.catalyst, req.orgId, "cfgNoAutoPush", b.widgetAutoPush ? "" : "true");
    }
    if (b.designRate !== undefined) {
      await setSetting(req.catalyst, req.orgId, "cfgDesignRate", b.designRate ? "true" : "");
    }
    if (b.fgCategoryId !== undefined) {
      await setSetting(req.catalyst, req.orgId, "cfgFgCategoryId", /^\d*$/.test(String(b.fgCategoryId || "")) ? String(b.fgCategoryId || "") : "");
    }
    if (b.widgetBooksOnly !== undefined) {
      await setSetting(req.catalyst, req.orgId, "cfgWidgetBooksOnly", b.widgetBooksOnly ? "true" : "");
    }
    if (b.priceLadder !== undefined) {
      // ~110 chars of JSON — fits settingValue (varchar 255); parse clamps 0 ≤ pct < 100.
      await setSetting(req.catalyst, req.orgId, "priceLadder", JSON.stringify(parseLadder(b.priceLadder)));
    }
    if (b.uoms !== undefined) {
      // Stored comma-joined in settingValue (varchar 255): ≤20 chars per unit,
      // so ~12+ units fit; blank = default list. Saved list is the cleaned one.
      const text = Array.isArray(b.uoms) ? b.uoms.join(",") : String(b.uoms || "");
      const value = text.trim() ? parseUoms(text).join(",") : "";
      if (value.length > 255) return res.status(400).json({ error: "Too many units — keep the list under 255 characters" });
      await setSetting(req.catalyst, req.orgId, "uomList", value);
    }
    if (Array.isArray(b.itemFields)) {
      await setSetting(req.catalyst, req.orgId, "skuItemFields", enabledKeys({ skuItemFields: b.itemFields.join(",") }).join(","));
    }
    res.json(settingsOut(await settings(req.catalyst, req.orgId)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// One-shot backfill of structured values for pre-existing items. Idempotent.
router.post("/backfill-values", async (req, res) => {
  try {
    res.json(await backfillItemValues(req.catalyst));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import new items from Zoho Books into an industry. Body: { industryId }.
// Create-only: items already linked (by zohoItemId or sku) are skipped.
router.post("/import-zoho", async (req, res) => {
  const { industryId } = req.body || {};
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  try {
    res.json(await importFromBooks(req.catalyst, industryId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Re-sync the SKU master from Zoho Books (CR-226): names / SKUs / composite type
// updated in place, new Books items created in { industryId }. Books is the truth.
// Books-first org (CR-287/CR-295, MSUN): the Finished Goods are the Books
// composite items (a category, when set, narrows them), their BOM lines feed
// the category-backed parameters, and the per-run read cap is lower — the
// widget fires this on open and must stay inside the 30 s function limit; the
// rest come on the next refresh. Category only (no Books-only toggle): that
// category, as before. Neither: the whole catalog (SKU Items page, Ricon).
router.post("/refresh-zoho", async (req, res) => {
  const { industryId } = req.body || {};
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  try {
    const s = await settings(req.catalyst, req.orgId);
    const categoryId = s.cfgFgCategoryId || "";
    const opts = s.cfgWidgetBooksOnly === "true"
      ? { compositesOnly: true, detailCap: 15, skuFromName: true, ...(categoryId ? { categoryId } : {}) }
      : categoryId ? { categoryId, detailCap: 15 } : {};
    res.json(await refreshFromBooks(req.catalyst, industryId, opts));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk import: create local SKU items from a parsed sheet (one row per item).
// Body: { industryId, rows } where rows = [{ "<Property caption>": "<cell>", ...,
// "Item Type": "Trading"|"Manufacturing" }] (the sheet is parsed to objects in the
// browser). Runs each row through the same engine as the manual generator (assemble
// → series → dup check → saveItemValues). Per-row results; one bad row never aborts
// the batch. format: "books" switches to the Zoho Books item-sheet columns
// (booksImport.js); there industryId may be left out — each row then takes the
// product type named like its Category Name. Push to Books stays manual unless the org's
// skuAutoPushImport setting is on — then each created row is pushed here.
router.post("/import", async (req, res) => {
  const { industryId, rows, format } = req.body || {};
  const byCategory = format === "books" && (industryId === undefined || industryId === null || industryId === "");
  if (!byCategory && !idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: "rows required" });
  try {
    const result = format === "books"
      ? await processBooksImport(req.catalyst, byCategory ? null : industryId, rows)
      : await processImport(req.catalyst, industryId, rows);
    const s = await settings(req.catalyst, req.orgId);
    if (s.skuAutoPushImport === "true") {
      // Sequential on purpose: Dev FUNCTIONS caps out around 10 concurrent.
      // ponytail: auto-push of very large batches can hit the function timeout —
      // keep such batches ≤ ~100 rows; upgrade path is a Catalyst Job.
      for (const r of result.results) {
        if (r.status !== "success") continue;
        try {
          const found = rowList(
            await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${r.itemId} AND ${orgClause(req.catalyst)}`),
          );
          if (!found.length) continue;
          const item = out(found[0]);
          await pushToZoho(req.catalyst, item, item.description);
          r.pushed = true;
        } catch (e) {
          r.pushed = false;
          r.pushError = e.message;
        }
      }
    }
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Search. Body: { industryId?, q?, sku?, type?, filters: [{ propertyId, valueId?, text? }] }.
// q = free-text LIKE on sku/name; sku = LIKE on sku only; type = exact match;
// filters = property-based. All present clauses are AND-ed. Nothing set ->
// plain list (optionally by industry).
// NB: ZCQL's LIKE wildcard is * (case-insensitive), not SQL's %.
// ponytail: LIKE '*q*' is a table scan and pulls one 300-row ZCQL page; fine for
// the internal app. Swap the q path to Catalyst Search (app.search()) for CRM/scale.
router.post("/search", async (req, res) => {
  const { industryId, filters, q, sku, type, withValues } = req.body || {};
  if (industryId && !idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  if (type && !TYPES.includes(type)) return res.status(400).json({ error: "Invalid type" });
  try {
    const zcql = req.catalyst.zcql();
    const ids = await searchItemIds(req.catalyst, filters);
    if (ids !== null && ids.size === 0) return res.json([]);

    const where = [orgClause(req.catalyst)];
    if (ids !== null) where.push(`ROWID IN (${[...ids].join(",")})`);
    if (industryId) where.push(`industryId = ${industryId}`);
    if (q && q.trim()) {
      const like = zStr("*" + q.trim() + "*"); // zStr escapes quotes — injection guard
      where.push(`(sku LIKE ${like} OR name LIKE ${like})`);
    }
    if (sku && sku.trim()) where.push(`sku LIKE ${zStr("*" + sku.trim() + "*")}`);
    if (type) where.push(`type = ${zStr(type)}`);

    let sql = `SELECT * FROM ${TABLE}`;
    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
    sql += " ORDER BY CREATEDTIME DESC";
    const items = rowList(await zcql.executeZCQLQuery(sql)).map(out);
    const result = await withIndustry(req.catalyst, items);
    // withValues: attach { "<Property caption>": "<display text>" } per item — the
    // CRM widget uses it for spec chips and custom-subform column mapping.
    // valueText already holds the resolved display value (see itemValues.saveItemValues).
    // ponytail: single ZCQL page (300 value rows); widget searches are narrow.
    if (withValues && result.length) {
      const iv = rowList(await zcql.executeZCQLQuery(
        `SELECT skuItemId, propertyId, valueText FROM SKUItemValue WHERE skuItemId IN (${result.map((i) => i.id).join(",")}) AND ${orgClause(req.catalyst)}`,
      ));
      const capById = new Map(rowList(await zcql.executeZCQLQuery(
        `SELECT ROWID, caption FROM Property WHERE ${orgClause(req.catalyst)}`,
      )).map((p) => [String(p.ROWID), p.caption]));
      const byItem = {};
      for (const v of iv) {
        const cap = capById.get(String(v.propertyId));
        if (cap && v.valueText) (byItem[String(v.skuItemId)] ||= {})[cap] = v.valueText;
      }
      for (const it of result) it.values = byItem[String(it.id)] || {};
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  const { name, sku, description, type, industryId } = req.body;
  if (!name || !sku || !type || !industryId) {
    return res.status(400).json({ error: "name, sku, type, industryId required" });
  }
  if (!idOk(industryId)) return res.status(400).json({ error: "Invalid industryId" });
  try {
    if (!(await ownsRow(req.catalyst, "Industry", industryId))) return res.status(404).json({ error: "Industry not found" });
    if (await findSkuRowId(req.catalyst, sku)) {
      return res.status(409).json({ error: "SKU already exists" });
    }
    const row = await req.catalyst.datastore().table(TABLE).insertRow({
      name,
      sku,
      description: description || null,
      type,
      industryId: String(industryId),
      orgId: req.orgId,
    });
    const item = out(row);
    await log(req, item.id, "sku.create", { sku });
    // Zoho Books sync is manual only (CR-021) — user clicks Push (/:id/push-zoho).
    const [withInd] = await withIndustry(req.catalyst, [item]);
    res.status(201).json(withInd);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  const { name, description, type, fields } = req.body;
  // ponytail: SKU code = Name for now (CR-237); revert to body sku when the generator/series owns edits again
  const sku = name;
  const data = { ROWID: id };
  if (name !== undefined) data.name = name;
  if (sku !== undefined) data.sku = sku;
  if (description !== undefined) data.description = description;
  if (type !== undefined) data.type = type;
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`),
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const existing = out(rows[0]);
    // Trading ↔ Manufacturing decides which Books API (item vs composite) the
    // stored zohoItemId belongs to — Books can't convert in place, so the type
    // locks once the item has been pushed (CR-029).
    if (type !== undefined && type !== existing.type && existing.zohoItemId) {
      return res.status(400).json({ error: "Item type is locked after pushing to Zoho Books" });
    }
    if (sku !== undefined && (await findSkuRowId(req.catalyst, sku, id))) {
      return res.status(409).json({ error: "SKU already exists" });
    }
    // Org-enabled extra fields (CR-209) merge into booksData; sheet-import keys stay.
    if (fields !== undefined) {
      const picked = pickItemFields(enabledKeys(await settings(req.catalyst, req.orgId)), fields);
      const fieldError = itemFieldError(picked); // CR-231: HSN 4/6/8 digits
      if (fieldError) return res.status(400).json({ error: fieldError });
      const bd = mergeBooksData(existing.booksData, picked);
      if (bd !== undefined) data.booksData = bd;
    }
    const row = await req.catalyst.datastore().table(TABLE).updateRow(data);
    const item = out(row);
    await log(req, id, "sku.update", { keys: Object.keys(data).filter((k) => k !== "ROWID") });
    // Zoho Books sync is manual only (CR-021) — user clicks Push (/:id/push-zoho).
    const [withInd] = await withIndustry(req.catalyst, [item]);
    res.json(withInd);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`),
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    // CR-223: the Books/Inventory item goes first; a refusal leaves everything as is.
    const { zohoDeleted } = await deleteFromZoho(req.catalyst, out(rows[0]));
    await deleteItemValues(req.catalyst, id);
    await req.catalyst.datastore().table(TABLE).deleteRow(id);
    await log(req, id, "sku.delete", { sku: out(rows[0]).sku, zohoDeleted });
    res.json({ deleted: true, zohoDeleted });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Item + stored property selections for the edit-in-generator flow (CR-030).
// selections: { propertyId: valueId } for list props, { propertyId: valueText }
// for Range — the same shape the generator's `selections` state uses.
router.get("/:id/values", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`),
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const vals = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM SKUItemValue WHERE skuItemId = ${id} AND ${orgClause(req.catalyst)}`),
    ).map(out);
    const selections = {};
    for (const v of vals) selections[String(v.propertyId)] = idOk(v.valueId) ? String(v.valueId) : v.valueText;
    res.json({ item: out(rows[0]), selections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/push-zoho", async (req, res) => {
  const id = req.params.id;
  if (!idOk(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const rows = rowList(
      await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id} AND ${orgClause(req.catalyst)}`),
    );
    if (!rows.length) return res.status(404).json({ error: "SKU item not found" });
    const item = out(rows[0]);
    // Push dialog options (CR-087): tracking + inventory account, create-only.
    // A caller that sends neither gets the org defaults (CR-166).
    const { tracking, inventoryAccountId } = req.body || {};
    const d = settingsOut(await settings(req.catalyst, req.orgId));
    const result = await pushToZoho(req.catalyst, item, item.description, {
      tracking: TRACKING.includes(tracking) ? tracking : d.pushTracking,
      inventoryAccountId: inventoryAccountId ? String(inventoryAccountId) : (d.pushAccountId || undefined),
      plainIfNoBom: true, // a single-item sync must not fail on a short BOM — lands as a plain item (CR-242)
    });
    const updated = rowList(await req.catalyst.zcql().executeZCQLQuery(`SELECT * FROM ${TABLE} WHERE ROWID = ${id}`));
    await log(req, id, "sku.push_zoho", { zohoItemId: out(updated[0]).zohoItemId });
    res.json({ success: true, zohoItemId: out(updated[0]).zohoItemId, item: result });
  } catch (err) {
    console.error("[Zoho] manual push error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
