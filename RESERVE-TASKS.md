# Reserve / De-reserve — reference & open design questions

Rebuild of the existing addon.octfis.in `ZBTejReserve.aspx` screen inside this app.

> **Tasks live in [TASKS.md](TASKS.md)** (single task list) — this file keeps the
> reserve-specific reference material: grid formulas, open design questions, risks.
> Schema: [SCHEMA.md](SCHEMA.md). System shape: [ARCHITECTURE.md](ARCHITECTURE.md).

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

## Status

Phase 3 (read path) is **code-complete and deployed** to SKU-GEN-OCTFIS dev
(2026-07-03) — scope + `reauth_required` handling, Books/Inventory reads, both
Data Store tables, the grid endpoint with A–I computed server-side, `reserve/sync.js`,
`ReservePage.jsx`, and the SYNC_SECRET-guarded `/internal/sync-stock` hook.
Outstanding: live verification against a real SO, and all of Phase 4 (write
actions), which is blocked on the open items below. Details: [TASKS.md](TASKS.md).

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
