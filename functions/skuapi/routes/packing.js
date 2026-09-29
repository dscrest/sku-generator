"use strict";

/**
 * Packing List (CR: Books packing-list widget). Persists one packing plan per
 * SO/invoice per org: PackingList { orgId, docKey, variant, header } +
 * PackingBox { orgId, listId, seq, kind, dims, itemsJson } (row per box so no
 * plan-size cap from the 10000-char text limit).
 *
 * docKey is `so:<salesorder_id>` when the invoice links to an SO (so the same
 * plan opens from either the SO or its invoice), else `inv:<invoice_id>`.
 * Mounted at /api/packing with NO addon gate — the Books widget is available
 * to any Books-connected org, like /api/crm.
 */
const express = require("express");
const { rowList, zStr } = require("../store");
const { settings, byOrg } = require("../workorder/store");
const booksApi = require("../zoho/booksApi");
const { loadToken } = require("../zoho/auth");

const router = express.Router();

const DOC_RE = /^(so|inv|wo):\d+$/;
const HEADER_MAX = 9500; // text column silently caps at 10000
// Package kinds; legacy rows saved as "box" read back as "wooden".
const KINDS = ["wooden", "corrugated", "pallet", "loose"];
const kindOf = (k) => (KINDS.includes(k) ? k : "wooden");

// Sanitize the client's boxes array into rows; throws { status, message } on bad shape.
// Gross weight is per package; net is per item (qty × weightPc).
function cleanBoxes(boxes) {
  if (!Array.isArray(boxes) || boxes.length > 500) throw { status: 400, message: "boxes must be an array (max 500)" };
  return boxes.map((b, i) => {
    const items = Array.isArray(b && b.items) ? b.items : [];
    const itemsJson = JSON.stringify(items.map((it) => ({
      itemId: String(it.itemId || ""),
      name: String(it.name || "").slice(0, 300),
      hsn: String(it.hsn || "").slice(0, 20),
      size: String(it.size || "").slice(0, 100),
      qty: Number(it.qty) || 0,
      weightPc: Number(it.weightPc) || 0,
      netWeight: Number(it.netWeight) || 0,
    })));
    if (itemsJson.length > HEADER_MAX) throw { status: 400, message: `Box ${i + 1} has too many items` };
    return {
      seq: i + 1, kind: kindOf(b && b.kind), dims: String((b && b.dims) || "").slice(0, 100),
      grossWeight: Number(b && b.grossWeight) || 0, itemsJson,
    };
  });
}

// Map a Books SO/invoice line item to the widget's source-line shape. Size =
// the item's "Size" custom field (same label match as bom.itemSize), else the
// line description.
function toLine(li) {
  const cf = (li.item_custom_fields || []).find((c) => String(c.label || "").trim().toLowerCase() === "size");
  return {
    itemId: String(li.item_id || ""),
    name: li.name || "",
    description: li.description || "",
    size: String(cf && cf.value != null ? cf.value : "").trim() || li.description || "",
    hsn: li.hsn_or_sac || "",
    qty: Number(li.quantity) || 0,
    unit: li.unit || "",
  };
}

// Books item weight → kg. A "Weight" custom field wins (label match like
// bom.itemSize; value "205 kg" / "500 g" / 205), else the built-in package weight.
const KG_PER = { g: 0.001, gm: 0.001, gms: 0.001, lb: 0.45359, lbs: 0.45359, oz: 0.02835 };
function weightKg(item) {
  const cf = ((item && item.custom_fields) || []).find((c) => /^weight\b/i.test(String(c.label || "").trim()));
  if (cf && cf.value != null && cf.value !== "") {
    const m = String(cf.value).trim().match(/^([\d.]+)\s*([a-z]*)/i);
    if (m) return (Number(m[1]) || 0) * (KG_PER[m[2].toLowerCase()] || 1);
  }
  const pd = (item && item.package_details) || {};
  return (Number(pd.weight) || 0) * (KG_PER[String(pd.weight_unit || "").toLowerCase()] || 1);
}

// Fill line.weightPc from each line's Books item, one GET per distinct item in
// parallel (outbound Zoho calls from one invocation — the Dev FUNCTIONS
// concurrency cap is about fan-out into our own function, CR-205). A failed
// lookup leaves 0 so the user types it.
async function fillWeights(catalyst, lines) {
  const kg = {};
  const ids = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
  await Promise.all(ids.map((id) => booksApi.getItem(catalyst, id)
    .then((item) => { kg[id] = weightKg(item); })
    .catch(() => { kg[id] = 0; })));
  for (const l of lines) l.weightPc = kg[l.itemId] || 0;
}

// Header fields carried by Books custom fields on the SO, invoice and org
// profile, matched by label (lowercased, non-alphanumerics stripped — the org
// profile's fields have no api_name). Later docs override earlier ones. MSUN
// keeps Buyer Order No and Buyer Order Date as two fields → "no | dd-mm-yyyy".
const normLabel = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const CF_KEYS = {
  portLoading: ["portofloading"],
  placeReceipt: ["placeofreceiptby", "placeofreceipt"],
  portDischarge: ["portofdischarge"],
  preCarriage: ["precarriage", "precarriageby"],
  incoTerms: ["incoterms"],
  buyerOrderNoDate: ["buyerordernodate", "buyerordernoanddate"],
  workorderNoDate: ["workordernodate", "workordernoanddate", "workorderno"],
  adCode: ["adcodeno", "adcode"],
  lcNo: ["lcno"],
  countryOrigin: ["countryoriginofgoods", "countryandoriginofgoods", "countryoforigin"],
  exporterRef: ["exportersrefno", "exporterrefno", "exportersreferenceno"],
};
const fmtDmy = (s) => { const p = String(s || "").split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : String(s || ""); };
function headerFromCustomFields(docs) {
  const out = {};
  for (const d of docs) {
    const by = {};
    for (const c of (d && d.custom_fields) || []) {
      if (c && c.value != null && String(c.value).trim() !== "") by[normLabel(c.label)] = String(c.value).trim();
    }
    for (const [key, aliases] of Object.entries(CF_KEYS)) {
      const hit = aliases.find((a) => by[a]);
      if (hit) out[key] = by[hit];
    }
    if (by.buyerorderno) out.buyerOrderNoDate = [by.buyerorderno, fmtDmy(by.buyerorderdate)].filter(Boolean).join(" | ");
  }
  return out;
}

async function loadSaved(catalyst, orgId, docKey) {
  const lists = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID, variant, header FROM PackingList WHERE orgId = ${zStr(orgId)} AND docKey = ${zStr(docKey)}`,
  ));
  if (!lists.length) return null;
  const boxes = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT seq, kind, dims, grossWeight, itemsJson FROM PackingBox WHERE orgId = ${zStr(orgId)} AND listId = ${zStr(String(lists[0].ROWID))} ORDER BY seq ASC`,
  ));
  let header = null;
  try { header = lists[0].header ? JSON.parse(lists[0].header) : null; } catch { /* corrupt = blank */ }
  return {
    rowId: String(lists[0].ROWID),
    variant: lists[0].variant || "export",
    header,
    boxes: boxes.map((b) => {
      let items = [];
      try { items = b.itemsJson ? JSON.parse(b.itemsJson) : []; } catch { /* corrupt row = empty */ }
      // ponytail: items[0].grossWeight is the pre-column (CR-131) location; drop once Dev plans are resaved.
      const grossWeight = Number(b.grossWeight) || Number((items[0] || {}).grossWeight) || 0;
      return { seq: Number(b.seq), kind: kindOf(b.kind), dims: b.dims || "", grossWeight, items };
    }),
  };
}

// GET /api/packing/doc?invoiceId=<id> | ?soId=<id> | ?woId=<id>
// → { docKey, source, company, docHeader, saved | null, prefillHeader | null, me }
router.get("/doc", async (req, res, next) => {
  try {
    const { invoiceId, soId, woId } = req.query;
    if (!/^\d+$/.test(String(woId || invoiceId || soId || ""))) return res.status(400).json({ error: "invoiceId, soId or woId required" });
    const t0 = Date.now();

    let so = null;
    let invoice = null;
    let docKey = null;
    let source = null;
    if (woId) {
      // Work order path: with a linked SO the plan is keyed so:<id> — the very
      // same plan the Books widget opens; without one it's wo:<id> with lines
      // from the WO's finished goods (invoice no/date typed manually).
      const wos = await byOrg(req.catalyst, req.orgId, "WorkOrder", `ROWID = ${zStr(String(woId))}`);
      if (!wos.length) return res.status(404).json({ error: "Work order not found" });
      const wo = wos[0];
      if (wo.salesOrderId) {
        so = await booksApi.getSalesOrder(req.catalyst, wo.salesOrderId);
      } else {
        docKey = `wo:${wo.ROWID}`;
        const fgs = await byOrg(req.catalyst, req.orgId, "WorkOrderFG", `workOrderId = ${zStr(String(wo.ROWID))}`);
        source = {
          soNumber: wo.salesOrderNumber || wo.woNumber || "",
          invoiceNumber: "",
          invoiceDate: "",
          reference: "",
          customer: { name: wo.customerName || "", address: "" },
          lines: fgs.map((f) => ({
            itemId: String(f.fgItemId || ""), name: f.fgName || "", description: f.fgSku || "", size: f.fgSize || "",
            hsn: "", qty: Number(f.fgQty) || 0, unit: "",
          })),
        };
      }
    } else if (invoiceId) {
      invoice = await booksApi.getInvoice(req.catalyst, invoiceId);
      // Books exposes the SO link in different places depending on how the
      // invoice was created — try them all before falling back to inv-keyed.
      const linkedSoId = invoice.salesorder_id
        || (Array.isArray(invoice.salesorders) && invoice.salesorders[0] && invoice.salesorders[0].salesorder_id)
        || (invoice.line_items || []).map((l) => l.salesorder_id).find(Boolean);
      if (linkedSoId) so = await booksApi.getSalesOrder(req.catalyst, linkedSoId);
    } else {
      so = await booksApi.getSalesOrder(req.catalyst, soId);
    }

    if (!docKey) {
      docKey = so ? `so:${so.salesorder_id}` : `inv:${invoice.invoice_id}`;
      const src = so || invoice;
      const addr = src.shipping_address || src.billing_address || {};
      source = {
        soNumber: so ? so.salesorder_number : "",
        invoiceNumber: invoice ? invoice.invoice_number : "",
        invoiceDate: invoice ? invoice.date : (so ? so.date : ""),
        reference: (so && so.reference_number) || (invoice && invoice.reference_number) || "", // customer PO no.
        customer: {
          name: src.customer_name || "",
          address: [addr.address, addr.street2, addr.city, addr.state, addr.country, addr.zip].filter(Boolean).join(", "),
        },
        lines: (src.line_items || []).map(toLine),
      };
    }
    const t1 = Date.now();

    // Everything below is independent — in parallel. Sequential, this leg alone
    // took 3.5–6.8 s in the Dev access logs (CR-205). The org profile
    // (req.orgId IS the Books organization_id) is always read: it carries the
    // consignor fallback AND the Exporter's Ref. No. custom field.
    const [, cfg, org, saved, prefillRows, token] = await Promise.all([
      fillWeights(req.catalyst, source.lines),
      settings(req.catalyst, req.orgId),
      booksApi.apiRequest(req.catalyst, "GET", `/organizations/${req.orgId}`).then((d) => d.organization || {}).catch(() => ({})),
      loadSaved(req.catalyst, req.orgId, docKey),
      // Newest saved list in the org seeds the export header fields no Books
      // custom field supplies (AD code, LC no…). Used only when nothing is saved.
      // ponytail: OrgSetting keys if admin-controlled defaults are ever needed.
      req.catalyst.zcql().executeZCQLQuery(
        `SELECT header FROM PackingList WHERE orgId = ${zStr(req.orgId)} ORDER BY MODIFIEDTIME DESC LIMIT 1`,
      ).then(rowList).catch(() => []),
      loadToken(req.catalyst, req.userId).catch(() => null),
    ]);

    // Consignor block: Company-details settings first, org profile for whatever is blank.
    const a = org.address || {};
    const company = {
      name: cfg.companyName || org.name || "",
      address: cfg.companyAddress || [a.street_address1, a.street_address2, a.city, a.state, a.zip, a.country].filter(Boolean).join(", "),
      email: cfg.companyEmail || org.email || "",
      gstin: cfg.companyGstin || "", logoUrl: cfg.companyLogoUrl || "",
    };
    const docHeader = headerFromCustomFields([so, invoice, org]);

    let prefillHeader = null;
    if (!saved && prefillRows.length && prefillRows[0].header) {
      try { prefillHeader = JSON.parse(prefillRows[0].header); } catch { /* skip */ }
    }
    // me: the widget's org-mismatch banner, so it needs no separate /auth/me round trip.
    const me = { orgId: req.orgId, orgName: (token && token.orgName) || null };
    console.log(`[packing/doc] ${docKey} lines=${source.lines.length} resolve=${t1 - t0}ms parallel=${Date.now() - t1}ms`);
    res.json({ docKey, source, company, docHeader, saved, prefillHeader, me });
  } catch (err) { next(err); }
});

// POST /api/packing/:docKey  body { variant, header, boxes } → { ok: true }
// POST, not PUT: the zip-hosted widget calls cross-origin, and PUT is never a
// CORS-"simple" method — it forces an OPTIONS preflight the Catalyst gateway
// answers itself without CORS headers, failing the request.
router.post("/:docKey", async (req, res, next) => {
  try {
    const { docKey } = req.params;
    if (!DOC_RE.test(docKey)) return res.status(400).json({ error: "Bad doc key" });
    const { variant, header, boxes } = req.body || {};
    const headerJson = JSON.stringify(header || {});
    if (headerJson.length > HEADER_MAX) return res.status(400).json({ error: "Header too large" });
    let rows;
    try { rows = cleanBoxes(boxes); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const ds = req.catalyst.datastore();
    const fields = { orgId: req.orgId, docKey, variant: variant === "domestic" ? "domestic" : "export", header: headerJson };
    const existing = rowList(await req.catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID FROM PackingList WHERE orgId = ${zStr(req.orgId)} AND docKey = ${zStr(docKey)}`,
    ));
    let listId;
    if (existing.length) {
      listId = String(existing[0].ROWID);
      await ds.table("PackingList").updateRow({ ROWID: existing[0].ROWID, ...fields });
    } else {
      const created = await ds.table("PackingList").insertRow(fields);
      listId = String(created.ROWID);
    }

    // Boxes replaced wholesale — no partial updates.
    const old = rowList(await req.catalyst.zcql().executeZCQLQuery(
      `SELECT ROWID FROM PackingBox WHERE orgId = ${zStr(req.orgId)} AND listId = ${zStr(listId)}`,
    ));
    const boxTable = ds.table("PackingBox");
    for (const r of old) await boxTable.deleteRow(r.ROWID);
    for (const b of rows) await boxTable.insertRow({ orgId: req.orgId, listId, ...b });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;

// ponytail self-check: `node functions/skuapi/routes/packing.js --selftest`
if (require.main === module && process.argv.includes("--selftest")) {
  const assert = require("assert");
  assert.ok(DOC_RE.test("so:123") && DOC_RE.test("inv:9") && DOC_RE.test("wo:42"), "docKey accepts so:/inv:/wo:");
  assert.ok(!DOC_RE.test("so:") && !DOC_RE.test("x:1") && !DOC_RE.test("so:1; DROP"), "docKey rejects junk");
  const clean = cleanBoxes([
    { kind: "pallet", dims: "120 X 80", grossWeight: "256", items: [{ itemId: 1, name: "Valve", qty: "4", weightPc: 95 }, { itemId: 2, qty: 1 }] },
    { kind: "junk", items: "nope" },
    { kind: "corrugated" }, { kind: "box" },
  ]);
  assert.strictEqual(clean[0].kind, "pallet");
  assert.strictEqual(clean[0].seq, 1);
  assert.strictEqual(clean[0].grossWeight, 256);
  assert.strictEqual(JSON.parse(clean[0].itemsJson).length, 2); // multi-item box
  assert.strictEqual(JSON.parse(clean[0].itemsJson)[0].qty, 4);
  assert.strictEqual(clean[1].kind, "wooden"); // unknown kind coerces to wooden
  assert.strictEqual(JSON.parse(clean[1].itemsJson).length, 0);
  assert.strictEqual(clean[2].kind, "corrugated");
  assert.strictEqual(clean[3].kind, "wooden"); // legacy "box"
  assert.throws(() => cleanBoxes("nope"));
  assert.strictEqual(toLine({ item_id: 5, description: "2 inch", item_custom_fields: [{ label: "Size", value: " 2\" " }] }).size, "2\"");
  assert.strictEqual(toLine({ item_id: 5, description: "2 inch" }).size, "2 inch");
  assert.strictEqual(weightKg({ package_details: { weight: "500", weight_unit: "g" } }), 0.5);
  assert.strictEqual(weightKg({ package_details: { weight: 12.5, weight_unit: "kg" } }), 12.5);
  assert.strictEqual(weightKg({}), 0);
  assert.strictEqual(weightKg({ custom_fields: [{ label: "Weight", value: "205 kg" }] }), 205);
  assert.strictEqual(weightKg({ custom_fields: [{ label: "Weight (kg)", value: 12 }] }), 12);
  assert.strictEqual(weightKg({ custom_fields: [{ label: "Weight", value: "500 g" }], package_details: { weight: 9 } }), 0.5);
  assert.strictEqual(weightKg({ custom_fields: [{ label: "Weight", value: "" }], package_details: { weight: 9 } }), 9);
  // Header from Books custom fields: label match, invoice overrides SO, org supplies Exporter's Ref, blanks skipped.
  const hdr = headerFromCustomFields([
    { custom_fields: [{ label: "Port of Loading", value: "Mundra" }, { label: "Work Order No and Date", value: "WO-0026 | 01-09-2026" }] },
    { custom_fields: [{ label: "Port of Loading", value: "Hazira" }, { label: "Port of Discharge", value: "" }, { label: "Inco Terms", value: "Ex Works" },
      { label: "Buyer Order No", value: "88888" }, { label: "Buyer Order Date", value: "2026-09-15" }] },
    null,
    { custom_fields: [{ label: "Exporter's Ref. No.", value: "AAQCM4066R" }, { label: "", value: "" }] },
  ]);
  assert.deepStrictEqual(hdr, {
    portLoading: "Hazira", workorderNoDate: "WO-0026 | 01-09-2026", incoTerms: "Ex Works",
    buyerOrderNoDate: "88888 | 15-09-2026", exporterRef: "AAQCM4066R",
  });
  assert.strictEqual(headerFromCustomFields([{ custom_fields: [{ label: "Buyer Order No. & Date", value: "PO-1 | 01-01-2026" }] }]).buyerOrderNoDate, "PO-1 | 01-01-2026");
  assert.deepStrictEqual(headerFromCustomFields([{}]), {});
  console.log("packing selftest ok");
}
