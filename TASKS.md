# Task list — SKU Studio / OCTFIS platform

**Single source of truth for open work.** Everything that is planned, in
progress, or deliberately deferred lives here — no parallel task files.
Work Order reference material (A–I formulas, warehouse map, per-org setup, role
SOPs) lives in [WORKORDER.md](WORKORDER.md); its *tasks* are below.
`RESERVE-TASKS.md` is superseded by it and kept only for CR-005 history.

Related docs: [CHANGES.md](CHANGES.md) (change requests + shipped log),
[SCHEMA.md](SCHEMA.md) (DB), [ARCHITECTURE.md](ARCHITECTURE.md) (system),
[ZOHO_AUTH.md](ZOHO_AUTH.md) (OAuth setup).

Last updated: 2026-08-26.

---

## In progress

### CR-049 — WO details page redesign, Claude Design mockup (branch `feat/zoho-field-mapping`)
- [x] `MaterialsGrid.jsx` rewritten — KPI band + coverage bar, shortage/procurement banners, instant per-line Reserve/Issue/Release/Return (+ inline Return qty row), "Reserve everything available"; confirm bar / qty inputs / column picker removed
- [x] `WorkOrderPage.jsx` — mockup header (one action row), tabs → Materials·Items·Activity, invoice-gate banner page-level, Activity timeline merges movements + audit trail
- [ ] Verify on deploy: KPI totals match the grid, per-row actions post txns and refresh, Release/dereserve works, Return caps at issued, short banner → Purchase request page, Approve/Reject still gate invoicing, Activity shows both movement and audit events

### CR-048 — By-item grid: WO/Status/PO columns, ordered lines visible (branch `feat/zoho-field-mapping`)
- [x] `purchase.js` `shortfallByItem(lines, orderedLines)` — ordered/requested lines join the per-item buckets with per-line `status`/`poNumber`; `totalQty` pending-only, `orderedQty` separate; selftest asserts
- [x] `workorder.js` shortfall-by-item route fetches open-WO PR lines on a PO + maps draft lines → ordered entries (Requested / PO Raised / Partially received / Received)
- [x] `WorkOrderPurchasePage.jsx` — 6-column grid, ProcChip sub-rows, pending-only selection/raise
- [ ] Verify on deploy: raised item stays in By item with "PO Raised" + PO number; checkbox disabled when nothing pending; draft-PR line shows "Requested" with the PR number; raising a mixed item only orders the pending WO lines

### CR-047 — Purchase Requests grid fix + tab-line button (branch `feat/zoho-field-mapping`)
- [x] `store.js` `inList` drops blank ids (fixes the ZCQL `ROWID IN ('')` 500 behind the empty Requests/Orders grids) + selftest asserts
- [x] `WorkOrderPurchasePage.jsx` — "Raise request for…" dropdown removed; list-load failures toast instead of silently emptying the grid
- [x] `MaterialsGrid.jsx` — shortage bar folded into the action tab line (short pill + Request purchase)
- [ ] Verify on deploy: Requests shows all 8 PRs (incl. today's Draft PR-0003 and the "— consolidated" rows) with status chips; Orders loads; short WO shows pill + button on the tab line

### CR-042 — TO serial/batch + number fallback, SO-picker gating, dynamic approval, instant stock sync (branch `feat/zoho-field-mapping`)
- [x] `zoho/inventoryApi.js` — `pickSerialsBatches` (pure, self-checked) attaches first-available serials / FIFO batches to each transfer line; friendly shortage error replaces code 2205
- [x] `createTransferOrder` retries with `transfer_order_number` (numberHint = txn number) only on code 6; `txn.js` `friendlyTransferError` rewords raw Zoho errors
- [x] `GET /sales-orders` — confirmed-only via `creatableSalesOrders` on `order_status === "open"` (Books' API never returns status "confirmed"; Zoho's SO filter_by rejects/ignores Confirmed, so no server filter) and drops SOs already on a WO (self-checked)
- [x] Dynamic approval — 2nd level only when `approverL2Email` set; new `PendingApproval` status after L1; `FLOW.Draft` no longer offers Approved (dropdown can't skip); `requiredLevelsMet` self-checked; invoice gate + WO page reflect configured levels
- [x] Instant sync — `reconcileOrg({ full })`, `POST /api/wo/refresh?full=1`, `POST /api/wo/items/:itemId/sync-stock` (`syncItem`), "Sync all" button on the materials grid
- [ ] Verify on deploy: confirm a reserve/issue on a serial-tracked item posts a TO with serials (check Catalyst logs for the exact serial/batch payload shape); org with TO auto-numbering off gets a numbered TO, not code 6; SO picker shows only confirmed, WO-less SOs; with only an L1 approver the WO approves on L1, with L2 set it sits at Pending Approval until L2; adjust stock in Zoho → "Sync all" reflects it

### CR-035 — App-wide improvement pass (review findings, 4 phases)
- [x] Phase 1 quick wins: `--bg-page` token, QC gate modal (Esc = do nothing), ⌘↵ create shortcut, debounced SKU preview, labeled CSV headers, helpdesk mailto, loading-vs-empty states, PR-line save toast
- [x] Phase 2 backend perf: `buildGridsBulk` (batch the reports N+1 → ~6 queries), per-request Zoho token memo (`catalyst.__zohoToken`), scoped `procStatusByWo` for GET /:id, parallel/bulk Zoho loops (PO refresh, stock reconcile via `listItemsWithStock`, txn lines `IN`, grid self-heal)
- [ ] Verify on deploy: reports + shortfall pages return same data faster; WO detail unchanged; force-expired token refreshes once
- [x] Phase 3 frontend perf: WO page single-row refetch, lazy per-tab lists in WorkOrderPurchasePage, `React.memo` MaterialsGrid rows, route-level code splitting (main bundle 546→325 kB)
- [x] Phase 4 UX: SKUItems house-grid compliance (no row-click), bulk push to Books, stale-sync badge (`lastPushedAt` column via Catalyst MCP + SCHEMA.md), URL state for selection/filters, controlled PR qty input + qty-clear guard, modal Enter-to-submit, confirm() → Modal deletes, shared fmtMoney/fmtDate, a11y basics, required-field markers, String() id compares, EstimatePage chrome tokens
- [ ] Verify on deploy: push a SKU → badge "✓ Synced"; edit it → "Edited · Re-push"; bulk push; ?item= deep link survives refresh; Enter submits the Industry modal; QC modal Esc does nothing

### CR-034 — WO status auto-advance on material movement (branch `feat/zoho-field-mapping`)
- [x] `workorder/txn.js` — `advanceWoStatus` from `confirmTxn`: first reserve → MaterialAllocationPending (from Draft/Approved), first issue → InProgress; forward-only so the CR-031 completion sweep can't demote
- [ ] Verify on deploy: confirm a reserve on a Draft WO → chip shows MaterialAllocationPending; confirm an issue → InProgress; complete a WO → auto-return sweep leaves status at Completed

### CR-032 — Print Estimate from CRM Quote (branch `feat/zoho-field-mapping`)
- [x] `zoho/crmApi.js` — `getQuote`, `getDealQuotes` (explicit `fields` for the related-records API)
- [x] `routes/crm.js` — `GET /api/crm/deal/:id/quotes` (200 + array), `GET /api/crm/quote/:id` (404 on missing)
- [x] `frontend/src/pages/estimateParser.js` — tolerant description parser (specs / DESIGN groups / size rows) + flat fallback + totals; self-check `estimateParser.test.js` (prototype totals 13,12,800 / 3,93,840 / 9,18,960 / qty 25)
- [x] `EstimatePage.jsx` — quote picker (auto-select lone quote), sheet port of the prototype, A–F / A–D template toggle, `window.print()` with A4 print CSS
- [x] Route `/#/estimate` in `App.jsx`; "Print Estimate →" link in `CrmInfoCard.jsx`
- [x] `?quoteId=` deep link (Quote-record button) → sheet directly, no picker; `readParam` helper
- [x] Checkbox multi-select on the deal's quote list → one sheet per quote, page-break between, `← Quotes` back button; print CSS wrapper `.est-print-area`
- [x] Seamless login: CRM deep link + logged out → auto Zoho OAuth with `sessionStorage` returnTo (hash survives roundtrip) + once-per-tab loop guard
- [x] Totals inside the item grid (TOTAL-A / DISC / TOTAL rows) + sequential PAGE nn in the grid's final row
- [x] T&C last page: `estimateTerms.js` (defaults + localStorage + normalize, self-check `estimateTerms.test.js`) + `EstimateTerms.jsx` (`TermsSheet` printed last, `TermsEditor` behind toolbar "✎ Edit T&C" toggle)
- [ ] CRM console: Deal button `/app/#/estimate?dealId=${Deal.Id}`, Quote button `/app/#/estimate?quoteId=${Quotes.Quote Id}`
- [ ] Verify on deploy: deal link → checkbox list → tick 2 → two sheets, page break, no trailing blank page; quote link → direct sheet; template toggle flips all sheets; discount row present/absent; flat fallback on plain-text line; logged-out deep link auto-logs-in and returns to the estimate; cancelled OAuth → login page (no loop); pre-CRM-scope token → Connect CRM prompt
- [ ] Pin the quote-line description convention with real quotes, then tighten the parser
- [x] CR-039: Version pick list functional — Standard / With Total / Export / All Item - Trading; CalcSheet only on With Total; Trading skips grouping (`buildEstimate({ merge: false })`)
- [x] CR-039: Export-version T&C — export preset shipped (`EXPORT_TERMS`)
- [x] CR-040: Duties & Taxes added to Export (B); one-time cache reset (`TERMS_VERSION`) so all types show A/B; amount columns centered (`.est-num`)

### CR-031 — WO item editability + completion auto-return + reconciliation (branch `feat/zoho-field-mapping`)
- [x] `zoho/booksApi.js` — `searchItems` typeahead helper
- [x] `routes/workorder.js` — `assertEditable` (locked at Completed/Closed/Cancelled); `GET /api/wo/items?q=`; `POST /api/wo/:id/lines` (add/setQty/remove/replace + reason, internal only, committed lines kept at qty 0); status hook runs auto-return before `Completed`; `GET /reports/reconciliation`
- [x] `workorder/txn.js` — `sweepLines` + `autoReturnOnComplete` (+ selftest)
- [x] `workorder/reports.js` — `reconcileRows` + `reconciliation` (+ selftest)
- [x] `WoItemsTab.jsx` (new Items tab: grid, Books-item picker, change notes, locked banner) wired into `WorkOrderPage.jsx`; completion toast lists Transfer Orders
- [x] `WorkOrderReportsPage.jsx` — Reconciliation view (WO filter, CSV)
- [ ] Verify on deploy: edit at InProgress (qty/add/replace/remove, picker only shows Books items, note in "Changes", no composite/SO change); replace a reserved item → line at 0 on the grid; Completed (QC Passed) → dereserve/return TOs in Zoho Inventory + toast; edit on Completed → 409; QC Rejected → no TOs; reconciliation per-WO + org-wide incl. removed lines

### CR-030 — Skip unselected Books-item props + edit SKU in generator (branch `feat/zoho-field-mapping`)
- [x] `zoho/push.js` — `buildAssociatedItems` skips unselected flagged props; `mergeMappedLines` + `syncMappedItems` (property-derived BOM swap on re-push, manual lines untouched, write only on change)
- [x] `GET /api/sku-items/:id/values` (item + stored selections); `POST /api/sku/update-item` (validate, replace values, auto-push linked items → `zohoWarning` on Books failure); `generate` takes `excludeItemId`
- [x] `SKUGeneratorPage.jsx` `?item=` edit mode (prefill, industry/type locked, Update SKU); `SKUItemsPage.jsx` "Edit parameters"
- [x] Check: `push.test.js` skip + merge cases
- [ ] Verify on deploy: partial-selection Manufacturing push succeeds; edit → SKU/name/description regenerate (no self-duplicate) → Books item/composite auto-syncs; BOM swap keeps manual lines; unlinked edit saves without push

### CR-029 — Manufacturing SKUs push as Books composite items (branch `feat/zoho-field-mapping`)
- [x] `zoho/push.js` — `pushToZoho` branches on `type`; `pushManufacturing` (fields-only re-push, stale-link + legacy plain-item heal); `buildAssociatedItems` (flagged props → selections → `pushValueToZoho`, throws with captions on any gap)
- [x] `zoho/inventoryApi.js` — `createCompositeItem` full payload (descriptions, CFs via shared `buildItemCfs`, rate 0, taxable, serial, FIFO); `updateCompositeItemFields` (never touches `mapped_items`)
- [x] `zoho/booksApi.js` — `is_taxable:true` on plain create too; `buildItemCfs`; `deleteItem`
- [x] Type lock after push — API 400 in `routes/skuItems.js` PUT, disabled Type select in `SKUItemsPage.jsx`
- [x] Check: `zoho/push.test.js` (payload + validation paths)
- [ ] Verify on deploy: Manufacturing push creates a Books assembly item (PCS, rate 0, Taxable, both descriptions, §3+§4 CFs, serial/Finished Goods/FIFO, flagged values as associated items qty 1); missing flagged value fails with caption; Trading regression; type lock; re-push preserves BOM edits
- [ ] Deferred: Copy-from-Total price, composite-aware import, HSN/GST fields

### CR-028 — BOM page = Books composite items + create in Books (branch `feat/zoho-field-mapping`)
- [x] `zoho/inventoryApi.js` — `listCompositeItems` (paged), `createCompositeItem` (minimal body)
- [x] `zoho/booksApi.js` — `findItemBySku`, `createComponentItem` (plain inventory item, "Inventory Asset" account via generalized `getStockAccountId`)
- [x] Routes `GET/POST /api/wo/composites*` — grid, cache-first BOM read, preview (Books lookup for unmatched → `missing`), apply with optional `createMissing`, new-composite create
- [x] `CompositeBomPage.jsx` replaces `WorkOrderBomPage.jsx` (deleted) on `/wo/bom` — composite grid → drill-in diff/import; "New composite item" flow
- [x] `BomTab.jsx` — "⬇ Download template" CSV button; parse helpers exported
- [x] Zoho Books composite-items export format accepted (`parseBooksComposites`) — grid "Import Books export" bulk flow (`POST /api/wo/composites/import`: update matched / create unknown), detail upload picks the matching group, new-composite form prefills from a single-group export
- [x] Resolves CR-023's deferred "BOM save as new composite" (`POST /compositeitems` now exists)
- [ ] Verify on deploy (live org): composites grid lists Books composites; preview buckets new/missing correctly; apply with `createMissing` creates a plain item (no FG custom fields) + updates `mapped_items`; `POST /composites` creates a composite visible in Books; per-WO BomTab regression (revision + guard intact); org switcher changes the list

### CR-027 — Books item field-mapping defaults on push (branch `feat/zoho-field-mapping`)
- [x] `zoho/booksApi.js` `createItem` — `unit:"pcs"`, `product_type:"goods"`, `track_serial_number:true`, `inventory_valuation_method:"fifo"`; `updateItem` re-sends `unit`
- [x] Per-org Finished Goods resolver `getFinishedGoodsAccountId` (chartofaccounts, `stock`/"Finished Goods", cached) → `inventory_account_id` (no env constant — multi-tenant)
- [x] §3 constants pushed via `ITEM_DEFAULT_CFS` (Books defaults don't apply on API create)
- [x] §4 mapping (MSUN org, via MCP) — `zohoCfApiName` on Connection Type, Surface Treatment (G), Drilling, Design Type, Size
- [x] Dropdown value normalizer (`normalizeCustomFields`) — loose match (case+whitespace) to Books option labels; per-org cached fields fetch
- [x] `cf_surface_treatment_g` "Overlay Wleding "→"Overlay Welding" in Books + app value trimmed; design/size left to normalizer (options in use, locked)
- [x] Deployed (2× — payload+resolver, then normalizer)
- [ ] **Books:** convert `cf_valve_type` lookup→dropdown, then map Valve Type (`...82007`)
- [ ] Verify on push: Unit=Pcs, Serial + Finished Goods + FIFO, §3 constants, §4 values (incl. DN10/O-Port via normalizer), description

### CR-025 — Club properties into one un-separated SKU segment (branch `feat/zoho-field-mapping`)
- [x] Add `Property.clubKey` (varchar 255, nullable) — done via OCTFIS Catalyst MCP
- [x] `routes/sku.js` — segment-grouped assembly (club codes join `""`, segments join by industry separator)
- [x] `routes/properties.js` — POST/PUT persist `clubKey` (empty clears)
- [x] `PropForm` Club field — `ClubPicker` combobox (chip + filter existing + create new)
- [x] `SKUGeneratorPage` live chips grouped per club
- [x] Club chip (`⛓ <club>`) on property list rows so clubbed props don't look duplicated
- [ ] Verify on deploy: Body+Gland → one segment `KA`; 3-part Seat club; un-club by clearing; no-club industry unchanged

### CR-026 — Property value as a standalone Zoho Books item (branch `feat/zoho-field-mapping`)
- [x] Add `PropertyValue.createAsItem` (boolean, nullable) + `zohoItemId` (varchar 64, nullable) — done via OCTFIS Catalyst MCP
- [x] `store.js` — `createAsItem` in `BOOL_COLS`
- [x] `zoho/booksApi.js` — `findItemByName`; `zoho/push.js` — `pushValueToZoho` (dedupe a→d, write-back id)
- [x] `routes/propertyValues.js` — POST/PUT best-effort create; `GET /property-values/linked`
- [x] `BooksLinkedValuesPage` + `/sku/books-items` tab
- [x] **Gate moved to property level** — `Property.createValuesAsItems` (boolean, via OCTFIS Catalyst MCP); `store.js` BOOL_COLS; PropForm "Values are Zoho Books items" checkbox; per-value `ValForm` checkbox removed
- [x] `routes/propertyValues.js` gate on parent `propertyMakesItems`; `routes/properties.js` persist flag + `backfillPropertyItems` on turn-on; `→ BOOKS` chip on property rows
- [ ] Verify on deploy: flag a property → its values become name-only Books items; turning on backfills existing values; same-name dedupe; un-flagged properties create nothing; Zoho-not-connected still saves

### CR-024 — CRM Deal context on the SKU generator page (branch `feat/zoho-field-mapping`)
- [x] Add `ZohoCRM.modules.READ` to `SCOPES` (`zoho/auth.js`)
- [x] `zoho/crmApi.js`: `getDeal` (CRM v6 `GET /Deals/{id}`) + pure `crmReauthNeeded` + selftest
- [x] Route `GET /api/crm/deal/:id` (`routes/crm.js`) mounted under `/api`; 409 reauth / 404 not_found
- [x] `components/CrmInfoCard.jsx` — read-only "CRM Info" card, non-blocking reauth link
- [x] Render on `SKUGeneratorPage` when `?dealId=` present
- [x] Preserve `?dealId=` from the items search page "+ New" button into the generator (create screen)
- [ ] CRM console: add a Deal custom link button → `/#/sku/generator?dealId=${Deal.Id}`
- [ ] Verify on deploy: existing Books user opens the link → "Connect CRM" → grant scope → reopen → card shows Deal Name / Account Name / etc; generator usable throughout
- Deferred: write-back to the Deal (CR-012 `Plan_Pricing` subform) — read-only for now; no proactive login-time CRM prompt (lazy consent)

### CR-023 — Item-wise Purchase Request across work orders (branch `feat/zoho-field-mapping`)
- [x] Rename nav `Purchase` → `Purchase request` (`App.jsx`)
- [x] Backend pure helpers + selftest: `shortfallByItem`, `procurementStatus` (`workorder/purchase.js`)
- [x] `createPoForLines` factored out of `confirmPR`; `raiseItemPO` (consolidated PR + one grouped draft PO)
- [x] `refreshPurchaseOrders` splits grouped-line received/billed across per-WO lines by qty share
- [x] Routes: `GET /purchase/shortfall-by-item`, `POST /purchase/raise`; `procStatus` on `GET /` + `GET /:id`
- [x] `ProcChip`/`PROC_TONE` (`woCommon.jsx`); WO list column + filter; WO detail header chip
- [x] By-item view on the Purchase Request page: checkbox + editable qty + WO breakdown + pinned vendor/Raise-PO bar
- [x] **Add `PurchaseRequestLine.workOrderId` column** (varchar 50, nullable) — created via Catalyst MCP in SKU-GEN-OCTFIS/Development
- [ ] Verify on deploy (Books connected): two open WOs short the same RM → one by-item row (summed) → check + vendor + Raise PO → one grouped draft PO in Books → both WOs show `PO Raised`; mark received → refresh → `Partially received` / `Received`
- [ ] Regression: per-WO `PurchaseTab` raise/confirm still works; Orders view + PO edit/delete unchanged
- Deferred: BOM "save as new composite" (item 5) — needs a `POST /compositeitems` path (new)

### CR-021 — Manual Zoho Books item sync only (branch `feat/zoho-field-mapping`)
- [x] Removed automatic `pushToZoho` on SKU/item create + item update (`routes/sku.js`, `routes/skuItems.js`); dropped unused import
- [x] Clarified the existing Push button: `✓ Synced · Re-push`, in-flight "Pushing…" + double-click guard (`SKUItemsPage.jsx`)
- [ ] Verify on deploy: save creates/edits nothing in Books until Push clicked; Push then Re-push updates (no duplicate)

### CR-020 — Orders tab: all Books POs + delete with lock (branch `feat/zoho-field-mapping`)
- [x] `booksApi.listPurchaseOrders` (paginated) + `GET /api/wo/purchase-orders` (`purchase.listAllPOs`)
- [x] `poDetail`/`deletePo` work for Books-only POs (no local PR lines); shortfall reset only when app-created
- [x] Orders grid from the endpoint with PR#/"Books" origin + 🔒 on received/billed POs; Delete disabled with 🔒 in detail view
- [ ] Verify on deploy: Books-only POs listed and deletable when unlocked; locked ones blocked; app PO delete still resets shortfall

### CR-019 — PR line merge, grid pages, item-pipeline report (branch `feat/zoho-field-mapping`)
- [x] `collapseLines` in `createPR`: same-item lines merge (root cause of the duplicate PO line + double-counted received/billed)
- [x] `/wo/purchase` → Requests/Orders grids (POs derived from PR lines, no new endpoint) with drill-in to `PurchaseTab`/`PoSplit`
- [x] `/wo/bom` → BOM grid (FGs, Rev, BOM date) with drill-in to `BomTab`
- [x] `GET /api/wo/reports/item-pipeline` + third Reports view with WO/vendor filters
- [ ] Verify on deploy: shared-RM shortfall raises one merged line; purchase/BOM grids and drill-ins; pipeline totals reconcile

### CR-018 — WO Zoho-Books UI (branch `feat/zoho-field-mapping`)
- [x] Sidebar submenu: Work Orders / BOM / Purchase / Reports
- [x] `/wo/:id` split view: left WO rail + toolbar (Edit · Approve ▾ · status · ⋯) + Details/Approvals/History sub-tabs
- [x] `DELETE /api/wo/:id` (Draft/Cancelled only, guards + cascade) and `GET /api/wo/purchase-requests`
- [x] `/wo/bom` and `/wo/purchase` global pages reusing `BomTab`/`PurchaseTab`
- [x] Print / PDF via hidden print sheet + `window.print()`
- [ ] Verify on deploy: approve flow, delete guards, print layout, global purchase page

### CR-014 — SKU tabs in setup order + combined SKUs page (branch `feat/zoho-field-mapping`)
- [x] Tabs reordered Industries → Properties → SKU Generator; default landing `/sku/industries`
- [x] SKU Items + Generator merged: `/sku/items` list with **+ New** → `/sku/generator`
- [x] Row click → Zoho-Books master–detail (left list + right edit panel); edit modal removed
- [x] Recent SKUs rail removed from generator; create navigates back to the list
- [x] `SKUItemsPage` pagination folded onto shared `GridFooter`/`usePager`

### CR-012 — CRM Deal → SKU master item picker (specified, blocked)
Widget in a CRM Deal → search SKU master → multi-select → rows land in the
deal's item grid. Full spec + verified CRM metadata in [CHANGES.md](CHANGES.md).
No new OAuth scope needed (widget acts as the signed-in CRM user).
- [ ] **Confirm the target subform.** Answers so far imply two new subforms
      (`SKU_Items_A` / `SKU_Items_B`) mirroring the Plan A/B pattern — inferred,
      not confirmed. Everything below depends on it
- [ ] **CRM console (Dhiraj):** add `SKU` text field to `Plan_Pricing` — the
      correlation key, so repeat transfers don't duplicate the catalog
- [ ] **CRM console (Dhiraj):** create the new SKU line subform(s) on Deals
      (lookup → `Plan_Pricing`, qty, rate, amount); confirm the column list
- [ ] **CRM console (Dhiraj):** check whether a lookup filter would hide
      widget-created `Plan_Pricing` records (existing `App_Plan` filter is
      `query_id 3100593000205746400`)
- [ ] **CRM console (Dhiraj):** register the widget (Setup → Developer Space →
      Widgets) + the Deal button that launches it
- [ ] **Decide:** the widget loads for a CRM user with no SKU-app session and no
      selected Books org — the `App.jsx` gate will block the iframe
- [ ] Widget route (`/sku/crm`): search + multi-select over `POST /api/sku-items/search`
- [ ] `ZOHO.embeddedApp` — `getRecord` (Deal Name, Deal ID, Contact Name) →
      find-or-create `Plan_Pricing` by `SKU` → `updateRecord` appends the rows
- [ ] Out of scope this CR: generating a new SKU in the widget, editing on
      transfer, any write to `Products` / `Quotes`

### CR-011 — Generator chrome cleanup + catalog search (branch `feat/zoho-field-mapping`)
- [x] Hide the in/out transfer UI (column, `isActive()` gate and `NOT IN SKU` badge kept); reset the 24 rows stuck at `activeInSku = false`
- [x] Remove the breadcrumb bar, page heading and stats tiles
- [x] `GlobalSearch.jsx` in the SKU tab bar — items + properties, ⌘K, `/sku/items?q=` deep link
- [x] Submit to helpdesk → account menu; generator opens on the first industry
- [ ] Wire `Submit to helpdesk` to a real destination — it is still a toast stub

### CR-009 — Vertical generator + property gates (branch `feat/zoho-field-mapping`)
- [x] Vertical property list with ◀ / ▶ in-out transfer + Remove all / Add all (saved per industry via `Property.activeInSku`)
- [x] `Property.includeInName` gate + space-joined item name, with "none flagged ⇒ all" fallback
- [x] Per-property `Caption: Value` description lines → Books `description` **and** `purchase_description`
- [x] Schema applied: `Property.activeInSku` + `Property.includeInName` (nullable booleans, no default). `SKUItem.description` was already `text`/10000 — no change needed
- [x] Deployed to `SKU-GEN-OCTFIS` (2026-07-23)
- [ ] Tick `Include in item name` on the properties Dhiraj nominates for the name
- [ ] Live check in Books: SKU field, sales description, purchase description, and the `zohoCfApiName` custom fields all populated on one generated item
### CR-010 — Property values as Zoho Books items (specified, not started)
Values of some properties (e.g. **Pipe Size**) are real Books items with their own code.
**One-way sync: SKU DB → Zoho Books** — authored here, pushed out, never read back.
- [ ] Schema: `Property.valuesAreItems`, `Property.trackInventory` (stock or not), `PropertyValue.zohoItemId`
- [ ] `pushValueToZoho` in `zoho/push.js` (copy of `pushToZoho`); `createItem` gains an optional `itemType` — `inventory` vs `sales_and_purchases`
- [ ] Push on create/update of a value when the parent property is flagged; `POST /api/property-values/:id/push-zoho` + `POST /api/properties/:id/push-values` for retry/bulk
- [ ] Property form checkboxes + linked/not-linked column and Sync-all in the values table
- [ ] **Decide**: `PropertyValue.sku` codes now share the Books SKU namespace with generated SKU codes. Default is push as-is and surface Zoho's duplicate error; fallback is a per-property prefix column
- [ ] Delete is **not** mirrored — deleting a value leaves the Books item alone (say so in the confirm dialog)
- [ ] Out of scope: building the generated SKU item as a Books composite item / BOM from its values

### CR-008 — Zoho field mapping UI (branch `feat/zoho-field-mapping`)
- [x] `GET /api/zoho/item-custom-fields` — list Books item custom fields for the mapping screen (`booksApi.listItemCustomFields`)
- [x] Import: find-or-create `PropertyValue` for mapped **List** properties (case-insensitive match, auto 4-char SKU code); Range keeps `valueText`
- [ ] Mapping screen UI: pick a Books custom field per property from a dropdown instead of typing `api_name` by hand
- [ ] Verify a full import round-trip against a real Books org (values land on the right properties, no duplicate PropertyValues)

---

## Open

### CR-013 — Work Order module (MSUN BRD), code complete, not yet deployed
Code and docs are done; everything below needs the Catalyst console or a live org.
Reference + setup procedure: [WORKORDER.md](WORKORDER.md).
- [ ] **Create the 13 tables + 2 column additions** in the Catalyst console exactly as
      specified in [SCHEMA.md](SCHEMA.md), then flip the ledger rows from ⏳ to ✅
- [ ] Enable `work-order` for the org in `/#/admin/addons`; reconnect Zoho for the Inventory scope
- [ ] Set the three warehouses + alert recipients in Work Order → Settings
- [ ] Register the nightly cron → `POST /internal/reconcile` (`X-Sync-Secret`)
- [ ] Register the Books workflow-rule webhooks → `/internal/zoho-event` (WORKORDER.md §4);
      **verify which modules the client's Books plan will actually fire rules for**
- [ ] **Live verification against Zoho**: the exact `POST /inventory/v1/transferorders`
      and `POST /books/v3/purchaseorders` payloads (warehouse ids on PO lines,
      `salesorder_item_id` line mapping) — these are written to the documented shape
      but have never been posted to a real org
- [ ] Walk one real MSUN SO end to end: create WO → import BOM → reserve → issue →
      return → purchase request, hand-checking column H against `ZBTejReserve.aspx`
- [ ] Set `ALERT_FROM_EMAIL` and confirm a shortfall alert actually arrives
- [ ] Retire `/api/reserve/*` + `ReservePage.jsx` one release after `/wo` is live

### Work Order — open with the client (BRD §13)
- [ ] "Reports — As per Tej Control" — **not built**, no specification exists
- [ ] Confirm whether Extra Reserved `A + C − D − G` is intentional (see WORKORDER.md §1 —
      de-reserve is capped at C regardless, so this is display-only)
- [ ] Approver roles/levels; warehouse count beyond Main/Reserve/Issue
- [ ] Ownership of the "SO-to-PO Add-on" in the flow diagram (the Purchase Request
      module covers the same ground)

### Security / ops
- [ ] **Rotate the Zoho OAuth secrets** — live credentials are committed in `functions/skuapi/catalyst-config.json`; move them to Catalyst environment secrets
- [ ] Set a dedicated `SESSION_SECRET` (currently falls back to `ZOHO_CLIENT_SECRET`)
- [ ] Register the reconcile cron (also listed under CR-013)

### Add-ons not started
- [ ] `cheque-printing` — entitlement key exists, no implementation
- [ ] `label-printing` — entitlement key exists, no implementation

---

## Deferred (decided, not scheduled)

| Item | Why deferred | Add when |
|------|--------------|----------|
| Catalyst Search for free-text item search | Needs console-side column indexing; SKU tokenization unverified | CRM widget or data volume makes LIKE too slow |
| Server-side pagination (`LIMIT`/`OFFSET`) | Result sets fit in one 300-row ZCQL page | Items outgrow one page |
| Dedicated Books correlation custom field | `sku` + `zohoItemId` correlation holds | SKUs start being edited directly inside Books |
| Two-way sync / conflict UI on import | Import is create-only by decision | Overwrite semantics are actually wanted |
| `AppUser.role` column | `ADMIN_EMAILS` env allowlist is enough | Admins need self-service management |
| Per-org add-on cache | One ZCQL per request is not measurable | It shows up in latency |
| Combined-item PO template for the PO team | PO lines stay 1:1 per SO by design (CR-015); combined view is a print/report concern | The PO team asks for it |

---

## Done (recent — full detail in CHANGES.md)

- [x] CR-050 MSUN estimate template pass — With Total default, header cleanup + every page, CRM Account/Contact "To" details, Revision fields, discount only on CalcSheet w/ clubbed page amounts, ISO footer slot, T&C bold/color (2026-08-26)
- [x] CR-045 PO GST picks inter/intra-state (IGST vs CGST+SGST) by org-vs-vendor GSTIN state code; fixes code 3032 (2026-08-25)

- [x] CR-043 Estimate "Our Offer No" = CRM Quote No (MSUN custom `Quote_No`, then `Quote_Number`), no Subject fallback; `Quote_No` added to picker fields (2026-08-25)
- [x] CR-041 Estimate header band (logo + address) prints on the first page only (2026-08-25)
- [x] CR-040 Estimate T&C: A/B on all types (Duties & Taxes on Export + one-time cache reset) + centered amount columns (2026-08-25)

- [x] CR-017 Nav: Order Management submenu (Work Orders/Reports), Settings moved to account menu (2026-07-28)
- [x] CR-016 PO detail view in Purchase tab: edit/remove lines, issue/cancel, delete with shortfall reset (2026-07-27)
- [x] CR-015 Purchase tab: vendor error surfacing + ⟳ re-sync, draft-PR shortfall dedup + hint (2026-07-27)
- [x] CR-007 Multi-DC Zoho login + phone-registered (email-less) accounts (2026-07-23)
- [x] CR-006 Import find-or-create PropertyValues for mapped properties (2026-07-23)
- [x] CR-005 Multi-add-on platform, entitlements admin, reserve read path, record-grid standard (2026-07-03)
- [x] CR-004 Org switcher + Books-only OAuth scope trim (2026-07-03)
- [x] CR-003 Multi-user Zoho auth + per-org multi-tenancy (2026-07-02)
- [x] CR-002 Backend migrated to Catalyst Data Store, deployed to SKU-GEN-OCTFIS (2026-06-30)
- [x] CR-001 Zoho Books integration + modular backend structure (2026-05-28)
