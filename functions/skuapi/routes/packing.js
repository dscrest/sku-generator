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

const router = express.Router();

const DOC_RE = /^(so|inv|wo):\d+$/;
const HEADER_MAX = 9500; // text column silently caps at 10000

// Sanitize the client's boxes array into rows; throws { status, message } on bad shape.
function cleanBoxes(boxes) {
  if (!Array.isArray(boxes) || boxes.length > 500) throw { status: 400, message: "boxes must be an array (max 500)" };
  return boxes.map((b, i) => {
    const kind = b && b.kind === "pallet" ? "pallet" : "box";
    const items = Array.isArray(b && b.items) ? b.items : [];
    const itemsJson = JSON.stringify(items.map((it) => ({
      itemId: String(it.itemId || ""),
      name: String(it.name || "").slice(0, 300),
      hsn: String(it.hsn || "").slice(0, 20),
      size: String(it.size || "").slice(0, 100),
      qty: Number(it.qty) || 0,
      weightPc: Number(it.weightPc) || 0,
      netWeight: Number(it.netWeight) || 0,
      grossWeight: Number(it.grossWeight) || 0,
    })));
    if (itemsJson.length > HEADER_MAX) throw { status: 400, message: `Box ${i + 1} has too many items` };
    return { seq: i + 1, kind, dims: String((b && b.dims) || "").slice(0, 100), itemsJson };
  });
}

// Map a Books SO/invoice line item to the widget's source-line shape.
function toLine(li) {
  return {
    itemId: String(li.item_id || ""),
    name: li.name || "",
    description: li.description || "",
    hsn: li.hsn_or_sac || "",
    qty: Number(li.quantity) || 0,
    unit: li.unit || "",
  };
}

async function loadSaved(catalyst, orgId, docKey) {
  const lists = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT ROWID, variant, header FROM PackingList WHERE orgId = ${zStr(orgId)} AND docKey = ${zStr(docKey)}`,
  ));
  if (!lists.length) return null;
  const boxes = rowList(await catalyst.zcql().executeZCQLQuery(
    `SELECT seq, kind, dims, itemsJson FROM PackingBox WHERE orgId = ${zStr(orgId)} AND listId = ${zStr(String(lists[0].ROWID))} ORDER BY seq ASC`,
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
      return { seq: Number(b.seq), kind: b.kind || "box", dims: b.dims || "", items };
    }),
  };
}

// GET /api/packing/doc?invoiceId=<id> | ?soId=<id> | ?woId=<id>
// → { docKey, source, company, saved | null, prefillHeader | null }
router.get("/doc", async (req, res, next) => {
  try {
    const { invoiceId, soId, woId } = req.query;
    if (!/^\d+$/.test(String(woId || invoiceId || soId || ""))) return res.status(400).json({ error: "invoiceId, soId or woId required" });

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
          customer: { name: wo.customerName || "", address: "" },
          lines: fgs.map((f) => ({
            itemId: String(f.fgItemId || ""), name: f.fgName || "", description: f.fgSku || "",
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
        customer: {
          name: src.customer_name || "",
          address: [addr.address, addr.street2, addr.city, addr.state, addr.country, addr.zip].filter(Boolean).join(", "),
        },
        lines: (src.line_items || []).map(toLine),
      };
    }

    const cfg = await settings(req.catalyst, req.orgId);
    const company = {
      name: cfg.companyName || "", address: cfg.companyAddress || "",
      gstin: cfg.companyGstin || "", logoUrl: cfg.companyLogoUrl || "",
    };

    const saved = await loadSaved(req.catalyst, req.orgId, docKey);
    let prefillHeader = null;
    if (!saved) {
      // Newest saved list in the org seeds the export header (ports, AD code…).
      // ponytail: OrgSetting keys if admin-controlled defaults are ever needed.
      const rows = rowList(await req.catalyst.zcql().executeZCQLQuery(
        `SELECT header FROM PackingList WHERE orgId = ${zStr(req.orgId)} ORDER BY MODIFIEDTIME DESC LIMIT 1`,
      ));
      try { prefillHeader = rows.length && rows[0].header ? JSON.parse(rows[0].header) : null; } catch { /* skip */ }
    }
    res.json({ docKey, source, company, saved, prefillHeader });
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
    { kind: "pallet", dims: "120 X 80", items: [{ itemId: 1, name: "Valve", qty: "4", weightPc: 95 }] },
    { kind: "junk", items: "nope" },
  ]);
  assert.strictEqual(clean[0].kind, "pallet");
  assert.strictEqual(clean[0].seq, 1);
  assert.strictEqual(JSON.parse(clean[0].itemsJson)[0].qty, 4);
  assert.strictEqual(clean[1].kind, "box"); // unknown kind coerces to box
  assert.strictEqual(JSON.parse(clean[1].itemsJson).length, 0);
  assert.throws(() => cleanBoxes("nope"));
  console.log("packing selftest ok");
}
