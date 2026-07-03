# Reserve / De-reserve — tasks & planning

Reserve-specific task file (main project tasks live in the separate task-management
file). Rebuild of the existing addon.octfis.in `ZBTejReserve.aspx` screen inside
this app. Full plan context: see plan `the-sku-generator-is-transient-comet.md`
and ARCHITECTURE.md.

## Grid formula reference (from existing addon)

Per raw-material row of the selected FG (composite item) on a sales order:

| Col | Meaning | Source |
|-----|---------|--------|
| A | BOM qty | Zoho composite item `mapped_items[]` × SO FG qty |
| B | Stock on Hand | ItemStockSnapshot (synced from Zoho) |
| C | Reserved | ReservationLine.reservedQty |
| D | Issued | ReservationLine.issuedQty (net of returns) |
| E | PO | ItemStockSnapshot.poQty |
| F | Received | ItemStockSnapshot.receivedQty |
| G | Billed | ItemStockSnapshot.billedQty |
| H | Reservable | `max(0, min(A − C − D − G, B))` |
| I | Extra Reserved | `A + C − D − G` |
| J | Reserve Qty | user input (click cell) |

Click a qty → reserve if available; row red = shortage → reorder from vendor.
"New RM Added" rows come via Import BOM.
**Exact column definitions to be confirmed against reference tables (open item 4).**

## Tasks

### Phase 3 — read path (code deployed 2026-07-03; needs live verification with a re-consented token)
- [x] Add `ZohoInventory.fullaccess.all` scope + `reauth_required` (409) handling on reserve endpoints
- [x] booksApi: `getSalesOrder`, `listSalesOrders`, `listPurchaseOrdersForItem` (+ `getPurchaseOrder` for line qtys)
- [x] inventoryApi: `getCompositeItem`, `listWarehouses`, `getItemStock` (+ write stubs)
- [x] Data Store tables: `ReservationLine` (69851000000054976), `ItemStockSnapshot` (69851000000056456)
- [x] `GET /api/reserve/sales-orders | /so/:soId | /grid` + `POST /api/reserve/sync` (formulas server-side)
- [x] `reserve/sync.js` (sequential, rate-limit-friendly) + `reserve/zohoDocs.js` action seam (POST actions return 501 until Phase 4 — no separate actions.js until there is logic to put in it)
- [x] `ReservePage.jsx`: SO picker / `?soId=` deep link, FG selector, sync banner + refresh, grid with red shortage rows
- [x] `POST /internal/sync-stock` cron hook (SYNC_SECRET-guarded) — verified 401/200 on deploy; cron itself not registered yet
- [ ] **Live verification**: enable `reserve` for the org in `/#/admin/addons`, reconnect Zoho (Inventory scope), open `/#/reserve?soId=<real SO>` and hand-check H against the existing addon
- [ ] Verify deep link `…/app/#/reserve?soId=…` survives login/OAuth round-trip (sessionStorage fallback if not)

### Phase 4 — write actions (BLOCKED on reference tables/designs from Dhiraj)
- [ ] Fill `zohoDocs.js`: Zoho document per action (reserve/de-reserve/issue/return/transfer)
- [ ] Action validation: reserve ≤ H, issue ≤ C, return ≤ issued
- [ ] Grid cell click → reserve qty input wired to POST actions
- [ ] Import BOM action
- [ ] Per-warehouse snapshot rows if reserved-warehouse model requires
- [ ] Catalyst URL cron → `POST /internal/sync-stock` (secret-guarded), frequency TBD
- [ ] Books custom button per customer org (manual setup step — document procedure here)

## Open items awaiting inputs (reference tables / design formats)

1. **Zoho document mapping per action** — reserve = transfer order to which warehouse? issue = package/adjustment/shipment? return = reverse transfer or adjustment?
2. **Reserved-warehouse convention** — one fixed "Reserved" warehouse per org, or per-project?
3. **P2P transfer + Import BOM** reference screens (import from where?)
4. **Exact E/F/G definitions** — open POs only? date cutoffs? (existing addon's column logic)
5. **Cron frequency** + "Next Sync" display rule
6. **Books custom-button** URL/setup convention per customer org

## Risks

- Inventory scope addition ⇒ every existing user must re-consent before reserve works (SKU-only flows unaffected — handled via `reauth_required`).
- Zoho rate limits (~100 req/min/org) ⇒ snapshot cache, only grid-referenced items synced, sequential calls.
- Cron borrows the org's most-recent user token; if that user disconnects, sync stops silently (upgrade path: org-level service token).
