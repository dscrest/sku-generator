# Task list — SKU Studio / OCTFIS platform

**Single source of truth for open work.** Everything that is planned, in
progress, or deliberately deferred lives here — no parallel task files.
Work Order reference material (A–I formulas, warehouse map, per-org setup, role
SOPs) lives in [WORKORDER.md](WORKORDER.md); its *tasks* are below.
`RESERVE-TASKS.md` is superseded by it and kept only for CR-005 history.

Related docs: [CHANGES.md](CHANGES.md) (change requests + shipped log),
[SCHEMA.md](SCHEMA.md) (DB), [ARCHITECTURE.md](ARCHITECTURE.md) (system),
[ZOHO_AUTH.md](ZOHO_AUTH.md) (OAuth setup).

Last updated: 2026-09-01.

---

## In progress

### CR-090 — Admin console org registry (branch `feat/zoho-field-mapping`)
- [x] Catalyst — new `Org` table (`orgId` varchar 50 unique mandatory, `orgName` varchar 255) via MCP
- [x] `zoho/auth.js` — `saveOrg` best-effort upserts into `Org` (try/catch, never blocks selection)
- [x] `routes/admin.js` — `GET /orgs` unions Org ∪ distinct ZohoToken (pure `orgUnion` + `--selftest`); `Org` in `ORG_TABLES` cascade
- [x] `AddonAdminPage.jsx` — org-count badge + missing `work-order` label
- [ ] Verify after deploy: switch ABC → XYZ → both listed with independent toggles; count badge = 2; delete an org removes its registry row

### CR-089 — SKU numerical series per property combination (branch `feat/zoho-field-mapping`)
- [x] Catalyst — `Industry.seriesStart` (int, nullable) via MCP
- [x] New `skuSeries.js` (`nextSuffix`/`nextSeriesSku`/`stripSuffix`) + `skuSeries.test.js`
- [x] `store.js` — `seriesStart` in `NUM_COLS`
- [x] `routes/industries.js` — accept/persist `seriesStart` (POST/PUT)
- [x] `routes/sku.js` — `/generate` appends suffix (edit keeps it while combination unchanged); `/create-item` recomputes server-side
- [x] `IndustriesPage.jsx` — Numerical Series field in Add/Edit modals + grid column
- [x] `SKUGeneratorPage.jsx` — series chip + toast uses server sku
- [ ] Verify after deploy: series 1 on an industry → same combination twice = `-0001`, `-0002`; different value = `-0001`; edit without changing values keeps the number; blank field = no suffix

### CR-087 — Push-to-Books config dialog + CF mapping removal (branch `feat/zoho-field-mapping`)
- [x] `booksApi.js` — `listStockAccounts`; `createItem` takes `{ tracking, inventoryAccountId }` (serial default, batch via `track_batch_number`); all custom-field push code deleted
- [x] `inventoryApi.js` — `createCompositeItem` same tracking/account opts; CF code removed
- [x] `push.js` / `itemValues.js` — opts threaded through `pushToZoho`/`pushManufacturing`; `buildZohoCustomFields` deleted
- [x] `routes/skuItems.js` — `GET /stock-accounts`; push route reads `{ tracking, inventoryAccountId }` body
- [x] `SKUItemsPage.jsx` — pre-push dialog (single + Push All), tracking radio, account dropdown default Finished Goods
- [x] Tests — `push.test.js` + `booksApi.test.js` rewritten for tracking/account mapping and no-CF payloads
- [ ] Verify after deploy: push Trading + Manufacturing item with Batch + chosen account → Books item batch-tracked, right account, no custom fields; `track_batch_number` accepted by the live org

### CR-086 — SKU generator: Tab between property fields (branch `feat/zoho-field-mapping`)
- [x] `SKUGeneratorPage.jsx` — `tabIndex={0}` on property selects + range inputs (macOS browsers skip selects on Tab by default)
- [ ] Verify after deploy: on the SKU Generator, click the first property, press Tab → focus moves down the property list; dropdowns open with Space/arrows

### CR-085 — Industries tab → account/Settings menu (branch `feat/zoho-field-mapping`)
- [x] `App.jsx` — Industries out of `SKU_TABS`; "Industries" item in the account dropdown (sku-generator addon); SKU nav + `/sku/*` fallback → `/sku/items`; industries routes kept for permalinks
- [ ] Verify after deploy: SKU Generator sidebar entry opens the items list; account menu → Industries opens the old page; deep links from Properties/global search still work

### CR-084 — Purchase requests: modify & delete + WO Purchase tab (branch `feat/zoho-field-mapping`)
- [x] `purchase.js` — `deletePR` (409 when any line is on a PO) + `deletePRLine` (last line deleted → PR removed too, `prDeleted:true`); `pr.delete`/`pr.line.delete` activity
- [x] Routes — `DELETE /api/wo/pr/:prId`, `DELETE /api/wo/pr-line/:lineId`
- [x] `PurchaseTab.jsx` — "Delete request" (confirm modal) on Draft PRs, per-line ✕ on lines without a PO
- [x] `WorkOrderPage.jsx` — Purchase tab renders `PurchaseTab` (detail endpoint already returns `purchaseRequests`)
- [ ] Verify after deploy (WO-0009): edit PR qty 2 → 10 from WO → Purchase; delete a line → shortfall returns; delete the PR → chip clears; confirmed PR delete 409s until the PO is deleted

### CR-083 — "Request purchase" prefills the grid's Purchase action (branch `feat/zoho-field-mapping`)
- [x] `MaterialsGrid.jsx` — button no longer navigates to `/wo/purchase`; it switches to Purchase mode and prefills qty = `shortfallQty` for ticked rows (else all short rows); confirm bar raises the PR as in CR-077
- [ ] Verify after deploy: on a WO with short items, click Request purchase → Purchase mode + shortfalls prefilled → Request N lines → PR number toast, chip shows Requested; ticking one row prefills only it; double-raise 409s "Already requested"

### CR-082 — WO approval levels setting (branch `feat/zoho-field-mapping`)
- [x] `store.js` — `approvalLevels` in `SETTING_KEYS` (select: Auto/Disabled/1/2), pure `approvalLevelCount` (explicit setting wins, else derived from approver emails, none → 0), `requiredLevelsMet(set, count)`; selftest cases
- [x] Routes — `/approve` 409s at 0 levels or level > count; status advance + `/invoice-gate` (`[1,2].slice(0,count)`, empty = allowed) use the count; WO detail returns `requiredApprovalLevels`
- [x] UI — settings page renders `select`-type keys; WO page hides Approve/Reject at 0 levels; Approvals tab: disabled notice at 0, one card at 1
- [ ] Verify after deploy: settings dropdown persists; Disabled → no Approve button + invoice gate open; 1 level → L1 approves to Approved, L2 attempt 409s; 2 levels → PendingApproval after L1; Auto matches configured emails

### CR-081 — Qty inputs: no spinner arrows (branch `feat/zoho-field-mapping`)
- [x] Global `index.css` rule hides spin buttons on all `input[type="number"]` (webkit + `appearance: textfield`); numeric-only typing unchanged
- [ ] Verify after deploy: qty boxes (Materials grid, Purchase pages, PO edit) show no arrows, typing letters still rejected

### CR-080 — WO Close (all-issued gate) + admin Reopen with reason (branch `feat/zoho-field-mapping`)
- [x] Close gate in `POST /:id/status`: 409 `unissued` with item list when net issued < required; `force:true` closes anyway (logged `forced:true`); `unissuedRows` + `unissued.test.js`
- [x] `POST /:id/reopen` (requireAdmin): Closed → Completed, reason required, `wo.reopen` logged with reason (History tab)
- [x] UI: Close WO button (Completed) + warn modal, Reopen WO button (Closed, admin only) + reason modal; `user` threaded to WorkOrderPage
- [ ] Deploy, then verify: close a fully-issued WO silently, close a short WO via the warning, reopen as admin (reason in History), non-admin gets no button and a 403

### CR-075 — WO "In stock" −2: snapshot prune/write-through chain (branch `feat/zoho-field-mapping`)
- [x] `writeStock` prunes per-warehouse rows only when the payload has a breakdown; breakdown-less bulk rows fall to the item-detail call; `healStock` also heals a missing Main row
- [x] `stocktargets.test.js` writeStock prune tests + selftests pass
- [ ] Deploy, then per-item Sync on item 123456789 → WO-0008 In stock shows the real Head-Office qty (not −2)
- [ ] Verify WO Settings Main warehouse (`4000844000000032109`) is the Head Office location; check Zoho — if its Main went negative from TO 4000844000001673101, fix in Zoho (redo TO / adjust stock)

### CR-079 — By-item Purchase page qty always editable (branch `feat/zoho-field-mapping`)
- [x] ByItemView/RowGroup: `canOrder` gate removed — checkbox + qty input on every row (covered rows default 0); select-all covers all rows; `raise()` drops zero-qty lines
- [x] `raiseItemPO`: covered/extra item (qty > 0, no pending breakdown) inserts one unattributed line instead of being skipped; selftest passes
- [ ] Deploy + verify: WO-0010 → Request purchase → 987654333 row editable, type 5 + vendor → Raise PO creates PR + draft PO

### CR-078 — cf_so_no SO traceability on TOs + PO lines (branch `feat/zoho-field-mapping`)
- [x] `createTransferOrder` sends `custom_fields: [{cf_so_no}]` (SO number from `confirmTxn`); retry once without CFs if the org lacks the field
- [x] `createPurchaseOrder` line items send `item_custom_fields: [{cf_so_no}]`; same strip-CFs retry; `poPutBody` echoes `item_custom_fields` through PO edits
- [x] `collapseLines` keyed by (item, SO) → one PO line per SO; `confirmPR` stamps the WO's SO on every line; `raiseItemPO` carries per-breakdown SO (in memory, no DB column)
- [x] Selftest: per-SO collapse + item_custom_fields echo
- [ ] Deploy + verify: Reserve → TO in Zoho Inventory shows cf_so_no; confirm PR → PO lines show SO NO per line; By-item raise across 2 SOs → 2 lines; PO qty edit keeps cf_so_no

### CR-077 — Materials grid Purchase action (branch `feat/zoho-field-mapping`)
- [x] Fifth action "Purchase" on the WO Materials grid: uncapped qty input, MAX = remaining shortfall, Confirm posts the PR with the typed lines
- [ ] Verify: WO → Materials → Purchase → tick item, type qty → Confirm → PR appears under Purchase page → Requests with that qty

### CR-076 — PO GST retry, duplicate-PR guard, pre-raise qty (branch `feat/zoho-field-mapping`)
- [x] `createPurchaseOrder` retries once with flipped IGST↔CGST+SGST on Zoho 3032/3033
- [x] `createPR` re-nets posted lines against open draft PRs (`openDraftLines` shared with the shortfall route) → 409 when fully covered
- [x] PurchaseTab shortfall qty editable before raising; zero-qty lines dropped
- [ ] Deploy + verify: failing PR now raises its PO (IGST on the Books PO); double "Raise purchase request" → 409 toast; edited qty lands on the PR line

### CR-070 — Cheaper stock sync: incremental delta + webhooks (branch `feat/zoho-field-mapping`)
- [x] `listItemsWithStock({since})` — newest-first + early-stop; `reconcileOrg` reads/advances `OrgSetting.stockSyncCursor`; incremental delta processed whole, full/force sweep paged
- [x] `/refresh` accepts `?force=1`; **⟳ Sync stock** (incremental) + **↻ Full resync** buttons
- [x] `internalAuth` accepts `?secret=` fallback for Books webhook rules; WORKORDER.md §4.6 updated
- [x] `maplimit.test.js` delta early-stop + cursor-max assertions pass
- [ ] Deploy + verify: 1st sync writes `stockSyncCursor`; change one item → access logs show ~1 list + ~1 detail call (not 143)
- [ ] Client: register Books `item` workflow rule → confirm 200 + a `source:"webhook"` snapshot row

### CR-074 — Warehouse-per-column flat grid (branch `feat/zoho-field-mapping`)
- [x] `warehouseStock` pivots server-side: `{ warehouses, mainWarehouseId, issueWarehouseId, items }`; Available = main − issue (org-total fallback); syncedAt = newest row
- [x] Flat grid, dynamic warehouse columns, "—" when no breakdown; dropdown filters (warehouse + stock qty) + zero-stock checkbox; GridFooter pagination
- [x] Per-item ⟳ patch recomputes stocks/total/available; CSV pivots warehouse names to columns; CR-073 reserved/issued fields removed
- [x] Tests + build pass; deployed
- [ ] Verify: columns match org warehouses, Available = Head Office − Issue, dropdowns + checkbox + pager work, ⟳ updates a row in place

### CR-073 — Reserve/Issue → consumption columns (branch `feat/zoho-field-mapping`)
- [x] `warehouseStock` pivots Reserve/Issue location rows into per-item `reserved`/`issued`; only physical warehouses group; `syncItem` returns both for live patch
- [x] Grid columns `Item | SKU | On hand | Reserved | Issued | Available | Last synced` + group totals; CSV labels added
- [x] Tests + build pass; deployed
- [ ] Verify: Reserve/Issue no longer appear as groups; Reserved/Issued figures match Zoho; per-item ⟳ updates them

### CR-072 — Warehouse-stock report redesign (branch `feat/zoho-field-mapping`)
- [x] `byOrgAll` in store.js — ROWID-cursor paging past ZCQL's ~300-row cap; `warehouseStock` returns full per-warehouse set + "Unassigned" group; rows carry `warehouseId`+`syncedAt`; `?warehouseId=` filter dropped
- [x] New grouped grid: collapsible warehouse headers (totals, zero count, per-group ⟳ Sync), per-item ⟳, SKU, color-coded stock, Last synced
- [x] Chip filters (warehouse counts + All/In stock/Low(<10)/Zero) + "Ignore items with 0 stock" checkbox + Sync visible; all client-side
- [x] Fonts: Inter body + Space Grotesk display app-wide (index.html, index.css, SKUGeneratorPage tokens)
- [x] Tests (stocktargets, maplimit, store selftest) + build pass; deployed
- [ ] Verify on `/wo/reports` → Warehouse stock: groups collapse, chips + checkbox filter, per-group Sync walks items, Last synced updates, fonts changed
- [ ] Optional: re-skin exactly from `Warehouse Stock.dc.html` once the design file is dropped into the repo

### CR-071 — Warehouse-stock report: per-item ⟳ refresh + SKU column (branch `feat/zoho-field-mapping`)
- [x] `stockTargets(item)` extracted from `writeStock` (pure); `syncItem` returns `{stockOnHand, availableStock, warehouses[]}`
- [x] `WorkOrderReportsPage.refreshItem(itemId)` — one `sync-stock` call, patches the row in place (org total, or selected warehouse's breakdown); busy spinner; no re-pull
- [x] `⟳` button per item row + SKU column restored; subtotal/grand-total colSpans widened; `npm run build` passes
- [x] `stocktargets.test.js` (org-total-first + per-location/warehouse shaping) passes
- [ ] Deploy + verify on `/wo/reports` → Warehouse stock: ⟳ updates one item's numbers in place; item/SKU search + SKU column; warehouse-filtered refresh patches that warehouse's row

### CR-069 — Warehouse-stock report: merged warehouse cells (branch `feat/zoho-field-mapping`)
- [x] `WarehouseStock` → single grouped table, `rowSpan`-merged + shaded warehouse cell over each group's item rows + subtotal
- [x] Columns `Warehouse | Item Name | Stock on hand | Available` (SKU dropped from screen, still in CSV export)
- [x] Per-warehouse subtotals + grand total preserved; `npm run build` passes
- [ ] Deploy + verify on `/wo/reports` → Warehouse stock: one table, merged shaded warehouse cells, totals correct

### CR-068 — Warehouse-stock report reads item-level on-hand (branch `feat/zoho-field-mapping`)
- [x] `warehouseStock` default view = org-total row per item (item-level truth, no 300-row truncation); warehouse pick → that warehouse's rows
- [x] `writeStock` deletes per-warehouse rows the fresh payload no longer carries (no stale 0 rows)
- [x] Report warehouse dropdown fed from `/settings` locations; filter now server-side (`?warehouseId=`)
- [x] Deployed
- [ ] Verify: AFR - AIRWIN shows on-hand 1 in the report (refresh; no resync needed — org-total already 1)

### CR-067 — "Sync all stock" 408 fix: paged full sweep (branch `feat/zoho-field-mapping`)
- [x] `reconcileOrg({full,offset,limit})` processes a 50-item slice, returns `{total,nextOffset,done}`; route passes `offset`/`limit` through
- [x] `WorkOrderReportsPage.syncAll()` loops chunks until done (`Syncing… N/total`)
- [x] `maplimit.test.js` paging-cursor check (every id once, terminates) passes
- [ ] Deploy + verify: full sync completes with no 408; AFR - AIRWIN lands in `ItemStockSnapshot` with on-hand 1 at its location

### CR-066 — Stock refresh 408 fix (branch `feat/zoho-field-mapping`)
- [x] `reconcileOrg` per-item + composite loops run via `mapLimit(items, 6, fn)`; removed serial `sleep`/`DELAY_MS`; `maplimit.test.js` passes
- [ ] Verify on deploy: "⟳ Refresh stock" returns 200 (access-log duration well under 30s), no 408
- [ ] Deferred: move reconcile to a background job when the working set outgrows 6-wide-in-30s (`ponytail:` at `mapLimit`)

### CR-065 — Estimate uses CRM per-line Size field (branch `feat/zoho-field-mapping`)
- [x] `buildEstimate` reads `line.Size` (source of truth) over stale description `Size:`; distinct sizes per row; test 5c
- [ ] Verify on deploy (`/#/estimate?quoteId=1356653000001379320`): one name shows its distinct sizes (26"/19"/20"/21"…) each with its own price

### CR-064 — Estimate SIZE printed once per run (branch `feat/zoho-field-mapping`)
- [x] `ItemRows` size stack blanks a size that repeats the row above (empty `<li>` keeps alignment); prices/qty per row unchanged
- [ ] Verify on deploy (`/#/estimate?quoteId=1356653000001379320`): SR 11 shows `26" DN 650` once; a genuine multi-size item still prints each distinct size once

### CR-063 — Estimate size-value spacing (branch `feat/zoho-field-mapping`)
- [x] One `<tr>` per item; Size/Qty/List/Amount stacked with 10px gaps (`est-stack`), aligned via uniform entry height
- [ ] Verify on deploy: a 2-size item shows tight 10px-gapped values at the top (no stretch); many-size items still aligned; pagination/column rules intact

### CR-062 — Estimate stale in-line Size fix (branch `feat/zoho-field-mapping`)
- [x] `parseLineDescription` drops the redundant `Size:` spec line (SIZE column is the source of truth); test 1b covers it
- [ ] Verify on deploy: a same-name item with a changed size prints the new size, no `Size:` line in the description block

### CR-060 — Estimate print polish (branch `feat/zoho-field-mapping`)
- [x] Revision No free text + above date; SR-NO top-aligned; Terms↔Bank gap→divider; bold customer contact; contact-email fallback; company email two lines; CalcSheet PAGE nn aligned to item pages
- [ ] Verify on deploy: type R1 in Revision No prints as-is above the date; customer email shows in the To block (else find the real CRM field on a live `_contact`); bank table sits under Terms with the divider; summary PAGE nn lines up with pages 1–2

### CR-059 — Estimate print tweaks (branch `feat/zoho-field-mapping`)
- [x] CalcSheet PAGE nn into totals band; To-line bold single line; cells vertically centered
- [ ] Verify on deploy: CalcSheet shows PAGE nn inside the teal band, long customer names stay on the To line, item rows read centered against tall description cells

### CR-058 — Estimate footer certification-logo row (branch `feat/zoho-field-mapping`)
- [x] `FootBand` → four individual logos (IAF · IAS · IBR · ISO) in a centered 13.6mm flex row (16mm broke print pagination); IAF jpeg checkerboard cleaned
- [ ] Verify on deploy: footer row on every printed sheet incl. T&C page, no extra blank page in A4 print preview (CR-055 geometry)

### CR-057 — Demo revert: old WO details screen (branch `feat/zoho-field-mapping`)
- [x] `WorkOrderPage.jsx` + `MaterialsGrid.jsx` restored from `b9a1248` (pre-CR-049); redesign + ledger parked at `5d9eb68`
- [ ] After the demo: `git checkout 5d9eb68 -- frontend/src/pages/WorkOrderPage.jsx frontend/src/components/MaterialsGrid.jsx`, rebuild, deploy — then close CR-049/051 verify items

### CR-051 — WO Activity in/out movement ledger (branch `feat/zoho-field-mapping`)
- [x] `txn.js` `listTxns` — txn lines enriched with `name`/`sku`/`uom` from the WO's `WorkOrderLine` rows (one extra query)
- [x] `WorkOrderPage.jsx` `ActivityTab` — movement cards (↗ out / ↙ in, colored edge, route chip, TO number, item rows with qty); audit events as slim rows in the same stream
- [ ] Verify on deploy: reserve/issue show blue ↗ cards with item names + qty, release/return green ↙, Draft/Cancelled muted, audit rows interleaved chronologically

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

- [x] CR-061 Warehouse-stock report — `/wo/reports` "Warehouse stock" tab (item × warehouse On hand/Available), warehouse + item-search filters, ⟳ Sync all stock + CSV; `ItemStockSnapshot` gains `itemName`/`sku` (2026-08-29)
- [x] CR-055 Estimate print: footer capped 16mm + font-load re-measure; spill-free confirmed by headless-Chrome PDF test (2026-08-26)
- [x] CR-056 Estimate print polish: numeric Revision No before Revision Date (blank = omitted), header email removed, "To, <name>" one line, CalcSheet compact (no filler stretch), PAG NO. middle-aligned, wrapping descriptions (2026-08-26)
- [x] CR-054 Estimate print: no browser URL/date header-footer (`@page` margin 0 + sheet padding); footer stays on its page — print matches measured layout (2026-08-26)
- [x] CR-053 Estimate print: toolbar Revision No/Date print in the sheet header below Offer Preparation Date when set (2026-08-26)
- [x] CR-052 Estimate print: MSUN certificates footer image + tables stretch to the footer on every sheet (2026-08-26)
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
