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
| B | Stock on Hand | `ItemStockSnapshot`, **Main warehouse** row — the WO's own `mainWarehouseId` when set (CR-249), else the org setting |
| C | Reserved | `ReservationLine.reservedQty` — sitting in the Reserve warehouse |
| D | Issued | `issuedQty − returnedQty` |
| E | PO | Σ `PurchaseRequestLine.purchaseQty` (ordered) |
| F | Received | Σ `PurchaseRequestLine.receivedQty` |
| G | Billed | Σ `PurchaseRequestLine.billedQty` |
| H | **Reservable** | `max(0, min(A − C − D, B))` — G dropped (CR-152): a PO raised for the WO is received into Main, so it is already in B; subtracting it made purchased stock unreservable once billed |
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

Fixed by the BRD; only the warehouse *ids* are per-org (`OrgSetting`). Main is
the org default and can be overridden per work order (`WorkOrder.mainWarehouseId`,
CR-249); Reserve and Issue are always org-wide.

| Action | From | To | Document |
|--------|------|----|----------|
| Reserve | Main | Reserve | Transfer Order |
| De-reserve | Reserve | Main | Transfer Order |
| Issue | Reserve | Issue | Transfer Order |
| Return | Issue | Main | Transfer Order |
| Purchase Request confirm | — | delivery = Main | one draft PO **per vendor** (CR-170) |

Reserve, de-reserve, issue and return are one table (`MaterialTxn`) and one code
path — they differ only by `type` and the warehouse pair. One action on the
Materials grid is **one transaction and one Transfer Order for every finished
good at once** (CR-277): each `MaterialTxnLine` names its FG, the same raw
material under two FGs becomes one TO line (quantities summed, picks merged),
and balances stay per FG. The Completed / Cancelled sweep likewise writes one
de-reserve and/or one return TO per work order.

### Status lifecycle (CR-160)

Table in [`workorder/status.js`](functions/skuapi/workorder/status.js). Status
moves only from the ⋯ menu — material actions never change it. Within the
shop-floor stages (Ready For Machining … Ready For Dispatch) the menu also
offers one step back (`← Stage`, CR-171); nothing moves, dates already stored
are not re-asked. Completed onwards, Draft and Approved never step back.

| Status | Meaning | Gate to leave / what it allows |
|--------|---------|--------------------------------|
| Draft | Fresh WO | Approval (or *→ Ready For Machining* when approvals are off) |
| PendingApproval / Approved | Sign-off flow (CR-080) | — |
| ReadyForMachining | Reserve / issue start here | — |
| MachiningInProgress | RM being processed | **Machining Completion Date** compulsory |
| ReadyForFitting / FittingInProgress | Fitting | **Fitting Completion Date** compulsory to leave FittingInProgress |
| ReadyForDispatch | Last shop-floor stage | Completed needs ≥ 1 assembly per FG, QC result, nothing reserved (CR-151) |
| Completed → Dispatched → Closed | Done; Close warns on unissued lines; Reopen (admin) → Dispatched | — |
| Hold | Reason required; nothing moves; resumes to the prior status | — |
| Cancelled | De-reserves (Reserve → Main); issued material stays | — |

Assembly (Details → **Make Assembly** action, CR-172; renamed CR-208) is allowed at any shop-floor
stage (Ready For Machining … Ready For Dispatch) once the finished good's
**issued** material covers at least one unit (CR-277 — partial assembly; it
used to need every BOM line fully issued). The tab is one table: Ordered ·
Assembled · **Ready** (units the issued material covers = min over BOM lines of
⌊(issued − consumed by earlier assemblies) ÷ per-unit⌋) · **Blocked** (the
rest) · **Waiting on** (the raw materials holding them back, with the quantity
still to issue, e.g. *Seal (1 more)*) · *Assemble now* (prefilled to Ready,
edit for a smaller run; Proceed opens the assemble modal seeded with it). A row
with nothing ready waits. The server re-checks the count on Proceed and refuses
more than Ready, naming the raw materials.

Proceed Assembly (CR-176) first looks up the batch/serial pool of every raw
material at the Issue warehouse; tracked lines open the same picker as
Issue/Return (FIFO prefilled, each line must be covered exactly) and the picks
go into the Zoho bundle lines — untracked lines are consumed silently.
Confirming the picker (or Proceed on an FG with no tracked lines) closes the
modal at once; the Ready row shows *Assembling…* with its count locked until
Zoho answers, then refreshes (CR-243). Each
produced unit gets a serial `PREFIX + YYYY + NNN` (CR-150); the prefix prefill
order is the FG item's `cf_valve_type` code before the dash (CR-177) → the SKU
item's "Valve Type" property code → the SKU's leading letters → typed in the
modal.

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
   required before any material can move; the page blocks and says so. Main
   here is the default — an org with several factories picks the Main
   warehouse on each work order (CR-249). Turn on **Pick Main warehouse on
   every work order** there to make that pick mandatory (CR-260).
4. **Set the alert recipients** — purchase team email, approver L1/L2, shortfall
   days (default 4), cost threshold % (default 80).
5. **Register the cron** — Catalyst console → Cron → URL type, nightly:
   `POST https://<domain>/server/skuapi/internal/reconcile`
   with header `X-Sync-Secret: <SYNC_SECRET>`.
   5b. **Daily item refresh** (CR-271, orgs on Product Designs) — same, daily:
   `POST https://<domain>/server/skuapi/internal/refresh-items`
   with header `X-Sync-Secret: <SYNC_SECRET>`.
6. **Register the Books webhooks** — Books → Settings → Automation → Workflow
   Rules. One rule per module, action = webhook, method POST, URL:
   `https://<domain>/server/skuapi/internal/zoho-event?type=<type>&orgId=<orgId>`
   header `X-Sync-Secret: <SYNC_SECRET>`. If the rule can't send a custom header,
   append `&secret=<SYNC_SECRET>` to the URL instead (accepted as a fallback) —
   without one or the other the endpoint returns 401. Enabling these makes stock
   changes push in real time (one item each), so the manual sync is only a
   backstop.

   Books webhook form (verified on MSUN, CR-245): Authorization = *Self
   Authorization*, leave "secure this webhook" unticked, Body = **Raw** JSON,
   e.g. `{"salesorder_id": "${SalesOrder.SalesOrder ID}"}` via *Insert
   Placeholders*. The function parses JSON only — *Default Payload*, form-data
   and urlencoded bodies arrive empty and the event is silently ignored. The
   rule itself is *Edited · any field*: the sink diffs quantities, so no field
   condition is needed.

   | Rule on | `type=` | Fires when |
   |---------|---------|-----------|
   | Purchase Order | `purchaseorder` | created / status change |
   | Bill | `bill` | created |
   | Item | `item` | stock adjusted |
   | Composite Item | `compositeitem` | BOM edited in Books |
   | Sales Order | `salesorder` | edited (flags the work order for the planner) |

   Unknown types are acknowledged, never rejected, so an extra rule can never
   show failures in the customer's console.
7. **Optional — work order number on the Sales Order** (CR-173 / CR-268). In
   Books → Settings → Sales Orders → Field Customization, add a text field
   labelled **Work Order No and Date** (api name
   `cf_work_order_no_and_date`). The active work order is then written there
   as `WO-0012 / 16/09/2026`, and cleared on cancel or draft delete. An org
   without the field is skipped — no error, no Books call after the first
   attempt. A field added later is picked up within minutes (next cold start).

> Workflow-rule coverage differs per Books plan and module. Verify each rule
> saves against the live org; anything Books will not fire is picked up by the
> nightly reconcile instead.

## 5. Role SOPs (training)

Everything in the module is **Draft → Confirm → a Zoho document appears**. The
only thing that changes between jobs is which column you type in.

### Production / Planning
1. Work Order → **+ New** → one form laid out like the Books Sales Order page
   (CR-252): pick the sales order — Customer, SO Date, Expected Shipment, Buyer
   Order, Freight, Delivery, Booking and Transporter fill in read-only — set the
   Main warehouse, WO / Machining / Fitting dates, priority and TC Required,
   tick the finished goods in the item table (quantities editable), add a
   Special Instruction → Create. Each FG's BOM is pulled from its Zoho composite
   item. ✎ **Edit** on a work order opens the same page (`/wo/:id/edit`) with
   the sales order and finished goods read-only.
2. **BOM tab** — upload the engineering BOM (Excel/CSV or paste from a sheet).
   Review the colours: green = new, amber = qty changed, red = removed.
   *Apply & update Zoho* writes the revision back to the composite item.
3. Move the status along the top bar as the job progresses. Completing asks for
   the quality-check result; **QC Rejected sends the job back to In Progress**.

### Store / Inventory
1. Open the work order → **Materials tab**.
2. Pick the action: **Reserve · De-reserve · Issue · Return**.
3. Type quantities in the last column (or press **Fill maximum**), then
   **Confirm**. One Transfer Order is created for every finished good you typed
   against and its number is shown.
4. The bold column is your limit for the action you picked. Typing over it turns
   the box red and Confirm explains exactly what to do.
5. **Replace** (defective issued material): type the defective quantity, Proceed
   → pick the defective batch/serial numbers (tracked items only) → give the
   reason and add a photo (click the dashed box or drop the image on it; on a
   phone it opens the camera or gallery) → **Proceed Replace** sends it: a
   Store issue (`SI-…`) per line and a **draft** return transaction. Nothing
   moves in Zoho yet (CR-280): the units stay in the Issue warehouse and are
   **blocked** there (never offered by a picker, never counted as assemblable)
   until the store manager acts. That is all the shop floor does — the request
   now waits in **Store issues**.
   Return and Replace only cover material **not yet assembled** — once a unit
   is made, its parts have left the Issue warehouse. Found a defect after
   assembly? Assembly tab → ⋮ **Delete assembly** first, then Replace.

### Store Issue Manager
1. Settings → Work Order → Alerts → **Store issue email** receives every defect;
   the sidebar shows a red count next to **Store issues** while any row is
   still open (replacement undecided or units not yet dealt with).
2. Order Management → **Store issues** (filter **Open** by default): each row is
   one defective line with its photo, batch/serials and reason. Two decisions
   per row, each with a reason, both in the work order's History:
   **The first action on a row fires the defective-return Transfer Order**
   (Issue → Main, the batches picked at raise) — whichever of the two it is
   (CR-280); the row then reads *returned to Main* instead of *still at Issue*.
   - **Replacement** — ⋮ → **Replace — Reserve & Issue**: the dialog opens with
     the defective item selected (✕ to pick a different Books item — the BOM is
     swapped), shows what Main can supply now with its batch/serial numbers, and
     what will be purchase-requested — or *No stock at Main for …*, in which
     case Proceed raises a purchase request for the whole quantity. Pick the
     batch/serial numbers, Proceed → return TO, then Transfer Orders Main →
     Reserve → Issue for the in-stock part and one purchase request for the
     rest. **Replace — Raise PR** skips the stock move and requests the whole
     quantity. The Replacement column shows the outcome and the TO / PR numbers.
   - **Defective units** — ⋮ → **Restock — repaired** (usable again),
     **Trash — write off** (Zoho inventory adjustment at Main), or **Return to
     vendor** (marked; stays blocked — adjust the stock in Books when the
     vendor credits it).
   A row leaves the Open view once both decisions are made.

### Valves configured on a CRM quote (CR-261)
A valve quoted through the Product Configurator is one Books item per model;
its Books BOM holds placeholder raw material. When its sales order carries the
quote number, **New Work Order** shows a **Configuration** column (quote no ·
MOC and the other answers) and the WO's raw material is the items mapped for
those answers in *Product Configurator → Components* — Casing CI, Gland CI … for
MOC = CI — not the composite's lines.

- A part with no item for that MOC, or an item not yet in Books, is named in a
  message after Create; the other parts are seeded. Add the missing one on the
  **Items** tab, or map it in Components and use **BOM → Compare** to pull it in.
- Which source a work order uses is a setting: **Settings → Work order →
  Work order raw material** (CR-270). It needs the Product Configurator add-on.
  Ricon is on *Direct from Template*; every other organisation is on *Direct
  from Books*.

  | Setting | Finished good | Raw material comes from | Source |
  |---|---|---|---|
  | Direct from Books (default) | any | Books composite item × qty | composite |
  | Direct from Template | sold from a saved quote, Components rows match | Components for the quoted answers → their Books items | quote |
  | Direct from Template | Main product of an active Product Design | the design's components → Materials → their Books items | design |
  | Direct from Template | neither | Books composite item × qty, with a message | composite |

  Within *Direct from Template* the first row that gives an item wins.
- Neither found: Create says *<item>: no quote configuration or product design
  gave items — BOM taken from the Books composite*, per finished good.
- **From a Product Design (CR-270).** The sales order carries a dummy finished
  good (one Books composite per model). The work order finds the design whose
  **Main product** is that item and takes each component's material, then the
  Books item that material is linked to on *Product Configurator → Materials*.
  - Qty per finished good = component qty × cast weight. A part with cast
    weight 0 (counted in Nos) = the component qty.
  - One material on a component: it is used. Several (Casing: CI / WCB / SS):
    the one the quote's answers name (MOC). No saved quote on the SO = the
    component is named in a message and left out; add it on the **Items** tab.
  - A material with no Books item is named in a message; link it on Materials
    and use **BOM → Compare**.
  - Inactive designs are not used.
  - A work order raised before this change: **BOM → Compare** shows the
    design's items against the composite's; **Apply here only** takes them.
  - **Product Designs** (v2 since CR-271, the only form since CR-289): a
    component row can carry an **Item (ZB)** — a Books item picked from the
    synced SKU master — instead of its materials, and each material sub-line
    carries its own item (CR-290: Casing → CI = item X, WCF = item Y). The work
    order takes the option's item × qty × cast weight ahead of the material's
    Materials-page link, no link step needed. Keep the Books
    items synced: Books Items → Refresh from Zoho, or the daily cron (§4).
    One row per component (CR-276); its materials are sub-lines, each with
    its qty in the material's unit — Casing → CI 55 KG / WSB 70 KG. The
    sub-line qty is the WO line qty per finished unit for that material.
- The valve's Books composite is never updated from such a work order: the BOM
  tab offers *Apply here only*, and assembly consumes the WO's items without
  rewriting the composite.
- The configuration is frozen on the work order — a later edit of the quote
  does not change it.

### Sales Order quantity changes
When Sales edits a line quantity in Books, the work order list (and the WO page
side list) shows a red **▲** (qty went up) / **▼** (went down) before the WO
number — hover for "qty 3 → 4 (FG)" — and Details shows a banner per finished
good ("now 4 — this work order is for 3"). **Apply** rescales the BOM lines (refused if that would
go below what is already reserved/issued); **Dismiss** just acknowledges it.
Both are in History. The hint also arrives without opening the work order when
the Sales Order workflow rule (§4) posts to the webhook sink.

### Dates after a Sales Order change (CR-251)
Applying a quantity change or adding a new line opens the **Edit page** straight
away (step 2, Properties) with a note saying what changed, so the WO Date,
Machining Date and Fitting Date can move with it. The same three dates are
editable any time from ✎ Edit; the status gates still ask for them when a stage
is entered with the date blank.

### Sales Order new lines (CR-250)
When Sales adds a line to the SO after the work order was raised, the list and
side list show a red **＋** before the WO number (hover names the line) and
Details shows a banner "Sales order now has X × N — not on this work order".
**Add to work order** creates the finished good with its BOM seeded exactly as
at create (one BOM revision); **Dismiss** just acknowledges it. Lines the
planner left out at create never show — only lines added afterwards. Both are
in History.

### Purchase
1. Red rows on Materials = short. Open the **Purchase tab**.
2. **Raise purchase request** — quantities already on order are excluded, so
   nothing is ordered twice.
3. Pick a vendor per line, adjust quantities, **Confirm** → one *draft* PO per
   vendor, delivered to the Main warehouse and tagged with the SO number
   (quantity ordered beyond the requirement goes on its own line without it).
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
