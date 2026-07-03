"use strict";

/**
 * Reserve/De-reserve add-on — read path (Phase 3).
 * Grid formulas (see RESERVE-TASKS.md): per component of the selected FG,
 *   A=BOM  B=Stock on Hand  C=Reserved  D=Issued  E=PO  F=Received  G=Billed
 *   H (Reservable)     = max(0, min(A − C − D − G, B))
 *   I (Extra Reserved) = A + C − D − G
 * Computed server-side: action validation must recompute H here anyway.
 */
const express = require("express");
const { rowList, zStr, reqOrg } = require("../store");
const { getSalesOrder, listSalesOrders } = require("../zoho/booksApi");
const { getCompositeItem } = require("../zoho/inventoryApi");
const { snapshotRows, syncItems, syncOrgStock } = require("../reserve/sync");

const router = express.Router();

// Token predates the Inventory scope (or was revoked) → the UI shows a
// "Reconnect Zoho" callout instead of a raw error.
function isReauth(err) {
  return err.zohoCode === 57 || err.httpStatus === 401 || /INVALID_OAUTH|not authorized/i.test(err.message || "");
}

function fail(res, err) {
  if (isReauth(err)) {
    return res.status(409).json({ error: "reauth_required", message: "Reconnect Zoho to grant Inventory access" });
  }
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
}

// SO picker for in-app entry.
router.get("/sales-orders", async (req, res) => {
  try {
    const sos = await listSalesOrders(req.catalyst, req.query.q);
    res.json(
      sos.map((s) => ({
        id: String(s.salesorder_id),
        number: s.salesorder_number,
        date: s.date,
        customerName: s.customer_name,
        status: s.status,
        referenceNumber: s.reference_number || null,
      })),
    );
  } catch (err) {
    fail(res, err);
  }
});

// SO header + line items (FG selector). Composite detection happens when the
// grid loads the picked line — non-composite FGs come back as a clear 400.
router.get("/so/:soId", async (req, res) => {
  try {
    const so = await getSalesOrder(req.catalyst, req.params.soId);
    res.json({
      id: String(so.salesorder_id),
      number: so.salesorder_number,
      date: so.date,
      customerName: so.customer_name,
      status: so.status,
      referenceNumber: so.reference_number || null,
      lineItems: (so.line_items || []).map((l) => ({
        itemId: String(l.item_id),
        name: l.name,
        sku: l.sku || null,
        quantity: Number(l.quantity) || 0,
      })),
    });
  } catch (err) {
    fail(res, err);
  }
});

// The grid: BOM ⋈ snapshot ⋈ ReservationLine, formulas computed here.
router.get("/grid", async (req, res) => {
  const { soId, fgItemId } = req.query;
  if (!soId || !fgItemId) return res.status(400).json({ error: "soId and fgItemId required" });
  try {
    const orgId = reqOrg(req.catalyst);
    const [so, comp] = await Promise.all([
      getSalesOrder(req.catalyst, soId),
      getCompositeItem(req.catalyst, fgItemId).catch((err) => {
        if (err.httpStatus === 404 || err.zohoCode === 2006) {
          const e = new Error("Selected line item is not a composite (BOM) item in Zoho");
          e.status = 400;
          throw e;
        }
        throw err;
      }),
    ]);
    const soLine = (so.line_items || []).find((l) => String(l.item_id) === String(fgItemId));
    const fgQty = soLine ? Number(soLine.quantity) || 0 : 0;
    const components = (comp.mapped_items || []).map((m) => ({
      itemId: String(m.item_id),
      name: m.name,
      sku: m.sku || null,
      perUnitQty: Number(m.quantity) || 0,
    }));
    const itemIds = components.map((c) => c.itemId);

    // Snapshot: reuse cached rows; fetch live (and seed the cache) only for
    // components never seen before — first open is slow, refresh is explicit.
    let snaps = await snapshotRows(req.catalyst, orgId, itemIds);
    const missing = itemIds.filter((id) => !snaps.has(id));
    if (missing.length) {
      const fresh = await syncItems(req.catalyst, orgId, missing);
      snaps = new Map([...snaps, ...fresh]);
    }

    // Our reservation state for this SO × FG.
    const rlRows = itemIds.length
      ? rowList(
          await req.catalyst.zcql().executeZCQLQuery(
            `SELECT * FROM ReservationLine WHERE orgId = ${zStr(orgId)} AND salesOrderId = ${zStr(String(soId))} AND fgItemId = ${zStr(String(fgItemId))}`,
          ),
        )
      : [];
    const rlByItem = new Map(rlRows.map((r) => [String(r.componentItemId), r]));

    let lastSyncAt = null;
    const rows = components.map((c) => {
      const snap = snaps.get(c.itemId) || {};
      const rl = rlByItem.get(c.itemId) || {};
      const A = c.perUnitQty * fgQty;
      const B = Number(snap.stockOnHand) || 0;
      const C = Number(rl.reservedQty) || 0;
      const D = (Number(rl.issuedQty) || 0) - (Number(rl.returnedQty) || 0);
      const E = Number(snap.poQty) || 0;
      const F = Number(snap.receivedQty) || 0;
      const G = Number(snap.billedQty) || 0;
      const H = Math.max(0, Math.min(A - C - D - G, B));
      const I = A + C - D - G;
      if (snap.syncedAt && (!lastSyncAt || snap.syncedAt > lastSyncAt)) lastSyncAt = snap.syncedAt;
      const needed = Math.max(0, A - C - D);
      return {
        itemId: c.itemId,
        name: c.name,
        sku: c.sku,
        bom: A,
        stock: B,
        reserved: C,
        issued: D,
        po: E,
        received: F,
        billed: G,
        reservable: H,
        extraReserved: I,
        short: H < needed, // red row: can't cover what's still needed → reorder
      };
    });

    res.json({
      soId: String(soId),
      soNumber: so.salesorder_number,
      fgItemId: String(fgItemId),
      fgName: comp.name,
      fgQty,
      lastSyncAt,
      rows,
    });
  } catch (err) {
    fail(res, err);
  }
});

// Manual refresh (the sync banner's button): re-pull all synced items for this org.
router.post("/sync", async (req, res) => {
  try {
    const count = await syncOrgStock(req.catalyst, reqOrg(req.catalyst));
    res.json({ ok: true, items: count });
  } catch (err) {
    fail(res, err);
  }
});

// Phase 4: mutations. Wired to reserve/zohoDocs.js once the document mapping
// arrives — until then an honest 501.
router.post("/:action(reserve|dereserve|issue|return|transfer|import-bom)", (req, res) => {
  res.status(501).json({
    error: `"${req.params.action}" is not available yet — write actions ship in Phase 4 (see RESERVE-TASKS.md)`,
  });
});

module.exports = router;
