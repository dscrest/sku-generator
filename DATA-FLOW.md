# Data flow — where every piece of data comes from, where it lives, when it moves

Traced from code on 2026-10-08 (branch `feat/zoho-field-mapping`, CR-282).
Companion to [ARCHITECTURE.md](ARCHITECTURE.md) (shape), [SCHEMA.md](SCHEMA.md)
(columns) and [WORKORDER.md](WORKORDER.md) (formulas). This file answers one
question per datum: **source → store → trigger → write-back**, and lists the
gaps found on the way (§9). File references are under `functions/skuapi/`
unless a path says otherwise.

Legend for the *Trigger* column: **load** = fetched when a page/widget opens ·
**action** = a user click · **write-through** = our own Zoho write updates our
row in the same call · **webhook** = Books workflow rule → `/internal/zoho-event`
· **cron** = `/internal/reconcile` (nightly) / `/internal/refresh-items` (daily) — **no Catalyst cron job exists on Dev as of 2026-10-19**; `refresh-items` also skips non-`recipe-engine` orgs, so MSUN refreshes only from the Quote Maker widget (open / Refresh, CR-287)
· **once** = copied at create, never refreshed.

---

## 1. Systems of record

| Datum | Master | Our copy | Notes |
|---|---|---|---|
| Users, sessions | Catalyst `AppUser` + signed cookie | — | Stateless sessions |
| Zoho OAuth token, selected org | `ZohoToken` (per user) | — | Org id = `ZohoToken.orgId`, else env `ZOHO_ORG_ID` (`zoho/auth.js:202`) |
| Add-on entitlements, roles, org settings | `OrgAddon`, `Role`, `UserRole`, `OrgSetting` | — | `OrgSetting` is the catch-all KV for every module |
| Item catalogue (name, SKU, unit, HSN, rate, tax, stock) | **Zoho Books** | `SKUItem` (+ `booksData` JSON) | We own the SKU *string* and the property answers; Books owns everything else |
| Property answers behind a SKU | `SKUItemValue` | Books custom fields (`Property.zohoCfApiName`) | Pushed on item push; pulled on import / daily refresh |
| Composite BOM | **Zoho Inventory** composite item | `CompositeItemCache` (24 h TTL) | WO lines are a frozen *copy*, never a view |
| Product Design, Materials, Cost elements, Sizing, Component Map | Catalyst recipe tables | — | Links to Books by item id only |
| Stock on hand per warehouse | **Zoho Inventory** | `ItemStockSnapshot` | Four writers (§5.3) |
| Reserved / issued balances | `ReservationLine` (running) + `MaterialTxn` ledger (authoritative) | Zoho Transfer Orders | `POST /wo/:id/recompute` rebuilds balances from the ledger |
| Sales order header + lines | **Zoho Books SO** | `WorkOrder` (header), `WorkOrderFG` (lines) | Re-synced on WO open only |
| Purchase orders | **Zoho Books PO** | `PurchaseRequestLine` (qty / received / billed mirror) | Only POs we created, only until billed |
| Assemblies, serials | Zoho Inventory bundle | `WoAssembly` | Serial counter in `OrgSetting serialSeq` |
| CRM quote, products, quoted items | **Zoho CRM** | `ConfigQuote` / `ConfigQuoteLine` (configurator cart only) | Quote Maker (`widget.html`) keeps no copy |
| Packing plan | `PackingList` / `PackingBox` | — | Lines come live from Books each open |

---

## 2. The end-to-end workflow

```
                     ┌──────────────── Zoho CRM ────────────────┐
  Sales opens        │ Deal / Quote ──► widget.html (Quote Maker)│
  a Deal/Quote       │              └► configurator.html (Ricon) │
                     └───┬───────────────────▲──────────────────┘
       reads Products, metadata, Deal/Quote  │ writes Products, Quoted_Items,
                         │                   │ new Quote (from Deal)
                         ▼                   │
  ┌────────────── skuapi (Catalyst function) ─────────────────────────────────┐
  │ /api/sku/generate → /api/sku/create-item ──► SKUItem + SKUItemValue        │
  │ /api/recipe/sizing/select|price|bom, /component-map/resolve, /config-quote │
  │        ▲                              │                                    │
  │        │ Product Design, Materials,   │ ConfigQuote (cart + quoteNo)       │
  │        │ Sizing, Component Map        ▼                                    │
  └────────┼──────────────────────────────┼────────────────────────────────────┘
           │                              │   (manual, outside this repo)
           │                              ▼
  SKU Items page ── push-zoho ──► Zoho Books item / composite ◄── CRM→Books quote
           ▲                              │                        conversion
           │ import-zoho / refresh-zoho   ▼
           └──────────────────── Books Sales Order (quote no in Reference# / CF)
                                          │
                                          ▼  POST /api/wo  (SO picker)
  ┌──────────────── Work Order ───────────────────────────────────────────────┐
  │ header ◄─ SO fields (re-sync on open)   FG rows ◄─ SO lines               │
  │ BOM lines ◄─ composite | quote answers→Component Map | Product Design     │
  │ Materials grid A–I ◄─ WorkOrderLine ⋈ ItemStockSnapshot ⋈ ReservationLine │
  │                       ⋈ PurchaseRequestLine                               │
  │ Reserve/Issue/Return ──► Transfer Order (write-through to snapshot)       │
  │ Purchase request ──► draft PO per vendor ◄── PO webhook / nightly mirror  │
  │ Assemble ──► bundle @Issue + TO Issue→Main, serials                       │
  │ Defects ──► draft return TO, blocks, adjustment / PR                      │
  │ Print packing list ──► packing.html (shares plan with Books widget)       │
  └───────────────────────────────────────────────────────────────────────────┘
```

Three things to hold onto:

1. **Books is upstream of the work order, CRM is upstream of Books.** The only
   bridge from CRM to the WO is the quote number landing on the Books SO, and
   nothing in this repo writes it there (§4.4, gap G-1).
2. **The WO reads our tables only.** Zoho is touched by write-through, webhooks,
   cron, and a few "self-heal" reads on grid open (§5.3).
3. **Catalyst caps text columns at 10 000 chars.** Every JSON column (`lineJson`,
   `snapshotJson`, `configJson`, `trackingJson`, `soLinesJson`, `header`) is
   guarded at ~9 500; overflow is a 413 or a trimmed BOM, never silent truncation.

---

## 3. SKU master (`SKUItem`, `SKUItemValue`, `PropertyValue`)

### 3.1 Where each `SKUItem` column comes from

| Column | Source(s), highest precedence first | Written by | Trigger | Read back from Books? |
|---|---|---|---|---|
| `sku` | generator assemble + series (`routes/sku.js`) · sheet import column · Books `sku` on refresh · **`PUT /sku-items/:id` sets `sku = name`** (`routes/skuItems.js:346`, CR-237) | create-item, import, refresh, edit | action / cron | Yes, `refreshFromBooks` overwrites it (`zoho/import.js:186-192`) |
| `name` | `includeInName` property names · typed · Books `name` on refresh | same | action / cron | Yes, overwritten on refresh |
| `description` | one `Caption: Value` line per property · Books description on **first** import only | create-item, import | action | No (copied at insert only) |
| `type` | user pick, default `OrgSetting skuDefaultItemType`; configurator forces `Manufacturing` (`configurator.html:1401`) | create · promoted to `Manufacturing` by refresh/composite sync, never demoted; locked after first push | action / load / cron | Composite membership only |
| `uom` | configurator / forms (`SKUItem.uom`) → `booksData.unit` (sheet) → `"pcs"` | create, import | action | **No.** Books unit is never read back; every push overwrites it |
| `booksData` | Books-sheet import (`booksImport.js BOOKS_FIELDS`) · `mergeBooksData` (HSN, manufacturer from the item form) · refresh stamps `product_type`, `last_modified_time` | import, edit, refresh | action / cron | `product_type` once; nothing else |
| `zohoItemId` | six writers: push create (`zoho/push.js:268,319`) · API import · refresh (only if empty) · `syncComposites` · sheet `Item ID` column (**unverified** against Books) · push `isGone` re-create | — | — | Matched by id, then SKU |
| `lastPushedAt` | stamped after a push, best-effort (`push.js:345-348`) | push | action | — |

### 3.2 `SKUItemValue` (property answers)

| Flow | Direction | Rule | File |
|---|---|---|---|
| Generator / widget create | app | `saveItemValues`; List value that is not a valid row id is **dropped silently** | `itemValues.js:12-29` |
| Push to Books | app → Books custom fields | `buildCustomFields`: properties with `zohoCfApiName`, **this industry only**; empty list is not sent, so clearing a value locally never clears it in Books | `push.js:159` |
| API import (`/sku-items/import-zoho`) | Books → app | create-only; custom field → find-or-create `PropertyValue` (auto 4-char code); SKU match **case-sensitive** | `zoho/import.js:35-138` |
| Refresh (`/sku-items/refresh-zoho`, `/internal/refresh-items`, **every open of the Product Designs form** via `GET /recipe/products/goods`, and **the Quote Maker widget on open / Refresh** — scoped to SKU Settings `cfgFgCategoryId`, `detailCap 15`, after `POST /properties/sync-books-all` refilled the category-backed values, CR-287) | Books → app | `replaceMappedValues` **deletes and re-inserts** this item's values for every mapped property; `zohoCfApiName` read **across all industries**; ≤ 40 detail reads per run (`detailCap`), rest reported as `detailsPending`; SKU match case-insensitive | `zoho/import.js:159-260` |
| Sheet import (`/sku-items/import`) | sheet → app | caption-matched cells; unknown List cell creates a `PropertyValue` | `importItems.js`, `booksImport.js` |

So the answers behind a SKU have **two writers that overwrite each other**: the
generator (last save wins) and the Books refresh (daily cron, last run wins).

### 3.3 Property values as Books items (`PropertyValue.zohoItemId`)

| Trigger | What happens | File |
|---|---|---|
| `POST /property-values` with parent `Property.createValuesAsItems` | `pushValueToZoho`: linked → update · sibling value with same `displayValue` anywhere in the org → reuse · Books `findItemByName` → reuse · else create (`SKU = NAME-UPPER-HYPHENATED`). Failure → 201 + `zohoWarning` | `routes/propertyValues.js:106-125`, `push.js:389-440` |
| `PUT /property-values/:id` | pushes **only when unlinked**; a rename of a linked value is not sent | `propertyValues.js:149` |
| Manufacturing item push | `buildAssociatedItems` re-pushes every selected flagged value, passing the parent's HSN + manufacturer (so value items inherit whichever parent pushed last) | `push.js:43,283` |
| `DELETE /property-values/:id` | local only; Books item and dependent `SKUItemValue` rows stay | `propertyValues.js:156` |

### 3.4 Push payload precedence (`push.js`, `zoho/booksApi.js createItem/updateItem`)

Trading (plain item), lowest → highest: hard defaults (`item_type inventory`,
`product_type goods`, `unit pcs`, `rate 0`, tax 18 % inter-state, tracking +
stock account from the push dialog or `OrgSetting skuPushTracking/skuPushAccountId`)
→ `name`, `sku`, `description` → every non-`_` key of `booksData` → `tax_id`
from `booksData._gstRate` (inter-state lookup, column named intra) →
`unit = SKUItem.uom` → custom fields.

Manufacturing (composite): `buildAssociatedItems` **writes value items to Books
first**, then creates/updates the composite with `mapped_items` = flagged-value
items + Component Map lines (component line wins on a clash); manual lines in
Books are kept (`mergeMappedLines`). Composite is created **without a tax**.
Fewer than 2 BOM lines → plain item when `plainIfNoBom` (manual push only).

The two **auto** push paths (import auto-push, generator edit of a linked item)
pass no options → serial tracking + Finished Goods account regardless of the
org's dialog defaults (gap G-14).

---

## 4. CRM quote widgets

Two files, one copied from the other (`configurator.html:491`): **W** =
`widget.html` (Quote Maker, every org), **C** = `configurator.html` (Ricon
Product Configurator). All CRM writes carry
`Trigger: ['workflow','blueprint','approval']`.

### 4.1 Reads from CRM (browser, JS SDK)

| What | W | C | Used for |
|---|---|---|---|
| `PageLoad` Entity + id | yes (no Entity = dashboard mode) | yes (`quotes:undefined` possible if no record, C:590) | module, `docKey` |
| Products by `Product_Code = sku` → `Unit_Price` | prefill rate | prefill **base** rate | price, §4.3 |
| Products / Quotes / subform field metadata | yes | yes | label-matched columns; failure → `[]` silently |
| Current Quote record | existing subform rows | rows + `Quote_No` else `Quote_Number` (C:1551) | keep rows / `quoteNo` |
| Deal (`Deal_Name`, `Account_Name`, `Contact_Name`) | Create Quote | Create Quote | new Quote header |

Server-side CRM reads (`zoho/crmApi.js`, `routes/crm.js`, no add-on gate): Deal
→ `CrmInfoCard`; Deal → Quotes list; Quote + Account + Contact → `EstimatePage`
(`estimateParser.js` reads `Quoted_Items | Product_Details`, `Quote_No |
Quote_Number`, `Select_discount | Discount`, `Size` or `Size:` in description,
GSTIN under three guessed names).

### 4.2 Writes to CRM

| Target | Fields | W | C |
|---|---|---|---|
| Product (find by `Product_Code`, else create) | `Product_Name`, `Product_Code`, `Unit_Price`, `Description`, label-matched parameter columns, `Item_Source` = org type label, picklists `Product Type = goods`, `Item Classification = Finished Good` (label-matched, every product incl. loose motors) | `Unit_Price = rate` | `Unit_Price = ladder unit price` |
| Existing Product | description + parameter columns only; **`Unit_Price` never refreshed** | same | same |
| `Quoted_Items` / `Product_Details` row | `Product_Name{id}`, `Quantity`, `List_Price`, `Discount` (amount), description column (label), parameter columns (label; CRM-derived columns skipped) | `List_Price = rate`; **appends only** | `List_Price = unit price`; replaces rows in `crmRowIds`; adds `Item Class`, `Base Price`, `OH`, `Margin`, `P&F`, `Other`, `Disc`, `UOM` when such labels exist |
| Custom subform ("Product Information", else any other) | sku / name / qty / **rate** / disc aliases + label-matched rest | rate | **base** rate (not the unit price, gap G-3) |
| New Quote from Deal / dashboard | `Subject`, `Quote_Stage Draft`, Deal/Account/Contact ids, rows as above | Subject = Deal name → first item → "Quote" | Subject = Deal name → "Quote" |
| Deal record | never written (ponytail W:1635, C:2175) | — | — |

### 4.3 Where the price comes from (C)

1. Typed by sales (`rateTouched`).
2. Design cost: `POST /recipe/sizing/price` → `computeQuote().unitCost` (cost-plus
   math, `recipe/calc.js`) when `OrgSetting cfgDesignRate` is on and the picked
   `SizingModel.recipeCode` resolves to a design. Fills **Base price** only.
3. CRM `Products.Unit_Price` prefill when still 0.
4. Then the ladder, **client-side copy** of `recipe/ladder.js` (server
   `applyLadder` has no route caller): Base → OH → Margin → P&F → Other → Disc,
   each = previous ÷ (1 − %), % set per class (`Mfg` / `BO`) in
   `OrgSetting priceLadder`. `line.rate` stays base; CRM `List_Price` and new
   `Unit_Price` get the laddered unit.

Because step 4 writes the laddered price into `Unit_Price` and step 3 reads it
back as *base*, re-adding the same product with no typed rate ladders it
**twice** (gap G-2).

### 4.4 Saved cart → Books SO → work order

| Step | Data | Where | Who |
|---|---|---|---|
| Save / push / Create Quote | `ConfigQuote { docKey, crmRowIds, quoteNo }` + `ConfigQuoteLine { seq, lineJson, bomJson }` replaced wholesale | `routes/recipe.js:1280-1305` | C only; **W never writes it** |
| `quoteNo` | `Quote_No` else `Quote_Number` from the CRM Quote; blank for `deals:` carts; written only when non-blank | C:1547-1567 | C |
| Quote number onto the Books SO | **nothing in this repo** — relies on the CRM → Books conversion copying it into Reference# / a custom field / a `zcrm_*` field | — | external |
| WO lookup | `soQuoteKeys`: `reference_number` + every `zcrm_*` value + **every custom-field value** (≤ 30) matched against `ConfigQuote.quoteNo` or `docKey` ids; SO line ↔ cart line by SKU, else name, in cart order | `workorder/quoteBom.js:38-64,95-110` | WO create, when `recipe-engine` add-on **and** `OrgSetting woBomSource = template` |
| Frozen | answers + picked design → `WorkOrderFG.configJson` | `quoteBom.js:66-72` | once |

`bomJson` is display-only (card BOM popover); the WO reads `lineJson` only.

### 4.5 OrgSetting keys the widgets read (`GET /api/sku-items/settings`)

| Key | W | C |
|---|---|---|
| `cfgNoAutoPush` → `widgetAutoPush` | Push-to-Books switch default | **ignored** (C never pushes, CR-238) |
| `cfgDesignRate` | — | gates `/sizing/price` (client + server) |
| `priceLadder` | — | ladder % |
| `uomList` | — | UOM dropdown (fallback list inlined at C:540) |
| `skuTypeLabelTrading/Manufacturing` | `Item_Source` + badge | same |

---

## 5. Work order

### 5.1 Header (`WorkOrder`)

| Column | Source | Trigger | Notes |
|---|---|---|---|
| `salesOrderId/Number`, `customerId/Name` | SO | **once** at create (`routes/workorder.js:627-647`) | A customer change in Books never reaches the WO |
| `soDate` | `so.date` | every `GET /wo/:id` (`workorder/soFields.js:27-41`); Books failure swallowed, stored values serve | |
| `shipmentDate` = `dueDate` | `so.shipment_date`, overridden by a CF labelled *expected shipment (date)* when non-blank | on open | two sources; due *days* computed in the browser with **two thresholds** (`format.js dueDays` < 4 vs `woCommon.jsx DueDays` < 0) |
| `buyerOrderNo/Date`, `freightCharge`, `delivery`, `booking`, `transporter` | SO custom fields **matched by label** | on open | rename the label in Books → field goes blank |
| `woPriority` (API `priority`) | user; SO CF *priority* only fills a blank | create / edit | the one user-owned SO-derived column |
| `woDate`, `machiningDoneDate`, `fittingDoneDate`, `tcRequired`, `notes`, `mainWarehouseId` | user | create / `PUT /wo/:id` / status date gates | `mainWarehouseId` refused while anything is reserved/issued |
| `status`, `heldFrom`, `qcStatus` | `POST /wo/:id/status` | action | table in `workorder/status.js` |
| `soLinesJson` | SO line ids seen + pending | create, open, `salesorder` webhook | |
| `lastViewedAt` | open | fire-and-forget | drives the red dot, org-wide not per-user |
| `estimatedCost`, `actualCost`, `projectName` | **nobody writes them** (retired CR-159) | — | `alerts.js:40` still reads them → cost alert is dead (G-7) |

Written back to Books: SO custom field `cf_work_order_no_and_date` (hard-coded
api name) at create, self-healed on open, cleared on cancel / draft delete; org
without the field remembered per warm instance and skipped (`booksApi.js:331-347`).

### 5.2 Finished goods and BOM lines

`WorkOrderFG` from the SO line at seed (`fgName`, `fgSku`, `soLineItemId`,
`soQty`, `soAckQty`); `fgSize` from the Books item CF labelled *size*, fetched
once — a failed fetch stores `""`, and the backfill only retries `null`, so that
FG never gets a size (G-11).

**BOM source order** (`seedFg`, `routes/workorder.js:689-748`; `quoteBom.resolve`
`workorder/quoteBom.js:140-165`):

| # | `WorkOrderLine.source` | Condition | Lines come from | Frozen in |
|---|---|---|---|---|
| 1 | `quote` | template mode (add-on `recipe-engine` **and** `woBomSource = template`) and the SO names a saved `ConfigQuote` | `resolveBomLines` over the cart answers → `ComponentMap` → `SKUItem.zohoItemId`; + the frozen geared-motor item × FG qty (`configJson.motorItemId`, CR-284) | `configJson { quoteNo, industryId, sel, values }` |
| 2 | `design` | template mode, no quote lines; Published `RecipeTemplate` whose `productItemId` → `SKUItem.zohoItemId` = SO line `item_id` | `workorder/designBom.js designLines`: component `skuItemId` wins → else the material an answer names → lone option → first option if `allowMaterial=false`; qty = qty × castWeight (castWeight 0 → qty); services dropped | `configJson { designId, designCode, designName }` |
| 3 | `composite` | everything else | Inventory composite `mapped_items` (live, forced, at create); service lines dropped | `CompositeItemCache` (24 h) |
| 4 | `self` | composite has no material lines, or Zoho says "not a composite" | the FG itself × 1 | — |
| — | `excel` / `manual` | BOM tab upload (parsed in the browser, matched by SKU then name against the **cached** composite) / line ops | user | `BomRevision` per change |

Write-back to the Books composite: BOM apply (unless opted out, template-sourced
or configured FG) and **every assembly** when `configJson` is blank
(`workorder/assembly.js:136-143`, even in "Direct from Books" orgs, silent
catch). Excel/manual/self lines are pushed too, so one WO's edit changes the
shared composite (G-9). `BomRevision.pushedToZoho` is inserted `false` and never
updated (`workorder/bom.js:247`).

### 5.3 Stock — grid columns A–I (`workorder/formulas.js`, `workorder/grid.js`)

| Col | Table | Row picked |
|---|---|---|
| A | `WorkOrderLine.requiredQty` | — |
| B | `ItemStockSnapshot.stockOnHand` | the WO's Main (`WorkOrder.mainWarehouseId`, else org `mainWarehouseId`), **falls back to the org-total row** when no Main row; minus open `DefectReturn` blocks |
| C, D | `ReservationLine` | `reservedQty`; `issuedQty − returnedQty` |
| E, F, G | `PurchaseRequestLine` | lines with a PO, **only from `PurchaseRequest.workOrderId = this WO`** — the consolidated cross-WO PR (`raiseItemPO`) has `workOrderId ""` and only its *lines* carry the WO, so item-wise POs never reach E/F/G while the procurement chip and By-item view do count them (G-4) |
| H | `max(0, min(A−C−D, B))` | header comment at `formulas.js:16` still says `− G` |
| I | `A + C − D − G` | BRD formula, display only; de-reserve capped at C |

`ItemStockSnapshot` writers (the `source` column says which):

| `source` | Writer | When | Row shape |
|---|---|---|---|
| `writethrough` | `txn.adjustSnapshots` | every confirmed Transfer Order | ± qty on from/to warehouse rows only |
| `webhook` | `item` event → `getItemStock` → `writeStock` | Books Item rule | org-total + per-warehouse rows (prunes stale warehouse rows only when the payload has a breakdown) |
| `cron` | `reconcileOrg` | nightly; RM items on open WOs only (Draft…Dispatched) | same |
| `manual` | `POST /wo/refresh` (`full`, `force`, paged, cursor `OrgSetting stockSyncCursor`), `POST /wo/items/:id/sync-stock`, defect write-off | action | same |
| `grid` | self-heal on grid read when an item has no row / no Main row | **load** (a live Zoho call from the "zero-call" grid) | same |
| (legacy) | `reserve/sync.js` via `/internal/sync-stock` | cron for `reserve` orgs | org-total only, **no `warehouseId`**, writes `poQty/receivedQty/billedQty`; keyed by `itemId` last-row-wins, can overwrite a per-warehouse row (G-16) |

Not write-through: **assembly** (bundle consumes RM at Issue, FG TO Issue→Main)
and **PO receipt** (`purchasereceive` webhook updates F only). B drifts until an
item webhook / cron / manual sync (G-5, G-6).

### 5.4 Material transactions (`workorder/txn.js`)

| Step | Zoho | Local | On failure |
|---|---|---|---|
| Draft | — | `MaterialTxn` Draft + `MaterialTxnLine` (picks in `trackingJson`), caps re-checked against the live grid and defect blocks | 400 with the cap |
| Confirm | **one Transfer Order** for every FG at once (CR-277), route fixed by type (Main↔Reserve↔Issue), `cf_so_no` = SO id, serial/batch picks or FIFO excluding blocks; **any error retries without custom fields** (`inventoryApi.js:418-421`) so the SO link can drop silently | `MaterialTxn` Confirmed + TO id/number → `ReservationLine` upsert per FG × item → `adjustSnapshots` | Zoho error: combined route cancels the draft, separate `/confirm` leaves it Draft. Local write failing *after* the TO exists → orphan TO; `recompute` fixes balances, nothing fixes a lost `MaterialTxn` update (G-12) |
| Completed / Cancelled sweep | one de-reserve (+ one return of over-issue on Completed) TO per WO | same | Zoho failure aborts the status change |

Concurrency is last-write-wins (`txn.js:262`).

### 5.5 Purchase (`workorder/purchase.js`)

| Flow | Zoho | Local | Refresh |
|---|---|---|---|
| Raise PR (per WO or By-item cross-WO) | — | `PurchaseRequest` Draft + lines net of draft coverage; consolidated PR has blank `workOrderId` | — |
| Confirm | one **draft PO per vendor**: `reference_number` = SO no, line `location_id` = WO Main (By-item: **org** Main), `cf_so_no`, over-requirement as an extra line, GST by vendor state (retry flipped on 3032/3033, then retry **without custom fields** on any error) | `zohoPoId/Number/poStatus` on lines; one vendor failing leaves the PR Draft, ordered lines skipped on retry | — |
| Mirror | `GET /purchaseorders/{id}` | `purchaseQty` rewritten on edit, line detached on removal/404/cancel, `receivedQty/billedQty` split **pro-rata by `purchaseQty`** across local lines, `lastPoSyncAt` bumped on every refresh (so the list red dot re-fires on any refresh, not only receipts) | nightly cron; `purchaseorder` / `bill` / `purchasereceive` webhooks (no id in payload → **all** live POs); `setPoStatus issued`; `updatePoLines`. **Stops once `billed`** (`SETTLED_PO`), so later receipts are never mirrored (G-13) |
| PO grid / detail | live Books reads | nothing written | load |

### 5.6 Assembly and serials (`workorder/assembly.js`, `serial.js`)

Gates: shop-floor status, issued material covers the qty (`assemblable`), FG is
a composite (**any** `getCompositeItem` error reads as "not a composite").
Then: push WO lines to the composite (if `configJson` blank) → bundle at the
Issue location (`is_completed`, reference `WO-nnnn-A<seq>`) → TO Issue→Main for
the FG (failure = warning, FG stays in Issue) → `WoAssembly` row,
`WorkOrderFG.assembledQty/status`. Serial `<prefix><YYYY><NNN>`: prefix from
item CF `cf_valve_type` → CF labelled *valve type* → SKU "Valve Type" value code →
SKU leading letters → typed; counter `OrgSetting serialSeq`, committed only
after Zoho accepts, non-atomic. `ReservationLine` is not decremented; "consumed"
is derived from `assembledQty`. Delete reverses TO then bundle; serials are not
reclaimed.

### 5.7 Defects (`workorder/defects.js`, `blocks.js`)

Raise → `DefectReturn` rows (`SI-` series) + a **Draft** return txn + photo in
File Store + email. First Store action confirms that TO (Issue→Main). Replace →
optional BOM swap, reserve + issue TOs, PR for the shortfall. Disposition:
`adjusted` → Zoho inventory adjustment at Main + `syncItem`; `repaired` /
`returned_to_vendor` → no Zoho document. Blocks (pending + returned_to_vendor)
reduce B, the pickers and FIFO; **`returned_to_vendor` never clears** and Zoho
has no record of the block (G-15). Cancelling the draft via `/txn/:id/cancel`
orphans its defects (`defects.js:37`).

### 5.8 Webhooks and cron

| Endpoint | Handles | Ignores |
|---|---|---|
| `/internal/zoho-event?type=` | `purchaseorder`/`bill`/`purchasereceive` → PO mirror · `item` → snapshot · `compositeitem` → cache only (WO lines untouched) · `salesorder` → `syncSoQty` + `syncSoLines` (**header fields not refreshed**) | everything else (200, `handled:false`): transfer orders, adjustments, bundles, invoices, **contacts** |
| `/internal/reconcile` (nightly) | orgs with `work-order`; borrows the org's most recently active user token (user disconnects → org silently stops); stock for RM items on open WOs (bulk `/items`, detail call when no breakdown, 6 at a time); PO mirror; composite cache for FGs on open WOs; then `alerts.evaluateOrg` (shortfall email, `AlertLog` dedupe — a failed email is logged as sent and never retried) | FG stock; items on no open WO; SO header |
| `/internal/refresh-items` (daily) | `refreshFromBooks` for `recipe-engine` orgs (target industry = name matching `/books items/i`, else first); `skuFromName` **false** here but **true** on the v2 form's `/recipe/products/goods` | — |
| `/internal/sync-stock` (legacy) | `reserve` orgs, items already in the snapshot | — |

---

## 6. Product Configurator / Product Designs

### 6.1 Links to Books

| Link | Holds | Set by | Used for |
|---|---|---|---|
| `MaterialType.zohoItemId/zohoItemName` | Books item id + copied name | Materials page typeahead (`/recipe/books-items`) | push-books composite lines (`calc.bomLines`); WO `design` lines; widget BOM box |
| `RecipeComponent.skuItemId` | `SKUItem` ROWID | v1: services only; v2: *Item (ZB)* column from `/recipe/products/goods` | WO: item beats materials; push: service line only when no option; v2 **clone drops it** (`routes/recipe.js:677-682`, G-18) |
| `RecipeTemplate.productItemId` | `SKUItem` ROWID of the Main composite (`/recipe/products/composites` → `syncComposites`) | design form (**not ownership-validated**) | WO design lookup (SO `item_id` → `SKUItem.zohoItemId` → design); sizing fallback |
| `RecipeTemplate.booksCompositeItemId` | Books composite id | `POST /recipes/:id/push-books` only | push target — **can be a different composite from `productItemId`'s** (G-17) |
| `SizingModel.skuItemId` | `SKUItem` ROWID | Sizing grid | configurator quotes that item directly, no SKU generation |
| `SizingModel.recipeCode` | design code | Sizing grid | design cost (`/sizing/price`), BOM box (`/sizing/bom`) |
| `SizingMaterial` (`industryId`, `name`, `efficiency`, `status`; CR-281, parallel session) | system of record for "material processed × efficiency %" — no Books link | Material Efficiency page (`/api/recipe/sizing-materials`) | configurator reads the list, sends `materialId` to `/sizing/select`, required volume = Volume × efficiency ÷ 100; the pick is frozen in `ConfigQuoteLine.lineJson.config.sizingInput.materialId` and reaches the CRM line as *Material* / *Efficiency* entries in `line.values` (description + any label-matched `Quoted_Items` column) |
| `ComponentMap.skuItemId` | `SKUItem` ROWID | Components page / Excel import (items by SKU then name, questions by caption) | widget component list, Books composite BOM on push, WO `quote` lines |
| `GearedMotor.skuItemId` (CR-284) | `SKUItem` ROWID of the Books motor item | Geared Motors grid; the seed links by item name = sheet model | fallback link; the widget's pick normally carries the item matched live (next row) → `config.motor.skuItemId` → `configJson.motorItemId` → one WO `quote` line × FG qty (`quoteBom.linesFor`) |
| Books item custom fields `cf_brand` / `cf_range` / `cf_capacity` (CR-284) | brand text, RPM range text, HP — on the motor items in Books | Ricon's Books item form; mapped to RAV questions Brand / Range / Motor HP (`Property.zohoCfApiName`), copied into `SKUItemValue` by Refresh from Zoho (≤ 40 details per run) | `GET /api/recipe/geared-motors/items` → the widget's Model list (items whose three fields equal a narrowed sheet row) |
| `RecipeComponent.price` (CR-284) | service sell price per design — no Books link | Product Designs → Services → Price | `/sizing/bom` `price`; a ticked service rides the valve line (CR-293): BOM row + its price added after the ladder (else the item's Books `rate`) |

### 6.2 Three BOMs from one design

| Consumer | Rule | File |
|---|---|---|
| push-books | first enabled option per component; qty = qty × castWeight, **castWeight 0 → line skipped**; material beats `skuItemId`; services included | `recipe/calc.js:155-177` |
| builder push preview | retired with the builder (CR-289); `POST /recipes/:id/push-books` has no caller | — |
| WO `design` lines | `skuItemId` beats material; castWeight 0 → component qty; services dropped | `workorder/designBom.js:34-78` |
| widget `/sizing/bom` | `allowMaterial=false` → no material at all | `routes/recipe.js:1200-1229` |

### 6.3 Cost and price

`MaterialType.rate × castWeight` (RATE_QTY) / fixed / % → `computeQuote`
(cost-plus: `unitPrice = unitCost × (1+margin) × (1−disc) × (1+gst)`) →
`RecipeQuotation.snapshotJson` frozen at create (≤ 9 500 chars). Per-recipe
`CostElement.rate` blank → master rate at read time. `MaterialType.status` and
both `effectiveFrom` columns are **never consulted**. The configurator ladder
(§4.3) is margin-on-selling-price, a different model from `calc.js`.

### 6.4 v1 vs v2 design form (data only) — history: v1 retired in CR-289, v2 is the only form

| | v1 `RecipeNewPage` | v2 `RecipeV2NewPage` |
|---|---|---|
| Name | typed | forced to the composite's Books name |
| Main product | optional | required |
| Item (ZB) | not sent (existing value kept) | `skuItemId` per goods row |
| Materials | `materialIds` (castWeight kept) | `materials[{materialId, castWeight, skuItemId}]` (item per material, CR-290); component qty forced to **1**, sub-line qty = qty × castWeight |
| `allowMaterial` on item-only rows | n/a | not sent → stored `true` → `computeQuote` / `selectByMaterial` throw 400 for that design (G-19) |
| Reopen a v1 design with qty > 1 and save | — | qty → 1, castWeight → qty × castWeight: RATE_QTY unchanged, **FIXED element cost ÷ old qty** (G-19) |

---

## 7. Packing list (`packing.html`, `routes/packing.js`)

| Datum | Source, precedence | Stored? |
|---|---|---|
| Lines (`item_id`, name, description, HSN, qty, unit) | live SO (`so:<id>`), invoice → its SO (`salesorder_id` → `salesorders[0]` → line-level), or WO FGs (`wo:<id>`) | no — only `itemId`, `qty`, `weightPc` are read back from `PackingBox.itemsJson`; `name/hsn/size/netWeight` are written and ignored |
| Size | item CF labelled *size*, else description | no |
| Weight / pc | item CF whose label starts with *Weight*, else `package_details.weight`; failure → 0 silently | `weightPc` |
| Header (ports, Inco terms, Buyer Order, Exporter ref, AD code, LC no…) | custom fields matched by label (`CF_KEYS`), applied **SO → invoice → org profile, later wins** (so an org-profile CF overrides the document); then the org's **last saved plan** seeds anything blank | `PackingList.header` |
| Consignor | `OrgSetting company*` → Books org profile | — |
| Packages | user | `PackingBox` (replaced wholesale), package numbers derived from `seq` at render |

Lines are keyed by `itemId`, so two SO lines with the same item collapse into one.

---

## 8. Estimate print (`EstimatePage.jsx`, `estimateParser.js`)

CRM quote via `/api/crm/quote/:id`. Specs/size parsed from line descriptions by
regex; totals computed in the browser (flat lines use CRM `Total`, grouped lines
use qty × rate); `discountPct` = `Select_discount` else CRM `Discount` (an
amount, read as a %); revision no/date live in **localStorage** per browser;
bank table falls back to `DEFAULT_TERMS.bank` when `/api/crm/estimate-terms`
fails; `COMPANY` (name, address, GSTIN) is **hard-coded to MSUN** in
`EstimateTerms.jsx:14-26` in a multi-tenant app (G-20).

---

## 9. Gaps

Ranked by blast radius. "Verified" = re-read in code during this trace.

### 9.1 Broken or wrong today

| # | Gap | Where | Effect |
|---|---|---|---|
| G-1 | **Nothing writes the CRM quote number onto the Books SO.** The WO's quote lookup depends on the CRM→Books conversion happening to copy `Quote_No` into Reference# / a CF, and on *every* SO custom-field value being scanned as a candidate key | `workorder/quoteBom.js:38-46` | Ricon WOs silently fall back to the composite BOM; a CF value that happens to equal a quote number links the wrong quote |
| G-2 | **Configurator ladders the price twice** on a product that already exists in CRM: `Unit_Price` is stored laddered (C:1868) and read back as base (C:1511) | `configurator.html` | Quoted price inflates on every re-quote of the same SKU |
| G-3 | Custom subform *Rate* gets the base price while `Quoted_Items.List_Price` gets the laddered unit price | C:1941 vs C:2024 | Two line totals on one quote |
| G-4 | **Item-wise (cross-WO) POs never reach grid columns E/F/G**; the procurement chip and By-item view count them | `workorder/grid.js:39-43`, `purchase.js:496,540` | Shortfall shows as uncovered after a consolidated PO; red rows and shortfall emails are wrong |
| G-5 | Assembly does no snapshot write-through (bundle at Issue, FG TO Issue→Main) | `assembly.js:152-197` | B for RM at Issue and FG at Main stale until cron / item webhook |
| G-6 | PO receipt (`purchasereceive`) updates F but not B | `sync.js:281-287` | Received stock not reservable until the next item webhook / cron |
| G-7 | Cost-threshold alert reads `estimatedCost/actualCost` that nothing writes | `alerts.js:40` | Alert is dead code; setting `costAlertPct` does nothing |
| G-8 | Quote Maker (`widget.html`) never writes `ConfigQuote` | — | Only configurator carts can drive a WO; MSUN quotes have no answers to freeze |
| G-9 | Every assembly and BOM apply pushes excel / manual / self lines into the **shared** Books composite, even in "Direct from Books" orgs | `assembly.js:136-143`, route 1240-1249 | One WO's local edit rewrites the master BOM for every future WO |
| G-10 | `BomRevision.pushedToZoho` is always `false` | `bom.js:247` | History cannot say whether a revision reached Books |
| G-11 | `fgSize` stored `""` on a failed item read is never refetched (backfill retries `null` only) | route 695 / 819 | Size missing on packing list for that FG |
| G-12 | Confirm: a local `MaterialTxn` update failing after the Transfer Order exists leaves an orphan TO; a retry posts a second TO | `txn.js:326-337` | Double movement in Zoho; `recompute` cannot see it |
| G-13 | PO mirror stops at `billed` | `purchase.js:21` | Receipts after full billing never reach F |
| G-14 | Auto-push paths (import auto-push, generator edit of a linked item) ignore `skuPushTracking` / `skuPushAccountId` | `skuItems.js:232-250`, `routes/sku.js:174-180` | Items land in Books with serial tracking + Finished Goods account regardless of org settings |
| G-15 | `returned_to_vendor` blocks never clear; Zoho has no counterpart | `blocks.js:19` | B under-reports forever for that item unless the row is edited by hand |
| G-16 | Legacy `/internal/sync-stock` writes org-total rows without `warehouseId`, keyed by item, last-row-wins | `reserve/sync.js:20-25` | An org with both `reserve` and `work-order` can get org totals written onto a per-warehouse row |
| G-17 | A design has two "its Books composite" ids: `booksCompositeItemId` (push target) and `productItemId → SKUItem.zohoItemId` (what the WO matches the SO against). A create-new push makes a composite unrelated to the Main product | `routes/recipe.js:792-809`, `designBom.js:86-92` | The composite sales orders reference and the one engineering pushes to diverge |
| G-18 | Clone drops `RecipeComponent.skuItemId` | `recipe.js:677-682` | A cloned v2 design loses its Item (ZB) and service rows |
| G-19 | v2 form: item-only rows stored `allowMaterial=true` → `computeQuote` 400; re-saving a v1 design with qty > 1 divides FIXED element costs by the old qty | `recipe.js:415`, `RecipeV2NewPage.jsx:96,153` | Design cost / wizard / `cfgDesignRate` break or change silently for designs touched in v2 |
| G-20 | Estimate `COMPANY` + bank GSTIN hard-coded to MSUN | `EstimateTerms.jsx:14-26`, `estimateTerms.js:25-33` | Every other org prints MSUN's details when settings are blank |

### 9.2 Same datum, two sources (no single owner)

| # | Datum | Sources | Who wins |
|---|---|---|---|
| G-21 | `SKUItem.name` / `sku` | generator · `PUT /sku-items/:id` (**sku = name**) · Books refresh (daily cron **and every open of the v2 design form**) · sheet import | last writer; the cron can undo a local edit overnight |
| G-22 | `SKUItemValue` for mapped properties | generator save · Books refresh (delete + re-insert) | last writer |
| G-23 | `SKUItem.zohoItemId` | six writers (§3.1), sheet value unverified | first non-empty sticks; a SKU-matched row linked to a *different* Books id keeps the old link and takes the new name/SKU |
| G-24 | Item unit | `SKUItem.uom` → `booksData.unit` → `pcs`; never read from Books; `updateItem` forces `pcs` unless overridden | every push overwrites Books |
| G-25 | Description on push | create: `booksData.purchase_description` beats `SKUItem.description`; update: the reverse | depends on create vs update |
| G-26 | Tax on push | `booksData._gstRate` (inter-state lookup on an intra-state column) vs hard-coded 18 %; composites get **none** | — |
| G-27 | Org id | `ZohoToken.orgId` vs env `ZOHO_ORG_ID` | token |
| G-28 | Due date | `shipment_date` vs CF *Expected Shipment*; due-days threshold 4 vs 0 in two components | CF if non-blank |
| G-29 | Column B | WO Main vs org Main vs org-total row | first that exists |
| G-30 | E/F/G vs procurement chip | request-level vs line-level `workOrderId` | disagree (G-4) |
| G-31 | Received / billed per line | pro-rata split of the PO total | approximate by design |
| G-32 | Price (C) | typed → design cost → `Unit_Price` → ladder (client copy; server `applyLadder` unused; third copy in `ConfiguratorSettingsPage.jsx`) | typed |
| G-33 | Discount | widget: line %; `paramVals.disc`: ladder step; estimate: `Select_discount` else CRM amount read as % | depends on column |
| G-34 | Quote number | `Quote_No` vs `Quote_Number` | first non-blank |
| G-35 | Design selection | `findDesign` Published only · `templateBy` newest incl. Superseded · `sizing/select` any status incl. Archived; two Published designs may share a `productItemId` | per path |
| G-36 | Design BOM | push vs WO vs widget rules (§6.2) | per consumer |
| G-37 | Design product fields | `productCode/productName` copied from the client, wizard joins by `sku === productCode`; `materialCode` copied onto options, never re-synced | stale copies |
| G-38 | UOM | `MaterialType.uom` (KG) vs `RecipeComponent.uom` vs Books unit; "kg" hard-coded in snapshot / mfg pages | — |
| G-39 | `refreshFromBooks` scope | cron `skuFromName=false`, v2 form `true` | SKU-less Books items appear only via the form |
| G-40 | Packing header | SO → invoice → org profile (later wins) → last saved plan | org profile beats the document |
| G-41 | Books-import header mapping | `booksImport.js` (server) and `booksMapping.js` (client) | two copies of one rule |
| G-42 | Grid column prefs | server `GridPref` for every grid except Materials (`localStorage materialsGridCols2`) | — |

### 9.3 Fragile: matched by label / display text

Books: SO CFs (`soFields.js:13-24`), item *size* (`bom.js:83`), *valve type*
(`serial.js:47`), *Weight…* and the whole `CF_KEYS` set (`packing.js:98-126`),
every SO CF value as a quote key (`quoteBom.js:41`), item categories by name
(`recipe.js:754`), the "Books items" industry by regex (`import.js:292,347`,
`recipe.js:281,300`). Hard-coded api names: `cf_work_order_no_and_date`,
`cf_so_no`, `cf_valve_type`, `cf_capacity`.
CRM: `Product Type`, `Item Classification`, "Product Information" subform,
description column, every parameter column (`normLabel`), MOC caption /
motor regex / "RAV" default (C:717-778).
App: sizing model + series → value ids by display text (`recipe.js:1123`),
material by answer text (`calc.js:123`, `designBom.js:57`), WO answers =
captions (`quoteBom.js:153`), SO line ↔ cart line by SKU/name, Component Map
import by SKU/name/caption, Export T&C template by name (`EstimatePage.jsx:827`).

### 9.4 Stale by design (document, don't fix)

Frozen `WorkOrderLine` + `configJson`; `CompositeItemCache` 24 h (Excel diff
uses the cache, not live); customer + SO number copied once; SO header refreshed
only on WO open (not by the `salesorder` webhook); FG stock and items on no open
WO never reconciled; `booksData.product_type` written once; description copied
once; Books `rate`, `hsn_or_sac`, `manufacturer`, `status` never imported
(inactive Books items still refresh); warm-instance caches with no invalidation
(stock accounts and tax ids cache `null`, categories, `_noWoCf`).

### 9.5 Written but never read / dead

`PropertyValue.createAsItem` · `booksData._*` keys except `_gstRate` ·
`WorkOrder.projectName/estimatedCost/actualCost` · `BomRevision.pushedToZoho`
(always false) · `RecipeComponent.allowQtyOverride/allowComponentOverride/
parentComponentId` · `RecipeTemplate.changeReason/effectiveFrom` ·
`MaterialType.effectiveFrom/status` · `RecipeComponentAttr` (+ `GET
/recipe/properties`, `/property-values`: no caller) · `RecipeQuotation.status =
Order` (no reader) · `ConfigQuoteLine.bomJson` outside the card popover ·
`PackingBox.itemsJson.{name,hsn,size,netWeight}` · `company.gstin/logoUrl` in
the packing doc · `recipe/ladder.js applyLadder` (server) ·
`inventoryApi.getTransferOrder` · `GET /cors-debug` + `seenOrigins`
(`index.js:49-83`, marked temporary).

### 9.6 Silent failures worth a log line or a UI hint

Zoho reads that swallow to `null`/`[]`/`{}`: `getOrganizations` (no `code`
check), `getGstTaxId`, `getOrgGstStateCode`, `getContactGstStateCode`,
`listWarehouses` fallback, `createBundle` tracking probe, SO read on WO open and
in the `salesorder` webhook, packing org profile + item weight, CRM Account /
Contact on the estimate. Zoho writes that retry without custom fields on **any**
error: `createTransferOrder`, `createPurchaseOrder`. Per-row errors folded into
a result object the UI may not show: both imports, refresh, import auto-push,
`refreshAllOrgs` (per-org error becomes a string, not logged), PO mirror non-404
errors. Frontend loaders that turn an error into an empty list: `PurchaseTab`,
`HistoryTab`, `WorkOrderPurchasePage`, every `Recipe*` loader, `/grid-prefs`.

### 9.7 Documentation gaps

- `CLAUDE.md` and `docs/agents/domain.md` point at `CONTEXT.md` and `docs/adr/`;
  neither exists.
- `workorder/formulas.js:16` header still shows H with `− G` (code dropped it in
  CR-152).
- `workorder/sync.js:118` says the stock cursor never leaks into settings, but
  `GET /api/wo/settings` returns every `OrgSetting` row, including
  `stockSyncCursor` and `serialSeq`.
- `OrgSetting cfgNoAutoPush` is documented as "CRM widgets" but only
  `widget.html` honours it.
- `catalyst-config.json` carries live OAuth secrets (already noted in
  ARCHITECTURE.md).

---

## 10. Best practices (rules for every new flow)

Derived from the gaps above. Treat these as the review checklist for any CR
that reads or writes Zoho or copies a value between tables.

1. **One writer per column.** Before adding a writer, grep the column name and
   list the existing ones in the CR. If two writers must exist (local edit vs
   Books refresh), the refresh must respect a "locally edited" marker or only
   fill blanks, as `zohoItemId` and `woPriority` already do. Never let a cron
   overwrite a user edit (G-21, G-22).
2. **Copy once = say so.** A denormalised column (`customerName`, `fgSize`,
   `productCode`, `materialCode`, `zohoItemName`) gets a comment naming the
   master and the refresh path, or "never refreshed". Every such column is
   listed in §4–§6 for a reason.
3. **Match Zoho fields by `api_name`, never by label.** Labels are user-editable
   in Books and CRM. Where only a label exists (SO custom fields, CRM subform
   columns), store the resolved `api_name` in `OrgSetting` on first match and
   read that from then on (§9.3).
4. **Every Zoho write is write-through.** The response goes into our row in the
   same request; any stock-moving document (TO, bundle, adjustment, PO
   receipt) adjusts `ItemStockSnapshot` before the request returns. No new
   Zoho write may rely on the nightly reconcile to show up (G-5, G-6).
5. **Zoho first, then local, then idempotent.** Order the writes so that a
   crash leaves a recoverable state: write the Zoho document, store its id on
   our row *before* any other local write, and make the retry look up that id
   (G-12). Never retry a Zoho POST that may already have succeeded.
6. **No silent catches on data paths.** A swallowed Zoho error must at least
   `console.warn` with the org, entity and id, and the response must carry a
   `warning` the UI shows. Empty-list fallbacks on read errors are banned in
   loaders (§9.6).
7. **Frozen vs live is a column, not a convention.** Anything the WO must not
   change later gets stored on the WO (`configJson`, `WorkOrderLine`), and
   anything read live gets a TTL and a `syncedAt` the UI can show.
8. **Shared masters are never written from a child.** A work order, assembly or
   quote line must not rewrite the Books composite or a Product Design
   (G-9). Pushing a BOM upstream is an explicit, named user action.
9. **One formula, one place.** Price ladder, due-days, column B/H, BOM
   derivation and import header mapping each exist in two or three copies
   (G-28, G-32, G-36, G-41). New math goes in one server module with a
   `--selftest`, and the UI calls the route or imports the same file.
10. **Org-scoped, not tenant-hard-coded.** Company names, GSTINs, bank rows,
    default product names and category labels come from `OrgSetting` or the
    org's own data, never a constant (G-20, "RAV", "MSUN").
11. **Document the trigger.** Every new data movement adds a row to §11's
    trigger matrix: load / action / write-through / webhook / cron. If the
    honest answer is "cron only", the UI shows the last sync time.
12. **Caps are checked, not hoped.** Any JSON column write goes through the
    existing 9 500-char guard; any list read from Zoho states whether it pages.

## 11. Trigger matrix (what moves when)

| Data | load | action | write-through | webhook | cron |
|---|---|---|---|---|---|
| SKU master name/sku/values ← Books | v2 design form (`/recipe/products/goods`), Main-product list (`/products/composites`) | Refresh from Zoho, Import from Zoho | — | — | daily `refresh-items` |
| SKU → Books item / composite | — | Push to Zoho, Push all unsynced, import auto-push, generator edit of a linked item, create value as item | — | — | — |
| CRM Products / Quoted_Items | — | Add to quote / Save / Create Quote (widgets) | — | — | — |
| `ConfigQuote` cart | widget open | Save, push, Create Quote (C) | — | — | — |
| WO header ← SO | `GET /wo/:id` | create | — | `salesorder` (qty + new lines only) | — |
| BOM lines | — | create, BOM upload/apply, line ops, SO qty apply, Refresh BOM | — | — | — |
| Composite cache | WO open (24 h TTL) | `?refresh=1`, create (forced) | assembly / apply push | `compositeitem` | nightly (FGs on open WOs) |
| Stock snapshot | grid self-heal | ⟳ Refresh, item sync, write-off | reserve / issue / return TOs | `item` | nightly (RM on open WOs); legacy `sync-stock` |
| Balances C/D | — | confirm txn, recompute | TO confirm | — | — |
| PO qty / received / billed | — | confirm PR, issue PO, edit PO lines | PO create | `purchaseorder`, `bill`, `purchasereceive` | nightly |
| Assemblies, serials | — | Assemble, Delete assembly | bundle + TO | — | — |
| Defects, blocks | — | raise, replace, disposition | return TO, adjustment | — | — |
| Packing plan | widget / `/packing?woId` | Save | — | — | — |
| Alerts | — | — | — | — | nightly after reconcile |
