# Task list — SKU Studio / OCTFIS platform

**Single source of truth for open work.** Everything that is planned, in
progress, or deliberately deferred lives here — no parallel task files.
Work Order reference material (A–I formulas, warehouse map, per-org setup, role
SOPs) lives in [WORKORDER.md](WORKORDER.md); its *tasks* are below.
`RESERVE-TASKS.md` is superseded by it and kept only for CR-005 history.

Related docs: [CHANGES.md](CHANGES.md) (change requests + shipped log),
[SCHEMA.md](SCHEMA.md) (DB), [ARCHITECTURE.md](ARCHITECTURE.md) (system),
[ZOHO_AUTH.md](ZOHO_AUTH.md) (OAuth setup).

Last updated: 2026-10-22 (CR-294).

---

## In progress

### CR-294 — Sidebar user card, glass settings popover, dark theme (branch `feat/zoho-field-mapping`)
- [x] `theme.js` + `index.html` bootstrap, `index.css` dark tokens / `.glass-panel` / `.user-card` / `.pop-item`, `components/Popover.jsx`, `Modal glass`, `UserCard` + `ShortcutsModal` in `App.jsx`, `HeaderBar` removed, shared-component token swaps; frontend build clean (2026-10-22)
- [x] Deploy to Dev — `catalyst deploy` (2026-10-22, also shipped CR-288–293 from the same working tree)
- [ ] Verify (browser): `localStorage.theme='dark'` + hard refresh → no white flash; popover Light / Dark / Match system flip `<html data-theme>` live, persist on reload, Match system follows macOS; popover opens above the card, not clipped, closes on outside click / Esc / scroll; collapsed sidebar = avatar only, popover still opens; `⌘,` → Settings from SKU / WO / Recipe pages, `⌘K` still works on SKU pages; shortcuts modal glass in both themes; Log Out → login, Switch Organization → org picker; dark sweep of grid (sticky header), RowMenu, Modal, Toolbar delete, DateInput, PickList, native `<select>`, MaterialsGrid, Purchase tab; DevTools "emulate reduced transparency" → opaque popover
- [ ] Follow-up: page-level hardcoded colours for dark (~70 hits / 27 pages — `SKUGeneratorPage` 9, `WorkOrderPage` 6, `ZohoConnectPage` 5, `WorkOrderListPage` 5, `ReservePage` 5, `ImportItemsPage` 5, `LoginPage` 4, `OrgSelectPage` 3; mid-tone `#b91c1c` / `#15803d` status text in `MaterialsGrid` / `PurchaseTab` / `WoItemsTab` / `BomTab` kept as is) and `public/octfis-logo.png` contrast on the dark sidebar (dark variant or `filter: invert(1)`)

### CR-289–293 — Product Designs takeover, item per material, configurator order / prices / folded services (branch `feat/zoho-field-mapping`)
- [x] `RecipeComponentOption.skuItemId` on Dev via Catalyst MCP (69851000000353374, 2026-10-22)
- [x] CR-289 `App.jsx` routes + nav, `RecipeV2ListPage.jsx` ⋮ menu (Mark Inactive/Active, Delete), v1 pages removed
- [x] CR-290 `syncMaterials` / `GET /recipes` / `POST /sizing/bom`, `designBom.js` (+ selftest), form Item (ZB) per material sub-line
- [x] CR-291 `step2Box` MOC → Motor Selection (Drive, TPH range, RPM read-only, Range, Model) → Other
- [x] CR-292 `import.js` keeps `rate`; `/sizing/bom`, `/component-map/resolve`, `/category-items` return it; `c-rate` cell + BOM popover
- [x] CR-293 `config.services` objects, svc BOM rows, `unitPrice = ladder + services`, `+N services` chip, Price detail row, description line
- [x] `designBom.js --selftest`, `routes/recipe.js --selftest`, frontend build (2026-10-22)
- [x] Deploy to Dev — `catalyst deploy` (2026-10-22, with CR-294)
- [ ] Verify (app): Product Designs → Ricon RAV design → Casing: CI → item X, WCF → item Y → Save → reopen; ⋮ Mark Inactive / Active / Delete on a scratch design; no "v2" nav entry; SKU Items → Refresh from Zoho once (fills `rate`)
- [ ] Verify (widget, Ricon quote): step 2 = MOC → Motor Selection (Drive, TPH range, RPM read-only, Range, Model) → Other (Shaft, Proximity, Inlet, Outlet); ₹ per resolved row; tick Coating → one line, `+1 service` chip, BOM lists Coating + price, Price detail "Services (1)", footer = ladder + service; push → one `Quoted_Items` row, List_Price includes the service, description ends "Services: Coating"; Save → Edit → Coating still ticked
- [ ] Verify (WO): SO from that quote → New work order → Casing = item X for MOC CI (`source: design`), no service line
- [ ] After Ricon verifies: update memory `sandbox-copy-page-ricon-first` (v2 is the page now)

### CR-288 — Property ↔ Zoho Books field mapping: three value sources + Mapping view (branch `feat/zoho-field-mapping`)
- [x] `Property.valuesFromCf` on Dev via Catalyst MCP (2026-10-19)
- [x] `store.js` valueSource helpers, `booksApi` field options + `addCustomFieldOption`, `valueSync.planOptionSync`, `routes/properties.js` + `routes/propertyValues.js`; selftests, route loads, frontend build clean (2026-10-19)
- [x] `PropertyManagerPage.jsx`: Books field select, Values-come-from radio, Properties | Mapping toggle, Sync / Sync all
- [ ] **Probe `PUT /books/v3/settings/fields/{customfield_id}` live** (needs the user's OK to mint a token, `e2e-api-test-harness`): make a throwaway dropdown field in Books, PUT it back with one extra `values` entry, record the accepted body (or the refusal) in CHANGES.md, delete the field. If refused: the add-value hook already degrades to the manual-path warning
- [x] Deploy to Dev — `catalyst deploy` (2026-10-22, with CR-294)
- [ ] Verify (API, sequential): `GET /api/zoho/item-custom-fields` shows `values` on a dropdown field; `PUT /properties/:id { valueSource: "options", zohoCfApiName }`; `POST /properties/:id/sync-books` → `N new`; `GET /industries/:id/property-values` carries them; `POST /property-values` → Books field lists the option (or `zohoWarning`); `POST /properties/sync-books-all` reports both source kinds
- [ ] Verify (UI): Property Manager → Mapping → change source / field inline → saved on reload; Sync all; Properties view chip + Sync; form radio + field select; Quote Maker Refresh from Books shows the synced option; SKU Generator pick list shows it
- [ ] Follow-ups: Ricon hardcodes `cf_brand/range/capacity` (`routes/recipe.js` geared-motors/items) + `cf_valve_type` (`workorder/serial.js`) → property roles; `configurator.html` to call `sync-books-all` on open like the Quote Maker; `import.js customFieldMap` is org-wide (two industries on one api name → last wins)

### CR-295 — Quote Maker (MSUN): FG = Books composites, BOM-based match for material parameters (branch `feat/zoho-field-mapping`)
- [x] `refreshFromBooks({ compositesOnly })` + `bomValues` / `bomContext` / `replaceBomValues`; `refresh-zoho` reads both settings; widget fires the FG refresh on Books-only; SKU Settings copy. Self-tests, route load, widget parse, build clean (2026-10-22)
- [x] Data: `OrgSetting cfgWidgetBooksOnly = true` for MSUN (2026-10-22)
- [x] Deployed to Dev with CR-288…294 (user's go, 2026-10-22)
- [x] Stray `SKUItem 69851000000366056` + 19 values deleted (user confirmed, 2026-10-22); the quote line / CRM Product, if the widget pushed one, is the user's to remove
- [x] Verified (API, MSUN user): refresh → 28 composites, 27 created, `bomValues 38`, 16 s, 13 pending for the next run; `KGVBIHO` carries all 19 picked values; search with the 19 filters → exactly the Knife Gate FG; `CompositeItemCache` row present (2026-10-22)
- [x] Treatments need no field mapping — `Hard Chrome Plating Service - 200MM` / `Plasma Nitriding - 200MM` are BOM lines of the composite, matched through the BOM path (2026-10-22)
- [ ] Verify (widget, user): the 19 picks → `KNIFE GATE VALVE BI-DIRECTIONAL HANDWHEEL OPERATED` listed; change Body Material → not-found message + Refresh, no create card; second open shows the remaining 13 composites indexed
- [ ] Access log: open-time refresh stayed at 16 s for 15 composites — watch it when every composite is current (only changed ones are re-read, so steady state is ~2 s)

### CR-287 — Quote Maker: Finished Goods / BOM lookup against Books, MSUN MV1-T277 (branch `feat/zoho-field-mapping`)
- [x] Settings keys `cfgFgCategoryId` / `cfgWidgetBooksOnly` + SKU Settings Books tab; `refreshFromBooks({ categoryId })`; `POST /api/properties/sync-books-all`; widget refresh-on-open + Refresh button + NOT_FOUND box. Route load, selftest, widget parse, frontend build clean (2026-10-19)
- [x] Probed MSUN live: list rows carry flat `cf_<api>` keys (omitted when blank) → `customFieldsFromRow`, no detail reads; 154 items, 24 parameter categories, no FG category, no parameter custom field filled yet (2026-10-19)
- [x] Deployed to Dev (CR-285 + CR-286 + CR-287 together, 2026-10-19); `GET /sku-items/settings` shows `fgCategoryId` / `widgetBooksOnly`; `sync-books-all` → `{properties:0}`
- [x] Setup (superseded by CR-295, 2026-10-22): no CAT custom fields and no Finished Goods category needed — FG = composite items, materials matched through the BOM; Books-only toggle set via MCP. 7 field-backed properties are mapped and filled on the FGs; the two treatment mappings are the only open setup item (CR-295)
- [ ] Verify (API, sequential): `PUT /sku-items/settings`, `POST /properties/sync-books-all`, `POST /sku-items/refresh-zoho` report, `POST /sku-items/search` with the REQ example → item; widget on a Quote: values from categories, match → Add, miss → message + Refresh, create in Books → Refresh → found; toggle off → create card back
- [ ] Access log: open-time refresh under 30 s on Dev; raise/lower `detailCap 15` if needed
- [ ] Client owes the expected item for the REQ example (Q9) and the I / S split decision (Q2)

### CR-285 — Unit conversion WO → PR → PO, MSUN (branch `feat/zoho-field-mapping`)
- [x] `PurchaseRequestLine` + `srcItemId` / `srcName` / `srcQty` / `convFactor` on Dev via Catalyst MCP (2026-10-19)
- [x] `booksApi.itemConversion` / `resolveConvertItem` / `weightKg` (moved from packing); `purchase.convertLines` on every PR path, grid + draft coverage track the source item; `--selftest` purchase + packing pass; frontend build clean
- [x] Deploy to Dev — `catalyst deploy` (2026-10-22, with CR-294)
- [ ] User verify (MSUN): Stem Nut shortfall → Proceed Purchase → PR line = SG Iron × weight with "from Stem Nut × N"; Confirm → Books PO line; grid Stem Nut on-order = N; by-item Raise path; checkbox off → unchanged; checkbox on + blank Convert Item → 400 naming the item
- [ ] Confirm the Convert Item lookup value shape on the first real PR (id vs display name) and note it in CHANGES.md
- [ ] Next: Ricon PR timing unchanged (no `/items/:id` calls in the access log)

### CR-284 — Ricon configurator: Material first, priced services, geared-motor selection (branch `feat/zoho-field-mapping`)
- [x] `GearedMotor` table + `RecipeComponent.price` on Dev via Catalyst MCP (2026-10-09)
- [x] Routes `/api/recipe/geared-motors`, `/seed-rav-motors`, `/sizing/bom` service fields, `components-bulk` price; perms; `quoteBom` motor line; selftests pass
- [x] `RecipeGearedMotorsPage.jsx` + routes/menu; Product Designs v2 Services → Price column; frontend build clean
- [x] `configurator.html`: no caption, Material first, Drive → RPM range → HP → Geared motor rows, service tick rows → Service lines, edit mode, Bare Shaft clears
- [x] Deployed to Dev (2026-10-09)
- [x] 107 rows seeded via Catalyst MCP (2026-10-09); [ ] link Books items on the Geared Motors grid (no item name matched a model)
- [ ] Product Designs v2: enter the Coating price on each Ricon design
- [ ] Verify on a Ricon quote: material first / no heading; Chain Drive Only → 0.1–1 TPH → 15–25 RPM → PBL M0122 + SEW R27DIBE71M4 listed; tick Coating → own priced line on `Quoted_Items`; Edit re-opens both; WO from the SO shows the motor item line

### Zoho SSAF-T3 — Bulk item import → auto SKU → Zoho Books (Studio Sairish, task 1414095000028569207)
- [x] Import tab + Books item-sheet import, auto-push setting, item-wise suffix series, auto-registered values (CR-092 / 127 / 128 / 132 / 133 / 136 / 189)
- [x] Currency cells, product type per row / picked on the page, blank required = warning, typable column picker, Books export names auto-map (CR-255 / 257 / 258); deployed to Dev 2026-09-29
- [x] Zoho comment posted for Krushika (2026-09-29)
- [ ] Zoho status: Open → Running → To Be Tested — click in the Zoho UI (the API rejects the read-only Start / Due fields)
- [ ] Set up the Yarn / Thread / Filler product types' properties on the Studio Sairish org (only Fabric has any)
- [ ] Verify a real import on the org: Fabric row with a blank SKU → generated SKU + suffix; same row again → next suffix; auto-push to Books per SKU Settings
- [ ] Krushika's test sign-off

### CR-266 — Product Designs: no Publish / drafts / versions, edit in place (branch `feat/zoho-field-mapping`)
- [x] `routes/recipe.js`: create + clone live, `assertEditable`, publish / new-version / versions endpoints removed, delete on any design, list hides Superseded; `--selftest` passes
- [x] `RecipeBuilderPage.jsx` (no Publish, Edit → form, in-place tabs, no Versions tab / version chip), `RecipeNewPage.jsx`, `RecipeListPage.jsx`, `RecipeWizardPage.jsx`, `RecipeSnapshotPage.jsx`, `recipeShared.jsx` (Active / Inactive labels)
- [x] Frontend build clean; browser check in Chromium against a stubbed API
- [x] Deploy to Dev (2026-09-29)
- [x] One-time data update on Dev (`RecipeTemplate`, via Catalyst MCP): 6 lone Drafts → `Published`; 2 Draft v2 matching their live v1 → `Superseded`
- [ ] 2 Draft v2 that differ from the live v1, untouched: `RCP-RAVH100-SSQ` (Ricon, 69851000000312281 — drops Motor + Gear, adds MS / WCB) and `MOBILE512` (test org, 69851000000252320 — adds Camera) — user to say which copy stays
- [ ] Verify on Ricon: New design → Active at once, quotable; Edit → Save changes the same design; Delete from More ▾

### CR-265 — Every dropdown pick list is searchable, app + widgets (branch `feat/zoho-field-mapping`)
- [x] `frontend/src/components/searchableSelect.js` global enhancer, installed in `main.jsx` (no call-site edits)
- [x] Copy pasted at the top of the script in `widget.html`, `configurator.html`, `packing.html`; `books-widget/app/widget.html` re-copied
- [x] Quote Maker popover filter always on; Configurator List questions have a filter
- [x] `node frontend/src/components/searchableSelect.test.js` passes (helpers + widget-copy drift check); frontend build clean
- [x] Browser check in Chromium: grid filter, page size, "add" select, select in a modal, calendar month/year, keyboard only, disabled select, each widget page
- [x] Widget zip rebuilt (`books-widget/dist/packinglist.zip`), `app/widget.html` identical to `packing.html`
- [ ] Click-through in Safari and Firefox (not run)
- [x] `npm run build` + `catalyst deploy` to Dev 2026-09-29 (app, Quote Maker, Configurator, `/packing`); live pages confirmed to carry the enhancer
- [ ] **Manual:** re-upload `books-widget/dist/packinglist.zip` in Books → Settings → Developer Space → Widgets
- [ ] Verify inside the real Zoho CRM / Books iframes: panel not clipped, Configurator property select followed by auto-pick, packing item + package-type selects
- [ ] When `searchableSelect.js` changes: re-paste the body into the four widget files (the self-check names the stale one), re-zip

### CR-264 — Product Design form: Main product = the Books Composite Items list (branch `feat/zoho-field-mapping`)
- [x] `zoho/import.js` `planCompositeSync` + `syncComposites`; `--selftest` passes
- [x] `GET /api/recipe/products/composites`
- [x] `RecipeNewPage.jsx`: list from Books composites + the saved pick; fallback to SKU master assembly items when Books cannot be read; ⟳ beside the select re-reads Books
- [x] `npm run build` clean
- [x] Deploy to Dev (2026-09-29)
- [ ] Verify on Ricon: list = Books Composite Items (DHIRAJ COMP 1 … RAVS 300 SSNR-Sanitary); 5 rows promoted + 5 added in `SKUItem`; second open adds nothing

### CR-263 — Product Design form: Main product = assembly items only, component name optional (branch `feat/zoho-field-mapping`)
- [x] Main product list source superseded by CR-264
- [x] `GET /api/recipe/products` rows carry `type`
- [x] `RecipeNewPage.jsx`: Main product lists Manufacturing items + the saved pick; a row with only a material saves under the material's name
- [x] `npm run build` clean
- [ ] Click-through in the browser (not done — built only)
- [x] Deploy to Dev (2026-09-29)

### CR-281 — Ricon configurator: Material processed × Efficiency %, Material Efficiency master (branch `feat/zoho-field-mapping`)
- [x] `SizingMaterial` table added (Dev, Catalyst MCP)
- [x] `recipe.js` sizing-materials CRUD + `seed-rav-materials`; `sizing/select` takes `materialId`; `sizing.js` `eff`; `perms.js` map; self-tests pass
- [x] `RecipeSizingMaterialsPage.jsx` + routes/nav; `configurator.html` material select, derated Volume, Find gate, quote values, edit restore; build clean
- [x] Deploy to Dev (2026-10-08)
- [ ] User: create Quoted_Items column "Material" (and optionally "Efficiency") in CRM, or give the go to create it via the CRM MCP
- [ ] User verify: Material Efficiency → Load RAV materials (83) → edit one; widget 5 TPH · 0.6 · 20 RPM + Bolier Fly Ash → Volume `5.56 (80% of 6.94)`, Find without material blocked, with material Req. Cap 5.56 → smaller valve; line Description shows Material/Efficiency; saved line re-opens with the material

### CR-280 — Store issues: return TO on first action, Replace modal same-item default + batch list + no-stock message (branch `feat/zoho-field-mapping`)
- [x] `DefectReturn.returnedAt` added (Dev, Catalyst MCP)
- [x] `defects.js` raise = draft only, `settleReturn` in replace/action; `blocks.js` Issue view + `entryFor` issue id; `gridRow.defective` → `assemblable`; self-tests pass
- [x] `WoDefectsPage.jsx` prefilled item, inline batches, no-stock line, "still at Issue"; `MaterialsGrid.jsx` copy; build clean
- [x] Deploy to Dev (2026-10-07)
- [ ] User verify (WO-0028): Replace → no TO in Zoho, History shows Draft return, Store issues "still at Issue", Make Assembly Ready drops; Store issues → Reserve & Issue opens with the same item + batches → Proceed → return TO then reserve/issue TOs; Restock on another row fires its TO first; 0-stock item shows the no-stock line and raises a PR

### CR-279 — Store issue number series, WO as secondary column (branch `feat/zoho-field-mapping`)
- [x] `DefectReturn.issueNumber` added (Dev, Catalyst MCP); `siNumberPrefix` setting; `nextNumber` ignores blank rows
- [x] `defects.js` raise/list/email carry the number; `WoDefectsPage.jsx` Store issue first, Work Order second; build clean
- [ ] Deploy to Dev
- [ ] User verify: Replace on a WO → toast "Store issue SI-0001 …"; Store issues grid shows SI-0001 first, WO link second; Settings → Document numbering shows "Store issue prefix"

### CR-278 — WO Replace: batch picker first, the reason + photo dialog sends (branch `feat/zoho-field-mapping`)
- [x] `MaterialsGrid.jsx`: Replace → `pickThenMove` → picker → `submitMoves` opens `ReplaceDialog` with the picks → Proceed → `submitReplace`; `replaceMeta` removed; build clean
- [x] Deploy to Dev (2026-10-07)
- [ ] User verify (WO-0028, WCB KGV Body 50mm × 1): Proceed Replace → picker shows batch Dummy (2), prefilled 1 → Proceed → reason + photo → Proceed → toast "Sent to Store issues — Transfer Order TO-000xx created"; Store issues (Open) lists the row, badge 1; `DefectReturn` has one `pending` row; cancelling the picker or the dialog records nothing

### CR-277 — WO: one Transfer Order per action, partial FG assembly, ⋮ menu flips up (branch `feat/zoho-field-mapping`)
- [x] `MaterialTxnLine.workOrderFgId` added (Dev, Catalyst MCP)
- [x] `txn.js`: multi-FG drafts/confirm, `mergeByItem`, per-line balances, one sweep txn per type; `formulas.js assemblable`; `grid.js` payload `assembly`; `assembly.js` gate + preview `maxQty`; self-tests pass
- [x] `MaterialsGrid.jsx`: one `/txn` post, Assembly tab Ready / Blocked / Waiting on; `AssembleModal` cap; `RowMenu` portalled to body + flip (fixes every grid incl. Store issues); build clean
- [x] Deploy to Dev (2026-10-07, with CR-278)
- [ ] User verify (WO-0028): Issue lines under two FGs → one TO; Make Assembly shows FG2/FG3 Ready 1 · Blocked 1 · Waiting on RM; assemble 1; Complete → one de-reserve/return TO; ⋮ on the last row of a long grid opens upward

### CR-276 — Product Designs v2: material sub-lines per component, single-name pickers (branch `feat/zoho-field-mapping`)
- [x] `RecipeV2NewPage.jsx`: rowSpan component rows, material sub-lines with qty + unit, + add material by code, name-only pickers; build clean
- [x] Deploy to Dev (2026-09-30)
- [ ] User verify (Ricon): Casing → CI 55, WSB 70; Gland → CI 100, WSB 20 → Save → reopen shows both rows with sub-lines; old builder shows the same cast weights; WO from a quote with MOC = CI → Casing 55 KG, Gland 100 KG

### CR-275 — Product Designs v2: Item (ZB) from Books (no composites), Name merged into Main ERP item (branch `feat/zoho-field-mapping`)
- [x] `GET /api/recipe/products/goods`; `refreshFromBooks` `skuFromName` option (default off); `import.js --selftest`, routes load
- [x] `RecipeV2NewPage.jsx`: Main ERP item* replaces Name*, SKU filled from it; Item (ZB) from `/products/goods`; build clean
- [x] Deploy to Dev (2026-09-30)
- [ ] User verify (Ricon): v2 → New → Main ERP item lists DHIRAJ COMP 1; Item (ZB) lists Dhiraj RM 1 / Dhiraj RM 2 and not DHIRAJ COMP 1; Create → design name = DHIRAJ COMP 1

### CR-274 — Product Designs v2: one material per row, qty in the column (branch `feat/zoho-field-mapping`)
- [x] `RecipeV2NewPage.jsx`: Material select per row, same-name rows → one component; build clean
- [x] Deploy to Dev (2026-09-30)
- [ ] User verify (Ricon): rows `Casing · CI · 55 · KG` + `Casing · CF8 · 100 · KG` → Save → reopen shows two rows; old builder shows Casing with CI 55 / CF8 100; WO from a quote with MOC = CI → 55 KG per unit

### CR-273 — Product Designs v2: one qty per material, row unit shared (branch `feat/zoho-field-mapping`)
- [x] `RecipeV2NewPage.jsx`: chip qty is the qty, row Quantity reads *per material*, unit from the first material; build clean
- [x] Deploy to Dev (2026-09-30)
- [ ] User verify (Ricon): row Casing → add CI (unit becomes KG) → CI 55, CF8 100 → Save → reopen shows the same; WO from a quote with MOC = CI → 55 KG per unit

### CR-272 — Product Designs v2: qty per material on the row (branch `feat/zoho-field-mapping`)
- [x] `RecipeV2NewPage.jsx` chip qty input; `routes/recipe.js` `syncMaterials` takes `{ materialId, castWeight }`; build clean, routes load
- [x] Deploy to Dev (2026-09-30); layout superseded by CR-273

### CR-271 — Product Designs v2: direct Books items on a design + daily SKU-master refresh (branch `feat/zoho-field-mapping`)
- [x] `RecipeV2ListPage.jsx`, `RecipeV2NewPage.jsx` (Item (ZB) column), nav + routes; current pages untouched; `npm run build` clean
- [x] `workorder/designBom.js`: item on a component wins over its materials; `--selftest` passes
- [x] `zoho/import.js`: custom-field read-back on refresh (changed items only, ≤ 40 per run), `refreshAllOrgs`; `--selftest` passes
- [x] `index.js` `POST /internal/refresh-items`
- [x] Deploy to Dev (2026-09-30)
- [ ] **User: register the daily cron** — Catalyst console → Cron → URL type, daily: `POST https://sku-gen-octfis-925638796.development.catalystserverless.com/server/skuapi/internal/refresh-items`, header `X-Sync-Secret: <SYNC_SECRET>` (the nightly `/internal/reconcile` cron from CR-155 is still unregistered too)
- [ ] User verify (Ricon): Product Designs v2 → open TEST12345 → Item (ZB) = Dhiraj RM 1 / Dhiraj RM 2 on the two rows, materials removed → Save → new WO from an SO with DHIRAJ COMP 1 seeds the same two lines; the old Product Designs page still opens the design unchanged
- [ ] User verify (Ricon): Books Items → Refresh from Zoho still works (report now carries `values` / `detailsPending`)
- [ ] Next: CR-B (match by MOC + qty matrix + MOC pick on the WO), CR-C (cost sheet + configured SKU on the WO)

### CR-270 — WO raw material from the finished good's Product Design (branch `feat/zoho-field-mapping`)
- [x] `workorder/designBom.js` (new): `findDesign`, `loadDesign`, `designLines`, `linesForFg`; `--selftest` passes
- [x] `workorder/quoteBom.js`: `resolve()` (quote → design → composite), design config in `fgConfig` / `display` / `note`; `--selftest` passes
- [x] WO setting `woBomSource` (Direct from Books / Direct from Template) in `SETTING_KEYS`; `useQuote(addonKeys, settings)` needs add-on + setting
- [x] Ricon on Dev set to Direct from Template (`OrgSetting` row via Catalyst MCP); every other org stays on Books
- [x] `routes/workorder.js`: create, SO new line, BOM preview and apply go through `resolve`; design / quote lines never pushed to the Books composite
- [x] `BomTab.jsx`, `WorkOrderNewPage.jsx`; `npm run build` clean
- [x] Deploy to Dev (2026-09-29, functions + client)
- [ ] User verify (Ricon): WO-0002 → BOM → Compare → `RM-1` / `RM-2` removed, `Dhiraj RM 1` / `Dhiraj RM 2` added, no *Apply & update Zoho* → Apply here only
- [ ] User verify (Ricon): new work order from an SO with `DHIRAJ COMP 1` → lines from the design, Source = design; Books composite still lists `RM-1` / `RM-2`
- [ ] User verify (MSUN): create + BOM Compare unchanged (composite)
- [ ] User verify (Ricon): Settings → Work order shows *Work order raw material* = Direct from Template; switch to Direct from Books → BOM Compare shows the composite's lines
- [ ] Roll out to other organisations only after Ricon is verified
- [ ] Next: several materials per component picked by MOC — needs a MOC pick on the work order when the SO names no saved quote
- [ ] Open from CR-261: Books bundle whose lines are not in the composite's BOM — not verified

### CR-269 — WO list crash on an org with no purchase lines + raw runtime errors scrubbed (branch `feat/zoho-field-mapping`)
- [x] `workorder/purchase.js` `procStatusByWo`: `receiptAt` set before the early return; `--selftest` passes
- [x] `scrubErrors.js` (new) + mounted first in `index.js`; `--selftest` passes
- [x] Deploy to Dev (2026-09-29, `catalyst deploy --only functions`); function answers, live checks below not run yet
- [ ] Verify on Ricon: Work Orders list opens (was "Cannot read properties of undefined (reading 'get')")
- [ ] After deploy: search the Catalyst log for `[raw-error]` — each hit is a bug to fix at its source

### CR-268 — SO WO stamp skipped for an org without the custom field (branch `feat/zoho-field-mapping`)
- [x] `zoho/booksApi.js` `stampSalesOrderWo` / `stampWith`: Books 120138 → skip, no fallback, org remembered per instance; `--selftest` passes
- [x] Deploy to Dev (2026-09-29, `catalyst deploy --only functions`)
- [ ] Verify on Ricon: create a work order from an SO → no "Sales order not updated with the WO number" toast
- [ ] Verify on MSUN: create a work order → SO field shows `WO-xxxx / dd/mm/yyyy`; cancel → field clears

### CR-267 — WO BOM source: Books composite (MSUN) or template (Ricon), by add-on then by SO line (branch `feat/zoho-field-mapping`)
- [x] `quoteBom.useQuote(addonKeys)` + `--selftest` cases
- [x] `routes/workorder.js` `soConfigs()`: no quote lookup unless the org has `recipe-engine`; warning when the add-on is on and the SO names no saved quote; `GET /api/wo/so/:soId` through the same gate
- [x] `bom.js`, `quoteBom.js` `--selftest` + `push.test.js` pass; route module loads
- [x] Deploy to Dev (2026-09-29)
- [ ] User verify (MSUN org): New WO from a confirmed SO → lines = the composite's component items × qty, no Configuration column, no warning
- [ ] User verify (Ricon org): SO converted from a saved quote → lines are the MOC's items, Source = quote; SO with no saved quote → composite lines + the warning

### CR-262 — Search + filters on every grid that lacked them (branch `feat/zoho-field-mapping`)
- [x] Shared `matches()` (`gridCols.js`) + `<SearchInput>` (`GridFooter.jsx`); `gridCols.test.js` passes
- [x] `usePager` returns to the first page when the row count changes
- [x] Search on Materials, Cost Master, Sizing Models, Components, Quotations, Industries, Properties, Books-linked values, WO Item List tab, all WO Reports views; Templates on the shared input
- [x] New filters: Materials UOM, Cost Master Calculations, WO Item List Source, WO Reports Customers / Statuses
- [x] WO details left rail search matches SO number + customer
- [x] `npm run build` clean
- [ ] Click-through in the browser (not done — built and unit-checked only)
- [ ] Deploy to Dev
- [ ] Decide: search on the short unpaged tables (Users & Roles, Add-on admin, Property Manager values, Purchase tab, Reserve BOM grid)
- [ ] `WorkOrderListPage.jsx`: `useGridColumns` is called after an early return — move it above

### CR-261 — Ricon: configured valve's WO uses the real items for the quoted MOC (branch `feat/zoho-field-mapping`)
- [x] `push.js` `resolveBomLines` / `bomFromMatch`; `componentLines` on top of it; `push.test.js` passes
- [x] `workorder/quoteBom.js` (SO → quote → line → frozen config → requirement lines) + `--selftest`
- [x] `routes/workorder.js`: SO lines carry `config`; `seedFg` seeds from the template + `configJson`; preview / apply / assembly never touch the shared composite for a configured FG
- [x] `POST /api/recipe/config-quote/:docKey` takes `quoteNo`; `configurator.html` sends it
- [x] `WorkOrderNewPage.jsx` Configuration column; `BomTab.jsx` problems list, no *Apply & update Zoho* for a configured FG; frontend build
- [x] Schema: `ConfigQuote.quoteNo`, `WorkOrderFG.configJson` (Dev, via MCP)
- [ ] Deploy to Dev (on the user's go)
- [ ] **Check 1 — SO field:** open one Books SO converted from a Ricon CRM quote; note which field holds the quote number (Reference# / custom field / `zcrm_*`). None → the convert function writes the quote number to SO Reference#
- [ ] **Check 2 — Books bundle:** assemble one configured valve on Dev; confirm Books accepts bundle lines that are not in the composite's BOM. Refused → restore the composite after the bundle instead of skipping the push
- [ ] Ricon data: Components rows for the remaining Model × MOC (Excel import); Books items for the parts still missing (Brg Cover WCB, Gland WCB, every other MOC) → Refresh from Zoho (also fills unit + service flag on the existing rows)
- [ ] User verify (Ricon org): quote a mapped model with MOC = CI → save → converted SO → New WO shows the Configuration column → WO lines = Casing CI / Side Cover CI / Brg Cover CI / Gland CI × qty, stock columns filled → reserve → issue → assemble → Books assembly consumed the CI items, the valve's Books BOM unchanged
- [ ] User verify (MSUN org): New WO + assemble unchanged (no Configuration column)
- Later, if asked: planner picks the template by hand; two SO lines of the same valve on one WO; block the quote when a part has no item for the MOC

### CR-260 — WO Settings: pick Main warehouse on every work order, Ricon RD2-T482 (branch `feat/zoho-field-mapping`)
- [x] `store.js` `pickMainPerWo` setting + `needsMainPick()` + self-test; `POST /api/wo` 400 when on and nothing picked; `GET /api/wo/warehouses` returns `pickMain` / `notMain`
- [x] `WorkOrderNewPage.jsx`: Reserve / Issue dropped from the list, empty start + `Select warehouse` + Save guard when the setting is on
- [x] Self-checks pass (store, grid, txn, defects, purchase, assembly, blocks, perms); frontend build
- [x] Deploy to Dev (2026-09-29, ships CR-259 too)
- [ ] Ricon org: WO Settings → Warehouses → turn the setting on
- [ ] User verify (Ricon org): New WO → Main warehouse empty, list = Head Office + Unit-2 only → Save without a pick is blocked → pick Unit-2 → saved, header shows Unit-2, Details column B = Unit-2 stock
- [ ] User verify (MSUN org, setting off): New WO → Head Office preselected as before

### CR-259 — WO Main warehouse: false 409 on older WOs, picker without WO Settings permission, Ricon RD2-T482 (branch `feat/zoho-field-mapping`)
- [x] `store.js` `mainChanged()` + self-test; `PUT /api/wo/:id` compares the effective Main (blank = org Main)
- [x] `GET /api/wo/warehouses` (`wo.orders`); `WorkOrderNewPage.jsx` picker + `WorkOrderPage.jsx` header / issue slip read it; `perms.js` self-check
- [x] Self-checks pass (store, grid, txn, defects, purchase, assembly, blocks, perms); frontend build
- [x] Deploy to Dev (2026-09-29, with CR-260)
- [ ] Verify on Dev (MSUN org): `GET /api/wo/warehouses` → 200; PUT org Main on an older WO with reserved material → 200, Main still blank; PUT another warehouse → 409
- [ ] Verify in the UI as a user with only Work Orders permission: New WO shows the Main warehouse select

### CR-258 — Item import: the Product type box decides, "From Category Name" option (branch `feat/zoho-field-mapping`)
- [x] `booksImport.js` `pickIndustry` without fallback, forced vs by-category; `routes/skuItems.js` optional `industryId` for books; `booksImport.test.js` passes
- [x] `ImportItemsPage.jsx`: `From Category Name` option, mapping table per picked product type; build passes
- [x] Deployed to Dev (2026-09-29)
- [ ] Verify (SKU → Import, Simple): box = Fabric → only Fabric's properties in the mapping table, a Yarn-category row imports as Fabric with a warning; box = From Category Name → all product types' properties, the row goes to Yarn; a category matching no product type fails the row with that message

### CR-257 — Books-sheet item import: product type per row, lenient required, typable column picker (branch `feat/zoho-field-mapping`)
- [x] `booksImport.js`: `category` + `pickIndustry`, per-product-type `ctxFor`, `warning` / `productType` on results; `booksImport.test.js` passes
- [x] `booksMapping.js` `ALIASES` for the Books export column names; `booksMapping.test.js` passes
- [x] `ImportItemsPage.jsx`: `Category Name` field, all product types' properties (`GET /api/properties`), `ColumnPick` over `PickList`, results show product type + warning; build passes
- [x] Deployed to Dev (2026-09-29)
- [ ] Set up the Yarn / Thread / Filler product types' properties in Property Manager (test org has none — a row without an SKU cannot generate one there)
- [ ] Verify (SKU → Import, Simple) with a Books export: Rate / Purchase Rate / Location Name pre-mapped; typing in a column picker filters, `— not mapped —` unmaps; a Yarn row lands on product type Yarn; blank required properties import with a warning

### CR-255 — Books-sheet item import: money cells with a currency prefix (branch `feat/zoho-field-mapping`)
- [x] `booksImport.js` numeric cells drop the currency prefix + thousands commas; `booksImport.test.js` passes
- [x] Deployed to Dev (2026-09-29)
- [ ] Verify: a Books export row with `Opening Stock Value` = `INR 1.00` no longer fails on that column

### CR-256 — Bulk Item Import: sample as info link, upload button + picked file (branch `feat/zoho-field-mapping`)
- [x] `ImportItemsPage.jsx`: `FilePick` (button + hidden input + picked-file line) in simple and composite flows; sample step removed, link under the upload; steps renumbered; build passes
- [ ] Deploy to Dev
- [ ] Verify (SKU → Import, Simple): steps 1 · 2 · 3, no sample step; `No file selected` → pick a sheet → name · size · rows and the mapping table; `Download sample` link downloads `sample_items.xlsx`; an empty sheet → error toast and `No file selected`
- [ ] Verify (Composite): pick a Books composite export → file name + preview panel; Cancel clears both; `Download sample` link downloads the generated sheet

### CR-254 — Components: Associated Items / Associated Services sections (branch `feat/zoho-field-mapping`)
- [x] `zoho/import.js` — import + refresh keep `booksData.product_type`, refresh backfills; `booksImport.test.js` passes; `/products` `service`
- [x] `RecipeComponentMapPage.jsx` two sections + `+ Add item` / `+ Add service`; `ComponentEditPage.jsx` `?kind=service`; build passes
- [x] Product Design form: `RecipeNewPage.jsx` Services table (RecipeComponent `allowMaterial=false` + `skuItemId`); `calc.js bomLines` `items` map + selftest; push-books loads the items; build passes
- [ ] Deploy to Dev
- [x] `POST /service-items` + `NewServiceItemModal.jsx` on both forms; perms rule + selftest
- [ ] Verify (Product Designs → New): Services → + Add Service → pick "Coating service" → Create → builder Components tab lists it; Push to Books → composite shows it under Associated Services
- [ ] Verify: + New in Books → Name "Powder coating", SKU SVC-PCOAT → Create in Books → Books Items shows a Service item; the row's picker holds it; Components → Add service → same link works; duplicate SKU → 409 toast
- [ ] Data: SKU Items → Books items industry → Refresh from Zoho once, so Ricon's service items (coating service…) get `product_type`
- [ ] Verify: Components → Associated Services lists the coating-service component; + Add service → picker offers only service items, no From answer / Required / Goes as; Create → row under Services, qty `1 Nos`
- [ ] Verify: Test → the service line shows `· service`; Books push still files it under the composite's Associated Services; WO Materials has no line for it

### CR-253 — Components: simplified item mapping (branch `feat/zoho-field-mapping`)
- [x] `recipe/componentMap.js` — `groupRows`, `planSync` + selftest cases; `routes/recipe.js` — `GET /component-map/components`, `PUT /component-map/component`, `DELETE /component-map/component`, `/products` `inBooks`; perms self-check passes
- [x] `ComponentEditPage.jsx` (new + edit flat form, Advanced rules block); `RecipeComponentMapPage.jsx` grouped grid + Test modal; `App.jsx` routes + nav "Components"; build passes
- [ ] Deploy to Dev
- [ ] Verify (Ricon org): Components grid groups the existing rows; a Model+Series+MOC component shows `+n rules`; open it → Advanced rules listed with Edit links
- [ ] Verify: New → "Casing", Depends on MOC → CI / SS items → Create → grid `By MOC · 2/3 answers`; `GET /api/recipe/component-map` has two one-condition rows
- [ ] Verify: Edit the same → Same item always → Save → one `[]`-condition row, the two answer rows gone
- [ ] Verify: Test → MOC = CI → Casing resolves; MOC = MS with Required = Yes → red missing row
- [ ] Verify: CRM configurator BOM box unchanged for an untouched product; Books push still builds the composite
- [ ] Later, if asked: per-answer qty column; group History tab; BOM-request handoff / SO-confirm auto-WO / free-text add-on line (mind-map gaps)

### CR-252 — WO create / edit as one flat Books-style form (branch `feat/zoho-field-mapping`)
- [x] Rev 1 (two-step pills + per-FG SKU property blocks + `GET /item-props`) deployed to Dev, rejected on review — replaced the same day
- [x] `routes/workorder.js` — `GET /item-props` removed; `GET /so/:soId` returns the SO header fields (`soDate`, `shipmentDate`, `buyerOrderNo/Date`, `freightCharge`, `delivery`, `booking`, `transporter`); `perms.js` self-check line removed
- [x] `WorkOrderNewPage.jsx` rewritten: `/wo/new` + `/wo/:id/edit`, Books-style rows (Sales order · Customer · Main warehouse — WO# · WO Date · Expected Shipment · Machining / Fitting · Priority · TC), two-column read-only SO fields, finished-goods item table, Special Instruction; CR-251 `hint` via router state
- [x] `WorkOrderPage.jsx` — `EditModal` deleted; ✎ Edit and `onSoApplied` navigate to `/wo/:id/edit`; `App.jsx` route
- [x] Docs: CHANGES, ARCHITECTURE (API + route tables), WORKORDER §5; build + perms self-check pass
- [x] Rev 2 deployed to Dev 2026-09-28
- [ ] Verify: New → pick SO → Customer / SO Date / Expected Shipment / Buyer Order / Freight / Delivery / Booking / Transporter fill in read-only; item table lists the FG lines with qty inputs → Create → WO header card matches
- [ ] Verify: ✎ Edit → same form, SO and FGs read-only (sizes shown); change Fitting Date → Save → header card shows it
- [ ] Verify: Apply an SO qty change → Edit page opens with the amber note; Dismiss → stays on Details

### CR-251 — WO Edit: stage dates editable, auto-opened after an SO change (branch `feat/zoho-field-mapping`)
- [x] `routes/workorder.js` `PUT /:id` — `machiningDoneDate`, `fittingDoneDate`
- [x] `WorkOrderPage.jsx` `EditModal` — three-date row, `hint` note; `MaterialsGrid.jsx` `onSoApplied` after Apply / Add; build passes
- [x] Deployed to Dev 2026-09-28
- [x] Verify items superseded by CR-252 (the modal is now the `/wo/:id/edit` page)

### CR-250 — New SO line → Add to work order / Dismiss (branch `feat/zoho-field-mapping`)
- [x] `WorkOrder.soLinesJson` text via Catalyst MCP (69851000000312756)
- [x] `soFields.js` — `parseSoLines`, `soNewLines` (pure), `soLinesJson`, `syncSoLines`; test extended, passes
- [x] `routes/workorder.js` — `seedFg` extracted from create; create baselines `seen`; `POST /:id/so-line` (add / ack); `GET /:id` sync + `soNewLines`; list `soNewLine`
- [x] `sync.js` — `salesorder` webhook runs `syncSoLines`; skips Closed / Cancelled
- [x] `MaterialsGrid.jsx` banner + `addSoLine`; list + side-list red ＋; HistoryTab labels; build passes
- [x] Deployed to Dev 2026-09-28 (twice — pre-CR baseline fix + WO-0027 `soLinesJson` reset)
- [ ] Verify: open the WO on SO-00039 → banner names the new item → **Add to work order** → FG appears on Details with its BOM, History shows "Finished good added"
- [ ] Verify: add another line in Books → red ＋ on the list (via webhook, or after opening the WO) → Dismiss → ＋ gone, no re-nag

### CR-249 — WO Main warehouse per work order, Ricon RD2-T482 (branch `feat/zoho-field-mapping`)
- [x] **Schema (Catalyst MCP, Dev)**: `WorkOrder.mainWarehouseId` varchar 255 (column 69851000000314101, 2026-09-28)
- [x] `store.js` `warehouses(…, wo)` / `routeFor(…, wo)`; callers in `grid.js` (buildGrid, buildGridsBulk per-Main stock, mainStock), `txn.js`, `assembly.js`, `purchase.js` (WO-scoped PR), `defects.js`; `routes/workorder.js` create / GET / PUT (409 while reserved or issued) / `tracking-options?woId=`
- [x] `WorkOrderNewPage.jsx` Main warehouse select (default = org setting); `WorkOrderPage.jsx` header row + Edit select; `MaterialsGrid.jsx` routes + picker use the WO's Main
- [x] Self-checks pass (store, grid, txn, defects, purchase, assembly, blocks); frontend build
- [x] Deploy to Dev (2026-09-28); commented on RD2-T482
- [ ] User verify (Ricon org, two warehouses in Books): New WO → pick Unit-2 → Details column B = Unit-2 stock; Reserve → TO from Unit-2 → Reserve; Return → back to Unit-2; PO from the WO's PR delivers to Unit-2; Edit → change Main on a fresh WO works, on a WO with reserved stock → 409
- [ ] Add `mainWarehouseId` column in Production before promoting

### CR-248 — Ricon Product Configurator: card layout pass (branch `feat/zoho-field-mapping`)
- [x] `configurator.html` — footer = Base price + Add only (Qty/UOM removed, line starts at 1 / first UOM); right pane 440px; card row Qty · UOM · Base price · Disc %, no total (Price detail keeps it); script syntax-checked
- [x] Deployed to Dev 2026-09-28
- [ ] Verify (user): reopen the widget on a Ricon Quote → Base price readable on card and footer, no clipped controls, Price detail still shows Total / unit

### CR-247 — SO WO-stamp: singular `/salesorder/{id}/customfields` + fallback (branch `feat/zoho-field-mapping`)
- [x] `booksApi.js` — `stampSalesOrderWo` → `PUT /salesorder/{id}/customfields` bare array; fallback `PUT /salesorders/{id} { custom_fields }`; loads, `soFields.test.js` passes
- [x] Deployed to Dev 2026-09-28 (functions + client; CR-244 columns confirmed live first)
- [ ] Verify: open the WO raised on SO-00039 → Books SO CF shows `WO-xxxx / dd/mm/yyyy` (self-heal); create a fresh WO on another SO → no `problems` banner

### CR-246 — Ricon Product Configurator: two steps, vertical rows, saved quotes + Edit, BOM per line (branch `feat/zoho-field-mapping`)
- [x] `configurator.html`: step pills + `Configuration →` / `← Valve`, `qRow` vertical rows (inline expand, auto-open next), `#result` on step 2 only; "Unit …" caption removed; card actions Edit · BOM · Price detail; Save button; restore on open; `editLine` / Update line / Cancel edit; `keepRows` drops owned rows, `readOwnedRows` after push, Deal → Quote re-keys the cart
- [x] `routes/recipe.js`: `GET /config-quote`, `POST /config-quote/:docKey`, `cleanConfigLines` (+ `--selftest`); `perms.js` `/config-quote` → `recipe.configure` (+ selftest)
- [x] **Schema (Catalyst MCP, Dev)**: `ConfigQuote` 69851000000294788 + `ConfigQuoteLine` 69851000000312383
- [x] Deploy to Dev (2026-09-28)
- [ ] User verify (Ricon CRM Quote → Product Configurator): only the Valve step shows; `Configuration →` disabled until a model is picked; Bare Shaft → step 2 = the MOC row only; Motor Operated → MOC + config rows + Motor Selection rows, one expands at a time, an answer opens the next; SKU / BOM / Base preview fills; Add → card shows **BOM** + **Price detail**, no "Unit …" text
- [ ] User verify: Save → close → reopen → "Restored N saved lines"; Edit → step 2 with the saved answers and the model highlighted; change MOC → Update line → SKU/BOM change, qty kept, loose motor line re-added
- [ ] User verify: Add item to Quote → Quoted_Items rows; add a manual row in CRM; reopen → Edit → Add again → the widget's rows replaced, the manual row kept; `GET /api/recipe/config-quote?docKey=quotes:<id>` lists the new `crmRowIds`
- [ ] User verify (Deal): Create Quote → Draft quote; open the Configurator from that Quote → the lines are there
- [ ] User verify (MSUN `/widget`): unchanged
- [ ] Watch: a `required` question hidden by Bare Shaft blocking Add ("Still needed: …") → untick required on that question (data), no code change planned

### CR-244 — Defect workflow split: shop floor raises, store manager decides (branch `feat/zoho-field-mapping`)
- [x] `MaterialsGrid.jsx`: Replace dialog = reason + `PhotoField` (drop zone, thumbnail, ✕); Assign-replacement step and per-line Replace-with removed
- [x] `defects.js`: `raise` trimmed; `replacementPlan` (pure, self-checked), `replacementOptions`, `replace` (BOM swap → reserve top-up → issue → PR; row updated last); `list` `open`
- [x] `txn.trackingPool` (shared with `GET /tracking-options`), `grid.mainStock`; routes `GET /defects/:id/replacement-options`, `POST /defects/:id/replace`
- [x] `WoDefectsPage.jsx`: Open filter, Replacement column, ⋮ Replace — Reserve & Issue / Raise PR (`ReplaceModal` + `TrackingPicker`), Restock / Trash / Return to vendor; `App.jsx` badge `?status=open`
- [x] Self-checks + frontend build
- [x] **Schema (Catalyst MCP, Dev)**: `DefectReturn.replacementStatus` varchar 50 + `replacementRef` varchar 255 (ids 69851000000299964 / 69851000000299965, 2026-09-28); table was empty, no legacy backfill needed
- [x] Deploy to Dev (2026-09-28)
- [ ] User verify (MSUN, WO with an issued batch-tracked line): Replace 1 → dialog shows reason + photo zone only; drop a JPG → thumbnail + ✕; Proceed → picker → TO Issue→Main → "Sent to Store issues"; Store issues (Open) lists it "Awaiting decision", badge 1; ⋮ Replace — Reserve & Issue, item blank → "N reservable" → picker excludes the blocked batch → two TOs, chip "Reserved & issued"; second defect with a different Books item + short stock → "reserved & issued N · PR-x raised for M", WO BOM shows the swapped line, Purchase page lists the PR; Restock / Trash / Return to vendor as before; row leaves Open only when both decisions are made
- [ ] Negative: Replace on a decided row → 409; WO on Hold → Reserve & Issue → 409 "move it to Ready for Machining…", row stays Awaiting, retry works without a duplicate BOM line; item already on a draft PR → "Already requested — PR-x covers…"; legacy rows show "—" and are not counted

### CR-243 — Assembly runs from the Ready row, not the count modal (branch `feat/zoho-field-mapping`)
- [x] `AssembleModal.jsx`: no POST; `onProceed(body)` from picker Proceed and untracked Proceed
- [x] `MaterialsGrid.jsx`: `runAssembly` closes the modal, POSTs, toasts, reloads; `AssemblyPanel` row shows *Assembling…* with count locked; other rows' Proceed disabled meanwhile
- [x] `WORKORDER.md` assembly paragraph; `npm run build` passes
- [x] `catalyst deploy` (Dev) 2026-09-26
- [ ] User verify: batch-tracked FG → picker Proceed → both modals gone, row *Assembling…*, then Assembled/Remaining update; count modal never reappears

### CR-242 — Single-item sync: short-BOM Manufacturing SKU lands as a plain Books item (branch `feat/zoho-field-mapping`)
- [x] `zoho/push.js`: `pushPlain()` extracted; `pushManufacturing` falls back to it on `opts.plainIfNoBom` with < 2 lines; `routes/skuItems.js` push route sets the flag; `push.test.js` passes
- [x] `catalyst deploy` (Dev) 2026-09-24
- [ ] User verify: push Butterfly Valve from the details page → plain item in Books, chip "Synced"; later with ≥ 2 BOM lines a re-push replaces it with a composite

### CR-241 — Manufacturing push: value items inherit the parent's HSN (branch `feat/zoho-field-mapping`)
- [x] `zoho/push.js`: `pushValueToZoho(…, extra)` → `updateItem`/`createItem`; `buildAssociatedItems` passes `catalogueFields(booksData)` and names the failing value item; `node -e require` loads, `itemFields.test.js` passes
- [x] `catalyst deploy` (Dev) 2026-09-24
- [ ] User verify: re-push Butterfly Valve → no 2207; expect "needs at least 2 raw-material lines" until the Valve industry gets Component Map rows or a second flagged property
- [ ] Later, if a client needs it: `PropertyValue.hsn` column + input on the value form

### CR-240 — Uniform New button, generator in the record shell, SKU tab order (branch `feat/zoho-field-mapping`)
- [x] `Toolbar.jsx` `+ New` primary at the right; `App.jsx` tab order; `SKUGeneratorPage.jsx` in `RecordPage` with shared `SkuRail`; build passes
- [x] `catalyst deploy` (Dev) 2026-09-24 — working tree carried CR-238 too
- [ ] User verify: grid shows `+ New` right; tabs SKU Generator · Books Items · BOM · Import; New → generator with rail, header Create, ✕; Open in Generator → title = SKU, rail card selected, Save returns to the item
- [ ] Not asked: BOM page onto the record shell (`/sku/bom/:id`, History, More ▾)

### CR-239 — Users & Roles: lockout fix, reserved Admin, permission matrix (branch `feat/zoho-field-mapping`)
- [x] `perms.js`: `MODULES`/`VERBS`/`ACTIONS` → generated `PERM_KEYS`; `verbFor` + `hasVerb` in `requirePerm`/`prefixPerm`; Admin name = `*`; `expandLegacy`; self-test extended — passes
- [x] `routes/access.js`: `ensureAdmin` bootstrap, Admin locked, name reserved, last-Admin gate, delete refused while assigned, `users`/`locked` in role output
- [x] `UsersRolesPage.jsx`: BOFFO-style inline matrix form, roles grid, last-Admin checkbox disabled; build passes
- [x] `catalyst deploy` (Dev, functions + client) — working tree carried CR-237/238 too
- [ ] Verify (Dev org): open Settings → Users & Roles → Admin appears with Kamal + Dhiraj; both regain every module. Create "Purchase" (view+create+edit) → nobody changes; assign to a test user and drop their Admin → only Purchase; `DELETE /api/wo/po/:id` → 403 "Your role cannot delete Purchase"; sole Admin checkbox disabled (curl → 400); `PUT /api/access/roles/<adminId>` → 403; delete assigned role → 409; configure-only user `POST /api/recipe/sizing/select` still 200
- [ ] Later, when asked: per-verb button hiding on grid pages; drop `expandLegacy` once every org's roles are re-saved

### CR-238 — Ricon configurator widget: totals, Books push, design-cost line removed (branch `feat/zoho-field-mapping`)
- [x] `configurator.html`: `#totals`/`.sw` gone; `#res-cost` gone (Rate prefill kept); Push to Books box, `pushToBooks()` and failure note gone — item never pushed, `pending` chip; `node --check` passes; `widget.html` untouched
- [ ] `catalyst deploy` (Dev) — working tree carries CR-237 too
- [ ] User verify (Ricon CRM widget): no footer totals, no Design cost line, no Push to Books box; Base price still prefills; new config → line with pending chip, status empty; item on SKU Items page un-pushed

### CR-237 — SKU Item edit: Name is the SKU code for now (branch `feat/zoho-field-mapping`)
- [x] `SKUItemPage.jsx`: SKU input + validation + payload key removed; Name full width
- [x] `routes/skuItems.js` `PUT /:id`: `sku = name` (ponytail-marked), uniqueness check unchanged
- [ ] User verify on Dev; revert to body `sku` when the generator/series owns edits again

### CR-236 — Product Designs New/Edit: Component (text) + materials per row (branch `feat/zoho-field-mapping`)
- [x] `routes/recipe.js`: `syncMaterials` diff-sync on `upsertComponents` (`materialIds`), `skuItemId` only written when sent; `node --check` passes
- [x] `RecipeNewPage.jsx`: Component text + Materials (ZB items) chips/select column; edit prefill from `options`
- [x] `RecipeBuilderPage.jsx`: Components wording, material codes on Overview + card, drawer Item select removed
- [x] `vite build` clean
- [x] `catalyst deploy` (Dev, 2026-09-24)
- [ ] API check (needs the function secret — ask first): POST recipe with `materialIds [m1, m2, bogus]` → 2 options; PUT components-bulk `[m1]` → m2 gone, m1 keeps castWeight; row without `skuItemId` keeps its old link; delete 204
- [ ] User verify: New → type a component, add 2 materials, remove one chip, Create → Overview shows the component with its material code; Materials tab lists the same; Edit → chips prefilled → Save

### CR-234 — Product Designs: Edit opens the draft directly, no change-reason prompt (branch `feat/zoho-field-mapping`)
- [x] `RecipeBuilderPage.jsx`: Edit → `POST new-version` directly; reason modal + Overview "Change reason" row removed; Versions timeline hides empty reason
- [x] `vite build` clean
- [x] `catalyst deploy` (Dev, 2026-09-24)
- [ ] User verify: Published design → Edit lands on the edit form with a new draft; second Edit opens the existing draft

### CR-233 — Record-page pattern app-wide: items panel · tabs · More ▾ · History (branch `feat/zoho-field-mapping`)
- [x] `components/RecordPage.jsx` (RecordRail / RailCard / RecordPage), `components/HistoryTab.jsx` (AuditList, friendlyAction), `components/PushZohoDialog.jsx`, `pages/MasterDetailPage.jsx`
- [x] `routes/activity.js` `GET /api/activity` + `reports.js auditRows`; `logActivity` in `routes/recipe.js`, `routes/skuItems.js`, `routes/sku.js`
- [x] Product Designs: rail + History tab on `RecipeBuilderPage.jsx`
- [x] SKU Items: `SKUItemPage.jsx` at `/sku/items/:id`; grid page trimmed (Toolbar buttons, row click → details, `?item=` redirect)
- [x] Quotations: `RecipeSnapshotPage.jsx` on RecordPage; list `+` on the Toolbar
- [x] Masters: Materials / Cost Master / Sizing Models / Component Map export Form + CFG + Detail; `/…/:id` routes in `App.jsx`
- [x] `npm run build` clean; `node --check` on backend files
- [x] `catalyst deploy` (Dev, 2026-09-24)
- [ ] User verify: Product Designs rail filters + History rows; SKU item Edit/Save/Cancel, More ▾ Push/Generator/Delete, old `?item=` link; Quotation Convert logs; each master: row → details, Edit modal, Mark Inactive, Duplicate (Component Map), Delete; WO ⋯ + History unchanged

### CR-232 — CRM SKU widget on the Home dashboard (branch `feat/zoho-field-mapping`)
- [x] `widget.html`: `PageLoad` without `Entity` → dashboard mode (no record); Create Quote path without a Deal; opens the new quote, clears the cart
- [x] Script syntax check ok
- [x] `catalyst deploy` (Dev, 2026-09-24)
- [ ] CRM setup (MSUN): Setup → Developer Space → Widgets → Create, type **Dashboard**, hosting External, URL `…/server/skuapi/widget`; Home → ⋯ → Add Component → Widget → pick it
- [ ] User verify (MSUN Home): widget signs in / shows the picker; search + filters work; add lines → Create Quote → Draft quote with the lines opens, subject = first item name; existing Quote / Deal buttons unchanged
- [ ] Same dashboard mode for `configurator.html` if the Product Configurator should sit on Home too

### CR-231 — Manufacturer picklist from Books (real endpoint) + HSN 4/6/8 digits, Fotedar (branch `feat/zoho-field-mapping`)
- [x] Live probe (Fotedar token, GETs only, secrets in scratchpad files then deleted): `/settings/manufacturers` 404 on both APIs, Inventory v1 6018; **`GET /books/v3/manufacturers` → `manufacturers[].name`**; `items/editpage` also lists `manufacturers[]` + `brands[]`
- [x] `booksApi.listManufacturers` → Books v3 `/manufacturers`, 5-min cache per org
- [x] `itemFields.js`: `digits` / `lengths` on HSN, strip in `pickItemFields`, `itemFieldError`; 400 before any write in `sku.js` create/update + `skuItems.js` PUT; test +8 asserts
- [x] `components/itemFieldRules.js` + SKU Generator / SKU Items drawer: digits-only input, Save blocked with the message, `<select>` only when the list has entries, fetch failure toasts
- [x] `itemFields.test.js` ok, backend modules load, `npm run build` clean
- [x] `catalyst deploy` (Dev, 2026-09-24)
- [x] Follow-up: native select menu clamped at the viewport bottom → datalist (opened the whole master at once, unsizeable) → `components/PickList.jsx` (sized, scrolling, fixed-positioned, flips) in the Generator card and the Items drawer; rebuilt + redeployed
- [ ] User verify (Fotedar): Item details → Manufacturer offers the Books master as a typeahead list (Plaloc today); HSN accepts digits only, `123` blocked, `8481` / `848180` / `84818090` save
- [ ] Brand as a third extra field if Fotedar wants it (one `ITEM_FIELDS` entry + `listBrands` from `items/editpage` `brands[].brand`)

### CR-230 — Product Designs: Books-style details page, More ▾, item picker select, list header removed (branch `feat/zoho-field-mapping`)
- [x] `RecipeListPage.jsx`: header bar gone, Toolbar `+` → New
- [x] `RecipeNewPage.jsx`: Item Details = `<select>` "SKU — name"; legacy plain-name rows as "(unlinked)"
- [x] `RecipeBuilderPage.jsx`: Overview · Components · Materials & costing · Versions; meta card, Add component, Test template, drawer Delete removed; More ▾ Clone / Mark as Inactive / Mark as Active / Delete
- [x] `components/Menu.jsx` lifted from `WorkOrderPage.jsx`
- [x] `ConfiguratorSettingsPage.jsx`: cards stacked full width (ladder row is wide)
- [x] Overview tab: "Associated Items" table (Books look — item name + [SKU], quantity + unit) under the details
- [x] `routes/recipe.js`: `copyRecipeInto`, `POST /recipes/:id/clone`, `PUT /recipes/:id/status` (Published ↔ Archived), new-version refuses Archived
- [x] `npm run build` clean
- [x] `catalyst deploy` (Dev, 2026-09-24)
- [ ] User verify: list has no header; New page item select; details page tabs + Overview; Clone opens a Draft v1 copy; Published → Mark as Inactive → ARC, Push to Books / Edit refused, Mark as Active restores; Draft → Delete → list; WO ⋯ menu still works; Quote Maker ignores an Archived design

### CR-230 — Return / Replace capped at issued − assembled (branch `feat/zoho-field-mapping`)
- [x] `formulas.js`: `componentQtys` (moved from `assembly.js`), `gridRow(…, consumed)` → `consumed` / `returnable`, `cap("return")` on `returnable`
- [x] `grid.js assemble`: consumed per line from `fg.assembledQty`; `MaterialsGrid.jsx` Return + Replace `capKey: 'returnable'`
- [x] Self-checks (`formulas.js`, `grid.js` + the rest of workorder/) and frontend build
- [x] Deploy to Dev (2026-09-26)
- [ ] User verify (MSUN, WO with one assembled FG): Return/Replace tab → MAX fills nothing ("Nothing to replace…"), typing 1 paints red, Proceed → 400 "…not yet returned or assembled"; Assembly tab → Delete assembly → cap is back to issued; a WO with nothing assembled behaves exactly as before
- [ ] **Deferred (user, 2026-09-26) — Replace a component inside an already-assembled unit.** Not now: per-item replace before assembly is the Replace tab (per BOM line); post-assembly = Delete assembly → Replace. Zoho has no edit-bundle API. Design when wanted: Replace tab line gains an "in assembled unit" switch (pick assembly + FG serial from `WoAssembly.serialNumbers`); defective part → **positive** inventory adjustment at Main with its batch/serial (`inventoryApi.adjustmentBody` needs an `in_quantity` variant) + `DefectReturn` row (new cols `assemblyId`, `fgSerial`) so the block list and Store issues actions work unchanged; replacement part → blocked-aware pick from Main (`tracking-options`) + **negative** adjustment at Main (consumed; no TOs, ReservationLine untouched); short at Main → refuse with "raise a purchase request from the Purchase tab and replace once it arrives"; `defect.raised` activity carries the FG serial. Known gap: ledger/reports won't show repair consumption

### CR-229 — Settings hub reorg: Price Ladder → Product Configurator, tabbed SKU Settings, hidden main nav, Configure/Quotations off the menu (branch `feat/zoho-field-mapping`)
- [x] `components/TabBar.jsx` extracted from `App.jsx` (`right` slot); `App.jsx`: no `Sidebar` under `/settings/*`, Configure & Quote / Quotations dropped from `NAV_LINKS`
- [x] `SettingsLayout.jsx`: General / Add-ons groups, `/settings/sku` → `SkuSection` (TabBar + Outlet, tabs Series · Item defaults · Zoho Books · Industries · Properties), new `/settings/configurator`
- [x] `SkuSettingsPage.jsx`: `:tab` param, full-width card grid, pinned Save bar, ladder + designRate removed from state and PUT
- [x] `ConfiguratorSettingsPage.jsx` (new): price ladder + design-rate toggle, partial PUT `{ priceLadder, designRate }`
- [x] `npm run build` clean; `ladder.js --selftest` ok
- [x] `catalyst deploy` (Dev, 2026-09-24)
- [ ] User verify: gear → no main sidebar; SKU Settings tabs save across tabs; Product Configurator ladder saves and survives a later SKU Settings save; menu shows five Product Configurator entries, `/#/recipe/configure` still opens
- [ ] Follow-up (only if asked): Work Order settings group sidebar → TabBar

### CR-228 — Product Configurator: Motor HP from TPH band, Motor map rows, Motor HP → Books Capacity (branch `feat/zoho-field-mapping`)
- [x] Data (Dev, MCP): Motor map rows re-keyed (Fitted: HP + Make + Type; Loose: Inactive); Motor HP `zohoCfApiName = cf_capacity`; TPH bands on the Motor HP values
- [x] `PropertyValue.capMin` / `capMax` (MCP) + `NUM_COLS`; `POST`/`PUT /property-values` accept them; Properties page value form "Auto-pick from … to"
- [x] `configurator.html` `autoPick(tph)` on capacity change (`widget.html` untouched)
- [x] `catalyst deploy` (Dev)
- [ ] User verify (Ricon, Quote Maker): TPH 10 → Motor HP 1.5 HP, TPH 15 → 2 HP, TPH 0.8 → 0.5 HP, TPH 4.5 → unchanged (sheet gap); RAVH 100 S-Square + CI + 0.5 HP + BBL + IP55 IE2 → "Motor · Motor HP BBL IP IE2 0.5 × 1 Nos" after the design lines; push → Books item custom field Capacity = "0.5 HP"
- [ ] Confirm the Books api name of the Capacity custom field is `cf_capacity` (Books → Settings → Items → Custom fields); if the field is numeric, rename the Motor HP values to bare numbers
- [ ] Ricon: motor items + map rows for 1 / 1.5 / 2 / 3 / 5 HP (Component Map Import) — only 0.5 HP is mapped today

### CR-227 — Product Configurator: Product Design BOM under the picked model (branch `feat/zoho-field-mapping`)
- [x] `routes/recipe.js`: `templateBy()` + `POST /sizing/bom` (design by `recipeCode`, else by the picked Books item's `productItemId`; material by answer, never 400s)
- [x] `configurator.html`: design lines on pick, ahead of category items + Component Map; `missing` skips components the design lists (`widget.html` untouched)
- [x] `catalyst deploy` (Dev)
- [ ] User verify (Ricon, Quote Maker): pick RAVH 100 S-Square → Casing 55 KG / Side Cover / Brg Cover / Gland / Motor / Gear listed on pick, CI fills in after MOC, no red "no item mapped" rows, 4 map lines follow; RAVH 200 Square (no design) unchanged
- [ ] Data: link RAVH 150S / RAVH-S Square (SizingModel 69851000000295672) to `RCP-RAVH150-SS` once the user confirms it is the S-Square design — or the user sets Product design on the Sizing Models grid

### CR-226 — Product Configurator: sizing model → Books valve item, Refresh from Zoho (branch `feat/zoho-field-mapping`)
- [x] `SizingModel.skuItemId` column (Dev, MCP); `SIZING_FIELDS` + guard; `/sizing/select` returns `item` (own link, else the Product Design's product); `sizing.js fit()` passes `skuItemId`
- [x] Data: Square/RAVH 100 `recipeCode` = RCP-RAVH100-SSQ (design cost now flows); RCP-RAVH150-SS and RCP-RAVS150 have no Product item set — set it on the design or link the sizing row
- [x] Sizing Models page: Books item column + picker; `configurator.html` linked pick → quoted as-is (BOOKS ITEM badge, no generate/create/push)
- [x] `refreshFromBooks` + `POST /api/sku-items/refresh-zoho` + "Refresh from Zoho" button
- [x] `sizing --selftest`, route requires, widget `node --check`, frontend build; `catalyst deploy` (2026-09-23)
- [ ] User: SKU Items → industry RAV → Refresh from Zoho (valve composites become Manufacturing; RAVB 300 S-Blow Through, RAVH 300 S-Square, RAVH 400 SS-Square, RAVS 300 SSNR-Sanitary get created)
- [x] Ricon models linked via ZCQL (user "Go", 2026-09-23): Square/RAVH 100 → RAVH 100 S-Square, Square/RAVH 150 → RAVH 150 S-Square, RAVH-S Square/RAVH 150S → RAVH 150 SS-Square, RAVH-S Square/RAVH 200S → RAVH 200 SS-Square, RAVH-S IC/RAVH 150S → RAVH 150 SS-IC, RAVH-S IC/RAVH 200S → RAVH 200 SS-IC, RAVB Square/RAVB 150 → RAVB 150 S, RAVB Square/RAVB 200 → RAVB 200 S
- [ ] Open: Round/RAVH 150 has two Books items (R-8 Bld / R-10 Bld) — blades, contradicts "one item per model + series"; RAVH 220.70 CB matches no CB sizing row; RAVH 300 S-Square / RAVH 400 SS-Square / RAVB 300 S-Blow Through / RAVS 300 SSNR-Sanitary appear after Refresh from Zoho — link them on the Sizing Models page
- [ ] User verify (CRM): option row shows the Books name; pick → BOOKS ITEM badge; Add to lines → Books SKU on the line, no create-item call; unlinked model still generates

### CR-225 — Assembly delete: material back at Issue + 36642 number reuse (branch `feat/zoho-field-mapping`)
- [x] Zoho cleanup of the pre-CR-212 delete on WO-0026: TO-00035 + bundle WO-0026-A1 removed; batches 555/9999/111/125/Dummy Octfis verified back at Issue
- [x] `assembly.assembleFg`: reference seq per WO, retry on 36642 (number already used)
- [x] Deployed to Dev 2026-09-23 (whole working tree, incl. CR-222/223 pending edits)
- [ ] User verify (MSUN, WO-0026): Make Assembly again from the same batches → bundle number `WO-0026-A2` (or higher); ⋮ → Delete assembly → batches back under Issue in the picker / stock report

### CR-224 — Product Configurator: trim questions, Motor/Bare Shaft radio, MOC-driven Books items (branch `feat/zoho-field-mapping`)
- [x] `configurator.html`: Selected model section gone; four cards — Valve Selection (duty inputs + RAV type · Motor/Bare Shaft radio · Find), Model Selection (sizing options, after Find), Configuration (MOC first; Bare Shaft: MOC only, other answers cleared), Motor Selection (motor/gear, Motor Operated only, last); Find button sits under Volume; BOM list gated on MOC, Books category items + Component Map lines
- [x] `booksApi.listCategories` / `listItemsByCategory`; `GET /api/recipe/category-items?parent=&child=`; perm `recipe.configure`
- [x] Dev data: `showInWidget=false` on the 8 RAV questions; Motor HP "Bare Shaft" value deleted; `seedData.js` `widget: false` + seed routes honour it
- [x] `componentMap --selftest`, `perms --selftest`, `node --check` on widget script + routes pass
- [x] `catalyst deploy` to Dev (2026-09-23)
- [ ] Verify `GET /api/recipe/category-items?parent=MOC&child=CI` on Ricon's org returns Casing CI / Side Cover CI / Brg Cover CI / Gland CI (Books `category_id` filter assumed from the Inventory docs — fall back to `listItems()` filtered on `category_id` if Books rejects it)
- [ ] User verify (CRM Quote → Product Configurator): no Series/Model dropdowns; radio → Bare Shaft hides motor+gear fields and the SKU drops them; Configuration teal, MOC first; nothing under the SKU until MOC picked, then CI items + mapped components
- [ ] Later: re-key the seeded Motor map rows without Motor supply; decide qty/BOM push for category items

### CR-223 — SKU Items → Delete clears the Zoho Books item too (branch `feat/zoho-field-mapping`)
- [x] `inventoryApi.deleteCompositeItem`; `push.deleteFromZoho` (type → composite / plain item, gone = proceed, refusal = 409, local untouched)
- [x] `DELETE /api/sku-items/:id` Zoho-first, returns `{ deleted, zohoDeleted }`; `SKUItemsPage.jsx` dialog text + toast shows Zoho's reason
- [x] `node functions/skuapi/zoho/push.test.js` passes (type → endpoint, gone, refusal); `node --check` on route + inventoryApi; frontend build passes
- [ ] `catalyst deploy` to Dev
- [ ] User verify (MSUN): push a throwaway Manufacturing SKU → SKU Items ⋮ → Delete → gone in Books composite items and locally, toast "deleted here and in Zoho Books"
- [ ] Negative: delete a pushed item that has a Books transaction → toast with Books' message, row stays; delete one already removed by hand in Books → local row goes, no error

### CR-222 — Number inputs: no spinners in widget HTML (branch `feat/zoho-field-mapping`)
- [x] `configurator.html` global rule added; `packing.html` + `books-widget/app/widget.html` rule un-scoped from `td`
- [ ] `catalyst deploy` (configurator + packing ship with the function); re-zip Books widget per the manual-zip rule and re-upload
- [ ] User verify: configurator Qty / Base price, packing qty cells, Books widget — no arrows

### CR-221 — Product Designs → New: Books-style page + Associate Items (branch `feat/zoho-field-mapping`)
- [x] Columns via Catalyst MCP (Dev): `RecipeTemplate.uom` 69851000000291975, `RecipeComponent.skuItemId` 69851000000288714
- [x] `routes/recipe.js`: `uom` on create/update, `skuItemRef` on every component write
- [x] `RecipeNewPage.jsx` + route; `RecipeListPage` modal removed; builder Unit select, item line on the card, Item select in drawer + add modal
- [x] Frontend build passes; `node --check` on the route file
- [x] `catalyst deploy` to Dev 2026-09-23 (whole working tree — also shipped CR-216/217/219/220); API check passed (2 linked items + 1 bogus → ids kept / blank, `uom` canonicalised, dupe 409, test row deleted)
- [x] Pass 2: full-width Books layout; `/recipe/recipes/:id/edit` reuses the form (PUT meta + components-bulk + DELETE removed); builder draft **Edit** → form; new-version → form
- [ ] User verify: Product Designs → New → Name/SKU, pick 2 items, Add New Row, remove one, Create → builder shows the components with `sku · name`; Unit survives reload; duplicate SKU → error toast; builder **Edit** → same form prefilled, change a qty, remove a row, Save → builder reflects it

### CR-218 — Product Configurator (Ricon): Valve Selection Section + Volume (branch `feat/zoho-field-mapping`)
- [x] `configurator.html`: section renamed + `.hl` card, read-only Volume (Ltr/Min) after Speed via `updateVolume()`, `+N% spare` cell dropped, Product defaults to the industry named RAV; `seedData.js` drops Prod. Type / Application
- [x] Ricon Dev data: Prod. Type / Application `showInWidget = false` (Catalyst MCP)
- [x] Widget inline script parses; `sizing.js` self-test passes
- [x] `catalyst deploy` to Dev 2026-09-23 (whole working tree — also shipped CR-215/216/217)
- [ ] User verify in CRM (Ricon Deal): teal "Valve Selection Section" with Capacity → Bulk Density → Speed (RPM) 20 → Volume → RAV type, no Prod. Type / Application; 5 TPH / 0.6 / 20 → Volume 6.94; model rows end with "runs at N RPM"

### CR-217 — Product Configurator: "one size up" row removed (branch `feat/zoho-field-mapping`)
- [x] `recipe/sizing.js` drops `next` (self-test), `/sizing/select` sets `valueId` on the option only, `configurator.html` row/CSS cleanup
- [x] Sizing self-test, routes load, widget inline script parses
- [ ] `catalyst deploy` to Dev (whole working tree — also ships CR-215/216)
- [ ] User verify in CRM: 20 TPH / 0.8 / 20 RPM / Drop through → RAVH 300 (Square), RAVH 400S, RAVH 300 (Round) + Round Old "above largest" line, no grey rows; pick still fills Series + Model

### CR-216 — UOM list in SKU Settings (branch `feat/zoho-field-mapping`)
- [x] `OrgSetting uomList` + `parseUoms`/`uomsOf`/`normUom(v, list)` in `recipe/componentMap.js` (selftest covers parse, de-dup, org casing)
- [x] `GET/PUT /api/sku-items/settings` `uoms`; `GET /api/recipe/uoms` org-aware; org list at `create-item` and Component Map writes
- [x] SKU Settings → Units of measure box; template builder datalist, Component Map select and CRM Product Configurator (`fillUoms`) read the org list
- [x] Frontend built (`npm run build` → `functions/skuapi/app`); routes `node --check`; widget inline script parses
- [ ] `catalyst deploy` to Dev (whole working tree — also ships CR-215)
- [ ] User verify: set e.g. `Nos, Kgs, MTR, Box` in SKU Settings → the component card UOM in the template builder, the Component Map row and the configurator Qty unit offer exactly those; a saved item keeps the `MTR` spelling

### CR-214 — Product Configurator UOM list inlined (branch `feat/zoho-field-mapping`)
- [x] `configurator.html`: `uomList` = the CR-206 standard list, select filled at boot, `/api/recipe/uoms` fetch removed
- [x] Inline script parses; deployed to Dev (`catalyst deploy` 2026-09-23 — whole working tree)
- [ ] User verify (Fotedar, CRM Product Configurator): UOM offers Nos/Pcs/Kgs/Gms/Mtr/CM/MM/Ltr/Set/Box on the result row and per cart line; chosen unit lands on the quote line / Product Usage Unit

### CR-220 — Product Configurator: Mfg / BO price ladder per quote line (branch `feat/zoho-field-mapping`)
- [x] `recipe/ladder.js` (`applyLadder`, `parseLadder`, `classOf`, `--selftest` with the sheet numbers)
- [x] `routes/skuItems.js` `priceLadder` ⇄ `OrgSetting priceLadder`; `SkuSettingsPage.jsx` Price ladder card (mockup 1i)
- [x] `configurator.html` — class chip + tint, Base price, Price detail popover (1e), footer Total / Mfg / BO, CRM `List_Price` = ladder unit, `paramVals` ladder columns (`widget.html` untouched)
- [x] Checks: ladder self-test, widget script parses, routes load, `npm run build`
- [x] Deployed to Dev (`catalyst deploy` 2026-09-23); live `/configurator` carries the ladder
- [ ] Ricon: enter the % sets in Settings → SKU Settings (sheet: Mfg 10/15/5/–/10, BO 5/10/2/–/10; screenshot: 10/11/12/13/14 and 2/3/4/5/6)
- [ ] User verify (Ricon CRM Quote → Product Configurator): valve at base 100 → Mfg chip, Unit 190; loose motor → BO chip, Unit 123; Price detail toggle Mfg↔BO flashes and moves the footer totals; qty 15 BO line at base 100 → 1,841; Create Quote → `List_Price` 190
- [ ] User verify (MSUN `/widget`): unchanged
- [ ] CR-B next: `ComponentMap.childIndustryId` + `sequence`, plan grid + Configure drawer (mockup 1a–1d, 1h); CR-C: `PlanQuote`/`PlanQuoteLine`, Estimate "System quote" design with Customer / MFG / BO views, perm keys `recipe.plan.mfg` / `recipe.plan.bo` (team membership: print views + row locking, 1f/1g/1j); later: per-line % override

### CR-212 — Delete assembly resolves an untracked TO by number (branch `feat/zoho-field-mapping`)
- [x] `inventoryApi.findTransferOrderByNumber`; `assembly.deleteAssembly` reads the number from the row or the `fg.assemble` History entry and deletes the TO before the bundle
- [x] `createBundle` returns the bundle (not the envelope) so `zohoBundleId` is stored; `findBundleByNumber` for old rows; delete refuses when the bundle is not in Zoho
- [x] Self-checks (`assembly.js`, `inventoryApi.js`); deployed to Dev 2026-09-23
- [ ] **Clean-up:** WO-0026-A1 was deleted locally at 09:48 before the fix — delete bundle `WO-0026-A1` and Transfer Order `TO-00035` in Zoho Inventory (by hand, or via the API harness with approval)
- [ ] User verify (MSUN): assemble again → `WoAssembly.zohoBundleId` populated; ⋮ → Delete assembly → TO and bundle gone in Zoho, FG progress back, no warning

### CR-213 — SKU Settings page scroll (branch `feat/zoho-field-mapping`)
- [x] `SkuSettingsPage.jsx` wrapper `flex:1; overflowY:auto` (same as the other settings pages)
- [x] Frontend build ok, deployed to Dev (`catalyst deploy` 2026-09-23 — whole working tree)
- [ ] User verify: Settings → SKU Settings scrolls to the Extra item fields + Save

### CR-211 — Ricon: item costing in the add-on, design cost → configurator Rate, org-wise (branch `feat/zoho-field-mapping`)
- [x] Ricon data via Catalyst MCP (Dev): 7 plate/rod rates; `RCP-RAVS150` (69851000000312150, repurposed draft) + `RCP-RAVH150-SS` (69851000000299877) — 4 CI castings each, 4 cost elements; `SizingModel.recipeCode` on RAVS 150 + 3× RAVH 150; `OrgSetting cfgDesignRate=true`
- [x] `routes/skuItems.js` `designRate` ⇄ `cfgDesignRate`; `SkuSettingsPage.jsx` checkbox
- [x] `calc.js selectByMaterial` (+ self-test); `POST /api/recipe/sizing/price`
- [x] `configurator.html` `refreshPrice` → Design cost line + Rate box prefill (`widget.html` untouched)
- [x] Checks: calc/perms/addons self-tests, widget script parses, routes load, `npm run build`
- [x] Offline check: stored rows → `computeQuote` = 12,750 for both designs
- [x] Deployed to Dev (`catalyst deploy` 2026-09-23 — whole working tree); live `/configurator` carries `refreshPrice`, unauthenticated `/sizing/price` → 401
- [ ] User verify (Ricon app): Product Designs lists RAVS 150 + RAVH 150 SS (Draft) → Materials & costing shows CI 55/23/1/1 → Test tab all CI: Casing 7250, Side Cover 2410, Brg Cover 195, Gland 145, unit 12,750; Materials grid has MS/SS304/SS316/EN8 Rode/SS304 Rode/SS316 Rode/GM
- [ ] User verify (Ricon CRM widget): 1 TPH / 0.6 / 20 RPM / Sanitary → RAVS 150 → pick → MOC CI → "Design cost ₹12,750 · RAVS 150 v1 (Draft)" + Rate 12750; type a rate → answer changes keep it; Add → quote line rate 12750. Drop through / Square → RAVH 150 → RAVH 150 SS cost
- [ ] User verify (org switch): Settings → SKU untick → widget shows no design cost; MSUN: box unticked, no `/sizing/price` call
- [ ] User decide: RAVH 150 SS Casing figures (sheet row blank — copied from RAVS150); which RAVH 150 series rows should carry the SS design; then Publish both designs (Configure & Quote lists Published only)
- [ ] Later (say so when asked): plate/rod components, WCB/CF8 options, FAB + BLD_CHAMFER, OH/Margin/P&F/Disc as PERCENTAGE elements + Mfg-vs-BO profiles (per-component flag), Cast-vs-Plate grouping on Materials, MOC → cast-grade map

### CR-210 — Manufacturer dropdown from the Books master, Fotedar (branch `feat/zoho-field-mapping`)
- [x] `booksApi.listManufacturers` + `GET /api/sku-items/manufacturers`; `ITEM_FIELDS.manufacturer.source`
- [x] SKU Generator card + SKU Items drawer: `<select>` when the source loads, text input otherwise; stored off-master value stays selectable
- [x] `itemFields.test.js` passes, frontend build ok
- [x] Deployed to Dev (`catalyst deploy` 2026-09-23 — whole working tree)
- [x] User verify failed 2026-09-24: text box, not a dropdown — the guessed endpoint was 404; fixed in CR-231 (probed `GET /books/v3/manufacturers`)
- [ ] ~~User verify (Fotedar org): Manufacturer shows the Books master values in Generator + drawer → create/push → Books item carries the chosen manufacturer. If the dropdown does not appear, the Zoho endpoint/keys need a live probe (undocumented) — check the function log for the `/settings/manufacturers` error

### CR-209 — Org-wise extra item fields: Manufacturer + HSN Code, Fotedar (branch `feat/zoho-field-mapping`)
- [x] `itemFields.js` catalogue + pure helpers, `itemFields.test.js` passes
- [x] `OrgSetting skuItemFields` gate; settings GET/PUT + Settings → SKU checkboxes
- [x] `create-item` / `update-item` / `PUT /sku-items/:id` merge `fields` into `SKUItem.booksData`; composite push carries catalogue keys
- [x] SKU Generator "Item details" card + SKU Items drawer inputs, org-gated
- [x] Fotedar India (907623451) row inserted via Catalyst MCP (Dev)
- [x] Frontend build ok
- [x] Deployed to Dev (`catalyst deploy` 2026-09-23 — whole working tree)
- [ ] User verify (Fotedar org): Generator shows HSN Code + Manufacturer → create → Push → Books item has HSN + Manufacturer; edit from SKU Items drawer → re-push updates Books; another org → no fields, Settings boxes unticked
- [ ] Later if asked: same inputs in the CRM widgets' new-item forms

### CR-208 — WO: Make Assembly action, Show Completed Items tab, serials per line (branch `feat/zoho-field-mapping`)
- [x] `MaterialsGrid.jsx`: action label "Make Assembly"; `WorkOrderPage.jsx`: tab "Show Completed Items" after Purchase, serials one per line with per-serial select
- [x] Frontend build ok
- [x] Deployed to Dev (`catalyst deploy` 2026-09-23 — whole working tree)
- [x] Copy-all button removed from the serial column on request (2026-09-23); per-serial click-select stays
- [ ] User verify: Details → Make Assembly tab; top tabs order Details · Item List · Purchase · Show Completed Items · Approvals · History; click one serial → only it highlights, Ctrl+C copies it

### CR-207 — Packing List: over-pack error as inline banner (branch `feat/zoho-field-mapping`)
- [x] `packing.html`: `#overpack-warn` red banner kept current by `renderSummary()`; `blockedByOverPack()` scrolls to it instead of `alert()`
- [x] Widget zip rebuilt (`books-widget/dist/packinglist.zip`, no directory entries), `app/widget.html` identical to `packing.html`
- [x] Deployed to Dev (`catalyst deploy` 2026-09-23 — whole working tree)
- [ ] **Manual:** re-upload `books-widget/dist/packinglist.zip` in Books → Settings → Developer Space → Widgets
- [ ] User verify: qty above ordered → red banner lists `Item (N packed / M ordered)` at once; Save / Print → no browser dialog, banner scrolls into view, action blocked; qty corrected → banner gone, Save works

### CR-206 — Product Configurator: general UOM on Qty (branch `feat/zoho-field-mapping`)
- [x] `ComponentMap.uom` + `SKUItem.uom` varchar(20) via Catalyst MCP (Dev)
- [x] `recipe/componentMap.js`: `UOMS`, `normUom`, lines carry `uom` (selftest ok); `GET /api/recipe/uoms`; `componentMapData` stores `uom`; `create-item` stores `uom`
- [x] `push.js` / `inventoryApi.js`: Books `unit` = `item.uom` on plain + composite create/update; null keeps `pcs` (push.test.js ok)
- [x] `configurator.html`: UOM select beside Qty + on each cart card, component list `× 55 Kgs`, `paramVals` → Products Usage Unit / UOM columns, `pickValue` picklist casing
- [x] `RecipeComponentMapPage.jsx`: UOM select, grid `qty uom`, import `UOM`/`Unit` column (frontend build ok)
- [x] Deployed to Dev (`catalyst deploy` 2026-09-23 — whole working tree, CR-203/204 code went along again)
- [ ] User verify (RAV): Component Map row `55 Kgs` → widget shows `× 55 Kgs`; add to lines → card UOM select; push → Product Usage Unit = value; pushed Books item `unit` = value
- [ ] **CRM admin (per org):** add the units to Products → Usage Unit picklist (else the Product refresh warns, the line still lands)
- [ ] When promoting to Production: add the same two columns there (MCP, Environment = Production)

### CR-205 — Packing List: invoice custom fields, Exporter's Ref from org profile, blank new package, load time (branch `feat/zoho-field-mapping`)
- [x] Live probe of INV-000013 + MSUN org profile custom-field labels (read-only, secrets deleted)
- [x] `routes/packing.js`: `headerFromCustomFields` (SO < invoice < org, label aliases, Buyer Order No + Date join) → `docHeader`; `/doc` reads in parallel, weights per distinct item in parallel, org profile always read, `me` on the response, timing log line; selftest extended
- [x] `packing.html`: `docHeader` overrides prefill on a fresh plan / fills blanks on a saved one; `+ Add package` = Type only, L/W/H/Gross blank; `/doc` is the auth probe (no `/auth/me`)
- [x] Widget zip rebuilt (`books-widget/dist/packinglist.zip`), `app/widget.html` identical to `packing.html`
- [x] Deployed to Dev (functions, 2026-09-23 — whole working tree, so CR-203/204 backend code went with it); `/doc` 2.1 s warm end-to-end (was 3.4–6.8 s server + auth hop); `docHeader` = Hazira / XYZ / Ex Works / `88888 | 15-09-2026` / AAQCM4066R
- [ ] **Manual:** re-upload `books-widget/dist/packinglist.zip` in Books → Settings → Developer Space → Widgets
- [ ] User verify (MSUN INV-000013): Port of Loading = Hazira, Port of Discharge = XYZ, Inco Terms = Ex Works, Buyer Order = `88888 | 15-09-2026`, Exporter's Ref = AAQCM4066R on open; a saved plan keeps its edited values; `+ Add package` → blank L/W/H/Gross; page opens in a few seconds
- [ ] Optional (MSUN): add invoice custom fields `Place of Receipt By`, `Pre-Carriage`, `AD Code No.`, `LC No.`, `Country & Origin of Goods` in Books if those should also come from the invoice (labels already matched)

### CR-245 — WO list: SO qty change as red ▲/▼ arrow (branch `feat/zoho-field-mapping`)
- [x] `soFields.soQtyChange` (+ test), `GET /api/wo` `soQtyChange`, arrow in `WorkOrderListPage.jsx` + WO side list
- [x] Deploy to Dev (2026-09-28)
- [x] User verify (MSUN, 2026-09-28): SO line qty edited in Books → Books webhook → red arrow in the WO list without opening the WO — "Working"

### CR-204 — SO quantity change: hint + History + Apply (branch `feat/zoho-field-mapping`)
- [x] `WorkOrderFG.soLineItemId` / `soQty` / `soAckQty` via Catalyst MCP (Dev); WO create stores them
- [x] `workorder/soFields.js` `soQtyChanges` (pure, `soFields.test.js`), `syncSoQty`, `soQtyPending`; run on WO open + `salesorder` webhook
- [x] `POST /api/wo/:id/fg/:fgId/qty` `{ qty }` (rescale by `perUnitQty`, committed guard, BomRevision, `wo.fgqty`) / `{ ack:true }` (`so.qty.dismissed`)
- [x] List `soQtyChanged` pill; Details banner per FG with Apply / Dismiss; History labels
- [x] Deploy to Dev (2026-09-28, with CR-245)
- [x] User verify (MSUN, 2026-09-28): SO line qty edited in Books → WO list shows the red arrow (CR-245) via the webhook
- [ ] User verify (MSUN): WO Details banner "now N", History "Sales order quantity changed"; Apply → BOM lines rescaled, revision +1; with reserved stock and a lower qty → refused with the guard message; Dismiss clears the arrow only
- [x] Books workflow rule for Sales Orders (MSUN, 2026-09-28): webhook POST `/internal/zoho-event?type=salesorder&orgId=60077990319`, header `X-Sync-Secret`, Raw JSON body `{"salesorder_id": "${SalesOrder.SalesOrder ID}"}`; rule = Sales Orders · Edited · any field. Default/form payloads are not parsed by the function — Raw JSON only

### CR-203 — Replace defective material + Store issues page (branch `feat/zoho-field-mapping`)
- [x] `DefectReturn` table via Catalyst MCP (Dev); `OrgSetting.storeIssueEmail` key; `wo.defects` permission
- [x] `workorder/blocks.js` (block list, pure + self-check) wired into `tracking-options`, `planLines`, `confirmTxn.assertPicksAllowed`, `createTransferOrder` auto-pick, grid column B
- [x] `workorder/defects.js` `raise` / `action` / `list` / File Store photo; `bom.applyLineOp` lifted from `POST /:id/lines`; `inventoryApi.createInventoryAdjustment`
- [x] Routes: `POST /:id/replace`, `GET /defects`, `POST /defects/photo`, `GET /defects/:id/photo`, `POST /defects/:id/action`
- [x] Materials grid **Replace** tab → defect dialog (reason, photo, replace-with) → picker → Assign replacement (Reserve & Issue / Raise PR); `WoDefectsPage` + nav + badge; `RowMenu items`; History labels
- [x] Self-checks: `blocks.js`, `txn.js`, `grid.js`, `perms.js`, `inventoryApi.js`, `bom.js`, `soFields.test.js`; frontend build
- [x] Deploy to Dev (2026-09-26, with CR-230)
- [ ] Set **Store issue email** in Settings → Work Order → Alerts; grant `wo.defects` to the Store Issue Manager role
- [ ] User verify (MSUN, a WO with an issued batch-tracked line): Replace 1 unit with reason + photo → TO Issue → Main, Store issues lists it with the photo, email received, WO History "Defective material replaced"; Reserve picker no longer offers that batch qty; Assign replacement → Reserve & Issue creates two TOs; Store issues ⋮ Repaired → batch usable again; Inventory adjustment → Zoho adjustment created (verify the payload Zoho accepts — body is logged on rejection), stock snapshot reduced; Return to vendor → stays blocked
- [ ] Negative: Replace on a Completed WO → 409; a reserve pick naming a blocked serial → refused; photo > 5 MB → refused client-side

### CR-202 — Assembly: delete/undo + Assembly tab with serials (branch `feat/zoho-field-mapping`)
- [x] `WoAssembly.zohoTransferOrderId` / `zohoTransferOrderNumber` via Catalyst MCP (Dev); `assembleFg` stores them
- [x] `zoho/inventoryApi.js` `deleteTransferOrder` / `deleteBundle`
- [x] `workorder/assembly.js` `deleteAssembly` (Zoho TO → bundle → local row, FG progress recomputed, `fg.assemble.delete` activity); `listAssemblies` returns `serials[]` + `transferOrderNumber`
- [x] `DELETE /api/wo/:id/assembly/:asmId` (`wo.action.assemble`)
- [x] `WorkOrderPage.jsx`: Assembly tab — item, Assembly #, qty, TO, serials one per line + Copy, ⋮ Delete assembly via `ReasonModal` (reason required, in the audit trail); card stretches to the tab bottom; History label
- [x] Self-checks (`assembly.js`, `inventoryApi.js`) + frontend build
- [x] Deploy to Dev (functions + client, 2026-09-23)
- [ ] User verify (MSUN WO-0026): Assembly tab lists the assembly with all serials, Copy pastes `KGV2026001, KGV2026002, …`; ⋮ → Delete → Zoho TO and bundle gone, stem back at Issue, FG 0/3 and status blank, History "Assembly deleted"; re-assemble gets fresh serials
- [ ] Negative: delete on a Completed/Closed WO → 409; Zoho refusal (FG invoiced) → error toast, row stays

### CR-201 — Assembly: Zoho 2056 "entered all the batches" at qty > 1 (branch `feat/zoho-field-mapping`)
- [x] Live probe against MSUN Zoho: payload replayed fine at qty 1, reproduced 2056 at qty 3; per-unit `quantity_consumed` at qty 3 accepted (probe bundles deleted)
- [x] `zoho/inventoryApi.js` `createBundle`: `quantity_consumed` = line total ÷ units (4 dp); bundle body logged on every Zoho rejection
- [x] Self-checks: `inventoryApi.js --selftest`, `assembly.js --selftest`
- [x] Deploy to Dev (functions, 2026-09-22)
- [ ] User verify (MSUN): WO-0026 → Assembly → KGV FG qty 3 → Select batch (stem FIFO 555 × 1 + 9999 × 2) → Proceed Assembly → "Assembly WO-0026-A1 created — 3/3 assembled · serials … · moved to Main by TO-xxxxx"; Zoho bundle lines show `quantity_consumed` 1 / total 3; stem Issue balance 0
- [ ] Closes CR-176's "pending user verify" (explicit picks) once the above passes

### CR-200 — Quote Maker reads the Component Map (branch `feat/zoho-field-mapping`)
- [x] `recipe/componentMap.js` `selectedFromValues`; `push.js componentLines` uses it (no behaviour change)
- [x] `POST /api/recipe/component-map/resolve` accepts `{ skuItemId }`
- [x] `widget.html`: `hasRecipe` gate, `resolveComponents` per added line, component rows under the cart card, loose components as own lines removed with the valve
- [x] Self-tests: `componentMap.js --selftest`, `push.test.js`; widget scripts parse
- [x] Deploy to Dev (functions, 2026-09-22) — `/widget` serves the new code, unauthenticated resolve → 401
- [ ] API verify (Ricon): resolve `{skuItemId}` of the RAVH 100 S-Square Loose-motor item → castings + gear `inBooks`, motor `asQuoteLine`; bogus id → 404; MSUN session → add-on gate
- [ ] CRM verify (Ricon Quote): search "RAVH 100" → Add → component rows under the card, motor line auto-added (Trading, × map qty); remove the valve → motor line goes; push → Quoted_Items has both. MSUN: no change, no extra request
- [ ] Deferred: shared widget code extraction (separate CR); loose-line qty following the valve qty

### CR-199 — SKU → CRM Product: fixed Product Type / Item Classification (branch `feat/zoho-field-mapping`)
- [x] `widget.html` + `configurator.html`: `fixedProductPicks()` by field label, merged into the new-Product payload
- [x] Deploy to Dev (functions, 2026-09-22, shipped with CR-200)
- [ ] CRM verify: push a quote line with a **new** SKU → Products record shows Product Type = goods, Item Classification = Finished Good; if the Products module lacks either field, nothing is sent and the push still succeeds

### CR-198 — Materials grid: qty box always editable (branch `feat/zoho-field-mapping`)
- [x] `MaterialsGrid.jsx` `GridRow`: no `disabled` on the qty box; over-cap red + MAX-at-0 grey kept
- [x] Deploy to Dev (2026-09-22)
- [ ] User verify (MSUN): WO-0026 → Details → De-reserve: every box editable; type 1 → red border → Proceed Release → "only 0 is reserved" toast, no MT created. Return tab: type 1 → Proceed Return → MT confirmed + TO

### CR-197 — Ricon: drop RAVS150 demo recipe, RAVH 100 S-Square recipe (branch `feat/zoho-field-mapping`)
- [x] Ricon org: demo recipe 69851000000296717 + 4 components + 12 options + 4 cost elements deleted via Catalyst MCP
- [x] Ricon org: Draft recipe 69851000000291888 `RCP-RAVH100-SSQ` — 6 components, CI options 55/23/1/1 kg, 4 cost elements
- [x] Demo seed removed: `seedData.js`, `POST /seed-demo`, Recipes "Seed RAVS150 demo" button, Materials hint
- [x] Deploy to Dev (2026-09-22)
- [ ] User verify (Ricon): Recipes lists only "RAVH 100 S-Square" (Draft), no seed button → open → 6 components in sheet order → Materials & costing: CI on the 4 castings 55/23/1/1 → Test tab all CI: Casing 3850, Side Cover 1610, Brg Cover 70, Gland 70, Motor/Gear 0
- [ ] Ricon: Motor / Gear pricing rule (bought-out items — no material option today)

### CR-196 — Deal → Quote from widgets: Quote_Stage always Draft (branch `feat/zoho-field-mapping`)
- [x] `widget.html` + `configurator.html`: `Quote_Stage: 'Draft'` on the Deal → Quote insert
- [x] Deploy to Dev (2026-09-22)
- [ ] User verify (MSUN): Deal → widget → Create quote → new Quote shows stage **Draft**; both SKU Quote and Product Configurator widgets

### CR-195 — Ricon product configuration: RM by MOC, loose motor, map import (branch `feat/zoho-field-mapping`)
- [x] `ComponentMap.asQuoteLine` column (Dev, via MCP)
- [x] `recipe/componentMap.js` passes `asQuoteLine`; `push.js componentLines` drops such lines from the composite; `routes/recipe.js` accepts the field
- [x] `POST /api/recipe/seed-rav-map` — Motor supply question + 7 sample rows by caption / answer / item name
- [x] `configurator.html`: separate-line tag + own cart line per flagged component (`widget.html` untouched)
- [x] `RecipeComponentMapPage.jsx`: "Goes as" column + field; Excel/CSV Import (parse in browser, POST 5 at a time)
- [x] Deploy to Dev (2026-09-22)
- [x] Ricon data: Industry "Books items" (69851000000296726) + Import from Zoho → 56 items imported, 19 skipped (no SKU / already linked)
- [x] `POST /api/recipe/seed-rav-map` as the Ricon user → 7 rows, `Motor supply` added (69851000000297722), `notFound` empty
- [x] 27 more rows posted from Ricon's item names: motor BBL/CG × IE2/IE3/IE4/FLP × Fitted/Loose, Gear Elmech Inline Helical / Warm, Chain/Direct/Couple Drive, Coating Service (service item, RAVH 100 S-Square), rotor strips (RAVH 100 S-Square), Shaft seal-Air Purge, SOV with timer, Proximity sensor, Inlet/Outlet Companion flange (qty = answer) — 34 rows total
- [ ] User verify: widget RAVH 100 / RAVH-S Square / CI / 0.5 HP BBL IE2 / Elmech NMRV / Motor supply=Loose → 4 castings + gear listed, motor "separate line"; Add → 2 cart lines; push → composite = castings + gear (KG); Fitted → motor inside, 1 line; Bare Shaft → no motor row, nothing missing
- [ ] Ricon: remaining Model × MOC weights via Component Map → Import
- [ ] Deferred: Bare Shaft hides Motor Make/Type (`Property.showIf`) — only if sales keep filling them; Motor HP from TPH — needs Ricon's rule; sheet says Gear type Inline Helical for item "Gear Elmech NMRV" — confirm

### CR-192 — Quote T&C templates as an org setting (branch `feat/zoho-field-mapping`)
- [x] `OrgSetting.settingText` text column added (Dev, via MCP)
- [x] `routes/crm.js`: `/api/crm/estimate-terms` GET + template CRUD + shared bank (writes need `estimate` perm)
- [x] Settings → Quote T&C page (`EstimateTermsSettingsPage.jsx`): named templates, copy/rename/delete, Save; seeds Domestic/Export on first open
- [x] `EstimatePage.jsx`: T&C template dropdown (remembered per quote/deal); Edit T&C = this print only
- [x] `estimateTerms.js`: `sanitizeHtml` on all loaded terms; localStorage + `TERMS_VERSION` removed
- [ ] Deploy to Dev
- [ ] User verify: Settings → Quote T&C shows Domestic + Export; edit + Save → visible on a quote print in another browser; new customer template selectable on the print; in-place edit gone after reload
- [ ] Production: add `settingText` column before promoting
- [ ] Deferred: auto-pick a template per CRM Account (needs an Account→template mapping) — add when picking by hand gets tedious

### CR-191 — Quote print: Offer Prepared By + contact block (branch `feat/zoho-field-mapping`)
- [x] `estimateParser.js`: `header.preparedBy` from Quote `Created_By.name`; self-test extended
- [x] `EstimatePage.jsx`: "Offer Prepared By" (Classic) / "Prepared By" (Template 2), hidden when blank
- [x] `estimateTerms.js`: Kamal row removed, Dipan → Sales Head, MARUTI OFFICE → (+91) 7574857881 / Office; `TERMS_VERSION` bumped (resets saved T&C edits)
- [ ] Deploy to Dev
- [ ] User verify: quote print shows the creator's name in both designs; last sheet has 2 contact rows with the new values; print geometry unchanged

### CR-190 — WO print: Material Issue Copy (branch `feat/zoho-field-mapping`)
- [x] `woIssueCopy.js` `combineIssued()` — one row per material across all confirmed issues/FGs, returns tracked separately; self-test
- [x] `WorkOrderPage.jsx`: ⋯ → Print Material Issue Copy; `IssueSlip` title + conditional Issued/Returned/Net columns
- [ ] Deploy to Dev
- [ ] User verify: WO with the same material issued on ≥2 FGs → one row, summed qty; WO with nothing issued → toast; History single slip unchanged

### CR-189 — Books-sheet import: category → property value, auto-create values, Item ID link (branch `feat/zoho-field-mapping`)
- [x] `booksMapping.js`: `ALIASES` — `Category Name` auto-maps to the `Category` property; self-test extended
- [x] `booksImport.js`: `ensureValues()` find-or-create `PropertyValue` (reuses `autoCode` from `zoho/import.js`); `valuesCreated` on the result
- [x] `Item ID` → `SKUItem.zohoItemId`; `Already imported` dedupe before the SKU check; digits-only guard; self-test extended
- [ ] Deploy to Dev
- [ ] User verify: import `sample_items.xlsx` into an industry with a `Category` List property → `Category Name` pre-selected, new values appear in Property Manager with auto codes, blank-SKU rows get generated SKUs; re-import → every row "Already imported"; with auto-push on, Books item is updated not duplicated

### CR-188 — Packing list sheet per MSUN reference PDF: pages stretch to the bottom (branch `feat/zoho-field-mapping`)
- [x] `packing.html`: `buildSheet()` + `paginateSheet()` — fixed-height A4 portrait pages, repeated header, `.pl-fill` stretch, `Page No.:- NN of NN`, closing totals/declaration/signatory block on the last page
- [x] Rows per PDF: SR NO per package, TOTAL NET per package, fixed column widths; title font fix
- [x] Headless-Chrome render of 39 sample packages → 3 full pages, no overflow page
- [x] Widget zip rebuilt
- [x] Deployed to Dev (2026-09-18); live `/packing` carries `paginateSheet`
- [ ] **Manual:** re-upload the zip in Books (covers CR-186/187/188)
- [ ] User verify on a real SO: Export + Domestic print; a package with more items than fit one page is not split (known ceiling, marked `ponytail:` in `paginateSheet`)

### CR-187 — Packing list: packages numbered per type (branch `feat/zoho-field-mapping`)
- [x] `packing.html`: `kindNo` / `kindTotal` — grid, sheet PACKING DETAILS and sticker `N OF M` all count per type; single running series removed
- [x] `packing.html`: blank consignee name/address/PO in a saved plan refill from the live SO/invoice (same fallback the consignor already had)
- [x] Widget zip rebuilt (`books-widget/dist/packinglist.zip`)
- [x] Deployed to Dev (2026-09-18)
- [ ] User verify: Pallet, Wooden Box, Pallet → Pallet 1, Wooden Box 1, Pallet 2; pallet sticker `01 OF 02`

### CR-186 — Packing list: portrait sheet, Type in column 2, per-item ✕, no ↑↓ (branch `feat/zoho-field-mapping`)
- [x] `packing.html`: `printHtml(html, landscape)` injects `@page` — sheet portrait, stickers landscape
- [x] `packing.html`: Type select moved to column 2; per-item ✕; ↑/↓ + `move()` removed
- [x] Widget zip rebuilt (`books-widget/dist/packinglist.zip`), `app/widget.html` identical to `packing.html`
- [x] Deployed to Dev (2026-09-18)
- [ ] **Manual:** re-upload `books-widget/dist/packinglist.zip` in Books → Settings → Developer Space → Widgets
- [ ] User verify: Print = A4 portrait (10 columns fit), Print Stickers = A4 landscape; ✕ removes one item only

### CR-184 — Widgets always save to SKU master; switch = Books push; composite BOM = configured RM (branch `feat/zoho-field-mapping`)
- [x] `routes/skuItems.js` — `widgetAutoPush` / `OrgSetting cfgNoAutoPush` (old `cfgNoAutoCreate` ignored)
- [x] `widget.html` + `configurator.html` — **Push to Books** box; item always created; unticked → *NEW — NOT PUSHED*
- [x] `zoho/push.js` — RM1/RM2 padding removed, `requireBomLines` (<2 lines → error), legacy placeholders dropped on re-push; `push.test.js` updated
- [x] `SkuSettingsPage.jsx` — "CRM widgets: push new items to Zoho Books immediately"
- [x] Checked in the local preview: both widgets with the box off → item row exists, `zohoItemId` empty, no push call; setting round-trip
- [x] Deployed to Dev (2026-09-18); live `/widget` and `/configurator` carry the Push to Books box
- [ ] User: recreate `GV-032-S4-HO-2` (Quote Maker no-match → Create & add to lines, or SKU Generator page) and push it
- [ ] User verify (MSUN): flag the properties whose values are Books items → push a Manufacturing SKU → composite BOM = those values, no RM1/RM2; a config with <2 flagged values → clear error, item stays unsynced in SKU Items
- [ ] Studio Sairish / Fabric (CR-165 case): one flagged property → push now errors — needs a second flagged property or a manual Books line

### CR-183 — Quote Maker widget: same item auto-creation switch (branch `feat/zoho-field-mapping`)
- [x] `widget.html` — **Create item** checkbox in the create card (default from `configuratorAutoCreate`), quote-only branch, *QUOTE ONLY* cart badge, button/title wording follows the switch
- [x] `SkuSettingsPage.jsx` — setting relabelled "CRM widgets: auto-create new items"
- [x] Checked in the local preview (fake CRM SDK): switch off → line added, 0 items created
- [x] Deployed to Dev with CR-182 (2026-09-18); both widget pages serve the new switch
- [ ] User verify (MSUN): default unchanged — no-match search → Create & add to lines still creates + pushes; untick → quote-only line, nothing in SKU Items / Books

### CR-182 — Product Configurator: item auto-creation setting (branch `feat/zoho-field-mapping`)
- [x] `routes/skuItems.js` — `configuratorAutoCreate` in GET/PUT `/settings` (`OrgSetting cfgNoAutoCreate`, blank = on; absent field = unchanged)
- [x] `SkuSettingsPage.jsx` — "Product Configurator: auto-create new items" checkbox
- [x] `configurator.html` — per-line **Create item** switch (new SKUs only), default from the setting; off → *QUOTE ONLY* line, no SKUItem, no Books push
- [x] Checked in the local preview: setting round-trip, switch off → line added, 0 items created
- [x] Deployed to Dev (2026-09-18)
- [ ] User verify: SKU Settings → untick → Save → CRM widget opens with Create item unticked; tick it for one line → that item is created

### CR-194 — Product Configurator: component items from the answers (Component Map) (branch `feat/zoho-field-mapping`)
- [x] Schema via Catalyst MCP (Dev): `ComponentMap` table
- [x] `recipe/componentMap.js` — `matchComponents` (most-specific row wins, qty from answer, `missing`) + `--selftest`
- [x] `routes/recipe.js` — `/component-map` CRUD + `POST /component-map/resolve`; `perms.js` route map
- [x] `zoho/push.js` — component lines in the composite BOM, fail loudly on missing / not-in-Books, mapped items in the re-push pool
- [x] App: **Component Map** grid (`/recipe/component-map`), `RowMenu` Duplicate
- [x] `configurator.html` — component list under the SKU (show only; `widget.html` untouched)
- [x] Checked: `componentMap.js` / `sizing.js` / `calc.js` / `perms.js` self-tests, `push.test.js`, `npm run build`
- [ ] Deploy to Dev (`catalyst deploy`)
- [ ] API check on Dev: generic + specific row → specific wins; flange row with qty-from-answer; required component with no row → `missing`
- [ ] Ricon: import component items from Books into SKU Items, fill the Component Map (body casting / rotor / motor / gearbox / accessories / flanges)
- [ ] User verify in CRM: answer all → component list under the SKU, changes when MOC flips CI → WCB; Add → quote has one valve line
- [ ] User verify: Push ON for a new valve → Books composite BOM = mapped components with qty; a manual BOM line survives a re-push; component not in Books → clear error, quote line still added
- [ ] Later, if the map runs to hundreds of rows: Excel import of map rows

### CR-181 — Product Configurator: CRM widget step 1 — questions + RAV sizing + SKU/item on demand (branch `feat/zoho-field-mapping`)
- [x] `recipe/sizing.js` — `selectModels` (Req. Cap, next size up per series, ties, `tooBig`, required speed) + `--selftest`
- [x] Schema via Catalyst MCP (Dev): `SizingModel` table, `Property.sizingRole`
- [x] `routes/recipe.js` — `/sizing-models` CRUD, `POST /sizing/select`, idempotent `POST /seed-rav`; `perms.js` `recipe.sizing`; `routes/properties.js` `sizingRole`
- [x] `configurator.html` at `GET /configurator` — feed data → suitable models → questions → SKU → existing/new item → Quote (auth/cart/write-back copied from `widget.html`, which is untouched)
- [x] App: nav *Product Configurator* / *Product Designs* / **Sizing Models** grid (`/recipe/sizing`), *Sizing role* dropdown in the property editor, `recipe.sizing` in Users & Roles
- [x] Checked: `sizing.js` / `calc.js` / `perms.js` self-tests, new routes in-process against a Data Store stub, `npm run build`
- [x] Deployed to Dev (functions + client, 2026-09-17); `/configurator` and `/widget` both serve 200
- [ ] Ricon org: enable `sku-generator` + `recipe-engine`, connect Zoho, **Sizing Models → Load RAV defaults**, grant `recipe.sizing` / `recipe.configure` roles
- [ ] Ricon CRM: Setup → Widgets → External hosting `…/server/skuapi/configurator` → detail-page button on Quotes and Deals
- [ ] User review of seeded guesses: value SKU codes + SKU positions, Motor HP ladder, Rotor Strip 4th value (sheet cut off), CB model names (`RAVH CB <capacity>`), sanitary 3.80 = `RAVS 150`?, `RAVH 900.70` under CB
- [ ] User verify in CRM: 5 TPH / 0.60 / 20 RPM / Drop through → Req. Cap 6.94, four series at 7.35 (Round Old shows RAVH 200 + RAVH 250D), runs at 18.9 RPM; IC → "Above the largest" note
- [ ] User verify: answer all → NEW ITEM → Add → item in SKU Items + Books, quote line carries answers + Req. Cap + Required Speed; same answers again → EXISTING ITEM, no duplicate
- [ ] **Next step (needs rules from user):** MOC → cast-grade map per component (SS304→CF8? 304L→CF3? 316→CF8M? 316L→CF3M? IC grades); then `SizingModel.recipeCode` → widget Rate from `computeQuote` + Books composite BOM from `bomLines` (replaces RM1/RM2 placeholders); cost elements `FAB` + `BLD_CHAMFER`; Motor HP / Gear Model defaults per model; Y/N accessories + flange qty as optional components; RM create-missing in Books; fold the SKU Generator nav into Product Configurator
- [x] Costing sheet: CI casing 55 kg shows 4400 but 55×70 = 3850 (4400 is FG260's rate; WCB 6600 is SGI's) — **user confirmed 2026-09-17: mistake in the sheet**; the engine's rate × cast weight (3850 / 5500) is correct, nothing to change

### CR-180 — Item type labels + CRM `Item_Source` in the quote widget (branch `feat/zoho-field-mapping`)
- [x] `routes/skuItems.js` — `typeLabels` in GET/PUT `/settings` (OrgSetting `skuTypeLabelTrading` / `skuTypeLabelManufacturing`, blank = Direct Purchase / In-House Manufacturing)
- [x] `SkuSettingsPage.jsx` — label text box beside each type radio, stored value in brackets
- [x] `SKUItemsPage.jsx`, `SKUGeneratorPage.jsx` — labels in pill / filter / edit drawer / type toggle
- [x] `widget.html` — type badge on cart lines; `Item_Source` written on the CRM Product (create + refresh) when the field exists; "Item Source"/"Item Type" plain subform columns filled via `paramVals`
- [x] Deployed to Dev (functions + client, 2026-09-16)
- [ ] User verify: SKU Settings → labels default to Direct Purchase / In-House Manufacturing, edit + Save + reload persists, clear → default returns
- [ ] User verify: SKU Items grid → pill, Type filter and edit drawer show the labels; filtering by Direct Purchase returns Trading items
- [ ] User verify: CRM Quote → widget → add a line → grey type badge on the line → Add item to Quote → open the Product in CRM → Item Source = Direct Purchase (Trading item) / In-House Manufacturing (Manufacturing item); repeat with an already-existing Product (refresh path)
- [ ] User verify: set a label to a value not in the CRM picklist → push shows "product fields not updated" warning, line still lands

### CR-179 — Zoho sign-in `Platform not allowed` on the IN DC (branch `feat/zoho-field-mapping`)
- [x] `zoho/auth.js` `getAuthUrl(forceConsent, dc)` + `routes/zohoAuth.js` `GET /auth/zoho?dc=` — consent leg can start on the user's DC
- [x] `session.js` `setDcCookie`/`readDcCookie` — `zdc` cookie set on successful exchange, read by `GET /auth/zoho`
- [x] `LoginPage.jsx` — "Zoho India account?" link → `/auth/zoho?dc=in` (popup-aware)
- [x] Deployed to Dev (functions + client, 2026-09-16)
- [ ] User verify (Studio Sairish / IN account): login page → "Zoho India account?" link → lands on `/app/` signed in; second sign-in from the plain Zoho button also works (cookie)
- [ ] If it fails the same way: api-console.zoho.com → client `1000.HHGW…` → type Server-based, Settings → Multi-DC IN on + "same OAuth credentials" on, redirect URI `/app/` present; else raise with Zoho support (first failure 16 Sep 13:17 IST, last success 15 Sep 16:39 IST)

### CR-177 — Serial prefix from the item's `cf_valve_type` (branch `feat/zoho-field-mapping`)
- [x] `serial.js` — pure `prefixFromItem` (api_name / label fallback, `value_formatted ?? value`, code before the dash); `serialPrefix` tries it first via `booksApi.getItem`
- [x] `serial.test.js` extended
- [x] Deployed to Dev (functions + client, 2026-09-16)
- [ ] Verify: WO-0024 → Assembly → Proceed → prefix prefilled from the FG's *Items* value (e.g. `KGV`) without typing; an FG without the CF still falls back as before

### CR-176 — Batch/serial picks for assembly components (branch `feat/zoho-field-mapping`)
- [x] `assembly.js` — `componentQtys` (4-dp rounding) + `applyPicks` (`trackingProblem` per line, 400 `details[]`) before any Zoho call; preview returns `components` + `fromWarehouseId`; `--selftest`
- [x] `inventoryApi.js` `createBundle` — explicit `tracking` wins, FIFO fallback; `txn.js` exports `trackingProblem`
- [x] Routes — `/tracking-options` accepts `fromWarehouseId` without `type`; `POST …/assemble` body `components`
- [x] `AssembleModal.jsx` — Proceed fetches pools sequentially, `TrackingPicker` (exported from `MaterialsGrid.jsx`) replaces the modal for tracked lines, Confirm posts picks
- [x] Deployed to Dev (functions + client, 2026-09-16)
- [ ] Verify: WO-0024 → Proceed Assembly → picker lists each batch-tracked RM with Issue-warehouse batches, FIFO prefilled; change a batch split, Confirm → Zoho bundle lines carry the chosen batch ids; FG still moved to Main; serial range in the toast
- [ ] Verify: picker Cancel returns to the modal with qty/prefix intact; mismatched pick (sum ≠ qty) → red toast per line, no bundle, no serial burned
- [ ] Regression: Materials tab Issue/Return picker unchanged

### CR-175 — Assembly single-location fix: bundle at Issue + FG Transfer Order to Main (branch `feat/zoho-field-mapping`)
- [x] `zoho/inventoryApi.js` — bundle header location = Issue warehouse; selftest passes
- [x] `assembly.js` — FG Transfer Order Issue → Main after the bundle (best effort, `transferOrderNumber` / `transferWarning`)
- [x] `AssembleModal.jsx` — toast shows the TO number or the warning
- [x] Probed Zoho directly: payload validates end to end; 900001 transient. `createBundle` trimmed to header `location_id` only + one retry on 900001 (body logged)
- [x] Deployed to Dev (functions + client, 2026-09-16)
- [ ] Verify: WO-0024 → Assembly → Proceed → bundle created (batch 888 + Dummy consumed from Issue), toast "moved to Main by TO-xxxxx"; Zoho: composite stock +1 in Head Office, 0 in Issue; serials on the FG
- [ ] Verify: if the TO fails (e.g. location permission), the assembly still records, red toast names the cause, FG stock sits in Issue

### CR-174 — Assembly tab: Ready / Pending sections + partial qty (branch `feat/zoho-field-mapping`)
- [x] `MaterialsGrid.jsx` — `readyFgs` / `pendingFgs` split; `AssemblyPanel` two sections, Assemble-now input + MAX, Proceed carries qty
- [x] `AssembleModal.jsx` — `fg.initialQty` seeds the quantity field
- [x] Frontend build passes; deployed to Dev (client + functions, 2026-09-16)
- [ ] Verify: WO-0024 → Details → Assembly → "Ready for assembly · 1" row with Assemble now = Remaining; type a smaller qty → Proceed Assembly → modal opens with that qty → confirm → Assembled bumps, row stays with the new Remaining
- [ ] Verify: type 0 or more than Remaining → input red, Proceed disabled; MAX restores Remaining
- [ ] Verify: WO with an unissued FG → listed under "Pending for assembly" with "N line(s) not fully issued", no button

### CR-173 — SO `cf_work_order_no_and_date` stamp + next-stage hint (branch `feat/zoho-field-mapping`)
- [x] `booksApi.js` — `stampSalesOrderWo` (`PUT /salesorders/{id}/customfields`), `SO_WO_CF`
- [x] `soFields.js` — `soWoStamp(wo)`; test extended, passes
- [x] `routes/workorder.js` — stamp on create (failure → `problems`), clear on Cancel + Draft delete, self-heal on `GET /wo/:id`; picker ignores Cancelled WOs
- [x] `woCommon.jsx` — `StatusChip ghost`, `NextStage`; `WorkOrderPage.jsx` header hint
- [x] Frontend build passes (2026-09-16)
- [x] Deployed to Dev (functions + client, 2026-09-16)
- [x] Verify: create WO on a confirmed SO → Books rejected the plural path (SO-00039, "Invalid URL Passed", 2026-09-28) → fixed in CR-247
- [ ] Verify: cancel that WO → CF blank; new-WO picker lists the SO again; create again → CF shows the new number
- [ ] Verify: edit WO date → reopen the WO → CF date follows (self-heal)
- [ ] Verify: header shows `DRF ─▶ Ready For Machining` on a Draft, updates per stage, nothing on Closed/Cancelled, resume target on Hold

### CR-172 — Details → Assembly action tab (branch `feat/zoho-field-mapping`)
- [x] `status.js` — `ASSEMBLABLE = MATERIAL_OK`; selftest passes
- [x] `formulas.js` — `fullyIssued(rows)`; selftest passes
- [x] `assembly.js` — `assembleFg` builds the grid and 409s unless fully issued
- [x] `AssembleModal.jsx` — moved out of `WoItemsTab.jsx`; button reads Proceed Assembly
- [x] `MaterialsGrid.jsx` — `assembly` action + `AssemblyPanel`; `WorkOrderPage.jsx` passes `status`
- [x] Frontend build passes (2026-09-16)
- [ ] Deploy to Dev (functions + client)
- [ ] Verify: WO-0024 → Details → action group shows Assembly (user with `wo.action.assemble`); the fully-issued FG is listed with Ordered / Assembled / Remaining; Proceed Assembly → modal prefilled to remaining + serial preview → confirm → toast with bundle no, Assembled bumps, FG drops off once Closed
- [ ] Verify: FG with an unissued line → not listed, empty-state text; POST `/wo/:id/fg/:fgId/assemble` for it via API → 409 "issue all material first"
- [ ] Verify: WO on Hold → row listed, no Proceed button; WO at Ready for Machining with everything issued → assembly allowed
- [ ] Verify: Item List tab has no ⚙ Assemble button, still shows "Assembled x/y"

### CR-171 — WO rail without customer + one-step-back status moves (branch `feat/zoho-field-mapping`)
- [x] `status.js` — `BACK` map + `prevStatuses(wo)`, folded into `nextStatuses`; selftest passes
- [x] `routes/workorder.js` — GET `/wo/:id` returns `prevStatuses`
- [x] `WorkOrderPage.jsx` — rail line 2 = Due date · Due Days (no customer); ⋯ menu shows `← Stage`
- [x] Build + deploy to Dev (2026-09-16, functions + client)
- [ ] Verify: rail items show WO no + status chip, then "Due <date> · <days>", no customer
- [ ] Verify: WO in Fitting in Progress → ⋯ has `→ Ready For Dispatch` and `← Ready For Fitting`; pick ← → chip updates, Activity logs from/to; Ready for Machining has no ←; Completed shows only → Dispatched

### CR-170 — WO review: PO extra split + Head Office delivery, reserve-all cap, picker MFG date, Received chip, stage dates (branch `feat/zoho-field-mapping`)
- [x] `purchase.js` — `splitExtra` (required keeps SO, excess is extra without); both PO paths deliver to `wh.main`; selftest passes
- [x] `status.js` + `routes/workorder.js` — `DATE_GATE` on entry (RFM: machining required + fitting optional; FIP: fitting required); `needDate` returns `fields[]`; selftest passes
- [x] `MaterialsGrid.jsx` — joint stock cap in `fillAvailable` (reserve only); MFG date column hidden for Reserve; `ReceiptChip` hidden once `needed === 0`
- [x] `WorkOrderPage.jsx` — multi-field `DateModal`; header labels Machining Date / Fitting Date
- [x] Build + deploy to Dev (2026-09-16, functions + client)
- [ ] Verify: WO → Purchase → PR line required 2, set 4, Confirm → Books PO has qty 2 (SO in cf_so_no) + qty 2 "Extra" (no SO); both lines' location = Head Office
- [ ] Verify: Purchase page → By item → raise → PO lines land in Head Office
- [ ] Verify: Details → Reserve on a batch-tracked item → picker has no MFG date; Issue → column back
- [ ] Verify: WO with 2 FGs sharing an item, stock < both needs → Reserve everything available fills FG1 fully, FG2 the remainder / nothing; Proceed Reserve → no error toast
- [ ] Verify: line fully received + fully reserved → no Received chip; not yet reserved → chip shows
- [ ] Verify: → Ready for Machining asks Machining Date (required) + Fitting Date (optional); left blank → Ready for Fitting → Fitting in Progress asks Fitting Date; filled on the first modal → no second prompt; Machining in Progress → Ready for Fitting no longer prompts

### CR-168 — Packing List: grid cleanup + portrait stickers (branch `feat/zoho-field-mapping`)
- [x] `packing.html`: select arrow gone, number spinners gone, L/W/H 48px, per-item ✕ removed, stickers A4 landscape scaled to fill the page (flex column, 22/32/64px type)
- [x] Widget zip rebuilt; Dev deploy 2026-09-16 (functions)
- [ ] Verify: `/server/skuapi/packing?soId=<id>` — Type box reads "Wooden Box" cleanly, L/W/H have no arrows, Print Stickers is landscape, one page per box, box size + "01 OF N" fill the bottom of the page
- [ ] **Manual:** re-upload `books-widget/dist/packinglist.zip` in Books → Settings → Developer Space → Widgets

### CR-166 — Push-to-Zoho dialog defaults in SKU Settings (branch `feat/zoho-field-mapping`)
- [x] `routes/skuItems.js` — `skuPushTracking` / `skuPushAccountId` settings; push route falls back to them
- [x] `SkuSettingsPage.jsx` — "Push to Zoho Books defaults" section; `SKUItemsPage.jsx` — dialog opens on the defaults
- [x] Build + deploy to Dev (2026-09-16, functions + client)
- [ ] User to verify: Settings → SKU Settings → pick None + an account → Save; SKU Generator → Push to Zoho → dialog preselects them; change them in the dialog → that push uses the changed values, the setting stays

### CR-165 — Manufacturing push: pad a short BOM with RM1/RM2 (Zoho code 2056) (branch `feat/zoho-field-mapping`)
- [x] `zoho/push.js` — `padMappedItems`; composite create pads < 2 lines with RM1/RM2 (by name, created once if missing); self-check passes
- [x] Deploy to Dev (2026-09-16, functions only)
- [ ] User to verify (Studio Sairish): Push to Zoho on `FC-HM-CN-FD-PN-20-001` → composite in Books with Handloom + RM1 + RM2; re-push keeps RM1/RM2
- [ ] Optional: Property Manager → Loom Type → untick "Create values as items" if the composite should carry RM1/RM2 only

### CR-167 — Packing List: L/W/H fields + Wt/pc from item master (branch `feat/zoho-field-mapping`)
- [x] `routes/packing.js`: `weightKg()` + `fillWeights()` → `line.weightPc` from Books `package_details`; selftest passes
- [x] `packing.html`: L/W/H numeric inputs (`dimsOf(b)` → `dims` string, legacy split on load), Wt/pc auto-fill on item pick / new item, in-place Net recalc
- [x] Widget zip rebuilt (`books-widget/dist/packinglist.zip`)
- [x] Dev deploy 2026-09-16 (`catalyst deploy`, also carried CR-160–166 WIP)
- [ ] Verify: open `/server/skuapi/packing?soId=<id>` — pick an item → Wt/pc = Books "Weight" CF (205 kg on the WCB Knife Edge Gate Valve), Net updates; L/W/H print as `SIZE (cm):- L X W X H`; old saved plan reopens with the three fields filled
- [ ] **Manual:** re-upload `books-widget/dist/packinglist.zip` in Books → Settings → Developer Space → Widgets; make sure items carry a Package weight in Books (Item → Package details) or Wt/pc stays 0

### CR-164 — Packing List: qty cap, multi-item packages, 4 package types, stickers, consignor defaults (branch `feat/zoho-field-mapping`)
- [x] Schema: `PackingBox.grossWeight` double via Catalyst MCP; `kind` → wooden/corrugated/pallet/loose (legacy `box` = wooden); `OrgSetting.companyEmail` key
- [x] `routes/packing.js`: `KINDS`/`kindOf`, per-package `grossWeight`, `toLine().size` from the item "Size" CF, `source.reference` from SO/invoice `reference_number`, consignor fallback to Books `GET /organizations/{orgId}`; selftest extended
- [x] `packing.html`: multi-item package grid (rowspan package cells, `+ item`), `packedQty`/`overPacked` block Save + Print + Print Stickers, red ⚠ summary, single package numbering, per-kind footer tally, `buildStickers()` + `.stk` print CSS, P.O NO / consignor email prefill
- [x] Widget zip rebuilt (`cp functions/skuapi/packing.html books-widget/app/widget.html && cd books-widget && zip -rD dist/packinglist.zip plugin-manifest.json app -x "*.DS_Store"`)
- [ ] Dev deploy (`catalyst deploy`) + verify: open `/server/skuapi/packing?soId=<MSUN SO>` — consignor block prefilled from the Books org profile, two-item box saves/reloads, over-pack blocks, Print Stickers gives one landscape page per package with "01 OF N"
- [ ] **Manual:** re-upload `books-widget/dist/packinglist.zip` in Books → Settings → Developer Space → Widgets (delete old widget first); optionally set Company details (name/address/email) in WO Settings to override the Books profile

### CR-163 — Manufacturing push: value items need a SKU (Books code 2112) (branch `feat/zoho-field-mapping`)
- [x] `zoho/push.js` — `valueItemSku(name)`; `pushValueToZoho` create sends it; self-check passes
- [x] Deploy to Dev (2026-09-16, functions only)
- [ ] User to verify (Studio Sairish): SKU Generator → `FC-HM-CN-FD-PN-20-001` → Push to Zoho → composite created in Books with "Handloom" (SKU `HANDLOOM`) as its associated item; Property Manager → Loom Type re-save backfills `Powerloom` too
- [ ] If Books still says 2112 after this, the org rejects the SKU *format* — pull the exact body from the Network tab and compare with a hand-made item in Books

### CR-161 — WO header: QC Not Applicable, TC Required, SO logistics fields, Special Instruction (branch `feat/zoho-field-mapping`)
- [x] Schema: `WorkOrder.freightCharge` / `delivery` / `booking` / `transporter` / `tcRequired` varchar(255) via Catalyst MCP
- [x] `workorder/soFields.js` — 4 logistics labels in `CF_MAP`; `soFields.test.js` extended
- [x] `routes/workorder.js` — create stores `tcRequired`, PUT whitelist, detail serves the five, status accepts `NotApplicable`
- [x] Client — header tuples, QC modal *Not Applicable*, Edit TC select + Special Instruction label, create page TC select + label
- [x] `npm run build` + deploy to Dev (2026-09-15)
- [ ] User to verify: WO whose SO carries the four CFs shows them in the header; blank CF → "—"
- [ ] User to verify: Edit → TC Required Yes + Special Instruction text persists after reload; print sheet says "Special Instruction"
- [ ] User to verify: → Completed shows Not Applicable / Rejected / Passed; Not Applicable completes and header shows *QC Status: Not Applicable*

### CR-160 — WO status lifecycle: machining / fitting / dispatch stages + Hold (branch `feat/zoho-field-mapping`)
- [x] Schema: `WorkOrder.heldFrom` varchar(50) via Catalyst MCP (69851000000277763); Dev remap 7 MAP → ReadyForMachining, 2 InProgress → MachiningInProgress
- [x] `workorder/status.js` — FLOW / DONE / HOLDABLE / MATERIAL_OK / DATE_GATE / ASSEMBLABLE / `nextStatuses`; selftest passes
- [x] `routes/workorder.js` — status route: Hold/resume with reason, approval-off Draft exit, completion-date gate (`needDate`), assembly gate, cancel de-reserve sweep, QC Rejected records only; reopen → Dispatched; detail returns `heldFrom` + stage dates
- [x] `workorder/txn.js` — auto-bump removed, reserve/issue gated on MATERIAL_OK, Hold blocks moves, `autoReturnOnComplete({ types })`; `assembly.js` at ReadyForDispatch; `alerts.js` skips Dispatched
- [x] Client — chips, ⋯ Put on Hold / Resume, `ReasonModal`, `DateModal`, Close WO at Dispatched, stage dates on header card, Assemble at RFD, History labels
- [x] `npm run build` passes
- [x] Deploy to Dev (2026-09-15)
- [ ] User to verify: Draft WO → ⋯ shows *→ Ready For Machining* (only if approvals off), *⏸ Put on Hold*, *Cancel*; Reserve on a Draft → red toast "move it to Ready for Machining…"
- [ ] User to verify: Ready For Machining → Reserve/Issue work and the chip stays RFM; *→ Machining In Progress* → *→ Ready For Fitting* opens the date modal → save → status moves, header shows *Machining Completed*
- [ ] User to verify: Hold from any stage → reason → chip HLD, material actions 409, ⋯ shows only *▶ Resume (…)* → back to the prior status; History has *Put on hold* / *Resumed from hold*
- [ ] User to verify: Ready For Dispatch → ⚙ Assemble visible (not earlier); *→ Completed* before assembling → 409 "not assembled yet"; after assembly → QC Passed → Completed; QC Rejected → chip stays RFD
- [ ] User to verify: Completed → Dispatched → Close WO; Reopen (admin) → Dispatched; Cancel a WO with reserved lines → de-reserve TO toast, issued qty untouched
- [ ] User to verify: existing WOs show RFM (was MAP) / MIP (was IP) in the list

### CR-159 — WO header trim, due date = SO Expected Shipment, FG Size, single-item BOM fallback (branch `feat/zoho-field-mapping`)
- [x] Schema: `WorkOrderFG.fgSize` varchar(100) via Catalyst MCP (69851000000277727)
- [x] `workorder/soFields.js` — due date = Expected Shipment; machining/fitting/"WO Due Date" CFs retired; `USER_OWNED` = priority; test rewritten, passes
- [x] `workorder/bom.js` — `itemSize`, `selfLine`, `requirementLines` (empty composite → the item itself); selftest passes
- [x] `routes/workorder.js` — create fetches Size per FG, no project/costs; `GET /:id` lazy Size backfill + `fgs[].size`; PUT whitelist trimmed; `bom/preview` uses `requirementLines`
- [x] `workorder/grid.js` — `fgSize` on each grid, `shortCount` removed
- [x] Client — New WO Schedule = read-only due date; header card / Edit modal / print / issue slip / list drop project, machining, fitting, costs; `fgLabel()` in both FG selects; Details group header shows Size
- [x] `npm run build` passes
- [x] Deploy to Dev (2026-09-15)
- [ ] User to verify: WO-0022 → ⋯ Refresh BOM → preview shows one line (the valve itself × 15) → Apply → Item List and Details show it; Reserve works on it
- [ ] User to verify: New work order → pick an SO → Schedule shows only *Due date* = the SO's Expected Shipment; created WO's *WO Due Date* equals *Expected Shipment*
- [ ] User to verify: WO header has no Project / Machining / Fitting; ✎ Edit shows Date, Priority, Notes only; Print / PDF has no cost line
- [ ] User to verify: an FG whose Books item has a *Size* custom field → both FG dropdowns read "Name · Size × Qty"; Details group header shows *Size …* instead of "N lines not in stock"

### CR-158 — MFG batch filter in the batch/serial picker (branch `feat/zoho-field-mapping`)
- [x] `MaterialsGrid.jsx` — `TrackingPicker`: MFG batch text filter above the item cards; non-matching batch rows hidden, hidden rows keep their typed qty
- [x] `npm run build` passes
- [x] Deploy to Dev (2026-09-15)
- [ ] User to verify: WO → Details → Reserve → Proceed Reserve → type part of an MFG batch in the picker: only matching rows remain, `n/qty selected` still counts hidden rows, Proceed submits them; clear the box → all rows return

### CR-157 — WO Refresh stock scoped to the work order + per-row item refresh (branch `feat/zoho-field-mapping`)
- [x] `sync.js` — `workingSet(…, woId)` / `reconcileOrg({ woId })`; `routes/workorder.js` — `POST /refresh?woId=`
- [x] `MaterialsGrid.jsx` — Refresh stock passes `woId`; ⟳ in the In stock cell → `POST /items/:itemId/sync-stock`; both reloads keep typed quantities
- [x] Data: WO-0017 five Labour service lines removed via the line-remove API (revisions 4–8)
- [x] `npm run build` passes
- [x] Deploy to Dev (2026-09-15)
- [ ] User to verify: WO-0017 → Details → *Refresh stock* only touches this WO's items (Network tab: `/api/wo/refresh?woId=…`); a row's ⟳ next to In stock fires one `sync-stock` call and the In stock figure updates; Item List no longer shows the five Labour lines

### CR-156 — WO page: one header row, one Details toolbar row, no Proceed Purchase (branch `feat/zoho-field-mapping`)
- [x] `WorkOrderPage.jsx` — ✕ and ⋯ (+ Close/Reopen/Approve) on the WO-number row; header, info card and tab paddings trimmed
- [x] `MaterialsGrid.jsx` — chips / From→To / search / "everything available" folded into the action row; Proceed Purchase + `requestPurchase()` removed; toolbar and confirm-bar padding 8px
- [x] `npm run build` passes
- [x] Left rail row: second line = Customer · Due date (WO date dropped)
- [x] Header info card: 7-column grid on wide screens (14 fields = two full rows), wraps below ~1200px
- [x] Details toolbar: chips before the FG select so they sit on the selector's line
- [x] Toolbar split: row 1 selector · chips · Refresh · ≡; row 2 FG · warehouses · search; bulk-fill button beside Proceed in the confirm bar
- [x] Confirm bar idle text + sync line removed; move label ("Main → Reserve warehouse") shown there instead of in the toolbar
- [x] Deploy to Dev (2026-09-15, six passes)
- [ ] User to verify: WO-0018 — one header line, no gap before Details, chips beside Refresh stock, more grid rows visible; Raise PR → footer *Proceed Raise PR* still raises the PR

### CR-155 — Assemble modal: editable serial prefix + serial preview (branch `feat/zoho-field-mapping`)
- [x] `workorder/serial.js` — `normalizePrefix`; `serialPrefix` returns `""` instead of throwing; `serial.test.js` extended, passes
- [x] `workorder/assembly.js` — `checkAssemblable`, `resolvePrefix`, `previewAssembly` (no commit), `assembleFg(…, prefix)`
- [x] `routes/workorder.js` — `GET /:id/fg/:fgId/assemble/preview`; POST body `prefix`
- [x] `WoItemsTab.jsx` AssembleModal — prefix field (prefilled), "Will assign …" line, Create gated on a clean preview
- [x] Deploy to Dev (functions + client, 2026-09-15)
- [ ] User to verify: WO-0015 → ⚙ Assemble → Prefix `DCOMPO`, line `Will assign DCOMPO2026001`; type `KGV` → `KGV2026001`; type `K-G` → red error, Create disabled; create → toast serials `KGV2026001`, Zoho composite's serial list shows it, `OrgSetting serialSeq = "2026:1"`
- [ ] User to verify: Zoho-native FG (SKU `D.I - Knife Edge Gate Valve`) → modal opens with Prefix `D`; correct to `KGV`

### CR-154 — Assembly bundle: Zoho auto-numbers Reference# (branch `feat/zoho-field-mapping`)
- [x] `zoho/inventoryApi.js` `createBundle` — `POST /bundles?ignore_auto_number_generation=true`; on a second 4097 retry without `reference_number`; selftest passes
- [x] Deploy to Dev (2026-09-15, functions only)
- [x] WO-0015 (org 743418751) reopened Closed → Completed from the back end for the live assembly run (ActivityLog `wo.reopen` written)
- [ ] User to verify: ⚙ Assemble on WO-0015 → bundle created, toast `DCOMPO2026001`; Zoho bundle shows Reference# `WO-0015-A1` (flag accepted) or Zoho's own number (fallback path)
- [ ] Then the CR-150 KGV/BV serial checks

### CR-153 — CRM widget: record writes fire workflow / blueprint / approval (branch `feat/zoho-field-mapping`)
- [x] `functions/skuapi/widget.html` — `CRM_TRIGGER` const; four `Trigger: []` → `Trigger: CRM_TRIGGER` (Products insert/update, Quotes/Deals subform update, Deal → Create Quote insert)
- [x] Memory: every Zoho CRM write carries the trigger list (widget `Trigger` / REST body `trigger`)
- [x] Deploy to Dev (2026-09-15, functions only)
- [ ] User to verify: add a line to a Quote via the widget and Deal → Create Quote → the quote-time workflow/approval that was failing now fires

### CR-152 — Reserve pass: WO-0019 M.S Yoke, picker MFG columns, sticky header, Books Web Tab, non-composite SO lines (branch `feat/zoho-field-mapping`)
- [x] `workorder/formulas.js` — H no longer subtracts G (billed PO qty lands in Main = B); selftest updated, passes
- [x] `routes/workorder.js` — `POST /:id/txn` cancels its draft when `confirm` throws (no more orphan Drafts); WO create seeds a `self` line for non-composite SO items
- [x] `zoho/inventoryApi.js` — `mfgBatch`/`mfgDate`/`expiry` on the pool, oldest MFG date first; picker pool = source stock only + pool-level `elsewhere`; selftest passes
- [x] `MaterialsGrid.jsx` — picker columns Batch · MFG batch · MFG date · Available · Take; sticky `th`; `index.css` `.grid-table` clip-path
- [x] Books Web Tab: `frontend` build copies dist → `functions/skuapi/app/`; `index.js` `frameable` + `express.static('/app')`; cookie `SameSite=None; Partitioned`; `POST /auth/adopt`; LoginPage popup handshake when framed; App.jsx deep-link redirect top-level only
- [x] `npm run build` passes; deploy to Dev (2026-09-14)
- [ ] **Manual (Dhiraj):** Zoho Inventory → give the connected user permission on the **Reserve** location (the six failed WO-0020 confirms were Zoho's "no permission for Reserve location")
- [ ] **Manual (Dhiraj):** Books → Settings → Web Tabs → URL `https://sku-gen-octfis-925638796.development.catalystserverless.com/server/skuapi/app/` (keep the trailing slash)
- [ ] User to verify: WO-0019 M.S Yoke shows 0 in Head Office because WO-0020 holds 4 (TO-00021) — receive stock or de-reserve on WO-0020, then Reserve works; an item with a billed PO + stock on hand reserves the full needed qty
- [ ] User to verify: Reserve CF8 KGV Body 50mm → picker shows MFG batch / MFG date, oldest first, no 0-available rows; first open: if MFG columns are all "—", read the raw `/items/batches` keys from the Network tab and fix the spelling in `batchRecordsToPool`
- [ ] User to verify: long BOM → Details header stays while scrolling; other grids keep rounded corners
- [ ] User to verify: Web Tab renders the app; "Sign in with Zoho" opens a popup, popup closes, app signed in inside the tab, survives reload; top-level `/app/` login unchanged
- [ ] User to verify: new WO from an SO with a plain (non-composite) goods line → Details shows that item as its own line (qty = SO qty) → Reserve moves it Main→Reserve
- [ ] Later: Refresh BOM on a `self`-seeded FG errors "not a composite" — hide the button for `source: self` FGs if it bothers anyone

### CR-151 — Block Completed while material is reserved + "… Completion Date" labels (branch `feat/zoho-field-mapping`)
- [x] `workorder/reports.js` — `reservedRows` (C > 0); selftest passes
- [x] `routes/workorder.js` — `POST /:id/status` → `Completed` 409s while any row has reserved > 0; grids loaded once for Complete + Close gates
- [x] `WorkOrderPage.jsx`, `WorkOrderNewPage.jsx` — labels `Machining Completion Date` / `Fitting Completion Date`; `WoItemsTab.jsx` banner wording
- [ ] Deploy to Dev (functions + frontend)
- [ ] User to verify: WO with one line reserved, not issued → `→ Completed` → QC Passed → red toast "1 item is still reserved (…) — issue or de-reserve before completing", status unchanged, no Transfer Order; issue the line → Completed goes through
- [ ] User to verify: QC Rejected on the same WO → back to InProgress with no reserved error; labels read "… Completion Date" on detail, edit and New WO

### CR-150 — Assembly at Completed + FG serial series `PREFIX+YYYY+NNN` (branch `feat/zoho-field-mapping`)
- [x] `workorder/serial.js` — `formatSerials`, `advanceSeq`, `serialPrefix` (Valve Type value code), `nextSerials` (OrgSetting `serialSeq`, commit after Zoho); `serial.test.js` passes
- [x] `workorder/assembly.js` — assemble only at `Completed`, QC bump removed, serials → bundle + `WoAssembly.serialNumbers`, `serialRange` in response/list
- [x] `zoho/inventoryApi.js` — `finishedProductFields` (explicit serials), composite-endpoint fallback for tracking flags; selftest passes
- [x] `WoAssembly.serialNumbers` (text 10000, 69851000000277358) added via Catalyst MCP
- [x] `WoItemsTab.jsx` — Assemble only at Completed; serial range in toast + previous assemblies
- [x] Deploy to Dev (functions + frontend, 2026-09-14)
- [ ] User to verify: WO with a KGV composite FG → QC Passed → Completed → ⚙ Assemble appears only now → assemble 2 → toast `KGV2026001–KGV2026002`; Zoho Inventory bundle carries those serials on the finished item; `OrgSetting serialSeq = "2026:2"`
- [ ] User to verify: second WO with a BV FG → assemble 1 → `BV2026003` (shared counter); assemble on an InProgress WO → 409 "complete the work order before assembling"
- [ ] Live check (carried from CR-126): Zoho accepts `finished_product_serial_numbers` on the serial+batch-tracked composite; `account_id` not demanded

### CR-149 — Service items never reach a work order (branch `feat/zoho-field-mapping`)
- [x] `zoho/inventoryApi.js` — `isService()`; `updateCompositeItem` carries the live composite's service rows over on every push (PUT replaces `mapped_items`)
- [x] `workorder/bom.js` — `linesFromComposite` drops services; selftest passes
- [x] `routes/workorder.js` — `/so/:soId` sends `productType`; `POST /` skips service SO lines into `problems`; `/items` typeahead hides services
- [x] `WorkOrderNewPage.jsx` — service SO lines hidden from the FG pick list
- [x] Deploy to Dev (functions + frontend, 2026-09-14)
- [ ] User to verify: new WO from the SO whose composite carries "Body Labour 50mm" → Details grid / Item List show goods only; Refresh BOM → Apply (push on) → composite in Zoho still lists the labour row; Items tab search "Labour" → no hit
- [ ] Existing WOs that already carry the labour line: Refresh BOM → Apply removes it (nothing reserved, so not blocked)

### CR-148 — Batch picker lists every batch with where the stock sits (branch `feat/zoho-field-mapping`)
- [x] `zoho/inventoryApi.js` — pure `batchRecordsToPool` keeps per-location balances; `listSerialsBatches` keeps zero-at-source batches + `elsewhere`; `createTransferOrder` returns internal picks so txn notes print `111 × 2` again (was `undefined × undefined`); selftest extended, passes
- [x] `MaterialsGrid.jsx` — picker renders every batch, `N in <warehouse>` under a 0, disabled Take when nothing at source, red header hint; no-batches text only when the item has no batch records at all
- [x] Deploy to Dev (2026-09-14)
- [x] Second pass after "same error": live Zoho probe → detail batches use `balance_quantity` (unread → 0 → dropped) and gated off the live call; alias added, batch items always read live records; functions redeployed 2026-09-14
- [ ] User to verify: WO with CF8 KGV Body 50mm → Reserve → Proceed → popup lists 12 (2), 13 (3) and 11121221 (2) available at Head Office, 111 greyed with "2 in Reserve"; pick 2 → TO created, MaterialTxn note shows the batch × qty

### CR-147 — CRM widget: newline description, Size on the line, Create Quote only + on top (branch `feat/zoho-field-mapping`)
- [x] `functions/skuapi/widget.html` — `lineDesc()` newline-joins `Caption: Value`; `colVal()` API-name fallback for column ↔ property matching (both `customRow` and `applyParamCols`); Deals hides Push-to-Deal, `Create Quote` is primary; action block moved above the lines list
- [x] Size root cause (live-verified): `Quoted_Items.Size` mirrors `Products.Size`; line-level writes ignored. `findOrCreateProduct` now writes parameter fields + newline Description onto the Product (create + refresh existing). Deployed to Dev 2026-09-14
- [x] Quotes button relabelled "Add item to Quote" (static; dynamic "Push N lines" label removed)
- [ ] Manual (Dhiraj): popup title bar "sku-generator" → rename the widget in CRM console (Setup → Developer Space → Widgets → sku-generator → "Quote Maker"; then Quotes/Deals → Links & Buttons → button label) — same open item as CR-115; not removable from code
- [x] Deploy to Dev (2026-09-14, functions only)
- [ ] User to verify: Quote → button reads "Add item to Quote"; push a sized item → Description one line per parameter, SIZE (INCH) subform column filled; Deal → only Create Quote visible, stays on screen with 15+ lines; `/#/estimate?quoteId=…` shows specs as lines + size in SIZE (INCH)
- [x] Retest (quotes …2218109 / …2218132): Product fields written (Size `1/2" | DN15`, Design, Connection, description verified via API); line `Size` still empty — it is an **associated** subform field (auto-filled from `Products.Size` in the UI only); `applyParamCols` now skips associated columns; estimate parser confirmed the line prints `1/2" DN15` from the description
- [x] Third retest (quote …2189047): line Size still null with Product Size set → CRM never auto-fills associated subform columns via API. Product-write failures now surfaced as warnings (popup stays open), bare-product fallback on insert
- [ ] Manual (Dhiraj): CRM Setup → Customization → Modules → Quotes → Quoted Items subform → **Size** → edit → remove the "associate with Products.Size" mapping (plain single-line text). Then push once more: the widget's line write lands and SIZE fills
- [ ] After that push, read the status line: any "product fields not updated — INVALID_DATA {api_name}" warning names the Products picklist whose options need the catalog value added (Ball Valve item failed silently on 2026-09-14)
- [ ] Later: delete the unreachable Deals branch of `pushLines()`/`discoverSubforms()` (`ponytail:` note) if the Deal push never returns

### CR-146 — CRM widget: compact filter rows + value popover (branch `feat/zoho-field-mapping`)
- [x] `functions/skuapi/widget.html` — filter panel cards (label + inline select) replaced by slim clickable rows (number badge, name, selected value, ✕ to clear); clicking a row opens one shared anchored popover: value list ("— Any —" + options, filter input when >9 options) for List params, free-text input (applied on Enter/close) for Range/Manual params; Esc/outside click closes. State contract unchanged (detached select/input per param, `syncChipsFromPanel` untouched downstream)
- [ ] Manual (Dhiraj): popup title bar "sku-generator" → "Quote Maker" — CRM console rename (see CR-115 open task: Setup → Developer Space → Widgets + Quotes → Links & Buttons); not settable from code
- [ ] Deploy to Dev + verify in CRM popup (all params visible without scrolling; row → popover → pick; ✕ / Clear all; param search still filters rows)

### CR-145 — CRM widget: no search-box chips, default item type setting, Deal → Quote (branch `feat/zoho-field-mapping`)
- [x] `functions/skuapi/widget.html` — filter chips removed from `#searchbar` (dropdown keeps the selection); Type option relabeled "Manufacturing (Finished Goods)"; `#c-type` preselects from org settings; `#quote-btn` (Deals only) creates a new Quote directly from the cart lines, linked to the Deal — Deal record untouched; parameter values (Size etc.) written into the quote line Description on both quote paths
- [x] `routes/skuItems.js` — `defaultItemType` on settings GET/PUT (`OrgSetting` `skuDefaultItemType`)
- [x] `SkuSettingsPage.jsx` — Default item type radios; `SKUGeneratorPage.jsx` preselects it (edit mode wins)
- [x] Selftests + frontend build pass
- [x] Deploy to Dev (2026-09-12)
- [ ] User to verify: no chip on filter select, widget/generator preselect Manufacturing after saving the setting, Deal → Create Quote (subform rows + Quote in the Deal's related list with account carried over)

### CR-144 — By-Item PR links + Associated WO toggle + inline PR editor (branch `feat/zoho-field-mapping`)
- [x] Backend: `prId` on "Requested" breakdown entries (routes/workorder.js + purchase.js)
- [x] `PurchaseTab.jsx` — PR card extracted to exported `PrCard` (WO-agnostic)
- [x] `WorkOrderPurchasePage.jsx` — `selectedPr` + `PrEdit`, `woSummary` → PR links + "Associated WO ▾", Requests row click opens consolidated PRs
- [x] Selftests + frontend build pass
- [ ] Deploy to Dev; verify links, toggle, qty edit on a draft PR, consolidated PR open, PoSplit round-trip

### CR-143 — Recipe → Books composite item push (branch `feat/zoho-field-mapping`)
- [x] Schema via Catalyst MCP: `MaterialType.zohoItemId`/`zohoItemName`, `RecipeTemplate.booksCompositeItemId` (ledger in SCHEMA.md)
- [x] `recipe/calc.js` — pure `bomLines()` (qty × castWeight, dedupe, skip, unlinked) + selftest asserts
- [x] `routes/recipe.js` — materials link fields, reauth→409 in `wrap`, `GET /books-items`, `GET /books-composites`, `POST /recipes/:id/push-books` (stale-link self-heal, CompositeItemCache refresh), new-version copies the link
- [x] `perms.js` — RECIPE_MAP rows for `/books-items` + `/books-composites`; selftest asserts
- [x] `RecipeBuilderPage.jsx` — header "Push to Books" + PushBooksDialog (preview, unlinked warning, composite picker / create-new)
- [x] `RecipeMaterialsPage.jsx` — Books Item column + BooksItemPicker in edit modal
- [x] Selftests + frontend build pass
- [ ] Deploy to Dev; link RAVS150 materials to Books items; push → verify composite `mapped_items` in Books; re-push replaces dummy lines
- [ ] Negative paths: unlinked material 400, deleted composite 409 re-link, new-version keeps pushing to same composite
- [ ] SO with pushed composite → create WO → BOM lines match recipe

### CR-142 — Abbreviated status chips across all grids (branch `feat/zoho-field-mapping`)
- [x] `woCommon.jsx` — `Chip` gains hover `title`; `STATUS_ABBREV`/`PROC_ABBREV`/`abbr()` fallback; new `ZStatusChip` for Zoho lowercase statuses
- [x] `recipeShared.jsx` — `StatusPill` abbreviates (PUB/DRF/SUP/ARC/QTN/ORD) + `title`
- [x] `WorkOrderPurchasePage.jsx` Received/Billed columns + `PurchaseTab.jsx` PO meta rows → `ZStatusChip`
- [x] Frontend build passes
- [x] Deploy to Dev (2026-09-12)
- [ ] User to eyeball WO list, Purchase grids, Recipe list (hover shows full label, e.g. MAP → "Pending Allocation")

### CR-140 — CRM quote widget: 3-column layout, Push button always visible (branch `feat/zoho-field-mapping`)
- [x] `functions/skuapi/widget.html` — `#panes` no longer wraps (footer can't fall off-screen); filter panel → 250px left column with own `#fp-grid` scrollbar; `#searchbar` moved into the middle results column; `#fp-toggle`/`.collapsed` deleted
- [ ] Deploy to Dev (`catalyst deploy` — loader redirects here, no CRM zip re-upload needed)
- [ ] Verify in CRM: add 24 items → "Push 24 lines to Zoho Quote" stays visible; filters scroll independently on the left

### CR-139 — Batch reserve fixes + WO-0017 E2E pass (branch `feat/zoho-field-mapping`)
- [x] `zoho/inventoryApi.js` — `listItemBatchRecords` (`/items/batches?item_id=`, per-warehouse `associated_locations` balance) + `withBatchFallback`; empty-`fromWh.batches` short-circuit fixed in both pool builders; TO `batches[]` now send `out_quantity` (was `quantity_transfer` — Zoho rejected)
- [x] `routes/workorder.js` — `/tracking-options` uses the fallback
- [x] `MaterialsGrid.jsx` — actionable empty-batches picker message
- [x] E2E on WO-0017 via minted session: TO-00014/15/16/17, PO-00032/33 — all CR-138 behaviors verified live; guards verified; selftests pass
- [x] Deploy to Dev (2026-09-11)
- [ ] User to re-check Reserve on CF8 KGV Body 50mm in the UI (batches 111 ×2, 11121221 ×3 should appear)

### CR-138 — WO purchase pass: Req Qty, rail due date, PO name/extra/SO No, drop Row/Panel Type (branch `feat/zoho-field-mapping`)
- [x] `PurchaseTab.jsx` — Req Qty column on PR line tables (`requiredQty`, "—" for extras)
- [x] `WorkOrderPage.jsx` — rail cards show `· Due <date>` (red when `dueDays < 4`); Row Type / Panel Type header cells removed
- [x] `routes/workorder.js` — detail API drops `rowType`/`panelType` + `soCf`; shortfall-by-item tags `salesOrderId` on pending/ordered/draft entries
- [x] `workorder/purchase.js` — PO lines carry `name: rmName` + name-prefixed description; `raiseItemPO` keeps WO shares and emits excess as an unattributed `isExtra` line (scale-down unchanged), passes `soId`; `collapseLines` keyed on `(item, so, isExtra)` with string-boolean normalization; `shortfallByItem` carries `salesOrderId`
- [x] `zoho/booksApi.js` — `createPurchaseOrder` sends line `name`
- [x] Selftest extended (extra-split + `"false"`-string case) — passes; frontend build passes
- [x] Deploy to Dev (frontend build + `catalyst deploy`, 2026-09-11)
- [x] Verified live via CR-139 E2E: PO-00032/PO-00033 carry item names, required/extra split, cf_so_no; detail API drops Row/Panel Type; list carries dueDate (2026-09-11)

### CR-137 — Settings hub `/settings/*` (branch `feat/zoho-field-mapping`)
- [x] `SettingsLayout.jsx` — settings sidebar (sections + search) + nested routes + SKU card landing; sections filtered by addon/perm like the main sidebar
- [x] `OrgSettingsPage.jsx` — org card + Switch Org, Books connection + Reconnect, admin-only AddonAdminPage embed (all from `/auth/me`, no backend)
- [x] `App.jsx` — header gear → `/settings`; Users & Roles/Admin pruned from sidebar, Industries/SKU/WO Settings pruned from account dropdown, Properties from SKU tabs; old routes redirect; default landing `/sku/items`
- [x] `PropertyManagerPage.jsx` breadcrumb → `/settings/sku/industries`
- [x] `npm run build` passes (settings pages = one `SettingsLayout` chunk)
- [ ] Deploy to Dev (frontend build + `catalyst deploy`)
- [ ] Verify live: gear → Org Settings; Switch Org + Reconnect; admin matrix admin-only; SKU cards → series/industries/properties (+ property manager breadcrumb); old URLs redirect; perm-less users get NoAccess/hidden sections; WO settings saves inside the hub

### CR-136 — Numerical series org-wide: Simple / Item-wise modes + settings UI (branch `feat/zoho-field-mapping`)
- [x] `skuSeries.js` — `nextSuffix` optional `base` anchor, `nextSeriesSku` `perBase` LIKE scope; `applySeries` params mode = per-base counter (same params → same name, next number), key-property matching (`skuSeriesKeyProps`/`searchItemIds` reuse) deleted; edit guard covers both modes
- [x] `routes/skuItems.js` — GET/PUT `/settings` drop `seriesKeyProps`
- [x] `SkuSettingsPage.jsx` — Off / Simple series / Item-wise series radios + "Number format" field (digit count = width)
- [x] `SKUGeneratorPage.jsx` — series chip gated by org settings (GET resolves legacy fallback) instead of `industry.seriesStart`
- [x] `IndustriesPage.jsx` — legacy per-industry series checkbox/format/column removed (DB columns stay for the fallback)
- [x] `skuSeries.test.js` — base-anchored cases; passes
- [x] Deploy to Dev (frontend build + `catalyst deploy`, 2026-09-11)
- [ ] Verify live: Item-wise → same combo twice = `-001`, `-002` (no duplicate error); different combo restarts; Simple → industry-wide numbers; Off → no chip/suffix; edit without param change keeps suffix; legacy org (mode unset, `seriesStart>0`) still continuous with radio preselected; bulk import of two identical rows → `-001`, `-002`

### CR-134 — WO packing list + FG dropdown + Item List chip; widget renamed (branch `feat/zoho-field-mapping`)
- [x] `plugin-manifest.json` button name → "Print Packing List" (both locations); zip rebuilt with the CR-131 recipe
- [x] MaterialsGrid (Details tab): always-visible FG dropdown (`All finished goods` + per-FG), filters the grid via `fgSel`
- [x] Items chip → **Item List** (WorkOrderPage TABS + branch); WoItemsTab FG dropdown always renders (single-FG guard dropped)
- [x] WO ⋯ menu "📦 Print Packing List" → `/server/skuapi/packing?woId=<id>` new tab; packing.html standalone boot via query params (ZFAPPS path untouched); `GET /api/packing/doc?woId=` — linked SO → shared `so:` plan, else `wo:<ROWID>` from WorkOrderFG lines, invoice no/date typed manually; `DOC_RE` + selftest cover `wo:`
- [ ] Deploy to Dev (frontend build + `catalyst deploy`)
- [ ] **Manual:** re-upload `books-widget/dist/packinglist.zip` in Books → Settings → Developer Space → Widgets (delete old widget first) — button should now read "Print Packing List"
- [ ] Verify live: WO with SO shares its plan with the Books widget; WO without SO shows FG lines + manual invoice fields, plan persists under `wo:`; Details FG filter + Item List chip work; Books widget regression (invoice + SO pages boot unchanged)

### CR-133 — Bulk item import: no product-type gate, composite import inline (branch `feat/zoho-field-mapping`)
- [x] ImportItemsPage: industry auto-picked (first from `/api/industries`); selector only when >1; steps renumbered 2·Sample/3·Upload/4·Map; Import disabled without an industry
- [x] Composite card is a toggle (not a `/sku/bom` link): inline sample (`downloadBooksSample`) + upload → `parseBooksComposites` → preview + create-missing checkbox → `POST /api/wo/composites/import` (BomTab.jsx reuse; CompositeBomPage untouched)
- [ ] Verify live: single-industry org shows no dropdown; composite export upload → preview → import toasts results

### CR-132 — Bulk item import: one sample + always-on Books mapping (branch `feat/zoho-field-mapping`)
- [x] `readXlsxFile` (BomTab.jsx) swapped `read-excel-file` → SheetJS `xlsx` (lazy import, first sheet only) — real Books exports (streamed zip) and legacy `.xls` now parse; fixes simple + composite import
- [x] `frontend/public/sample_items.xlsx` — trimmed "Item 4.xlsx" (120 headers + 5 rows, Item ID blanked); `sample_items.csv` deleted
- [x] ImportItemsPage: App-template format removed (radios, per-industry template download, `csvDownload`); single flow download sample → upload → map → import (`format:'books'` always)
- [x] `normHeader` also strips export-style `CF.` prefix (booksMapping.js + self-test) — exact-match-only automap kept; 34/39+CF fields automap against the new sample
- [x] Deploy to Dev (sample_items.xlsx serves 200/40KB; note: Catalyst web client 400s HEAD requests, GET is fine)
- [ ] Verify live: upload "Item 4.xlsx" → mapping table with exact fields prefilled, `Rate`/`Usage unit`/`Purchase Rate` blank → map manually → import rows OK; composite BOM upload still parses

### CR-131 — Packing List: Zoho Books widget (branch `feat/zoho-field-mapping`)
- [x] `PackingList` + `PackingBox` tables via Catalyst MCP (ids in SCHEMA.md ledger)
- [x] `getInvoice()` in booksApi.js; `routes/packing.js` (`GET /api/packing/doc`, `POST /api/packing/:docKey` — PUT preflights die at the gateway, selftest); index.js `serveWidget()` helper + `GET /packing` + ungated `/api/packing` mount
- [x] `packing.html` widget: ZFAPPS boot (invoice → salesorder fallback), widget.html auth dance, manual box/pallet rows, packed-vs-ordered summary, Export/Domestic toggle, iframe-srcdoc print
- [x] Deploy to Dev (2026-09-14)
- [x] Books has no External-hosting option (unlike CRM) → `books-widget/` zip package: manifest `service: FINANCE`, locations `invoice.details.button` + `salesorder.details.button`, `widget_type: modal` (per zoho/zoho-finance-ai-widget-rules); button name "Print Export" (renamed "Print Packing List" in CR-134)
- [x] Loader-stub zip failed (dark modal, zero hits on /packing in access logs — Books modal widgets stay hidden until the zip-hosted page itself completes `ZFAPPS.extension.init()`, so a redirect stub never reveals) → zip is now **self-contained**: `app/widget.html` is a build-time copy of `functions/skuapi/packing.html`, which got absolute Catalyst URLs (`CATALYST` const), `APP_ORIGIN` pinned to the Catalyst origin for the auth handshake (App.jsx TRUSTED already allows `.zappsusercontent.*`), and text/plain JSON bodies (CORS-simple, no preflight). Rebuild after widget edits: `cp functions/skuapi/packing.html books-widget/app/widget.html && cd books-widget && zip -rD dist/packinglist.zip plugin-manifest.json app -x "*.DS_Store"`
- [ ] **Manual:** in Books → Settings → Developer Space → Widgets: delete the old widget, upload `books-widget/dist/packinglist.zip`, hard-reload Books; the packing-list button (now "Print Packing List", CR-134) appears on Invoice + SO detail pages (check the ⋯/More menu) — zip rebuilt again for CR-169 (Add package → empty item row), re-upload needed
- [ ] Verify live: invoice with linked SO loads lines; save → reopen restores; same plan from the SO page; Export + Domestic prints match the MSUN reference; invoice without SO falls back to `inv:` key

### CR-130 — Purchasing: "Extra" pill removed + By Item sheet editing (branch `feat/zoho-field-mapping`)
- [x] `ExtraPill` deleted (woCommon) + both PR-line usages (PurchaseTab, WorkOrderPage Purchase documents)
- [x] By Item: vendor/Split ungated from the checkbox; editing qty/extra/vendor/split auto-ticks the row; Enter/Arrow column nav (`data-nav` + one table `onKeyDown`)
- [x] "Purchasing" h1 header bar + meta counts removed (page starts at the toolbar); user rule recorded: no in-page title bars anywhere
- [x] Deploy to Dev (first attempt hit "socket hang up" leaving the old bundle live — redeployed and verified the new hash serves)
- [ ] Verify live: unchecked rows editable, edits tick the row, Enter/arrows walk the qty/extra columns (Enter only in vendor), Raise unchanged, no "Extra" badge on PR lines, no "Purchasing" header

### CR-129 — Purchasing: page title + PR refs on By Item rows (branch `feat/zoho-field-mapping`)
- [x] Page header: drop the "Purchase requests" h1 — single "Purchasing" title (Requests view kept; an accidental removal of it was reverted)
- [x] By Item "Work Orders" column → "Purchase Requests": expand button shows the row's PR number(s) (fallback `N work orders`); the muted pending/PO summary text removed
- [x] Deploy to Dev
- [ ] Verify live: title reads "Purchasing"; a row with a PR shows `PR-nnnn ▾` as the button; Requests/Orders unchanged
- [ ] "Error accessing app": get the affected Zoho email → `Add_User` to the Catalyst Development project (hosting/API confirmed healthy)

### CR-128 — Books import: fixed sample file + field mapping (branch `feat/zoho-field-mapping`)
- [x] `frontend/public/sample_items.csv` (stock Books sample, verbatim) + "Download sample file" for the Books format — same file regardless of product type
- [x] `booksMapping.js` (`autoMap`/`applyMapping`) + node-assert test; Match-fields step (Books fields | file columns, auto-matched by name, Item Name required); rows re-keyed client-side so the import API is unchanged
- [x] Deploy to Dev (sample file verified serving at `/app/sample_items.csv`)
- [ ] Verify: upload a sheet with renamed columns → map manually → rows import with the mapped values

### CR-127 — Zoho Books item-sheet import + auto-push setting (branch `feat/zoho-field-mapping`)
- [x] `SKUItem.booksData` (text) via Catalyst MCP; OCTFIS Demo2 seeded with Fabric/Yarn schemes + 47 codes
- [x] `booksImport.js` (`splitBooksRow` / `pushableBooksFields` / `processBooksImport`) + `booksImport.test.js`
- [x] `POST /api/sku-items/import` `format: "books"` + sequential auto-push hook; `GET/PUT /api/sku-items/settings` (`skuAutoPushImport`)
- [x] `booksApi.createItem/updateItem` `extra` merge; `push.js` booksData → payload, `_gstRate` → `tax_id`
- [x] ImportItemsPage Simple/Composite chooser + Books-format toggle/template/auto-detect; SkuSettingsPage; account-menu "SKU Settings"
- [x] Deployed to Dev; engine verified against the coding sheets' examples (FB-CT-PD-PL-EB-500-220-01, YN-CT-CB-260-S-01) via in-memory harness
- [x] BOM moved from the Order Management submenu to the SKU Generator tab bar (`/sku/bom`; `/wo/bom` redirects). NB: the page still calls `/api/wo/composites` — needs the work-order addon enabled
- [ ] Live verify in OCTFIS Demo2: import `samples/sample-fabric-books-import.csv` + `sample-yarn-books-import.csv`, flip auto-push on, confirm items land in Books with SKU/rate/HSN/unit

### CR-126 — Auto assembly from the WO (branch `feat/zoho-field-mapping`)
- [x] `WoAssembly` table + `WorkOrderFG.assembledQty`/`status` via Catalyst MCP (ids in SCHEMA.md ledger)
- [x] `zoho/inventoryApi.js` `createBundle` (POST /bundles, doc-verified shape; FIFO serial/batch for components — explicit picks since CR-176; generated finished-product numbers for tracked composites)
- [x] `workorder/assembly.js` `assembleFg` (BOM push → bundle → WoAssembly row → FG progress → all-FGs-done ⇒ WO → QualityCheck) + `listAssemblies`
- [x] `POST /api/wo/:id/fg/:fgId/assemble` behind `wo.action.assemble`; FG payload carries progress + assemblies
- [x] WoItemsTab: Assembled x/y + Closed chip + ⚙ Assemble modal
- [x] Deployed to Dev 2026-09-10
- [ ] **Live bundle spike**: assemble 1 unit of a composite FG — verify field names accepted, `account_id` not demanded, component stock leaves Issue, FG stock lands in Main, serial/batch composite gets its generated numbers
- [ ] Verify: partial assembly (3 of 5) → FG stays open; remainder → FG Closed; second FG → WO at QualityCheck; QC Passed → Completed (auto-return) → Close; non-composite FG blocked with clear error

### CR-125 — WO action-level permissions (branch `feat/zoho-field-mapping`)
- [x] 9 `wo.action.*` PERM_KEYS + `assertAction` in `perms.js`; enforced on txn/status-close/approve/PR-PO/assemble routes
- [x] Role editor labels ("WO: …") in UsersRolesPage; `can(user,key)` gating (MaterialsGrid tabs, Close/Approve, PurchaseTab, Assemble)
- [x] Deployed to Dev 2026-09-10
- [ ] Verify: role without `wo.action.issue` → tab hidden AND direct POST 403; no-roles org unchanged; super-admin unaffected; org with roles must tick the new boxes (flag to Haresh)

### CR-124 — Print templates: company block + slips (branch `feat/zoho-field-mapping`)
- [x] `SETTING_KEYS` "Company details" group (name/address/GSTIN/logo URL)
- [x] `PrintHeader` on WoPrintSheet + IssueSlip; from→to warehouse names; Batch/Serial column from CR-123 picks
- [x] Deployed to Dev 2026-09-10
- [ ] Verify: print all five documents (WO, Reserve, De-reserve, Issue, Return) with company details + tracked items

### CR-123 — Batch/serial picker on stock moves (branch `feat/zoho-field-mapping`)
- [x] `MaterialTxnLine.trackingJson` via Catalyst MCP
- [x] `listSerialsBatches`/`trackingToLine` + explicit-tracking `createTransferOrder` (FIFO fallback kept) + selftests
- [x] `GET /api/wo/tracking-options` (routeFor-based source warehouse, FIFO prefill)
- [x] `txn.js` validate/store/confirm with picks; `listTxns` exposes `lines[].tracking`
- [x] `TrackingPicker` modal in MaterialsGrid (auto-opens for tracked lines, mandatory exact-qty picks)
- [x] Deployed to Dev 2026-09-10
- [ ] Verify: serial + batch tracked RMs — non-FIFO picks land verbatim on the Zoho TO; de-reserve/issue offer Reserve stock, return offers Issue stock; untracked flow unchanged

### CR-122 — Purchase pack: Books→WO delta sync, receipt chips, Extra flag (branch `feat/zoho-field-mapping`)
- [x] `PurchaseRequestLine.isExtra` via Catalyst MCP
- [x] `refreshPurchaseOrders` deltas: PO deleted (404-only) / voided / line removed / qty edited → resetPoLines / purchaseQty write-back; `po.sync.*` activity labels
- [x] `ReceiptChip` per line (MaterialsGrid) + WO-header aggregate; `ExtraPill` badges (PurchaseTab, History)
- [x] Deployed to Dev 2026-09-10
- [ ] Verify: edit qty / delete line / void / delete PO in Books → refresh → grid E/F/G + shortfall reappears exactly once + activity entries; receipt chips at 0/partial/full; Extra badge on AddLineRow + By-Item extra raises
- [ ] Gap check (§8): full/partial/select/extra PO-from-WO flows on Dev

### CR-120 — Column chooser + Users & Roles + DateInput (branch `feat/zoho-field-mapping`)
- [x] `GridPref`/`Role`/`UserRole` tables via Catalyst MCP (ids in SCHEMA.md ledger)
- [x] `DataTable.jsx` (DataTable/useGridColumns/ColumnChooser) + `gridCols.js` merge + selftest
- [x] `/api/grid-prefs` routes (org-wide, any user, no addon gate)
- [x] Grid conversions: wo.list, sku.* (4), recipe.* (4); wo.purchase/wo.reports/wo.bom/wo.items batch
- [x] `perms.js` (PERM_KEYS, userPerms cache, requirePerm/prefixPerm, WO_MAP/RECIPE_MAP, selftest)
- [x] Mount gating in `index.js` + `/auth/me` perms + `/api/access` routes
- [x] `UsersRolesPage.jsx` (/access/users), sidebar perm filter, route guards, NoAccess
- [x] `DateInput.jsx` + `dateText.js` + swap of all 8 native date inputs
- [x] Deployed to Dev 2026-09-10 (rode the CR-122–126 deploy)
- [ ] Verify: no-roles org unchanged · "Purchase only" role sees/reaches only Purchase · super-admin unaffected · column layout shared across users · Apply/Cancel semantics · DateInput in modals + estimate print

### CR-119 — Purchase Request follow-ups: Extra column, blue tabs, Orders column swap (branch `feat/zoho-field-mapping`)
- [x] Extra qty column on By Item (both groupings) — raises as a separate unattributed entry (`breakdown: []`) → plain PO line without SO ref; Order Qty lines keep per-SO `cf_so_no`
- [x] Segmented tabs highlight blue + white (app standard)
- [x] Orders view: Work Order column first, PO # swapped into its old slot
- [x] Deployed to Dev 2026-09-09
- [ ] Live verify: raise with Order Qty + Extra → Books PO shows SO-ref lines + one plain line

### CR-118 — Purchase Request screen redesign from reference design (branch `feat/zoho-field-mapping`)
- [x] `WorkOrderPurchasePage.jsx`: page header (Purchasing / Purchase requests + meta counts), segmented pill view + group-by switchers, search box on all 3 views, uppercase grid headers, checked-row highlight, select-all + WO-group checkboxes, borderless vendor selects, floating dark selection bar replaces the pinned raise bar
- [x] Deployed to Dev 2026-09-09
- [ ] Live verify: search, select-all, group toggle, floating bar counts, raise per vendor

### CR-117 — WO create: full page at /wo/new (branch `feat/zoho-field-mapping`)
- [x] `WorkOrderNewPage.jsx` — header + number pill, Sales order / Schedule / Details cards; route `new` in `App.jsx`; list "+ New Work Order" navigates there; CreateModal deleted from `WorkOrderListPage.jsx`
- [x] Backend: `GET /wo/next-number` preview; `POST /wo` persists `notes`
- [x] Deploy to Dev (2026-09-14)
- [ ] Live verify: pill number, SO pick + FG prefill, Days counters, priority segments, notes saved

### CR-116 — WO create: single-form flow, SO combobox, no project name (branch `feat/zoho-field-mapping`)
- [x] CreateModal (`WorkOrderListPage.jsx`): one view — SO searchable combobox at top, SO summary + 3-col header-field grid + FG checklist below; width 860; project name input + payload field removed
- [x] Labels: WO list "Status"→"SO Status", "Procurement"→"Purchase Status" (+ filter labels, rail filter) — display-only
- [x] Deployed to Dev 2026-09-09
- [ ] Live verify

### CR-115 — CRM widget: header removed, card fills popup, single top row (branch `feat/zoho-field-mapping`)
- [x] `#hdr` (brand + quote/org + step indicator) deleted from `functions/skuapi/widget.html`; card full-width/height, `min-height: 560px` dropped so the Push button fits short popups
- [x] Renamed "OCTFIS Quote Maker" (was briefly "OCTFIS - Quote Generator"); title + SKU searchbar + param search share one top row; "Filters N/M set" removed; industry dropdown removed (first industry auto-selected)
- [ ] Manual (Dhiraj): rename the widget/button in CRM console (Setup → Developer Space → Widgets + Quotes → Links & Buttons) — the popup title bar text "sku-generator" comes from there, not our page
- [x] Deployed to Dev 2026-09-09 (served page verified: new markup up, old header/counter/industry select gone)
- [ ] Live verify in CRM: single top row, params load without picking an industry, bottom "Push to Zoho Quote" button visible

### CR-114 — WO status label "Material Allocation Pending" → "Pending Allocation" (branch `feat/zoho-field-mapping`)
- [x] `LABEL_OVERRIDE` in `spaced()` (`woCommon.jsx`) — display-only, status code unchanged
- [x] Deployed to Dev 2026-09-09 (with CR-113; `RecipeComponentAttr` table created via MCP at deploy time)
- [ ] Live verify

### CR-112 — MSUN UI polish batch (branch `feat/zoho-field-mapping`)
- [x] `.grid-table` rounded tables (11 sites) + `CloseX` bare red ✕ (4 sites) + darker active nav/rail (`--blue-mid`)
- [x] WO header: subtitle removed, Project in grid, red due date < 4 days (header + list; list customer/due bold)
- [x] Rail: sticky search + Status/Priority filters, fmtDate'd dates
- [x] Title Case label sweep (headers, VIEWS/tabs + comparisons, buttons, filter labels, CSV maps)
- [ ] Live verify: rounded corners everywhere, rail filters, hover-bold ✕, MSUN eyeball pass

### CR-111 — CRM widget: open filter panel (branch `feat/zoho-field-mapping`)
- [x] 6-col parameter grid above the panes (select per List property, text for Range); N/M counter, param search, Clear all, collapse
- [x] Batched `GET /api/industries/:id/property-values` replaces lazy per-property loads (2 requests per industry pick)
- [x] Deployed to Dev
- [ ] Live verify: 24 params render 6-wide, options visible, select → chip → search narrows, create card unaffected

### CR-110 — MSUN WO: SO-derived header panel + list due/priority (branch `feat/zoho-field-mapping`)
- [x] 8 `WorkOrder` columns via Catalyst MCP (`woPriority` — `priority` reserved)
- [x] `workorder/soFields.js` label-matched CF extraction + test; create capture; detail-open re-sync folded into the `lastViewedAt` write; list/detail serialization
- [x] Detail header 13-field grid; list Due date/Due days columns + priorities filter; `dueDays()`/`<DueDays>`
- [ ] Live verify against a real MSUN SO — confirm the six custom-field labels match `CF_MAP` (adjust one-liners if not)

### CR-109 — CRM quote widget: SKU Studio redesign + create-in-Books (branch `feat/zoho-field-mapping`)
- [x] Reskin per `SKU Widget.dc.html` mock (header + steps, chips, results, quote-line cards); popup `Resize` 1320×780
- [x] Cart: Disc % + reorder + Clear; `Discount` amount in standard-subform write-back, disc aliases for custom subforms
- [x] Create flow: generate → create-item → push-zoho (NEW IN BOOKS / PUSH PENDING badges); manual path kept for filterless create
- [x] `crm-widget/app/widget.html` → redirect stub (legacy — widget is CRM-hosted "External", no zip upload needed)
- [x] Deployed to Dev (`catalyst deploy --only functions`); live at `/server/skuapi/widget`
- [ ] Config: enable `showInWidget` on the **Size** property (+ other wanted filters) per org
- [ ] Live verify: resize honored, create-and-add lands item in Books + line on quote, push-failure path shows PUSH PENDING

### CR-108 — CRM quote widget: property search + dual-subform add (branch `feat/zoho-field-mapping`)
- [x] `Property.showInWidget` column (MCP) + backend + Property Manager checkbox
- [x] Search returns per-item property values (`withValues`); widget redesigned (chips + two panes); metadata-driven write to standard + custom Quotes subforms; rate prefill from CRM Product `Unit_Price`
- [ ] Live verify on a real Quote: `ZOHO.CRM.META.getFields` response shape (SDK v1.2), custom subform discovered, empty-quote add lands rows in both subforms, existing rows preserved
- [ ] Flag the client's search properties (`showInWidget`) and confirm the filter menu shows exactly those

### CR-107 — Fotedar bug batch (branch `feat/zoho-field-mapping`)
- [x] Data: Fotedar Demo `seriesPad=3` + 6 SKUs renamed to 3-digit suffixes (MCP, 2026-09-09)
- [x] Series chip uses the industry's `seriesPad` (was hardcoded `\d{4}`)
- [x] `zohoCfApiName` mapping pushed to Books custom fields (plain + composite paths)
- [ ] Re-push `PKNMULA001` (Fotedar Demo) so the Books item sku drops the extra zero
- [ ] Live verify: pad-3 org shows series chip; mapped custom field lands in Books on push

### CR-104 — Recipe Engine add-on (branch `feat/zoho-field-mapping`)
Full module built: 6 tables (Catalyst MCP, Dev), `/api/recipe` routes with
draft-guarded immutability + snapshot freeze, 7 frontend pages (wizard,
quotations/snapshot/mfg, recipe list/builder, materials master). Detail in
[CHANGES.md](CHANGES.md); tables in [SCHEMA.md](SCHEMA.md).
- [x] Tables + columns via MCP; `recipe-engine` addon key; calc selftest green; frontend builds
- [x] `recipe-engine` enabled for OCTFIS test org 743418751 (OrgAddon row via MCP, 2026-09-05)
- [x] Deployed to Catalyst Dev (`catalyst deploy`, 2026-09-05); `/api/recipe/*` mounted (401 without auth, not 404)
- [ ] Live verify (demo seed removed in CR-197 — use any recipe): builder → new
      version → publish (old → Superseded) → wizard ×10 WCB/CF8 → QTN created →
      change a rate in Materials → snapshot unchanged, fresh calc shows new rate →
      convert → mfg totals (cast wt × qty, grade chips)
- [ ] Later (deferred): nested components UI, qty override in wizard, WO/MRP hook

### CR-099 — Work Order batch from Haresh's feedback (branch `feat/zoho-field-mapping`)
All 17 actionable items implemented (multi-FG grid, warehouse selection + settings
redesign, purchase-flow upgrades, wording, batch notes, issue slip, cross history,
red dot). Full detail in [CHANGES.md](CHANGES.md). Remaining:
- [x] Deploy backend + rebuilt frontend to Catalyst (`frontend/dist` → `catalyst deploy`, 2026-09-04)
- [ ] Live verify: multi-FG WO reserve across 2 FGs → 2 TOs; warehouse override
      lands on the Zoho TO; by-WO raise with 2 vendors → 2 POs; red dot appears
      after a PO receipt and clears on open; issue slip prints batch notes
- [ ] "User and Roles" from the same doc — **not scoped**; needs requirements from Haresh

### CR-096 — CRM widget: SKU picker on Quote pages (branch `feat/zoho-field-mapping`)
Realizes the Quotes half of CR-012. Full detail in [CHANGES.md](CHANGES.md).
- [x] `crm-widget/` zet project — `plugin-manifest.json` + vanilla-JS `app/widget.html`
      (search → cart → quick-create → `ZOHO.CRM.API` find-or-create Products +
      read-merge-write Quote line subform); `zet validate && zet pack` pass
- [x] Backend CORS: origin-reflecting suffix allowlist + `Allow-Credentials`
      ([index.js](functions/skuapi/index.js))
- [x] `App.jsx` OAuth finisher: `window.name === 'sku-auth'` → postMessage + close
- [x] Deleted obsolete `frontend/public/crm-widget.html` (SPA-redirect bootstrap)
- [x] Deploy backend + rebuilt frontend to Catalyst (2026-09-04)
- [ ] **CRM console (Dhiraj), per CR-097 (supersedes the zip upload):** edit the
      "SKU Picker" widget → Hosting **External**, Base URL
      `https://sku-gen-octfis-925638796.development.catalystserverless.com/server/skuapi/widget`;
      Quotes → Links & Buttons → View Page button "Add SKU Items" (~900×600).
      Delete `crm-widget/` once live-verified
- [ ] Live verify: silent/popup sign-in, search, quick-create 409, add-to-quote on a
      throwaway Quote **with existing lines** (proves replace semantics; repeat SKU →
      no duplicate Product); confirm real widget Origin in DevTools → tighten `CORS_OK`
- [ ] Deals flow — still blocked on the CR-012 custom subform decision

### CR-095 — Estimate "Template 2" print design (branch `feat/zoho-field-mapping`)
- [x] `EstimatePage.jsx` — Design toggle (Classic | Template 2), `CSS2` (`est2-` scoped, Arial per the PDF's embedded ArialMT/Arial-BoldMT), `EstimateSheet2` + `Sheet2Chrome` + `ClosingSheet2`, pagination engine reused via existing hooks
- [x] `estimateParser.js` — `validUntil()` (offer date + 15 days) + self-check cases; fixed stale contact-email assertion
- [ ] Verify in dev against a real quote: Classic unchanged, Template 2 matches mockup, multi-page repeat header/footer, Priced/Technical toggle, Print/Save PDF geometry

### CR-094 — Literal series format + default value per property (branch `feat/zoho-field-mapping`)
- [x] `PropertyValue.isDefault` column added via Catalyst MCP (id 69851000000256009); `store.js` `BOOL_COLS` += `isDefault`
- [x] `routes/propertyValues.js` — `POST`/`PUT` accept + persist `isDefault`; `clearOtherDefaults` enforces one-per-property
- [x] `IndustriesPage.jsx` — "Leading zeros" number input replaced by "Number format" text field (`seriesPad = digits.length`)
- [x] `PropertyManagerPage.jsx` — "Set as default value" checkbox in value form, `DEFAULT` badge in value grid
- [x] `SKUGeneratorPage.jsx` — `loadProperties` seeds `initSels` from each property's default (permalink/edit still override)
- [ ] Verify after deploy (Dev): type `00001` → SKUs 5-digit; mark a value default → badge + pre-selected in generator; second default clears the first

### CR-093 — SKU series settings: enable checkbox + leading zeros (branch `feat/zoho-field-mapping`)
- [x] `Industry.seriesPad` column added via Catalyst MCP (id 69851000000260038)
- [x] `skuSeries.js` — `pad` width threaded through `nextSuffix`/`nextSeriesSku`/`stripSuffix`, start always 1; `skuSeries.test.js` green
- [x] `routes/sku.js` + `importItems.js` — derive `pad = seriesPad || 4`; `routes/industries.js` + `store.js` read/write/coerce `seriesPad`
- [x] `IndustriesPage.jsx` — "Allow numerical series" checkbox + "Leading zeros" input with live preview (shared `seriesFields`); row shows first number at width
- [ ] Verify after deploy (Dev): edit industry → check series, leading zeros = 2 → preview `001`, save → generate SKU ends `001`, next `002`; set 3 → new SKUs use `0001`; uncheck → suffix gone

### CR-092 — Bulk item import (branch `feat/zoho-field-mapping`)
- [x] `skuBuild.js` — shared `assemble()` (SKU/Name/Description), `routes/sku.js` `/generate` refactored to use it
- [x] `importItems.js` — `buildResolver` (row → selectedValues, case-insensitive display-value lookup) + `processImport` (sequential, per-row results)
- [x] `routes/skuItems.js` — `POST /api/sku-items/import {industryId, rows}`
- [x] `importItems.test.js` — resolveRow + assemble cases; `node functions/skuapi/importItems.test.js` green
- [x] `ImportItemsPage.jsx` + `/sku/import` route + "Import" SKU tab; frontend build passes
- [ ] Verify after deploy (Dev): Yarn template download → fill 2 spec rows → upload → SKUs match `YNBOCB10RD00` etc.; unknown-value + out-of-range rows fail with typed errors; 20-row series import produces contiguous suffixes, no 409s; then "Push all unsynced" creates them in Books

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
- [x] Pin the quote-line description convention — the widget writes one `Caption: Value` per line (CR-147); tighten the parser once real quotes confirm it
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

### CR-012 — CRM Deal → SKU master item picker (superseded by CR-141)
**Update (CR-141):** shipped. The Quotes widget now also runs on Deals, writing
the **Product Information** subform via the generic label-mapper — the
`Plan_Pricing`-lookup spec below never materialized in CRM and is dropped.
Remaining manual step: add the SKU Picker button to the Deals detail page
(CRM console). Historical spec kept below for reference.
**Update (CR-096):** the picker itself now exists as the Quotes widget in
`crm-widget/` — the Deal flow below is a map entry + subform key away once the
CRM-side subform is created.
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

- [x] Zoho SSAF-T12 New Add-on SKU Generator Enhancement Request (Studio Sairish) — custom field mapping, auto suffix, reuse of property data, Manufacturing / Composite items (CR-008 / 027 / 128, CR-136, CR-189, CR-163 / 165 / 184 / 242); delivered to the client, Closed in Zoho (2026-09-29). Further changes come as a separate task
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
