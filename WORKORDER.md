# Work Order module — reference, setup & training

Implements the MSUN *Work Order Module BRD*. Change requests: [CHANGES.md](CHANGES.md)
(CR-013). Tables: [SCHEMA.md](SCHEMA.md). System shape: [ARCHITECTURE.md](ARCHITECTURE.md).
Tasks: [TASKS.md](TASKS.md).

Supersedes `RESERVE-TASKS.md` — the reserve add-on's read-only grid is now the
Materials tab of this module.

---

## 1. The grid, columns A–I

Per raw material of the selected finished good:

| Col | Meaning | Source |
|-----|---------|--------|
| A | BOM / required | `WorkOrderLine.requiredQty` = per-unit qty × FG qty |
| B | Stock on Hand | `ItemStockSnapshot`, **Main warehouse** row |
| C | Reserved | `ReservationLine.reservedQty` — sitting in the Reserve warehouse |
| D | Issued | `issuedQty − returnedQty` |
| E | PO | Σ `PurchaseRequestLine.purchaseQty` (ordered) |
| F | Received | Σ `PurchaseRequestLine.receivedQty` |
| G | Billed | Σ `PurchaseRequestLine.billedQty` |
| H | **Reservable** | `max(0, min(A − C − D − G, B))` |
| I | **Extra Reserved** | `A + C − D − G` |

Row turns red when `H < max(0, A − C − D)` — the outstanding requirement cannot
be covered from stock, so it needs purchasing.

All of it lives in one place: [`workorder/formulas.js`](functions/skuapi/workorder/formulas.js).
Self-check: `node functions/skuapi/workorder/formulas.js --selftest`.

> **Open BRD point (§13).** The BRD defines Extra Reserved as `A + C − D − G`,
> which is *larger* than the requirement and cannot be a de-reservable balance.
> `I` is displayed exactly as specified, but **de-reserve is capped at C** — what
> is physically in the Reserve warehouse. If MSUN confirms a different intent,
> change `cap()` in `formulas.js` and nothing else.

## 2. Warehouse map

Fixed by the BRD; only the warehouse *ids* are per-org (`OrgSetting`).

| Action | From | To | Document |
|--------|------|----|----------|
| Reserve | Main | Reserve | Transfer Order |
| De-reserve | Reserve | Main | Transfer Order |
| Issue | Reserve | Issue | Transfer Order |
| Return | Issue | Main | Transfer Order |
| Purchase Request confirm | — | delivery = Reserve | one draft PO **per vendor** |

Reserve, de-reserve, issue and return are one table (`MaterialTxn`) and one code
path — they differ only by `type` and the warehouse pair.

## 3. Keeping data fresh without burning the API

**Rule: Catalyst Data Store is the read model. No screen and no report calls
Zoho on load.** Zoho is touched in exactly three places:

1. **Write-through** (free) — every Transfer Order and PO is created by us, so
   the API response is written straight into our rows and the affected snapshot
   rows are adjusted by the moved quantity. C and D never come from Zoho at all.
2. **Webhooks** — Books workflow rules POST to `/internal/zoho-event`. Setup in
   §4 below.
3. **Nightly reconcile** — `POST /internal/reconcile`, bounded by *open work
   orders*: one bulk `GET /items?per_page=200` sweep filtered to the working set,
   PO refresh only for POs we created and only while unsettled, composite-item
   refresh only for FGs on open work orders.

Webhook delivery is not guaranteed and the rules live in the customer's console,
so the reconcile is **mandatory, not optional**.

## 4. Per-org setup procedure

1. **Enable the add-on** — `/#/admin/addons` → tick `work-order` for the org.
2. **Reconnect Zoho** once if the token predates the Inventory scope (the UI
   offers this; endpoints return `409 reauth_required` until then).
3. **Set the warehouses** — Work Order → Settings. Main, Reserve and Issue are
   required before any material can move; the page blocks and says so.
4. **Set the alert recipients** — purchase team email, approver L1/L2, shortfall
   days (default 4), cost threshold % (default 80).
5. **Register the cron** — Catalyst console → Cron → URL type, nightly:
   `POST https://<domain>/server/skuapi/internal/reconcile`
   with header `X-Sync-Secret: <SYNC_SECRET>`.
6. **Register the Books webhooks** — Books → Settings → Automation → Workflow
   Rules. One rule per module, action = webhook, method POST, URL:
   `https://<domain>/server/skuapi/internal/zoho-event?type=<type>&orgId=<orgId>`
   header `X-Sync-Secret: <SYNC_SECRET>`.

   | Rule on | `type=` | Fires when |
   |---------|---------|-----------|
   | Purchase Order | `purchaseorder` | created / status change |
   | Bill | `bill` | created |
   | Item | `item` | stock adjusted |
   | Composite Item | `compositeitem` | BOM edited in Books |
   | Sales Order | `salesorder` | edited (flags the work order for the planner) |

   Unknown types are acknowledged, never rejected, so an extra rule can never
   show failures in the customer's console.

> Workflow-rule coverage differs per Books plan and module. Verify each rule
> saves against the live org; anything Books will not fire is picked up by the
> nightly reconcile instead.

## 5. Role SOPs (training)

Everything in the module is **Draft → Confirm → a Zoho document appears**. The
only thing that changes between jobs is which column you type in.

### Production / Planning
1. Work Order → **+ New work order** → pick the sales order → tick the finished
   goods → Create. Each FG's BOM is pulled from its Zoho composite item.
2. **BOM tab** — upload the engineering BOM (Excel/CSV or paste from a sheet).
   Review the colours: green = new, amber = qty changed, red = removed.
   *Apply & update Zoho* writes the revision back to the composite item.
3. Move the status along the top bar as the job progresses. Completing asks for
   the quality-check result; **QC Rejected sends the job back to In Progress**.

### Store / Inventory
1. Open the work order → **Materials tab**.
2. Pick the action: **Reserve · De-reserve · Issue · Return**.
3. Type quantities in the last column (or press **Fill maximum**), then
   **Confirm**. One Transfer Order is created and its number is shown.
4. The bold column is your limit for the action you picked. Typing over it turns
   the box red and Confirm explains exactly what to do.

### Purchase
1. Red rows on Materials = short. Open the **Purchase tab**.
2. **Raise purchase request** — quantities already on order are excluded, so
   nothing is ordered twice.
3. Pick a vendor per line, adjust quantities, **Confirm** → one *draft* PO per
   vendor, delivered to the Reserve warehouse and tagged with the SO number.
   Your normal Books approval takes over from there.
4. Shortfall alerts arrive by email N days after BOM import if nothing was
   ordered.

### Finance / Audit
1. **Approvals tab** — record level 1, then level 2.
2. Invoicing stays blocked until both are recorded; the banner names what is
   missing.
3. **History tab** — every movement, its Zoho document, who confirmed it, when.

### Reports
Work Order → **Reports**: SO–BOM status and Shortfall/pending, both exportable
to CSV. Neither costs a Zoho API call.

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Warehouses not configured" | Settings incomplete | Set all three in Settings |
| `409 reauth_required` | Token predates the Inventory scope | Reconnect Zoho once |
| Add-on not enabled | No `OrgAddon` row | `/#/admin/addons` |
| Balances look wrong | Crash between the TO and the balance write | `POST /api/wo/:id/recompute` rebuilds them from the ledger |
| Stock stale | Cron not registered or webhook rules off | §4 steps 5–6; **⟳ Refresh** on Materials is the manual path |
| BOM upload leaves rows out | SKU/name matched nothing | The preview lists the unmatched rows — fix the sheet or add the item to the composite item first |

## 7. Still open with the client (BRD §13)

- Exact spec for "Reports — As per Tej Control" — **not built**, needs a format.
- Is the Reserve vs De-Reserve formula difference intentional? (see §1)
- Approver roles/levels for the two-level approval.
- Confirmation of warehouse count and naming beyond Main / Reserve / Issue.
- Ownership/status of the "SO-to-PO Add-on" referenced in the flow diagram —
  the Purchase Request module here covers the same ground.
- Named stakeholders for sign-off and UAT.
