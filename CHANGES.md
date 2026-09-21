# Change requests & change log

**Every change starts here.** A change request gets a CR id, a section in this
file (newest first) with what was asked, what shipped, and what was deliberately
not done. Schema effects go to [SCHEMA.md](SCHEMA.md); resulting work goes to
[TASKS.md](TASKS.md); structural effects go to [ARCHITECTURE.md](ARCHITECTURE.md).

| CR | Date | Title | Status |
|----|------|-------|--------|
| CR-194 | 2026-09-21 | **Product Configurator: component items from the answers (Component Map)** — user (Ricon): "from the answer we will list the item"; decided with the user: extend `/configurator` (no new widget), show the valve **and its component items**, items come from the add-on DB (`SKUItem`, Ricon's Books items are imported there), rule = a **mapping grid** the user maintains, components are **shown in the widget only** and become the **Books composite BOM**. Shipped: (1) new table `ComponentMap` (`component`, `conditionsJson` `[{propertyId,valueId}]` AND-ed, `skuItemId`, `qty` or `qtyPropertyId` = qty from a Range answer, `required`, `status`). (2) `recipe/componentMap.js` `matchComponents` — pure + `--selftest`: per component the row with the **most conditions wins** (generic `MOC=CI` row overridden by `Model+MOC`), qty ≤ 0 drops the line (flange count 0; an accessory answered N just has no row), `missing` = components with a `required` row and no match. (3) `routes/recipe.js`: CRUD `/component-map`, `POST /component-map/resolve` (one request, one `SKUItem` read; lines carry `inBooks`); `perms.js`: grid → `recipe.sizing`, resolve → `recipe.configure`, `/products` also opens to `recipe.sizing`. (4) `zoho/push.js`: `buildAssociatedItems` appends the matched components (`SKUItem.zohoItemId` × qty, same Books item merged, component wins over a flagged value of the same item) to the flagged-value lines; **fails loudly** on a `missing` required component or a component item not yet in Books; `syncMappedItems` adds every mapped item to the generator-owned pool so a re-push swaps component lines and leaves manual BOM lines alone. (5) App: **Product Configurator → Component Map** grid (`RecipeComponentMapPage.jsx`, `/recipe/component-map`), condition editor offers **SKU-active List questions only** (duty answers are not stored on the item, so the BOM could never evaluate them); `RowMenu` gained an optional **Duplicate**. (6) `configurator.html` only: component list under the SKU in the result panel (red = missing / not in Books); cart and quote write-back unchanged — the quote still gets one valve line. `widget.html` untouched. **Not done:** Excel import of map rows; Rate from component rates; components as quote lines; `SizingModel.recipeCode` stays unread; MOC→grade logic is deliberately not code — it lives in the map rows. | Built, not deployed |
| CR-193 | 2026-09-21 | **Material Issue Copy: big Work Order number** — user sent the paper `WORK ORDER #443` sheet: "Work Order number bigger". Shipped (frontend only): `IssueSlip` in `WorkOrderPage.jsx` prints a centred, underlined 34px **WORK ORDER #&lt;no&gt;** banner under the company header when `txn.type === 'issueCopy'`; follow-up ("arrange the rest of the details as in the image"): the title + loose 12px lines are replaced, for the issue copy only, by a ruled label/value grid like the paper sheet — `MATERIAL ISSUE COPY` block · SO NO / P.O NO · W.O DATE / P.O DATE · SO DATE / **DUE DATE** (16px) · LAST ISSUE (date + movement count); customer name removed from the issue copy on request — and its materials table gets full cell borders. The other four movement slips and the WO sheet are unchanged. No backend/schema change. | 🟢 deployed to Dev 2026-09-21 |
| CR-192 | 2026-09-21 | **Quote T&C templates as an org setting** — the quote print's last-page terms were hardcoded in `estimateTerms.js` with per-browser localStorage edits, so every wording change needed a developer, and terms differ customer to customer. Now: **Settings → Quote T&C** (`EstimateTermsSettingsPage.jsx`, `/settings/quote-terms`, `estimate` perm) manages N named templates (`{ name, terms[] }`) + one shared bank/contact table, reusing the print's in-place `TermsSheet` editor; *+ New* copies the template on screen; first open persists the built-in Domestic/Export wording (CR-191 text) as the org's starting templates. API in `routes/crm.js`: `GET /api/crm/estimate-terms`, `POST/PUT/DELETE …/templates[/:id]`, `PUT …/bank` (writes need `estimate`; rows org+key checked; 9500-char guard vs Catalyst's silent 10000 truncation). Storage: new `OrgSetting.settingText`, keys `estimateTpl` (one row per template, id = ROWID) and `estimateBank`. `EstimatePage.jsx`: new **T&C** dropdown picks the template (remembered per quote/deal in localStorage; Export version preselects the Export-named one); **Edit T&C** is now a this-print-only tweak, never saved. Term text is HTML and now shared org-wide → `sanitizeHtml` allowlist (formatting tags + color only) applied in `normalizeTerms` to everything loaded; self-check extended. localStorage persistence + `TERMS_VERSION` removed. | 🟡 edited locally, not deployed |
| CR-191 | 2026-09-21 | **Quote print: Offer Prepared By + contact block** — MSUN markup on the CRM quote print. Shipped (frontend only): `estimateParser.js` `buildEstimate` maps the Quote's `Created_By.name` → `header.preparedBy` (already in the whole-record `/api/crm/quote/:id` payload); `EstimatePage.jsx` prints **Offer Prepared By** under Offer Preparation Date (Classic) and a **Prepared By** meta row (Template 2), hidden when blank. `estimateTerms.js` `DEFAULT_TERMS.bank`: Kamal Patel row removed; contact rows are now name / mobile / designation / email — Dipan Patel → `Sales Head`, MARUTI OFFICE → `(+91) 7574857881` / `Office` (designation replaces the 2nd number, table stays 4 cells). `TERMS_VERSION` → `2026-09-21`, so every browser's saved T&C edits reset to the new defaults. Self-check extended in `estimateParser.test.js`. No backend/schema change. | 🟡 edited locally, not deployed |
| CR-190 | 2026-09-21 | **WO print: Material Issue Copy** — user: "Issue copy of material for that specific work order. Must include all the items that are issued during the process. Combine the qty if there are more than 1 FG during Issue." Shipped (frontend only): ⋯ menu → **Print Material Issue Copy** on `WorkOrderPage`. `woIssueCopy.js` `combineIssued(wo.transactions)` rolls every **Confirmed** `issue` movement up to one row per `rmItemId` (qty summed across movements and FGs, serial/batch picks concatenated) and returns a pseudo-txn that the existing `IssueSlip` prints (title `Material Issue Copy`, same header/WO·SO·customer line/signature row). Confirmed `return` movements land in a `Returned` column — `Issued / Returned / Net` columns appear only when something was returned; single-movement slips are unchanged. Nothing issued → toast, no print. Self-check `woIssueCopy.test.js`. No backend/schema change. **Deliberately not done:** server-side PDF, other per-stage prints (add when specified). | 🟡 edited locally, not deployed |
| CR-189 | 2026-09-21 | **Books-sheet import: category column maps to the Category property, unknown values auto-register, `Item ID` links the row** — user: "how can we map the SKU to items created during the Excel Import? The respective categories are there in the excel"; decisions: category = a Property value (not Industry), unknown values auto-create, dedupe Item ID then SKU. Shipped: (1) `booksMapping.js` `autoMap` gets an alias table — the Books export's `Category Name` column pre-selects against `Category (Custom Field)` (an exact `Category`/`CF.Category` header still wins; user can re-pick). (2) `booksImport.js` `ensureValues()`: a cell under a List property with no matching `PropertyValue` find-or-creates one (`displayValue`/`name` = cell, `sku` = `autoCode` reused from `zoho/import.js`) before the row resolves — so a blank-SKU row generates its SKU from the new code, and an SKU-given row keeps its category link instead of silently dropping it; result carries `valuesCreated`. (3) `Item ID` added to the mapping list; `splitBooksRow` returns it as `zohoItemId` (all-digits only — an Excel-mangled `2.95E+18` is ignored), an org-scoped match throws `Already imported (Item ID …)` before the SKU check, and the insert stores it — so re-import is idempotent and auto-push **updates** the Books item instead of creating a twin. App-template import (`importItems.js`) stays strict. No schema change. **Deliberately not done:** per-row Industry from the category, `Parent Category`, saved per-org mappings, fuzzy value matching (a typo'd cell makes a junk value — fix in Property Manager). | 🟡 edited locally, not deployed |
| CR-188 | 2026-09-18 | **Packing list sheet follows the MSUN reference PDF: pages fill to the bottom** — user sent `0588 - PACKING LIST` PDF: "the page should stretch till bottom". Shipped in `functions/skuapi/packing.html` (+ Books widget copy, zip rebuilt): `buildSheet()` emits one measurable sheet, new `paginateSheet(doc)` (run in the print iframe's onload) splits it into fixed 279mm A4-portrait `.pl-page`s — consignor/consignee + reference header and column heads repeat on every page, whole packages never split, a blank `.pl-fill` stretches each page to the bottom, `Page No.:- 01 of 04` strip on each, and the closing block (total per package type, TOTAL NO. OF ARTICLE, net/gross, export Declaration, FOR … Authorised Signatory) sits at the foot of the last page. Rows now match the PDF: one SR NO per package, TOTAL NET per package (rowspan) instead of repeating the item weight, fixed column widths. Print iframe is off-screen instead of `display:none` so it can be measured. Also: consignee name/address/PO refill from the live record when a saved plan has them blank; `.pl-title` font size was being overridden (now 22px). Checked by rendering 39 sample packages through headless Chrome → 3 full pages, no spill. | 🟢 deployed to Dev 2026-09-18; zip needs re-upload in Books |
| CR-187 | 2026-09-18 | **Packing list: packages numbered per type** — user: wants `Pallet 1, Pallet 2 / Box 1, Box 2`, not one running series (`Pallet 1, Box 2, Loose 3`). Shipped in `functions/skuapi/packing.html` (+ `books-widget/app/widget.html`, zip rebuilt): `kindNo(i)` / `kindTotal(kind)` replace `i + 1` in the grid `#` cell, the sheet's PACKING DETAILS `NO.:-`, and the sticker (`01 OF 02` = of that type's total). Wooden Box and Corrugated Box are separate series. Stored `seq` (row order) unchanged. No schema change. | 🟢 deployed to Dev 2026-09-18; zip needs re-upload in Books |
| CR-186 | 2026-09-18 | **Packing list: sheet prints portrait, Type in column 2, per-item ✕, no ↑↓** — user: only the sticker needs landscape; move Type to column two; remove items individually instead of the whole package; drop Up/Down. Shipped in `functions/skuapi/packing.html` (+ verbatim `books-widget/app/widget.html`, zip rebuilt): `@page` moved out of `#printStyles` into `printHtml(html, landscape)` — sheet A4 portrait, stickers A4 landscape; package Type select now follows `#`; ✕ per item row (`b.items.splice`), package ✕ and `+ item` stay; `move()` removed. No schema change. | 🟢 deployed to Dev 2026-09-18; zip needs re-upload in Books |
| CR-185 | 2026-09-18 | **CRM quote widget: no spinner arrows on number inputs** — user: "remove the Numerical Arrow to increase decrease values" on Qty / Rate / Disc %. Shipped: CSS only in `functions/skuapi/widget.html` (`appearance: textfield` + hidden `::-webkit-inner/outer-spin-button` on `input[type=number]`); inputs stay `type=number` so min/max and the numeric keypad are unchanged. Main app and Books widget untouched. | 🟡 edited locally, not deployed |
| CR-184 | 2026-09-18 | **Widgets always save the item to the SKU master; the switch only gates the Books push; composite BOM = configured RM, RM1/RM2 gone** — user: `GV-032-S4-HO-2` "created through CRM quote widget but can't see it in Books nor SKU DB" (MSUN had the CR-182 switch off, so only a CRM Product existed); "when the item is created, I want it added to SKU Master as well so that I can push manually and periodically"; "common logic across all orgs"; "composite items: add the new items as per configuration and RM1 and RM2 shall be removed"; short BOM → "throw error". Shipped: (1) **Setting** `OrgSetting cfgNoAutoPush` / API `widgetAutoPush` (replaces `cfgNoAutoCreate` / `configuratorAutoCreate` — the old key is ignored, default = push on), label **CRM widgets: push new items to Zoho Books immediately**. (2) **Both widgets**: the box is now **Push to Books**; a new item is *always* created via `/api/sku/create-item` (or `POST /sku-items` manual path); push only when ticked, else cart badge *NEW — NOT PUSHED* + "push it later from the SKU Items page". Quote-only branches and the *QUOTE ONLY* badge are deleted. Configurator also offers the box for an existing item not yet in Books. (3) **`zoho/push.js`**: `padMappedItems` / RM1-RM2 padding (CR-165) removed; `requireBomLines` throws `Composite needs at least 2 raw-material lines (has N) — flag the properties whose values are Books items…` on create and after the re-push merge; `syncMappedItems` adds any RM1/RM2 already on the composite to the pool so `mergeMappedLines` drops them (manual lines still kept). `push.test.js` covers the guard + placeholder removal. **Consequence:** an industry whose configuration yields <2 flagged-value lines (e.g. Fabric with one flagged property) now fails the push with that message until a second flagged property or a manual Books line exists. **Recover `GV-032-S4-HO-2`:** search it in the Quote Maker (no match → Create & add to lines) or create it on the SKU Generator page; the CRM Product is reused by SKU. Supersedes CR-182/183. | 🟡 deployed to Dev 2026-09-18, awaiting verify |
| CR-183 | 2026-09-17 | **Quote Maker widget: same item auto-creation switch** — user, after CR-182: "same applies for SKU generated items as well". `widget.html` create card gains a **Create item** checkbox, preselected from the same org setting (`configuratorAutoCreate` / `OrgSetting cfgNoAutoCreate`) and changeable per line; the button reads *Create & add to lines* / *Add to lines (quote only)* and the card title follows. Off: no `SKUItem`, no Books push — the line is added as *QUOTE ONLY* with the typed/generated name + SKU (+ parameter values when generated); the CRM Product is still found-or-created by SKU at push time. On: unchanged. SKU Settings label now reads **CRM widgets: auto-create new items** (covers both widgets). The main-app SKU Generator page is untouched — creating the item is its whole purpose and it never auto-pushed (CR-021). Default stays ON, so MSUN's behaviour is unchanged until the box is unticked. | ⚪ superseded by CR-184 |
| CR-182 | 2026-09-17 | **Product Configurator: item auto-creation setting** — user: "Add a setting for the item auto creation: I might want to create it or not create it." Shipped: org setting **Product Configurator: auto-create new items** in SKU Settings (`OrgSetting cfgNoAutoCreate`, stored inverted so blank = on; API field `configuratorAutoCreate` on GET/PUT `/api/sku-items/settings`, a PUT without the field leaves it untouched). The widget (`configurator.html`) shows a per-line **Create item** checkbox for a NEW SKU, preselected from the setting and changeable per line. On: unchanged (SKUItem + Books push). Off: nothing is stored in the add-on DB or Books — the line goes to the cart as *QUOTE ONLY* with the generated SKU/name/answers; the CRM Product for the quote line is still found-or-created by SKU at push time (CRM needs a product on the row). Existing items ignore the switch. **Known consequence of Off:** the same answers stay "NEW" next time (no catalog row to match) and nothing reserves the SKU. | ⚪ superseded by CR-184 |
| CR-181 | 2026-09-17 | **Product Configurator — CRM widget step 1: questions + RAV sizing + SKU/item on demand** — user (for Ricon Dynamics, generic later): sales answers dropdown questions in CRM, the system proposes the valve — "always on the upper side" — generates the SKU, shows the item if it exists and creates it (add-on DB + Books) if not; "Product configurator is nothing but Advance SKU Generator". Shipped: (1) **Sizing** — pure `recipe/sizing.js` (`--selftest`): `Req. Cap ltr/rev = TPH×1000 ÷ (RPM×60×BD)`, per series inside the asked type the smallest model with capacity ≥ Req. Cap (gaps climb, ties all offered, over-range reported as `tooBig`), `Required Speed = Req. Cap×RPM ÷ capacity`; sheet check 5 TPH / 0.60 / 20 RPM → 6.94 → RAVH 200 @ 18.9 RPM. (2) **Schema** — new `SizingModel` table + `Property.sizingRole` (`capacity`/`density`/`speed`/`group`/`series`/`model`): the widget finds sizing inputs/outputs by role, so nothing is RAV-specific in code. (3) **API** in `routes/recipe.js`: CRUD `/sizing-models`, `POST /sizing/select` (options carry the model/series `PropertyValue` ids, matched by display text), idempotent `POST /seed-rav` (Industry RAV + 26 questions + 111 values + 43 models from the two sheets, bulk inserts); perm `recipe.sizing`. (4) **Widget** — new `functions/skuapi/configurator.html` at `GET /configurator`: Product (=Industry) → Feed data → *Find suitable models* → pick (fills Series + Model, still editable) → remaining questions → live SKU via `/api/sku/generate`; duplicate SKU ⇒ *EXISTING ITEM* (loaded via `/sku-items/search`), else *NEW ITEM* ⇒ `/api/sku/create-item` (Manufacturing) + `/push-zoho`; quote line description = every answer + `Req. Cap` + `Required Speed`. Boot/auth, cart and quote write-back are **copied verbatim from `widget.html`**, which is untouched (MSUN isolation). Duty answers (`activeInSku=false`) never reach the SKU or the item — they ride the quote line. (5) **App** — nav *Recipe Engine → Product Configurator*, *Recipes → Product Designs* (labels only), new **Sizing Models** grid `/recipe/sizing` (record-grid pattern, *Load RAV defaults*), *Sizing role* dropdown in the property editor. **Not done (next step):** MOC → component material map, design-driven rate + Books BOM (`SizingModel.recipeCode` is the stored hook; new composites still get the RM1/RM2 placeholder BOM), Motor HP / Gear Model defaults per model, Y/N accessories as optional components, RM create-missing in Books, folding the SKU Generator nav in. **Seed guesses to review:** SKU codes, the Motor HP ladder (sheet says only "HP / Bare Shaft"), Rotor Strip's cut-off 4th value, CB models named `RAVH CB <capacity>` (sheet gives no size), sanitary 3.80 seeded as `RAVS 150` (sheet prints RAVH 150). **Flag:** costing sample shows CI casing 55 kg → 4400, but CI rate 70 ⇒ 3850; 4400 = FG260's rate (WCB 6600 = SGI's) — the sheet's rate lookup reads one row below. **User confirmed: sheet mistake — engine's rate × weight stands.** | 🟡 deployed to Dev 2026-09-17, awaiting CRM verify |
| CR-180 | 2026-09-16 | **Item type labels + CRM `Item_Source` from the quote widget** — user: "CRM Product Module Field: Item Source (API name `Item_Source`) … bring the Item type in the Product Selection subform of the CRM quote maker widget … Item Source values In-House Manufacturing & Direct Purchase (add in SKU Setup): Trading → Direct Purchase, Manufacturing → In-House Manufacturing … or add a Label field so any user can have their own naming". Decision: per-org **label field** (stored values stay `Trading`/`Manufacturing` — they drive the Books push branch and are locked after push); the label doubles as the `Products.Item_Source` picklist value. Shipped: `routes/skuItems.js` settings gain `typeLabels` (OrgSetting `skuTypeLabelTrading`/`skuTypeLabelManufacturing`, blank = `Direct Purchase`/`In-House Manufacturing`, 60-char cap); `SkuSettingsPage.jsx` text box beside each type radio with the stored value in brackets; `SKUItemsPage.jsx` (type pill, filter, edit drawer, lock tooltip) and `SKUGeneratorPage.jsx` (type toggle, locked display) render the label; `widget.html` — cart line shows a grey type badge, `findOrCreateProduct` sets `Item_Source = label` on create and refresh when the org's Products module has the field, `paramVals` exposes the label under "Item Source"/"Item Type" so a plain subform column with that label is filled (associated columns still skipped), create-card option texts follow the labels. Not done: no rename of stored values or `TYPES` validation; label not added to the line description text; `SKUPreview.jsx` (unused) untouched | 🚧 deployed to Dev, pending verify |
| CR-179 | 2026-09-16 | **Zoho sign-in fails for IN-DC users: `Platform not allowed`** — Studio Sairish (and the developer's own IN account): `POST /auth/zoho/exchange` → 400, log `Zoho token exchange failed (dc=in, http 200): {"error":"Platform not allowed"}`. Evidence: IN exchanges succeeded 14–15 Sep (last 15 Sep 16:39 IST), every attempt from 16 Sep 13:17 IST fails; refresh grants on `accounts.zoho.in` still work (same client id/secret), no deploy or env change in the window (env == `catalyst-config.json`), and a bogus code returns `invalid_code` on com/in/eu even with a wrong secret — so Zoho validates the code first and rejects our client's *platform* only for a real code issued by the `.com → .in` bounce. Nothing in this repo changed; cause is Zoho-side (API-console client type / Multi-DC settings, or Zoho behaviour). Shipped: (1) `getAuthUrl(forceConsent, dc)` + `GET /auth/zoho?dc=in` start the consent leg on that DC's accounts host (`DC_HOSTS` whitelist; absent/unknown → home DC, unchanged); (2) `session.js` `setDcCookie`/`readDcCookie` — a successful exchange sets `zdc=<dc>` (1 year, same None/Partitioned/Secure attrs as the session cookie) and `GET /auth/zoho` reads it, so every returning browser (login page, CRM/Books widget popups, packing list) skips the `.com` bounce with no widget change; (3) `LoginPage.jsx` "Zoho India account? Sign in via accounts.zoho.in" link under the Zoho button for first-time IN sign-ins (popup path reuses `zohoPopup` via `e.currentTarget.href`). If `?dc=in` still fails: api-console client (Server-based, Multi-DC IN on, same-credentials on) → Zoho support. Not done: per-DC secrets, `accounts-server` parsing, `state` param, auto-detecting the DC before the first login (Zoho gives no pre-auth signal) | 🚧 deployed to Dev 2026-09-16, pending user verify |
| CR-178 | 2026-09-16 | **WO ⋯ menu: no icons** — user: "redesign this: remove icons in front". `WorkOrderPage.jsx` header menu items lose their leading glyphs (→ ← ▶ ⏸ ✕ 🖨 📦); since the arrows carried the direction, forward moves now read *Move to <status>*, backward *Back to <status>*, *Resume (<status>)* on Hold. Hold / Reject / Print labels are plain text; Cancel / Delete unchanged | 🚧 deployed to Dev 2026-09-16, pending user verify |
| CR-177 | 2026-09-16 | **Serial prefix auto from the item's `cf_valve_type`** — user: "automatic code generation for the assembly time", with the Books dropdown *Items* (`cf_valve_type`) listing `KGV-Knife Edge Gate Valve`, `BV-Ball Valve`, `BFV-Butterfly Valve`, `GV-Gate Valve`… The prefix is the code before the dash. `serial.js`: pure `prefixFromItem(item)` — `custom_fields[]` entry with `api_name === "cf_valve_type"` (label `/valve\s*type/i` as fallback), `value_formatted ?? value` (covers the field's earlier lookup type, where `value` is a record id), `^\s*([A-Za-z0-9]+)\s*-` → uppercase, else `""`. `serialPrefix` now tries it first via `booksApi.getItem` (same call CR-159 uses for Size; one Zoho GET on modal open — later keystrokes send the prefix and `resolvePrefix` short-circuits), then the existing SKUItem "Valve Type" property → SKU letters → typed chain. The modal's prefix field stays editable. Tests in `serial.test.js`. Deliberately not done: caching the prefix on `WorkOrderFG`; a settings key for the CF name. No schema change | 🚧 deployed to Dev 2026-09-16, pending user verify |
| CR-176 | 2026-09-16 | **Batch/serial picks for assembly components** — user: "batch selection at assembly as well… I want a specific batch item in the assembly". CR-126 had deferred this to the CR-123 picker; now wired. `assembly.js`: pure `componentQtys(lines, qty, fgQty)` (per-unit × qty, requiredQty/fgQty fallback, **rounded to 4 dp** so `0.1×3` is `0.3` in the picker, the pick check and Zoho) + pure `applyPicks(components, picks)` (`[{itemId, tracking}]` → `txn.trackingProblem` per line, all problems collected → 400 with `details[]`), both run **before** the composite check/push, `nextSerials` and Zoho so a bad pick changes nothing; BOM lines now read via `bom.currentLines`. `previewAssembly` returns `components: [{itemId, name, qty}]` + `fromWarehouseId` (Issue). `POST …/assemble` body gains `components`. `zoho/inventoryApi.js` `createBundle`: `trackingToLine(c.tracking) \|\| availableSerialsBatches(...)` — same explicit-wins/FIFO-fallback line as `createTransferOrder`. `GET /tracking-options` accepts `fromWarehouseId` without `type`. `txn.js` exports `trackingProblem`. UI: `TrackingPicker` exported from `MaterialsGrid.jsx`; `AssembleModal` Proceed fetches the pool per component sequentially (Issue warehouse), opens the picker for tracked lines (FIFO prefilled, `verb="Assemble"`, warehouse names passed down) **in place of** the modal (no nesting — Cancel returns with qty/prefix intact), Confirm posts `components`; untracked FGs post straight through; server `details[]` shown as one toast per problem. **Second pass (user: "instead of Proceed Assembly display Select batch so the user is clear")**: the modal's primary button reads **Select batch** whenever the FG has BOM lines (the picker's own confirm is the real *Proceed Assembly*), plus one line in the modal text saying the assembly is created after the batches are confirmed; an FG with no tracked RM still assembles straight from that click. Verified live on WO-0024: the picker listed every tracked RM with its Issue-warehouse batch, FIFO prefilled. **Third pass**: MFG date column hidden for the Assembly verb (user: "remove MFG Date from the column"); Issue / Return keep it. `assembly.js --selftest` added. Deliberately not done: persisting the component picks (`WoAssembly` keeps only the FG serials; Zoho's bundle holds the line numbers); manual batch entry; a tolerance on the exact-qty check (only bites if a typed decimal sum drifts — add `1e-6` if seen live). No schema change | 🚧 deployed to Dev 2026-09-16, pending user verify |
| CR-175 | 2026-09-16 | **Assembly rejected: "Batch 888 is not available in selected branch for the item WCB Gland Follower 50mm" (2324)** — first assembly on WO-0024 (MSUN, Locations enabled, Main = Head Office branch). Root cause: a Zoho assembly is **single-location** — components are deducted from and the finished good is added to the header `location_id`; per-line `location_id` is ignored. `createBundle` sent Main at the header and Issue on the lines, so Zoho looked for batch 888 (issued to the Issue warehouse by TO-00026) in Head Office. Fix in `zoho/inventoryApi.js`: header `location_id`/`warehouse_id` = the Issue warehouse (`toWarehouseId` param dropped). `assembly.js` then moves the finished good Issue → Main with a Transfer Order via the existing `createTransferOrder` (serial-tracked FG carries its new serials; batch-tracked FG FIFO auto-picks at Issue — ponytail note), best effort: a failed transfer is returned as `transferWarning` (stock waits in Issue) and logged, never thrown, since the bundle already exists. Response + `fg.assemble` activity carry `transferOrderNumber`; the modal toast says "moved to Main by TO-xxxxx" or shows the warning. **Second attempt → 900001** ("unable to process your request… try again"). Probed Zoho directly (user-approved, token via scratchpad file): `GET /bundles/editpage` shows the real model — header `location_id` selectable among Head Office (type `general`) / Reserve / Issue (`line_item_only`, parent Head Office), **no location keys on line items**. Replayed the exact 10-line payload (incl. the composite PUT the app does first, and qty 2 spanning two batches per line) with an already-used FG serial as sentinel: every variant reached the last validation (2206 duplicate serial), never 900001 → payload is sound, 900001 was Zoho-transient. Hardened `createBundle`: header `location_id` only, per-line location keys dropped, one retry after 3 s on 900001 with the body logged. No schema change | 🚧 deployed to Dev, pending live retry on WO-0024 |
| CR-174 | 2026-09-16 | **Assembly tab: Ready / Pending sections + per-row partial quantity** — user: "create 2 sections: Ready assembly items (with an option to choose qty, I might want partial assembly) and Pending for assembly, same tab". Shipped in `MaterialsGrid.jsx` `AssemblyPanel`: **Ready for assembly** (every BOM line issued) gains an *Assemble now* column — number input prefilled to Remaining, MAX button, red + Proceed disabled when 0 or over Remaining; the typed value seeds the modal's quantity (`fg.initialQty` in `AssembleModal.jsx`, still editable there). **Pending for assembly** below it lists the FGs not Closed and not fully issued with a *Waiting on* column ("N line(s) not fully issued"), no button. Both sections show their count. No backend change | 🚧 deployed to Dev 2026-09-16, pending user verify |
| CR-173 | 2026-09-16 | **SO carries its WO (`cf_work_order_no_and_date`) + next-stage hint on the WO header** — two user asks. (1) **SO custom field**: the user added one Books SO custom field, api_name `cf_work_order_no_and_date`. `booksApi.stampSalesOrderWo(soId, value)` → `PUT /salesorders/{id}/customfields` (`ponytail:` body shape to verify on first live call, fallback is `PUT /salesorders/{id}` with `custom_fields`); text from pure `soFields.soWoStamp(wo)` = `WO-0012 / 16/09/2026`. Written on create (`POST /wo`; a Books failure lands in the response `problems`, never blocks), **cleared on Cancel** (`POST /wo/:id/status`, best-effort) and on delete of a Draft, and **self-healed on every `GET /wo/:id`** when the SO's current CF value differs (covers a create-time failure and `woDate` edits; a Cancelled WO never writes so it cannot blank a newer WO's stamp). **Picker unblocked**: `GET /wo/sales-orders` no longer counts Cancelled WOs as "taken", so a fresh WO can be raised on the same SO and its create overwrites the CF — previously only deleting the WO freed the SO. (2) **Next-stage hint**: `woCommon.jsx` `StatusChip` gains `ghost` (dashed outline, full label) and `NextStage` (short line + ▶ + ghost chip); `WorkOrderPage.jsx` header renders `<NextStage next={forward[0]} />` right after the status chip — first forward move from the API's `nextStatuses`, so Hold shows the resume target and finals show nothing. Detail header only, grid untouched. Draft with approvals on hints Ready For Machining (Approve sits on the same row). Tests: `soFields.test.js` extended. No schema change | 🚧 deployed to Dev 2026-09-16, pending user verify |
| CR-172 | 2026-09-16 | **Details → Assembly action tab** — user (WO-0024, one FG fully issued): "add another tab to the reserve/de-reserve tab list named Assembly; all those items reside there and the user sends them to assembly". Shipped: `MaterialsGrid.jsx` ACTIONS gains `assembly` (perm `wo.action.assemble`) — the RM grid, chips, filters and confirm bar give way to `AssemblyPanel`: one row per FG that is not Closed and whose every BOM line is fully issued (`issued ≥ bom`, removed lines ignored), columns Finished good · Size · Ordered · Assembled · Remaining · **Proceed Assembly** (opens the assemble modal, now `AssembleModal.jsx`; primary button renamed Proceed Assembly). Button hidden outside the shop-floor stages. Item List tab loses its ⚙ Assemble button (keeps "Assembled x/y"). Gate change: `status.js` `ASSEMBLABLE = MATERIAL_OK` (any shop-floor stage, was Ready For Dispatch only) and `assembleFg` 409s unless `formulas.fullyIssued(grid.rows)` — preview does not re-check (fires per keystroke). Selftests extended. Not done: no "queued for assembly" state — Proceed creates the Zoho bundle immediately. No schema change | 🚧 deployed to Dev 2026-09-16, pending user verify |
| CR-171 | 2026-09-16 | **WO rail without customer + one-step-back status moves** — two user asks. (1) **Rail item** on `/wo/:id`: second line was "Customer · Due date"; now "Due date · Due Days" (`DueDays` chip, red once overdue) and no customer. Grid at `/wo` untouched (it has a column chooser). (2) **Backward status**: `status.js` gains `BACK` (MachiningInProgress→ReadyForMachining, ReadyForFitting→MachiningInProgress, FittingInProgress→ReadyForFitting, ReadyForDispatch→FittingInProgress) and `prevStatuses(wo)`; `nextStatuses` includes it, so `POST /wo/:id/status` allows the move with no route change (DATE_GATE re-checks pass because the dates are already stored; no material sweep). GET `/wo/:id` returns `prevStatuses`; the ⋯ menu lists them as `← Stage` after the `→` moves. Completed / Dispatched / Closed / Cancelled stay final (Closed keeps admin Reopen); Draft / Approved never step back. Selftest extended. No schema change | 🚧 deployed to Dev 2026-09-16, pending user verify |
| CR-170 | 2026-09-16 | **WO review: PO extra split + Head Office delivery, reserve-all joint cap, picker MFG date, Received chip, stage dates on entry** — six user asks. (1) **PO extra qty had the SO on it**: WO-scoped PR confirm (`POST /pr/:prId/confirm`) stamped `cf_so_no` on the whole line even when `purchaseQty > requiredQty` (needed 2, ordered 4 → one line of 4 with the SO). New pure `splitExtra` in `purchase.js`: the required qty keeps the SO, the excess becomes an `isExtra` entry (no SO, description "· Extra"); `collapseLines` keys on `isExtra`, so Books gets two PO lines. The item-wise raise already did this. (2) **PO delivery = Main warehouse** (Head Office in the Dev org) instead of Reserve, both `confirmPR` and `raiseItemPO` — the grid's stock column *is* Main stock, so received material is now reservable instead of sitting in Reserve unseen. (3) **Batch picker hides MFG date when reserving** (`TrackingPicker`, `verb === 'Reserve'`); Issue / Return keep it. (4) **"Reserve everything available" joint cap**: with two FGs sharing a raw material each row filled to its own cap and FG2 over-asked Main stock → server 409. Now `fillAvailable` walks rows in order and gives each item only what is left of `r.stock`; rows that get nothing are skipped silently. A 409 on stale stock still toasts (deliberate — that means the snapshot is stale). (5) **Received chip gone once reserved**: `ReceiptChip` returns null when `received ≥ po` and `needed === 0`; Not received / Partial stay; WO-header callers pass no `needed` and keep the chip. (6) **Stage dates asked on entry**: `status.js` `DATE_GATE` is now keyed by the *target* status — `ReadyForMachining: { machiningDoneDate: required, fittingDoneDate: optional }`, `FittingInProgress: { fittingDoneDate: required }`; the route gates on `to`, stores whatever the body supplies, and replies `400 {code:"needDate", fields:[{field, required, value}]}`; `DateModal` renders one input per field (required defaults to today, optional blank, blanks not sent). Leaving Machining / Fitting in Progress no longer prompts; header card labels are "Machining Date" / "Fitting Date". Same two columns, no schema change. Selftests extended (`splitExtra`, `DATE_GATE` shape). Not done: per-line warehouse override on the PO; swallowing server-side reserve errors; separate planned vs completed dates | 🚧 deployed to Dev 2026-09-16, pending user verify |
| CR-169 | 2026-09-16 | **Packing List: "+ Add package" starts with an empty item row** — user: after packing 2 items in package 1, Add package pre-filled package 2 with the same 2 items. Shipped in `packing.html`: the `add-box` handler still copies type + L/W/H + gross from the previous package (repeat cartons are the norm) but its items become `[newItem()]`; `newItem()` now returns a blank "— item —" row (`itemId: ''`, weightPc 0, filled by the select's onchange) instead of defaulting to the first SO line — applies to "+ item" and the first package too. Widget zip rebuilt | 🚧 pending Dev deploy + zip re-upload + user verify |
| CR-168 | 2026-09-16 | **Packing List: grid cleanup + portrait stickers** — user screenshot: Type select's native arrow overlapped "Wooden B▾", L/W/H spinners, stray per-item ✕. Shipped in `packing.html`: `td select { appearance:none }` (whole box stays clickable), number-input spinners hidden via `::-webkit-inner-spin-button` / `-moz-appearance:textfield` (all grid numbers, one rule), L/W/H headers 70→48px (3 digits), per-item ✕ column removed (`// ponytail:` — package ✕ + re-add covers a wrong item); stickers stay **A4 landscape** (user reverted a brief portrait try against the MSUN paper sample) and now **fill the page**: `.stk` is a 192mm flex column, the box-details table takes the remaining height; type 16→22px, headings 32px, box size / "01 OF 33" 64px, 2px borders. Per-box sticker listing every item inside was already in CR-164. Widget zip rebuilt, deployed to Dev | 🚧 deployed to Dev 2026-09-16; pending zip re-upload + user verify |
| CR-167 | 2026-09-16 | **Packing List: L / W / H as three fields + Wt/pc from the item master** — user: "Add separate Length, width and height" and "auto calculate from the item master: qty × item weight → Net (kg)". Shipped: (1) the package row's single "Box size" text becomes three numeric inputs **L (cm) / W (cm) / H (cm)** (`b.l/b.w/b.h` in the widget); persisted unchanged as `PackingBox.dims` `"L X W X H"` via `dimsOf(b)` (no schema change), legacy `"120 X 80 X 33"` strings split back into the three fields on load; sheet `SIZE (cm):-` and sticker "Box Size" read the same string. (2) `GET /api/packing/doc` now fills `line.weightPc` from each Books item's weight — a **"Weight" custom field** first (label match like Size; value "205 kg" / "500 g" / number), else the built-in **package weight** (`package_details.weight` + `weight_unit`) → kg via `weightKg()`; one `GET /items/{id}` per distinct line item, sequential, failures → 0); the widget seeds Wt/pc from it on `+ item` / `+ Add package` and on item change (only when the master has a non-zero weight), Net = qty × Wt/pc recalculates in place; Wt/pc stays editable as an override and saved plans keep their saved values. (3) Grid column order per user: # · Item · Qty · Wt/pc · Net · ✕ · Type · L · W · H · Gross · actions (package cells still rowspan their items). Selftest extended (`weightKg` g/kg/blank). Widget zip rebuilt. Not done: seeding L/W/H from the item's package dimensions; caching item weights (one call per line per open is fine at SO sizes) | 🚧 deployed to Dev 2026-09-16; pending zip re-upload + user verify |
| CR-164 | 2026-09-16 | **Packing List: qty cap, multi-item packages, 4 package types, per-box stickers, consignor defaults** — from the MSUN box-label sample (MSUN → D-LINE, "01 OF 33"). (1) **Packed qty can no longer exceed ordered qty**: the packed/ordered summary turns red with ⚠ and Save, Print and Print Stickers refuse with a per-line message (client-side only — the server has no ordered qty without a Books round-trip per save; `// ponytail:` noted). (2) **One package holds several items**: the packages grid is one row per item with the package cells (number, type, size, gross) spanning its items; `+ item` per package, ✕ per item, ↑↓✕ per package; net = qty × wt/pc per item, **gross weight is per package** (new `PackingBox.grossWeight` double column; per-item `grossWeight` in `itemsJson` no longer written, read as a legacy fallback). (3) **Package types** `wooden` Wooden Box / `corrugated` Corrugated Box / `pallet` Pallet / `loose` Loose Packing (`PackingBox.kind`, legacy `box` reads as `wooden`, unknown coerces to `wooden`); **package numbers are now a single 1..N series across all kinds** (the sticker says "No out of total box"); the sheet's PACKING DETAILS cell reads `<KIND> NO.:- n` + `SIZE (cm):- …` and the footer tallies per kind ("2 WOODEN BOX, 1 PALLET"). (4) **Print Stickers** button: one A4-landscape page per package via the same iframe-srcdoc path (`buildStickers()`): Exporter/Shipper | Consignee/Buyer → "Product Details (Inside Box)" (SR NO, P.O NO, PRODUCT DETAILES, SIZE, QTY (Nos), NETT WEIGHT, GROSS WEIGHT — one row per item, gross spanning) → "<Kind> Details" (Box Size (L X B X H) (CM) | Box No "01 OF 33", zero-padded). P.O NO = the `Buyer Order No. & Date` header, now **prefilled from the SO/invoice `reference_number`** on a fresh plan; SIZE = the Books line's item "Size" custom field (same label match as `bom.itemSize()`), else the line description (`toLine().size`; WO path uses `WorkOrderFG.fgSize`). (5) **Consignor defaults**: new Company-details setting `companyEmail`; `GET /api/packing/doc` now fills whatever of name/address/email is blank in settings from the Zoho Books organization profile (`GET /organizations/{orgId}` — `req.orgId` is the Books org id), so MSUN gets its consignor block without configuring anything; the widget seeds "Consignor address & emails" with address + email. Selftest extended (kinds, gross, multi-item, size). Widget zip rebuilt (`books-widget/app/widget.html` = copy). Deliberately not done: server-side over-pack check, L/B/H as three numeric fields, sticker on the WO page beyond what the shared widget already gives | 🚧 built + selftest; pending Dev deploy + zip re-upload + verify |
| CR-166 | 2026-09-16 | **Push-to-Zoho dialog defaults in SKU Settings** — user asked not to pick Inventory Tracking and Inventory Account on every push, while keeping them changeable per push. Shipped: `OrgSetting` keys `skuPushTracking` (none/serial/batch, default serial) and `skuPushAccountId` (blank = Books default Finished Goods) on `GET/PUT /api/sku-items/settings` (`pushTracking`, `pushAccountId`); SKU Settings page gains a "Push to Zoho Books defaults" section (tracking radios + stock-account dropdown); the push dialog opens preselected on them (settings fetched once per page visit) and the auto "Finished Goods" pick only applies when no default account is saved; `POST /:id/push-zoho` falls back to the org defaults when the body carries neither, so any caller that skips the dialog (import auto-push) honours them too. Not done: per-industry defaults; remembering the last-used values instead of an explicit setting | 🚧 pending deploy + user verify |
| CR-165 | 2026-09-16 | **Manufacturing push: Zoho code 2056 "composite contains only one line item"** — after CR-163 the composite create reached Zoho and was refused: Fabric has one flagged property (Loom Type), so the BOM was a single qty-1 line, which Zoho never allows. User decision: no BOM picker — the org only needs SKU/item creation, so the composite carries the **default raw items RM1 and RM2**. Shipped: `padMappedItems` in `push.js` — when the property-derived BOM has < 2 lines, append RM1 and RM2 (looked up by name in Books, created once with SKU = name, untracked, if missing); ≥ 2 lines untouched; placeholders sit outside the flagged-value pool so `syncMappedItems` treats them as manual lines and a re-push keeps them. Not done: per-org placeholder names (constant pair; make it an OrgSetting if a second org wants different ones); removing the property-derived line (unflag Loom Type if the composite should be RM1+RM2 only). Self-check in `push.test.js` | 🚧 pending deploy + user verify |
| CR-163 | 2026-09-16 | **Manufacturing push fails with Books code 2112 "Enter a valid SKU for this item"** — Studio Sairish (org 60057837319): every Trading SKU pushed, every Manufacturing one failed; user suspected the composite/BOM. Logs show the failing call is the Books v3 `POST /items` for the *Loom Type* value item ("Handloom"), not the composite create: `pushValueToZoho` created value items with **no SKU** by design, and this org has Books Item Preferences → SKU mandatory, so the flagged-property backfill (09-09, 12-09) and every composite push died before reaching `/compositeitems`. No `PropertyValue` in that org ever got a `zohoItemId`. Shipped: value items now carry SKU = uppercased name (`valueItemSku`: "Cotton : Silk" → `COTTON-SILK`); update path unchanged (existing SKU-less value items in other orgs keep theirs). Not done: reading the org's SKU-mandatory preference (sending a SKU is harmless either way); using the value's short code as SKU (collides across properties). Self-check in `push.test.js` | 🚧 pending deploy + user verify |
| CR-162 | 2026-09-16 | **⟳ Refresh on WO pages** — user confirmed an SO in Books and the New WO picker still didn't list it (the picker only re-fetched when the search text changed). Shipped a ⟳ button on: New WO SO picker (re-runs the live `/api/wo/sales-orders` read), WO list toolbar, WO detail header (re-pulls SO fields + stock via `GET /:id`), Purchase page toolbar (WOs + whichever of PR/PO lists is loaded). Fetch on click only — no polling (user rule) | ✅ deployed to Dev 2026-09-16 |
| CR-161 | 2026-09-15 | **WO header: QC Not Applicable, TC Required, SO logistics fields, Special Instruction** — user asked whether QC Status (Not Applicable/Completed), TC Required (Yes/No), Freight Charge / Delivery / Booking / Transporter (from SO) and Special Instruction were on the WO. Audit: QC existed as Passed/Rejected (modal only, not in header); the four SO fields and TC were missing; Special Instruction was `notes` labelled "Instructions"/"Notes". Decided with the user: QC keeps Passed/Rejected and gains **Not Applicable** (completes like Passed); the four logistics fields are Books SO **custom fields** matched by label; TC Required and Special Instruction are **user-entered** on the WO. Shipped: `soFields.js` `CF_MAP` + 4 labels (re-sync on open comes free from `GET /:id`); `POST /` stores `tcRequired`; `PUT /:id` whitelist + `tcRequired`; detail serves the five; status route accepts `NotApplicable`. Client: header card shows Freight Charge / Delivery / Booking / Transporter / TC Required / QC Status; QC modal gains *Not Applicable*; Edit modal gains a TC Required Yes/No select and relabels Notes → Special Instruction (print sheet too); create page gains TC Required and relabels Instructions → Special Instruction. Not done: renaming the `notes` column; TC on the SO; a "Completed" QC value (Passed already means that). Schema: 5 varchar(255) columns. Follow-up 2026-09-16: *✎ Edit* is now a header button beside ⋯ on the WO detail (removed from the ⋯ menu) | 🚧 deployed to Dev 2026-09-16, pending user verify |
| CR-160 | 2026-09-15 | **WO status lifecycle: machining / fitting / dispatch stages + Hold** — user spec: Draft · Hold (reason, nothing moves) · Cancelled (de-reserves) · Ready for Machining (reserve starts here) · Machining in Progress (completion date compulsory to leave) · Ready for Fitting · Fitting in Progress (completion date compulsory) · Ready For Dispatch · Completed (no assembly → cannot complete) · Dispatched. Decided with the user: approvals (CR-080/082), the QC gate and Closed + admin Reopen **stay**; Hold from any open status resumes to the prior one; Cancel de-reserves only (issued stays); reserve/issue **gated** at Ready for Machining onward and no longer auto-bump the status; Assemble moves to Ready For Dispatch; Completed needs ≥ 1 assembly on every FG; QC Rejected only records the result. New pure `workorder/status.js` (FLOW, DONE/EDIT_LOCKED, HOLDABLE, MATERIAL_OK, DATE_GATE, ASSEMBLABLE, `nextStatuses(wo)`; self-checked) replaces the FLOW in `routes/workorder.js`. `POST /:id/status`: `Hold` needs `reason` → `heldFrom` = current status, `wo.hold` logged; from Hold the only target is `heldFrom` (`wo.resume`); Draft → ReadyForMachining 409s unless approval levels = 0; leaving MachiningInProgress / FittingInProgress needs `machiningDoneDate` / `fittingDoneDate` — body value or stored, else `400 {code:"needDate", field}` and the client prompts a date modal and resends; Completed 409s while any FG has `assembledQty` 0 (before the CR-151 reserved block); Cancelled runs `autoReturnOnComplete(…, {types:["dereserve"]})`; `qcStatus:"Rejected"` stores the result and returns without moving (`wo.qc`). Reopen: Closed → Dispatched. `txn.js`: `STATUS_BUMP`/`advanceWoStatus` deleted; `createDraft` 409s reserve/issue outside MATERIAL_OK; `loadContext` blocks Hold. `assembly.js` reads ASSEMBLABLE = ReadyForDispatch. `alerts.js` skips Dispatched. Client: chips RFM/MIP/RFF/FIP/RFD/DSP/HLD, `LABEL_OVERRIDE` gone; ⋯ menu gains ⏸ Put on Hold (reason modal — `ReopenModal` generalised to `ReasonModal`) and ▶ Resume; `DateModal` on `needDate`; Close WO at Dispatched; header card shows Machining/Fitting Completed when set (the transition prompt is now their only entry point since CR-159 dropped them from Edit); `WoItemsTab` Assemble at ReadyForDispatch, LOCKED + Dispatched; History labels for hold/resume/qc. Data (Dev): 7 `MaterialAllocationPending` → `ReadyForMachining`, 2 `InProgress` → `MachiningInProgress` via ZCQL. Deliberately not done: per-stage timestamps beyond the two dates; Hold on Completed/Dispatched; returning issued stock on Cancel. Schema: `WorkOrder.heldFrom` | 🚧 deployed to Dev 2026-09-15, pending user verify |
| CR-159 | 2026-09-15 | **WO header trim, due date = SO Expected Shipment, FG Size, single-item BOM fallback** — user: "Remove machining and fitting date at the time of WO creation. The WO due date will be the date of the Expected Shipment from Sales Order. Remove estimate cost and actual cost, remove project name. Each item has a size — display size of the FG in the dropdown from the Size custom field of the Books item, in the Reserve/De-reserve grid instead of the RM count, and in the FG dropdown on the Items tab. Raw material if it is not FG but single item should also appear in the grid — WO-0022 selected item not appearing." *Header*: `soFields.js` — `CF_MAP` drops "WO Due Date" / "Machining…" / "Fitting…", gains "Expected Shipment (Date)" → `shipmentDate` (a CF overrides Books' built-in `shipment_date`, a blank CF does not wipe it); `dueDate = shipmentDate` always, re-synced on every open (`USER_OWNED` = `woPriority` only); `soFields.test.js` rewritten. `routes/workorder.js`: create no longer writes `projectName` / `estimatedCost` / `actualCost`; `GET /:id`, list and `GET /so/:soId` stop serving project, machining, fitting, costs; `PUT /:id` whitelist = `notes`, `woDate`, `priority`. Client: New WO page's Schedule card is one read-only **Due date** (= SO Expected Shipment) + Days; header card, ✎ Edit modal, print sheet, issue slip and WO list drop Project / Machining / Fitting / costs. *Size*: new `WorkOrderFG.fgSize` (Books item "Size" CF, label-matched by `bom.itemSize`); one `GET /items/:id` per FG at create (list endpoint has no CFs), pre-CR rows backfilled once on the next WO open (`""` stored when absent so it never re-fetches). `fgLabel()` in `woCommon.jsx` renders "Name · Size × Qty" in both FG selects; the Details grid's FG group header shows **Size** where the "N lines not in stock" badge was (`grid.js` `shortCount` removed). *WO-0022 diagnosis*: Dev data showed one FG, zero `WorkOrderLine`, `BomRevision` r1 with an empty summary, `CompositeItemCache.mappedItems = []` — Zoho answered `/compositeitems/{id}` **successfully with no components**, and CR-152's self-line fallback only fired on a Zoho *error*. Root fix: `bom.requirementLines(comp, item, qty)` = composite lines, or the item itself when none (services-only too); used at create and in `bom/preview` (composite source), so **Refresh BOM on WO-0022 heals it**. Deliberately not done: dropping the five retired `WorkOrder` columns; removing the now-silent cost alert + `costAlertPct` setting; Size on RM rows / the Books item typeahead (50 detail calls per keystroke) | 🚧 deployed to Dev 2026-09-15, pending user verify |
| CR-158 | 2026-09-15 | **MFG batch filter in the batch/serial picker** — user: "Allow filter on the MFG Batch on the screen, then do not show them." The *Select batch / serial numbers* dialog (`TrackingPicker`, MaterialsGrid.jsx) gains one text box above the item cards, shown only when a batch-tracked line has batches; it does a case-insensitive substring match on the **MFG batch** column across every batch table in the dialog and hides non-matching rows (a table with no match shows "No batches match this filter."). View-only: quantities typed on a now-hidden row still count toward `n/qty selected` and still submit, because `submit()` maps over `pool.batches`, not the rendered rows. Serial lines untouched. Deliberately not done: matching Batch / MFG date columns; server-side filtering (the pool is already in memory). No schema change | 🚧 deployed to Dev 2026-09-15, pending user verify |
| CR-157 | 2026-09-15 | **WO Refresh stock scoped to the work order + per-row one-call item refresh** — user question: "when we do refresh stock, do we refresh all items or work-order items? Can we have individual item stock at the WO item level so only one API call is consumed?" Before: the Details grid's *Refresh stock* posted `/api/wo/refresh` with no scope, so it swept every raw material on **every open WO in the org** (one bulk `/items` page-walk plus, on this Locations-enabled org, one item-detail call per item, plus the PO refresh and a composite refresh per FG). Now: `POST /api/wo/refresh?woId=` → `reconcileOrg({ woId })` → `workingSet(catalyst, orgId, woId)` filters the open-WO list to that one row, so the button costs only that WO's lines (+ its FGs' composites + the PO list). Per-row: the **In stock** cell gains a ⟳ that posts the existing `POST /api/wo/items/:itemId/sync-stock` (one Zoho `GET /items/:id`, the same endpoint the stock report's per-item refresh uses, CR-129) and re-reads the grid; typed quantities survive both reloads (`load(qty)`). Also today, data-only: WO-0017's five *Labour* service lines (BL-50, GTL-50, STL-50, YL-50, HWL-50; seeded before CR-149's filter) removed through `POST /:id/lines {action:remove}` → revisions 4–8 with note "service item, not material"; no stock was reserved against them. Deliberately not done: patching the row in place from the sync response (the grid's derived columns are server-computed, one GET is cheaper than duplicating that math client-side); a "sync visible" walker on the WO grid (the report has one). No schema change | 🚧 deployed to Dev 2026-09-15, pending user verify |
| CR-156 | 2026-09-15 | **WO page: one header row, one Details toolbar row, no Proceed Purchase** — user screenshot: items grid showed too few rows. `WorkOrderPage.jsx`: the ✕ close and the ⋯ menu (plus Close/Reopen/Approve buttons) now sit on the same line as the WO number + chips, dead row gone; header/info-card/tab paddings trimmed. `MaterialsGrid.jsx`: the All/Short/Fully covered/Left chips, warehouse From→To, search and "<Verb> everything available" moved into the action-selector row (wraps on narrow screens); search box 220 → 180px; toolbar and confirm-bar padding 12 → 8px. **Proceed Purchase** button and its `requestPurchase()` prefill removed — purchasing happens only by picking **Raise PR** in the selector, entering quantities, and pressing the footer's *Proceed Raise PR*. Follow-up (same day): the left-rail row's second line shows **Customer · Due date** instead of WO date · Due date (list endpoint already returned `customerName`); the header info card is a grid whose column min-width is `max(150px, (100% − 6 gaps) / 7)` — 7 equal columns on a wide screen so the 14 fields fill two rows with no blank tail, more rows on narrow screens; Details toolbar order is selector · move text · chips · spacer · FG select · search · bulk fill · sync · columns, so the chips share the selector's line and the FG select wraps with the right-hand controls. Final layout: row 1 = selector · move text · chips · spacer · Refresh stock · ≡ columns; row 2 = FG select · From→To · search; "<Verb> everything available" moved into the confirm bar between Discard and Proceed (outline style, Proceed stays the only filled button). Confirm bar's idle text ("Enter a quantity or press MAX…" + "Stock last synced … · BOM revision N") replaced by the move label ("Main → Reserve warehouse"), which no longer sits in the toolbar row. Sticky-header fix: the grid scroller's 8px top padding let scrolled rows show above the stuck header; spacing moved to `marginTop` on the table. No schema change | 🚧 deployed to Dev 2026-09-15, pending user verify |
| CR-155 | 2026-09-15 | **Assemble modal: editable serial prefix + serial preview** — user showed Zoho's "Add Serial Numbers" box for a serial-tracked composite ("D.I - Knife Edge Gate Valve") and wants the addon to generate those serials and show them before creating the bundle. The bundle API already fills that box (CR-150), but the prefix resolver had no answer for a Zoho-native item: no `SKUItem`, no "Valve Type" property, and `/^[A-Za-z]+/` on `D.I - …` yields `D` → `D2026001`. Now `serial.js` gains pure `normalizePrefix` (trim, upper, `^[A-Z0-9]{1,10}$` else 400) and `serialPrefix` returns `""` instead of throwing when nothing matches. `assembly.js`: guards extracted into `checkAssemblable`; `resolvePrefix` = modal value → derived prefill → 400 "enter a serial prefix"; new `previewAssembly` runs the same guards + `nextSerials` **without** `commit()`; `assembleFg` takes the prefix. Routes: `GET /:id/fg/:fgId/assemble/preview?qty&prefix` (same `wo.action.assemble` perm), `POST …/assemble` body gains `prefix`. `AssembleModal`: Serial prefix field beside Qty, prefilled from the preview, uppercase as typed; one mono line "Will assign KGV2026001–KGV2026003" refreshed on every qty/prefix edit (user action, no timer); Create disabled while the preview errors. Deliberately not done: auto prefix from item-name initials / org rule table / Zoho custom field; persisting the chosen prefix per item; atomic counter (preview can go stale if another assembly lands first — Zoho rejects duplicate serials, retry). No schema change | 🚧 deployed to Dev 2026-09-15, pending live assemble |
| CR-154 | 2026-09-15 | **Assembly bundle rejected: "Number entered does not match the auto-generated number" (4097)** — first live assembly on WO-0015 failed. Not the serial/batch numbers (Advanced Inventory Tracking has no auto-generate toggle): Zoho auto-numbers the bundle's *Reference#* (`REF-N-00001` in its own docs) and `createBundle` sent `WO-0015-A1` in `reference_number`. Fix in `zoho/inventoryApi.js`: `POST /bundles?ignore_auto_number_generation=true` (Zoho's standard flag for manual transaction numbers); if the org still answers 4097, retry once without `reference_number` so Zoho numbers the bundle — the WO reference is already in `description`, and `WoAssembly.zohoBundleNumber` stores whatever Zoho returns. Failed attempt left nothing behind (no `WoAssembly` row, no `serialSeq` burned — CR-150's commit-after-Zoho held). WO-0015 was reopened Closed → Completed via the datastore for the retry. No schema change | 🚧 deployed to Dev 2026-09-15, pending live assemble |
| CR-153 | 2026-09-15 | **CRM widget: record writes fire workflow / blueprint / approval** — user report: quote-creation-time CRM automations were not running for widget-written records. Root cause: all four `ZOHO.CRM.API.insertRecord`/`updateRecord` calls in `functions/skuapi/widget.html` (Products insert in `insertProduct`, Products refresh in `findOrCreateProduct`, Quotes/Deals subform update in `pushLines`, Quotes insert on Deal → Create Quote) passed `Trigger: []`, which explicitly suppresses every automation. New `CRM_TRIGGER = ['workflow', 'blueprint', 'approval']` const next to `API`/`APP_ORIGIN`; all four sites use it. No server-side CRM write exists (`zoho/crmApi.js` is GET-only). Standing rule saved to memory: every Zoho CRM write, widget SDK `Trigger` or REST body `trigger`, carries this list. Widget-only, main app untouched. Not touched: the stale `crm-widget.zip` snapshot (not loaded at runtime since CR-097) | 🚧 deployed to Dev 2026-09-15, pending user verify |
| CR-152 | 2026-09-14 | **Reserve pass: WO-0019 "in-stock item won't reserve", batch picker MFG columns, sticky grid header, Books Web Tab, non-composite SO lines** — user list of 7. (1) *WO-0019 / M.S Yoke* — Catalyst logs showed three distinct causes: **code**: `formulas.js` H subtracted G (billed PO qty) — PR-0017/PO-00036 raised *for* WO-0019 received+billed 3 into Main, and that very stock was then deducted from what could be reserved ("only 1 can be reserved (stock on hand 2)"); H is now `max(0, min(A − C − D, B))`, G still displayed (WORKORDER.md updated). **Zoho config**: six confirms on WO-0020 failed with Zoho's *"You cannot mark this transfer order as transferred as you do not have permission for Reserve location"* — the connected Zoho user needs permission on the Reserve location (manual); each failure left an orphan Draft MaterialTxn (MT-0027…32), so `POST /wo/:id/txn` with `confirm` now cancels its draft when the confirm throws. **Stock**: WO-0020 then reserved all 4 M.S Yoke (TO-00021) — WO-0019 sees 0 in Head Office legitimately. (2–4) *Batch picker*: `batchRecordsToPool` reads `external_batch_number`/`manufacturer_batch_number` → `mfgBatch`, `manufacturer_date`/`manufactured_date` → `mfgDate`, `expiry_date` (both spellings — `/items/batches` keys are undocumented, verify live) and sorts oldest MFG date first (undated last), so FIFO auto-pick follows MFG date too; `listSerialsBatches` lists only batches with stock at the source (CR-148's zero rows dropped per user) and sums other-location stock into a pool-level `elsewhere`; picker columns `Batch · MFG batch · MFG date · Available · Take`, empty list says "All stock sits elsewhere (N in Reserve) — move it first". (5) *Sticky header*: `.grid-table` clips with `clip-path: inset(0 round …)` instead of `overflow: hidden` (which made the table its own sticky context), `th` is `position: sticky`. (6) *Books Web Tab*: the SPA lives on Catalyst static hosting (XFO DENY, unframeable) with a `SameSite=Lax` cookie and a same-frame OAuth link → accounts.zoho refused inside the tab. Now `npm run build` copies `dist/` → `functions/skuapi/app/` (gitignored) and `index.js` serves it at `/server/skuapi/app/` through a shared `frameable` CSP middleware (index is an explicit route: the Catalyst gateway forwards `/app` and `/app/` identically as `/app` — verified via `/cors-debug` — so express.static's directory index 404s and a slash redirect would loop; the browser keeps its own slash, which the relative asset URLs need); session cookie is `SameSite=None; Secure; Partitioned` (CHIPS: keyed by top-level site → works in the frame, can't ride along cross-site; Safari < 18.4 lacks CHIPS → in-tab login may loop there); LoginPage inside a frame opens `/auth/zoho` in the existing `sku-auth` popup, does the origin-checked `sku-auth-ready/hello/token` handshake App.jsx already implements, and `POST /auth/adopt?t=` turns the token into a cookie in the frame's partition; CRM deep-link auto-redirect gated to top-level. Manual: Books → Web Tabs → `https://sku-gen-octfis-925638796.development.catalystserverless.com/server/skuapi/app/` (trailing slash). (7) *Non-composite SO line*: WO create seeds a one-line BOM of the item itself (`source: self`, qty = FG qty) when Zoho answers "not a composite" (any `zohoCode` but 57), so it shows on Details and reserves like any RM; Refresh BOM on such an FG still errors (not a composite). Deliberately not done: I (Extra Reserved) unchanged; picker expiry column (read, not shown); token-based (cookie-free) SPA auth | 🚧 deployed to Dev, pending user verify + Web Tab registration |
| CR-151 | 2026-09-14 | **WO cannot complete while material is still reserved — issue is a must; "… Completion Date" labels** — user spec: when items are reserved, do not allow completion of the WO; issue is mandatory. Before, `Completed` silently de-reserved everything left in Reserve back to Main (CR-031 sweep). Now `POST /wo/:id/status` → `Completed` loads the material grids (same call the Close gate already made) and throws 409 `N items are still reserved (names) — issue or de-reserve before completing` when any row has reserved > 0 (`reports.reservedRows`, selftest extended); keyed on the post-QC status so QC Rejected → InProgress is never blocked; hard block, no `force`. The sweep stays but now only returns over-issue. Labels: detail card, edit modal and New-WO Schedule card all read `Machining Completion Date` / `Fitting Completion Date` (were "Machining Completion" / "Machining date"); Items-tab lock banner says "over-issued material" instead of "leftover". Deliberately not done: client-side pre-check before the QC prompt (QC answer first, then the 409 toast); Close gate unchanged (still soft warn + force) | 🚧 built, pending deploy + live verify |
| CR-150 | 2026-09-14 | **Assembly only once the WO is Completed + finished-good serial series `PREFIX+YYYY+NNN`** — user spec: once a WO is complete it goes to assembly, and every produced unit gets an auto serial built as Prefix (valve type code, `KGV`/`BV`) + running year + 3-digit auto number, one counter per year shared across prefixes (`KGV2025001, BV2025002, BV2025003, KGV2026001`). The Zoho side was already there (CR-126: `POST /inventory/v1/bundles`, Inventory-only — Books has no bundle API); the serials it sent were `WO-xxx-A1-1…`. New `workorder/serial.js`: pure `formatSerials`/`advanceSeq` + `serialPrefix` (FG → `SKUItem` by `zohoItemId`, else by `sku` → `SKUItemValue` → the property matching `/valve\s*type/i`, else lowest `skuPosition` → `PropertyValue.sku`; fallback = leading letters of the FG SKU; nothing → 400) + `nextSerials` (counter in `OrgSetting` `serialSeq` = `"YYYY:N"`, new year restarts at 1; `commit()` runs only after Zoho accepted the bundle so a failed assembly burns no numbers). `assembly.js`: `ASSEMBLABLE = ["Completed"]` (was Approved+), the all-FGs-assembled → QualityCheck bump removed, serials passed to `createBundle` as `finishedSerials`, stored on the new `WoAssembly.serialNumbers` (text 10000 → 700-unit cap per assembly), returned as `serials` + `serialRange`, logged on `fg.assemble`. `inventoryApi.js`: pure `finishedProductFields` (explicit serials win, reference fallback kept for other callers), composite tracking flags also read from `/compositeitems/{id}` when `/items/{id}` reports none; selftest extended. UI (`WoItemsTab`): ⚙ Assemble only at `Completed`; toast + "Previous assemblies" show the serial range. Deliberately not done: settings UI for pad/format (spec fixes 3 digits + year); a configurable prefix property (hardcoded Valve Type with fallbacks); gating Close WO on full assembly; atomic counter (read-then-write, Zoho rejects duplicate serials so the loser retries); batch number unchanged (`WO-xxx-An`) | 🚧 deployed to Dev 2026-09-14, pending live bundle verify |
| CR-149 | 2026-09-14 | **Service items never reach a work order** — user report: "Body Labour 50mm", a Zoho *service* item in the composite's Associated Services section, appeared as a WO material line (no stock → permanently short; we never reserve services). Root cause: `composite_item.mapped_items[]` carry `product_type: goods|service` (verified from `CompositeItemCache`) and `bom.linesFromComposite` never read it. Fix: `zoho/inventoryApi.js` exports `isService(m)`; `linesFromComposite` drops services (one filter — covers WO create, Refresh-BOM preview and the global composite page); `GET /api/wo/items` typeahead hides services; `GET /so/:soId` sends `productType` and `WorkOrderNewPage` hides service SO lines from the FG pick list, with a server guard in `POST /api/wo` (`problems`: "service item — not a finished good"). Side effect handled: `updateCompositeItem` PUTs the whole `mapped_items` list and every caller builds it from WO lines, so it now reads the live composite first and carries its service rows over — a push (apply revision, assembly, composite import) no longer strips labour from the composite in Zoho (one extra GET per push). bom.js selftest covers the drop. Deliberately not done: server-side type lookup on the manual `POST /:id/lines` add (typeahead already hides services); legacy SO reserve grid (`routes/reserve.js`); nested composites (`is_combo_product`) stay as material; no migration for existing service lines (none in Dev) — an affected WO drops them via Refresh BOM → Apply. No schema change | 🚧 deployed to Dev 2026-09-14, pending verify |
| CR-148 | 2026-09-14 | **Batch picker lists every batch of the item, with where the stock sits** — user report (CF8 KGV Body 50mm, Reserve): the picker opened on the red "no batch numbers at the source warehouse" dead-end with `0/2 selected`; the firm wants a popup listing the item's batch numbers to select from. Root cause: `/tracking-options` only kept batches with a balance at the routed source warehouse (Reserve = Main) and dropped the rest, so after the CR-139 test moves left the batches in Reserve the popup had nothing to show and no explanation. `zoho/inventoryApi.js`: new pure `batchRecordsToPool()` (extracted from `listItemBatchRecords`) keeps every `associated_locations[]` balance per batch and only drops batches with no stock anywhere; `listSerialsBatches` keeps zero-at-source batches and adds `elsewhere: [{location_id, balance}]`; `pickSerialsBatches` unchanged (already skips zero rows); selftests extended. `MaterialsGrid.jsx` picker: every batch renders — Available shows `N in <warehouse>` under a 0 (names from the `/api/wo/settings` warehouse list already loaded, no new call), Take input disabled when nothing is at the source, a red header line says the stock sits in another warehouse (+ "pick a different From warehouse" when warehouse selection is on); the no-batches text now fires only when the item has no batch records at all and no longer points at ⟳ Refresh (the pool is fetched live on Proceed). Also fixed: MaterialTxn batch notes read `undefined × undefined` since CR-139 (`createTransferOrder` returned the Zoho-shaped `{batch_id, out_quantity}` lines; now returns the internal picks `{batch_number, quantity_transfer}` that `txn.js` prints) — seen live on MT-0021…24. Stale `CR-121` comment tags in MaterialsGrid corrected to CR-123. **Second pass (same day, user still saw the empty popup after a hard refresh) — probed Zoho live**: the item detail *does* now carry `locations[Head Office].batches` for the newly received batches "12" (2) and "13" (3), but with `balance_quantity` — a field neither pool builder read (`batch_available_stock ?? quantity_in ?? quantity ?? batch_quantity`), so they counted as 0 and were filtered out, **and** their presence gated off the live `/items/batches` call (CR-139's fallback only ran when the detail batches were empty). Old batch 111 sits in Reserve (2), 11121221 is split Head Office 2 / Reserve 1. Fix: `balance_quantity` added to the alias list, and `withBatchFallback` now *always* replaces a batch item's pool with the live records (detail-payload batches deleted) — one extra Zoho GET per tracked line on Proceed; `batchRecordsToPool` treats an empty `associated_locations[]` like a missing one (batch total = source balance). Verified via the deployed API: Reserve pool for the item lists 12 (2), 13 (3) and 11121221 (2) available at Head Office, 111 greyed with "2 in Reserve". Deliberately not done: manual batch-number entry / creating batches from the app (Zoho needs the batch to exist at the source; the popup now shows where it is instead). No schema change | 🚧 deployed to Dev, pending verify |
| CR-147 | 2026-09-14 | **CRM quote widget: description one line per parameter, Size lands on the line, Create Quote only + on top** — user report: quote-line Description came inline ("Size: 42 · Colour: Red") so the estimate print showed a run-on line with `-` in SIZE (INCH); Size never reached the line even though the item has it; on Deals, drop "Push to Zoho Deal" and keep only "Create Quote", moved to the top so many lines can't hide it. `functions/skuapi/widget.html` only. (1) `lineDesc()` joins `Caption: Value` with `\n` — the convention `estimateParser.js` splits on and SCHEMA.md documents for item descriptions; both quote paths inherit it. (2) **Root cause of missing Size (verified live via the MSUN CRM API, quote 1356653000002189035):** the `Quoted_Items.Size` column is derived from the **Product record's `Size` field** — every filled line points at a Product with the identical `Size`, and a `Size` sent on the line row is silently ignored on both the Quotes push and Deal → Create Quote. Widget-created Products (`findOrCreateProduct`) only carried name/code/price. Now `findOrCreateProduct` loads `META.getFields({Entity:'Products'})` once and writes the item's parameter values onto the Product via `applyParamCols` (Size, Design_Type, Connection_Type, Drilling, Surface_Treatment_G — matched by label, else API name via the new `colVal()`) plus the newline `Description`; an existing Product gets the same fields refreshed with `updateRecord` (failure never blocks the line). An earlier guess in this CR (label "SIZE (INCH)" mismatch, parenthesis-stripping in `normLabel`) was wrong and is reverted — stripping made "Surface Treatment" and "Surface Treatment (G)" collide. Second pass after the user's retest (quotes …2218109 / …2218132): the Product now carries Size/Design/Connection/description (verified via API), but the line's `Size` stayed empty — the user confirmed `Quoted_Items.Size` is a subform field **associated with `Products.Size`** (auto-filled when a product is picked in the CRM UI); CRM ignores API-sent values for associated columns. `applyParamCols` now skips columns with `association_details` (derived, not writable). Estimate print already shows the size for these lines from the newline `Size:` spec (parser check on …2218132 → `1/2" DN15`). Third retest (quote …2189047, 12:42): Product has Size, line still null → **CRM does not auto-fill an associated subform column via the API at all** (insert or update). The only way to get the line's `Size` column filled from the widget is CRM-side: remove the Product association on `Quoted_Items.Size` (plain text) — the widget already writes plain columns. Same retest also showed the Ball Valve Product's fields update failing silently (24 parameters; likely a picklist value CRM rejects). Now: Product update/insert failures are collected into `warnings` (SDK per-row `INVALID_DATA` + field name surfaced by `rowError()`), a rejected insert retries with the bare name/code/price product so the line still lands, and `finish()` keeps the popup open with the warnings instead of auto-closing when any occurred. (3) Deals mode hides `#add-btn`; `#quote-btn` is the primary action. The Deals branch of `pushLines()`/`discoverSubforms()` is now unreachable and kept with a `ponytail:` note. (4) `#lines-foot` (subtotal + buttons + status) moved above the scrolling `#lines` list (border-bottom). Deliberately not done: deleting the dead Deal-push code; items created in manual mode still carry no parameter values (`values: {}`). Follow-up (same day, screenshot): Quotes button relabelled **"Add item to Quote"** (static; the "Push N lines to Zoho Quote" label code in `updateTotals()` deleted). The **"sku-generator" popup title bar** is the CRM console widget/button name, not our page — it cannot be removed from code, only renamed in CRM (Setup → Developer Space → Widgets → *sku-generator* → rename to "Quote Maker"; then Quotes/Deals → Links & Buttons → rename the button label) — the still-open CR-115 manual step | 🚧 deployed to Dev 2026-09-14, pending user verify + console rename |
| CR-146 | 2026-09-12 | **CRM quote widget: compact filter rows + value popover** — user report (screenshot): the filter column's card-per-parameter layout (label row + full-width inline `<select>`) forced scrolling past ~7 parameters; asked for the names kept together with a click-to-pick popup. `functions/skuapi/widget.html` only. Each parameter is now one ~30px clickable row — number badge, caption, selected value in teal (or "Any"), ✕ to clear — so 15+ parameters fit without scrolling. Clicking a row opens a single shared popover (`#fp-pop`, absolutely positioned in the panel, clamped to its height): List params get the "— Any —" + values list with the current value highlighted and a filter input when >9 options; Range/Manual params get a free-text input applied on Enter or close. Esc/outside click closes; ✕ and "Clear all" unchanged in behavior. State is kept in detached per-param `<select>`/`<input>` elements so `syncChipsFromPanel` → search POST → results, param search (`#fp-search`), create card and quote lines are untouched (only addition: the row's value label is painted in the same sync pass). The popup title bar "sku-generator" is the CRM console widget/button name, not our page — rename to "Quote Maker" is the still-open CR-115 manual console step. Deliberately not done: multi-select values, keyboard navigation inside the popover | 🚧 built, pending Dev deploy + verify |
| CR-145 | 2026-09-12 | **CRM widget: no chips in search box, default item type setting, Deal → Quote** — three user asks on the quote widget (`functions/skuapi/widget.html`). (1) Selecting a filter value no longer renders a chip inside the search bar — the selection stays in the filter-panel dropdown only (`#chips` span + `.chip` CSS deleted; `renderChips()` reduced to the Clear-button toggle; filter state/`chips` array untouched, so search filtering, `#c-chips` and the generator still work). (2) New org setting **Default item type** (Trading / Manufacturing (Finished Goods)) — `OrgSetting` key `skuDefaultItemType` on `GET/PUT /api/sku-items/settings` (`routes/skuItems.js`), radio pair on `SkuSettingsPage.jsx`, preselects the widget create card `#c-type` (option relabeled "Manufacturing (Finished Goods)", value unchanged) and `SKUGeneratorPage` (guarded so `?item=` edit mode wins). (3) **Create Quote from a Deal**: in Deals mode a new `#quote-btn` creates a new Quote **directly from the cart lines** — the Deal record itself is untouched (user clarification; "Push to Zoho Deal" remains the subform path). It reads the Deal, finds/creates a Products record per line, discovers the Quotes line-items key via META (`Quoted_Items`/`Product_Details`) and `insertRecord`s a Quote — Subject = deal name, `Deal_Name`/`Account_Name`/`Contact_Name` lookups carried over, lines as std subform rows (discount as amount). add-btn handler refactored into `pushLines()` unchanged in behavior. Follow-up (same day): **parameter values on quote lines** — the item's stored parameter values (Size, Colour, …) are written into the line-item Description column ("Size: 42 · Colour: Red") on both the Deal → Create Quote path and the Quotes-mode push (`lineDesc()` + `getQuotesLineMeta()` discovers the Quoted_Items description column via META; classic `Product_Details` uses `product_description`), **and onto any matching custom Quoted_Items columns by label** (`applyParamCols()`: column "Size" ↔ property "Size", numeric columns coerced, never overwrites qty/rate/desc — same rule as the Deal subform's `customRow`). Fetched from structured values, not parsed from item description text. Second follow-up: MSUN's `Quoted_Items` has **no** custom columns (META-verified) — the Size column lives in the Quotes **custom "Product Information" subform**, so Create Quote now also writes those rows (`getQuotesLineMeta()` discovers the Quotes custom subform + Products lookup column, rows built with the existing `customRow()`); settings hub card retitled "SKU Series & Defaults" so the default-item-type setting is findable. No schema change. Deliberately not done: opening the new Quote in CRM after create (popup just closes+reloads) | 🚧 built, pending Dev deploy + verify |
| CR-144 | 2026-09-12 | **By-Item grid: PR links + "Associated WO" toggle + inline PR editor** — user request (screenshot of the Purchase Requests column showing "2 work orders ▾"): the column now leads with the PR series. Per row it renders each draft PR the item sits on as a clickable `PR-000x` link (dash when none — user decision), and the per-WO breakdown hides behind a new **Associated WO ▾** button (shown only when pending lines exist). Clicking a PR link opens an inline PR editor on the same page (user decision; same pattern as the Orders→`PoSplit` drill-in) where line qty/vendor/add/delete/confirm work — including **consolidated cross-WO PRs (`woId` null), which had no edit surface before**. Backend: `shortfall-by-item` "Requested" breakdown entries now carry `prId` (`routes/workorder.js` draftLines map + `purchase.js shortfallByItem`, two one-liners). Frontend: PR card extracted verbatim from `PurchaseTab.jsx` into exported `PrCard` (all mutations keyed by pr/line id, so it's WO-agnostic); `WorkOrderPurchasePage.jsx` gains `selectedPr` state + `PrEdit` wrapper (vendors + `PrCard`), placed after the `selectedPo` block so a PO opened from the editor wins and closing it returns to the editor; `woSummary` rewritten; Requests-grid row click now opens consolidated PRs (`pr.woId ? PurchaseTab : PrEdit`) instead of doing nothing. No schema change. Deliberately not done: links for PO-stage lines (PO numbers already shown in the expansion/Orders) | 🚧 built, pending Dev deploy + verify |
| CR-143 | 2026-09-12 | **Recipe → Books composite item push** — user flow: recipes are built in the Recipe Engine against the local material master; once fixed, "Push to Books" on the recipe creates or overwrites a Books composite item whose `mapped_items` come from the recipe, so the composite lands on Sales Orders and the existing SO→WO flow (BOM seeded from `mapped_items`) works unchanged. User decisions: manual push button; first push picks the existing composite (with dummy lines) or "create new", link stored on the recipe (`RecipeTemplate.booksCompositeItemId`, copied by new-version so the lineage keeps one composite); push **fully replaces** `mapped_items` (recipe is source of truth; Books name/sku untouched on update); default material = first enabled option per component (per-order variations stay in the WO BOM flow); materials link to Books raw-material items via a manual typeahead picker on the Materials page (`MaterialType.zohoItemId`/`zohoItemName`), push 400s listing unlinked materials. Backend: `recipe/calc.js` pure `bomLines()` (perUnitQty = component.qty × castWeight, dedupe-by-item summing, skip no-option/zero-qty, collect unlinked; selftested); `routes/recipe.js` — materials CRUD accepts the link fields, `wrap` maps Zoho auth expiry to 409 `reauth_required`, new `GET /books-items?q=` (searchItems typeahead), `GET /books-composites` (listCompositeItems picker), `POST /recipes/:id/push-books` (no `assertDraft` — targets Published recipes, only recipe write is the stored link; stale link (1002/2006/404) clears the id and 409s to re-link, no silent recreate; refreshes `CompositeItemCache` best-effort); `perms.js` RECIPE_MAP rows for the two lookup routes. Frontend: RecipeBuilderPage header "Push to Books" + `PushBooksDialog` (client-side BOM preview mirroring bomLines, unlinked warning linking to Materials, composite picker/create-new on first push); RecipeMaterialsPage "Books Item" grid column + debounced `BooksItemPicker` in the edit modal. Schema: 3 columns via MCP (see SCHEMA.md ledger). Deliberately not done: auto-sync on save/publish, bulk sync screen, per-quotation composite push, auto-create missing raw materials in Books | 🚧 built, pending Dev deploy + verify |
| CR-142 | 2026-09-12 | **Abbreviated status chips across all grids** — user request (with a Zoho-style "IL"/"DSP" screenshot): status columns force grids wide; every chip now renders a short code with the full label on native `title` hover. Centralized in the two shared chip components, so all grids/detail headers inherit with no per-page edits: `woCommon.jsx` — `Chip` gains `full` (title), `STATUS_ABBREV` (DRF/PAP/APR/MAP/RFP/IP/QC/CMP/CLS/CXL), `PROC_ABBREV` (REQ/PO/PRC/RCV), exported `abbr()` fallback (initials, or first-3 for one word), and new `ZStatusChip` for Zoho lowercase/underscore statuses (PND/PRC/RCV/BLD/PBL/CLS/CXL/DRF, "—" when empty); `recipeShared.jsx` — `StatusPill` abbreviates (PUB/DRF/SUP/ARC/QTN/ORD) + `title`. Plain-text statuses converted to chips: POS grid Received/Billed columns (`WorkOrderPurchasePage.jsx`) and the PO detail meta rows (`PurchaseTab.jsx`) now use `ZStatusChip`. Per user decision: abbreviate everywhere incl. detail headers. No schema/backend change | 🚧 deployed to Dev, pending verify |
| CR-141 | 2026-09-11 | **CRM widget on Deals (Product Information subform)** — the SKU Picker now works from a Deal's detail page, not just Quotes (closes the long-parked CR-012 Deal flow, superseding its `Plan_Pricing`-lookup spec). `functions/skuapi/widget.html` only (loader untouched, no backend change — CRM writes are all client-side SDK): PageLoad gate accepts `Deals` and captures `moduleName`, which now drives `META.getFields`/`getRecord`/`updateRecord`. `discoverSubforms` per module: Quotes unchanged (`Quoted_Items`/`Product_Details` + custom); Deals has no standard line-items subform → `stdKey null`, custom = the subform labeled **Product Information** (fallback: first subform), rows written via the existing `customRow` label-mapper. If the subform has a lookup-to-Products column (`info.custom.productCol`, both v2 string and object meta shapes handled) it's filled via `findOrCreateProduct`; otherwise Products creation is skipped entirely on Deals. UI text de-quoted ("Push to Zoho Deal", "Reading record…"). **CRM console step (Dhiraj): add the existing SKU Picker button to the Deals detail page** — manifest is module-agnostic, no re-zip. Deliberately not done: standard-subform support on Deals (none exists in CRM) | 🚧 built, pending Dev deploy + verify |
| CR-140 | 2026-09-11 | **CRM quote widget: 3-column layout, Push button always visible** — user report: with 24 lines selected the bottom "Push to Zoho Quote" button was unreachable — `#panes` had `flex-wrap: wrap`, so when CRM caps the popup width the quote-lines pane wrapped *below* the results pane and its footer fell off the `overflow:hidden` 100vh card. `functions/skuapi/widget.html` only (loader untouched): panes no longer wrap and are reordered per request — **filters left** (the CR-111 parameter panel becomes a 250px column, `#fp-grid` single-column with its own scrollbar, no height cap), **search + results middle** (`#searchbar` with chips moved into `#left`), **quote lines right** (unchanged; pinned footer now always on-screen). `#fp-toggle` collapse + `.collapsed` CSS deleted (existed only to reclaim vertical space in the old horizontal layout). No JS/logic changes beyond the toggle removal — chips/search/create-card all address elements by id | 🚧 built, pending Dev deploy + verify |
| CR-139 | 2026-09-11 | **Batch-tracked reserve unblocked (two live Zoho bugs) + WO-0017 end-to-end API test pass** — Root-caused "No batches in stock at the source warehouse" on CF8 KGV Body 50mm: (1) Zoho's `/items/{id}` detail returns `locations[].batches: []` even when batch records exist (verified live: the PO-00031 receive created batches "111"/"11121221" with balances, invisible on the item detail) — new `listItemBatchRecords()` (`GET /items/batches?item_id=`, per-warehouse balance from `associated_locations[].balance_quantity`) + `withBatchFallback()` patch the item's batch pool in `/tracking-options` and `availableSerialsBatches`; also fixed the latent empty-array short-circuit (`fromWh.batches` `[]` blocked the item-level fallback in both pool builders). (2) Transfer Orders rejected batch lines with "Invalid value passed for out_quantity" — TO `batches[]` take `out_quantity`, not `quantity_transfer` (the internal pick shape; bundles already mapped it) — `createTransferOrder` now converts at the payload boundary. Picker dead-end message replaced with actionable guidance (MaterialsGrid). E2E API test on WO-0017 (minted session, sequential curl): batch reserve 3 kg → TO-00014 ✓, issue/return round-trip TO-00015/16 ✓ (grid A–I invariants exact, 25 rows), over-reserve cap rejected ✓, re-reserve TO-00017 ✓, PR-0013 confirm → PO-00032 (names, Extra tag, cf_so_no both lines) ✓, item-wise raise 8 vs 6 required → PO-00033 required-6-with-SO + extra-2-no-SO split ✓, PO edit preserves cf_so_no ✓, all lifecycle/QC/close/reopen/approve/delete guards reject with clear messages ✓ (CR-138 fixes all verified live). Status auto-bumped Draft→…→InProgress by design (STATUS_BUMP on issue). Selftests + tests all pass | ✅ deployed to Dev, verified live |
| CR-138 | 2026-09-11 | **WO purchase pass: PR Req Qty column, rail due date, Books PO line name/extra-split/SO No, drop Row/Panel Type** — (1) PR line tables in PurchaseTab gain a read-only **Req Qty** column (`requiredQty`, "—" for extras) next to the editable order Qty — the requested quantity was fetched but never rendered. (2) The WO left-rail cards (WorkOrderPage) show `· Due <date>` after the WO date, red when `dueDays < 4` (same rule as the list grid). (3) Books PO lines from `createPoForLines` now carry the item name: `name: rmName` on the line **and** the name prefixed into the description (`<name> · [Extra ·] SO <n>/PR <n>`) in case Books ignores line `name` when `item_id` is set. (4) **Extra qty gets its own PO line**: `raiseItemPO` no longer scales the WO breakdown *up* when the buyer raises the total — WO shares keep their required qty and the excess is stored as an unattributed `isExtra` line (`requiredQty 0`, no WO/SO), scale-*down* unchanged; `collapseLines` keys on `(item, soNumber, isExtra)` (normalizing Catalyst's string booleans — `"false"` is truthy) so required and extra never merge; selftest extended. (5) **SO No on item-wise POs**: `salesOrderId` plumbed end-to-end — shortfall-by-item route tags it (pending + ordered/draft entries), `shortfallByItem` keeps it on breakdown entries, `raiseItemPO` passes it as `soId` → existing `cf_so_no` lookup (per-WO confirmPR path already worked). (6) Row Type / Panel Type dropped from the WO detail header and the detail API (unused `soCf` live Books read deleted). No schema change (`isExtra` column existed) | 🚧 deployed to Dev, pending verify |
| CR-137 | 2026-09-11 | **Settings hub (`/settings/*`) — Zoho-style settings area** — All settings move behind a header gear icon into one hub with its own left sidebar (sections + client-side search over section/card labels) and a content pane, per the reference design. New `SettingsLayout.jsx` (settings shell + nested routes + `SkuSettingsHub` card landing, one lazy chunk holding every settings page) and `OrgSettingsPage.jsx` (org name/ID/signed-in-as + Switch Organization, Zoho Books connection dot + Reconnect → `/server/skuapi/auth/zoho?consent=1`, and — `isAdmin` only — the embedded `AddonAdminPage` matrix; everything read from the `/auth/me` payload, **zero backend changes**). Sections filter by the same addon/perm rules as the main sidebar: Org Settings (all), Users & Roles (`users.manage`), SKU Settings (`sku` + addon; cards → SKU Series / Industries / Properties), Work Order (`wo.settings` + addon). Moves: Industries/Properties/SKU Settings leave the SKU tab bar & account dropdown; Users & Roles and the Admin section leave the main sidebar; WO Settings leaves `/wo/*`. Old paths all redirect (`/sku/industries[…]`, `/sku/properties`, `/sku/settings` → `/settings/sku/series`, `/wo/settings`, `/access/users`, `/admin/addons` → `/settings/org`; `LegacyPropertiesRedirect` → `MovedPropertiesRedirect` targeting `/settings/sku/industries/:id/properties`); default landing changes `/sku/industries` → `/sku/items`. In-page links to old paths ride the redirects; only PropertyManagerPage's breadcrumb was retargeted. Deliberately not done: dedicated Books-connection status endpoint (`/auth/me` already carries it), moving embedded pages' 56px action headers (they carry counts/Refresh/+Add) | 🚧 built, pending Dev deploy + verify |
| CR-136 | 2026-09-11 | **Numerical series org-wide: Simple / Item-wise modes + SKU Settings UI** — the series moves from per-industry to an org-wide setting with three modes (OrgSetting `skuSeriesMode`: `off` / `continuous` / `params`, plus `skuSeriesPad` width 1-8; unset mode falls back to the legacy `Industry.seriesStart`/`seriesPad` so pre-CR-136 orgs keep working with no migration). **Simple series** (`continuous`) = one running number per industry (FAB-RED-001, FAB-BLU-002, FAB-RED-003). **Item-wise series** (`params`) = each combination base counts its own series — same params again creates a new item with the same name and that base's next number (CH-RD-001, CH-RD-002; CH-BL-001). Implementation: since `assemble()` is deterministic (same params ⇒ same base string), the item-wise counter is scoped by base SKU — `nextSuffix` gains an optional `base` anchor (`^base+sep+digits$`, so longer bases sharing the prefix don't count) and `nextSeriesSku` a `perBase` flag adding `sku LIKE 'base+sep*'` to keep the 300-row page on-series; the earlier key-property matching design (`skuSeriesKeyProps` + `searchItemIds` suffix reuse) is **deleted** — it resolved same params to the *same* suffix, which 409'd as a duplicate instead of creating the next unit. The edit guard (unchanged combination keeps its suffix) now covers both modes. UI: `SkuSettingsPage.jsx` gains the mode radios + "Number format" field (type `001`, digit count = width); the generator's series chip is gated by the org setting (`GET /api/sku-items/settings` resolves the legacy fallback) instead of `industry.seriesStart`; the per-industry "Allow numerical series" checkbox/format is removed from `IndustriesPage.jsx` (columns stay in the DB serving the fallback). `skuSeries.test.js` extended with base-anchored cases. Deliberately not done: atomic counter row (same accepted max+1 race as CR-089/091/093), renumbering existing SKUs on mode/width change, cleanup of stale `skuSeriesKeyProps` OrgSetting rows (they just go unread) | 🚧 deployed to Dev, pending live verify |
| CR-135 | 2026-09-11 | **WO Edit re-exposed in ⋯ menu** — the EditModal (project name, WO date, due date, priority, machining/fitting completion, costs, notes) survived the WO detail redesign but its trigger was dropped, so `setEditing(true)` was never called and edit was unreachable. One menu item "✎ Edit Work Order" added to the ⋯ menu in `WorkOrderPage.jsx`; backend `PUT /api/wo/:id` was intact all along. | ✅ shipped |
| CR-134 | 2026-09-11 | **WO packing list + FG dropdown + Item List chip; Books widget renamed "Print Packing List"** — (1) Books widget button renamed "Print Export" → **"Print Packing List"** (`books-widget/plugin-manifest.json` both locations; zip rebuilt — manual re-upload in Books pending). (2) Work Order Details tab gains an always-visible finished-good dropdown ("All finished goods" + one option per FG) filtering the materials grid (`MaterialsGrid.jsx` `fgSel` state, filter in the `visible` memo — group headers vanish with their rows; chips/counts stay org-wide); the **Items chip is renamed "Item List"** and its FG dropdown now always renders (the `fgs.length > 1` guard dropped in WoItemsTab). (3) **Print Packing List from the WO** (⋯ menu) reusing the CR-131 builder: opens `/server/skuapi/packing?woId=<id>` in a new tab — packing.html gained a standalone boot (`?woId=/?soId=/?invoiceId=` query params skip ZFAPPS and go straight to the auth probe; same-origin session cookie signs in, silentAuth/popup as fallback; Books widget path byte-identical since Zoho hosting never passes these params). Backend `GET /api/packing/doc?woId=` (org-scoped `byOrg` lookup, 404 cross-tenant): a WO **with** `salesOrderId` delegates into the existing SO path — docKey `so:<id>`, the **same saved plan as the Books widget** (Books fetch failure surfaces as an error, no `wo:` fallback — that would fork the plan); a WO **without** one gets docKey `wo:<ROWID>` with lines from `WorkOrderFG` (name/SKU/qty) and blank invoice no/date — typed manually into the already-editable `invoiceNoDate` header. `DOC_RE` accepts `wo:\d+` (selftest extended). No schema change (docKey is varchar(80)). Deliberately not done: invoice columns on WorkOrder (manual entry per user), consignee address from the WO (no address stored) | 🚧 built, pending Dev deploy + zip re-upload + verify |
| CR-133 | 2026-09-11 | **Bulk item import: product-type gate removed, composite import inline** — ImportItemsPage no longer gates the simple flow behind a "Product type" dropdown: the industry is auto-picked from `GET /api/industries` (first one); a small unnumbered selector renders only when the org has more than one, and steps renumber to 2·Sample / 3·Upload / 4·Map. Import button also disables on `!industryId` (zero-industry org edge). The "Composite items" card is no longer a `<Link to="/sku/bom">` (which forced a second click on the BOM page's "Import Books export" button) — it toggles an inline composite flow on the same page: `downloadBooksSample()` sample, upload → `parseBooksComposites` → preview panel (groups + "Create missing component items" checkbox) → `POST /api/wo/composites/import`, toasting per-row errors/success like CompositeBomPage. All reused from BomTab.jsx exports; CompositeBomPage and backend untouched. Deliberately not done: "updates existing / creates new" badge in the preview (needs the `/api/wo/composites` list + reauth handling; import results already report outcomes), and a real `.xls` composite sample (existing generated CSV opens in Excel) | ✅ built, pending verify |
| CR-132 | 2026-09-10 | **Bulk item import: one sample file, real .xls/.xlsx support, always-on Books field mapping** — The Import Items page collapses to a single flow: the per-product-type "App template" format (radio + generated per-industry template download) is removed; every upload maps to Zoho Books fields. One fixed sample for all product types: `frontend/public/sample_items.xlsx` (replaces `sample_items.csv`), a trimmed copy of a real Books item export ("Item 4.xlsx", repo root) — its 120 headers + 5 example rows, `Item ID` values blanked. Parser swapped in the shared `readXlsxFile` one-liner (BomTab.jsx, also used by CompositeBomPage/BomTab, so composite import benefits too): `read-excel-file` → SheetJS `xlsx` (lazy chunk) — the old parser failed on real Books exports ("invalid signature": Books writes streamed zip entries) and never supported legacy `.xls` at all; first sheet only (Books exports carry a second dropdown-metadata sheet). Mapping step always renders after upload; `autoMap` stays exact-match-only (case-insensitive, rest left blank for manual mapping) but `normHeader` now also strips the export-style `CF.` prefix so `CF.Material` auto-maps to the `Material (Custom Field)` property (booksMapping.js + test). Against the new sample, 34 of 39+CF fields auto-map; renamed export columns (`Rate`, `Purchase Rate`, `Usage unit`, `MPN`, `Vendor`, `Location Name`…) stay blank by design. Backend untouched (`format:'books'` path already existed; app-template `processImport` stays route-reachable). Deliberately not done: fuzzy/alias matching (explicit "exact 100%, rest blank" requirement), mapping table over all 120 export columns (only supported fields listed) | 🚧 deployed to Dev, pending verify |
| CR-131 | 2026-09-10 | **Packing List — Zoho Books widget (Invoice + SO pages)** — New Books widget (`functions/skuapi/packing.html`, served at `GET /packing` with the same frame-ancestors CSP as the CRM widget via a shared `serveWidget()` helper in index.js) producing a printable Packing List per the MSUN export reference. Line items come from the SO linked to the invoice (resolution chain `invoice.salesorder_id` → `salesorders[0]` → first `line_items[].salesorder_id`; falls back to invoice-keyed when no SO) or from the SO itself when opened on the SO page — either way the same plan (`docKey = so:<id>` / `inv:<id>`). User builds box/pallet rows **fully manually** (per row: Box/Pallet, item, qty, weight/pc, gross weight, box dims; net = qty × wt/pc); BOX and PALLET numbers are independent 1..N series derived from row order at render, never stored. Export/Domestic print variants (domestic drops ports/incoterms/AD-code/LC/country blocks); print = A4-landscape sheet cloned into an iframe srcdoc (`estimate-prototype` pattern). Plans persist per SO/invoice per org: new `PackingList` + `PackingBox` tables (row-per-box; see SCHEMA.md), `routes/packing.js` (`GET /api/packing/doc?invoiceId=|soId=`, `POST /api/packing/:docKey` replaces boxes wholesale — POST not PUT: PUT is never CORS-simple, its preflight dies at the Catalyst gateway (found live: cross-origin save from zappsusercontent failed until switched); ponytail selftest) mounted **without** an addon gate like grid-prefs; new-list export headers prefill from the org's newest saved list; consignor prefills from the CR-122 company OrgSettings (read via `workorder/store.settings()` directly, not the gated /api/wo route). `getInvoice()` added to booksApi.js. Auth = widget.html's cookie-free `?t=` token dance (no addon check). Deliberately not done: multi-item boxes in the UI (schema/API already accept `items[]`), auto-split of line qty into boxes (declined), weights from Books item fields, Zoho Packages/Shipments integration. Books has **no External-hosting option** (unlike CRM), so a zip is uploaded: `books-widget/` — `plugin-manifest.json` (`service: FINANCE`, locations `invoice.details.button` + `salesorder.details.button`, `widget_type: "modal"`, name "Print Export"; valid locations verified against zoho/zoho-finance-ai-widget-rules) + `app/translations/en.json`; built with the CR-096 recipe (`zip -rD`, letters-only name `packinglist.zip`). **A CRM-style loader stub does NOT work in Books** (first upload: dark modal, zero /packing hits in access logs — Books modal widgets stay hidden until the zip-hosted page itself completes `ZFAPPS.extension.init()`), so the zip is self-contained: `app/widget.html` = build-time copy of `packing.html`, which was made origin-independent (absolute `CATALYST` API base, `APP_ORIGIN` pinned for the sku-auth handshake — App.jsx TRUSTED already covers `.zappsusercontent.*` — and text/plain JSON bodies to stay CORS-simple). Widget edits now need re-zip + re-upload (`cp` + `zip -rD`, see TASKS). Manual step: delete old widget, upload the zip in Books → Settings → Developer Space → Widgets | 🚧 deployed to Dev; pending zip upload in Books + verify |
| CR-130 | 2026-09-10 | **Purchasing: drop the "Extra" pill + sheet-style By Item editing** — The blue "Extra" badge next to item names on purchase-request lines is removed everywhere (PurchaseTab PR cards, WorkOrderPage "Purchase documents" table; `ExtraPill` deleted from woCommon — the `isExtra` data flag and the By Item "Extra" qty column stay). By Item view now edits like a sheet: vendor selects and Split are no longer disabled behind the row checkbox — every cell is always editable, and touching a row's qty/extra/vendor/split auto-ticks it so the buyer fills the grid in one pass and hits Raise once (untick still drops a row). Excel-style keyboard nav via one delegated `onKeyDown` on the table: Enter walks down the same column (`data-nav` tags on qty/extra/vendor cells, split rows included), ArrowUp/Down too on inputs (prevented from spinning the number; arrows keep native meaning inside selects). Raise/grouping logic unchanged. Deliberately not done: in-app vendor creation (explicitly declined — vendors still come from Zoho Books only). Follow-up: the "Purchasing" page-title header bar (h1 + cosmetic wo/item/vendor counts, incl. the `onMeta` plumbing) removed entirely — page starts at the view-switcher toolbar; user rule going forward: no in-page title bars | 🚧 deployed to Dev, pending verify |
| CR-129 | 2026-09-10 | **Purchasing: page title "Purchase requests" → "Purchasing", PR refs inline on By Item rows** — The two-line page header ("Purchasing" eyebrow + "Purchase requests" h1) collapses to a single "Purchasing" h1; the Requests/Orders views and all backend routes are unchanged (an initial removal of the Requests view was a misread of the request and was fully reverted). In the By Item view the "Work Orders" column is now **"Purchase Requests"**: the expand button leads with the row's PR number(s) (`PR-0009 ▾`; `poNumber` is overloaded in the breakdown — `status==='Requested'` rows hold PR numbers, other non-Pending rows real PO numbers), falling back to `N work orders` while no PR exists; a PR with nothing pending renders as plain text (no toggle). The muted `N pending · N on PO · PO-…` summary text is removed entirely (per follow-up) — the cell holds only the PR button/text. Also triaged the reported "Error accessing app" on the main web app: the string exists nowhere in this repo — Catalyst hosting/web app healthy (deployed, access logs all 200/304 with normal OAuth 401→302 pairs), so it's the Catalyst platform page shown to a Zoho account that isn't a member of the Development project; fix is Add_User, pending the affected email | 🚧 deployed to Dev, pending verify |
| CR-128 | 2026-09-10 | **Books import: fixed sample file + side-by-side field mapping** — The Books-format "Download template" (industry-derived headers) is replaced by a fixed **Download sample file** serving the stock Zoho Books `sample_items.csv` verbatim (now a static asset in `frontend/public/`; same file for every product type; relative href since the app is hosted under `/app/` with HashRouter). After uploading a sheet in Books format, a new **Match fields** step shows every Zoho Books field (fixed headers + the industry's `"<caption> (Custom Field)"` properties) beside a dropdown of the uploaded file's columns — same-named columns (case-insensitive, custom-field suffix + its "Feild" misspelling tolerated) are pre-matched automatically, the rest map manually; matched count shown, Import disabled until Item Name is mapped. On import the rows are re-keyed to the Books headers client-side (`applyMapping`), so the backend `booksImport.js` contract is unchanged; unmapped columns are dropped. New pure module `frontend/src/components/booksMapping.js` (`normHeader`/`autoMap`/`applyMapping`) + `booksMapping.test.js` (node assert). App-template flow untouched. Deliberately not done: fuzzy/synonym auto-matching (exact normalized match only), saving mappings per org, mapping for the app-template format | 🚧 built, pending Dev deploy + verify |
| CR-127 | 2026-09-10 | **Zoho Books item-sheet import + auto-push setting + Fabric/Yarn demo schemes** — Import page gains an item-kind chooser (Simple items here / Composite items → link to the existing BOM-page import, unchanged) and a sheet-format toggle: App template (unchanged) or **Zoho Books item sheet** (the `sample_items.csv` export shape; auto-detected when the uploaded headers carry Item Name + SKU). New `functions/skuapi/booksImport.js`: fixed Books headers map to a typed JSON stored in new `SKUItem.booksData` (`rate`, `purchase_rate`, `hsn_or_sac`, `unit`, `product_type`, `item_type`, `is_returnable`, brand/manufacturer/UPC/EAN/ISBN/part_number, `reorder_level`, `package_details`; taxes, accounts, preferred vendor, warehouse and opening stock stored under `_` keys — reference-only, never pushed since they need Books id lookups); `"<caption> (Custom Field)"` columns (the sheet's "Custom Feild" typo tolerated) resolve to Properties via the existing `buildResolver`. A row **with** an SKU keeps it verbatim (no series; property cells resolve best-effort so a typo can't fail the row); a row **without** one runs the exact manual engine (`assemble` + `nextSeriesSku`; row error asks to fill SKU or custom-field columns). Push: `booksApi.createItem`/`updateItem` gain a trailing `extra` object spread over the hardcoded defaults (imported unit/rate/product_type win; `custom_fields` reapplied after; non-inventory `item_type` drops tracking/inventory-account fields), `push.js` parses `booksData` on the Trading branch, resolves `_gstRate` → `tax_id` via `getGstTaxId`, strips create-only keys on update. New org setting **`skuAutoPushImport`** (`OrgSetting`, generic helpers) + `GET/PUT /api/sku-items/settings` + `SkuSettingsPage` (account menu → SKU Settings, sku-generator addon): when on, `/api/sku-items/import` pushes each created row sequentially and results carry `pushed`/`pushError` (shown in the results table + CSV). Seeded **OCTFIS Demo2 (org 894544992)** via Catalyst MCP with the user's coding sheets: Fabric (FB · Content · Dye Type · Weave · Surface Ornamentation · GSM · Width · Colour) and Yarn (YN · Content · Yarn Type · Ply/Count · Twist Type · Colour), separator `-`, series pad 2 — the pipeline reproduces the sheets' own examples (`FB-CT-PD-PL-EB-500-220-01`, `YN-CT-CB-260-S-01`; verified by an in-memory end-to-end harness). Sample Books-format CSVs in `samples/`. Tests: `booksImport.test.js` (header routing, typo stripping, enum normalization, `_`-key/create-only filtering, 10k guard). Deliberately not done: pushing taxes/accounts/opening stock (id lookups), composite rows in the Books sheet (always Trading), busboy/server-side parsing (client-parse convention kept) | 🚧 built, deployed to Dev; pending live import + push verify |
| CR-126 | 2026-09-10 | **Auto assembly from the WO (Haresh WO mods §3)** — per-FG, per-quantity assembly that turns issued material into finished-good stock. New `workorder/assembly.js` `assembleFg`: validates qty against `fgQty − assembledQty` and WO status (Approved+), **requires the FG to already be a Zoho composite item** (no API converts a plain item; creating one would produce stock of a different item than the SO's — blocked with an actionable error, per user decision), best-effort pushes the WO's *current* BOM to the composite (`updateCompositeItem` + `bom.refreshComposite` — assembly consumes WO-side edits), then `createBundle` (`zoho/inventoryApi.js`, **POST /inventory/v1/bundles**, doc-verified fields: `reference_number` `WO-xxx-An`, `quantity_to_bundle`, `line_items[].quantity_consumed` + per-line `location_id`=Issue warehouse, FIFO `serial_numbers`/`batches[{batch_id,out_quantity}]` for tracked components, `finished_product_serial_numbers`/`_batches` generated from the reference for a tracked composite, `is_completed: true`, FG stock lands in **Main**). New `WoAssembly` table records each partial assembly with the Zoho bundle number; `WorkOrderFG.assembledQty`/`status` track progress (fully assembled FG → `Closed`). **All FGs assembled → WO moves to QualityCheck, not Closed** (user decision: QC Passed + Close stay manual; existing auto-return sweep runs on Completed as before). Route `POST /api/wo/:id/fg/:fgId/assemble` behind `wo.action.assemble`; GET `/:id` FG payload carries `assembledQty`/`status`/`assemblies[]`. UI: WoItemsTab shows "Assembled x/y" + Closed chip + ⚙ Assemble button → modal (qty prefilled to remaining, prior bundle numbers listed). Deliberately not done: explicit serial/batch picks for assembly components (FIFO only — reuse the CR-123 picker if asked); `account_id` on bundle lines (docs mark it required, omitted — composite carries its accounts; **verify on first live assembly**) | 🚧 built, pending Dev deploy + live bundle verify |
| CR-125 | 2026-09-10 | **WO action-level permissions (Haresh WO mods §5)** — extends the CR-120 Users & Roles module (NOT a parallel per-user JSON): 9 new `PERM_KEYS` in `perms.js` — `wo.action.reserve/dereserve/issue/return/assemble/approve/close/po.create/po.modify` — grantable per role in the existing role editor (`UsersRolesPage.jsx` PERM_LABELS, "WO: …" entries). New `assertAction(catalyst, orgId, userId, key)` helper (in-route variant of `requirePerm` for handlers that derive the key from the body) enforced on: `/:id/txn` + `/txn/:txnId/confirm` (`wo.action.<type>`), `/:id/status` when target Closed, `/:id/approve`, `/purchase/raise` + `/:id/purchase-request` + `/pr/:prId/confirm` (`po.create`), `/po/:poId` PUT/DELETE/status (`po.modify`), `/:id/fg/:fgId/assemble`. Same lockout rules as page keys: super-admins always pass, an org with zero roles is wide open — **an org that already configured roles must tick the new "WO:" boxes** (roles shipped hours ago in CR-120, so nobody is realistically affected). UI gating via `can(user, key)` (woCommon): MaterialsGrid action tabs filter to allowed ones, WorkOrderPage Close/Approve hidden, PurchaseTab Raise/Confirm hidden, WoItemsTab Assemble hidden. No schema change | 🚧 deployed to Dev, pending verify |
| CR-124 | 2026-09-10 | **Print templates: company block + per-movement slips (Haresh WO mods §6)** — org-level company details on every printed WO document, fixed layouts (user decision: no template designer). 4 new `SETTING_KEYS` group "Company details": `companyName`, `companyAddress`, `companyGstin`, `companyLogoUrl` (plain URL; Stratus upload is the upgrade path) — settings page renders them with zero UI changes. New `PrintHeader` (WorkOrderPage) — logo/name/address/GSTIN band — mounted on both `WoPrintSheet` (Work Order print) and `IssueSlip` (Reserve/De-reserve/Issue/Return slips — per-type titles already existed). IssueSlip additions: from→to warehouse names (ids now in `listTxns` payload, names from `/api/wo/settings` warehouses), per-line **Batch/Serial column** from CR-123's `lines[].tracking` (old txns fall back to the notes blob). Same `.wo-print-sheet` + `window.print()` mechanism — no new print infra | 🚧 built, pending Dev deploy + verify |
| CR-123 | 2026-09-10 | **Batch/serial picker on stock moves (Haresh WO mods §1)** — tracked items get an explicit, mandatory picker instead of the silent FIFO auto-pick (CR-042). `MaterialTxnLine.trackingJson` (text 10000, `{"serials":[…]}`/`{"batches":[{batch_id,batch_number,qty}]}`; ~400 serials/line cap guarded with a "split the movement" error). `zoho/inventoryApi.js`: `listSerialsBatches` (full pool at a warehouse, for the dialog) + `trackingToLine` (explicit picks → TO line fields) + `createTransferOrder` honors per-line `tracking` with **FIFO fallback kept** (auto-return sweep + API callers untouched — mandatory-for-tracked is UI-enforced). New `GET /api/wo/tracking-options?itemId&type&qty`: source warehouse from `routeFor` (de-reserve/issue offer Reserve stock, return offers Issue stock; honors warehouse-override), returns pool + FIFO prefill. `txn.js`: `planLines` validates picks cover the qty exactly (`trackingProblem`), `createDraft` stores per-line `trackingJson`, `confirmTxn` re-validates and passes picks to the TO; `listTxns` parses `lines[].tracking` (notes blob kept for old slips). UI: `TrackingPicker` modal in MaterialsGrid — opens automatically on Proceed when any entered line is tracked, serial chips / batch qty table, FIFO prefill pre-selected, confirm disabled until each line matches its qty; untracked flow unchanged. Selftests extended (`inventoryApi --selftest`) | 🚧 built, pending Dev deploy + verify |
| CR-122 | 2026-09-10 | **Purchase-side pack: Books→WO delta sync + receipt status + Extra flag (Haresh WO mods §2/§4/§7/§8)** — (1) *PO changes in Books reflect in the WO*: `refreshPurchaseOrders` (purchase.js) now handles all four deltas — PO **deleted** (confirmed HTTP 404 only, via `err.httpStatus`; transient errors never reset) → `resetPoLines` so items return to the shortfall; PO **voided/cancelled** in Books → same reset as the app-side cancel; **line removed** → `resetPoLines(poId, {itemId})`; **line qty edited** → `purchaseQty` written back (multi-WO groups scaled by share, last line absorbs rounding). Webhooks + nightly reconcile get all four free; `po.sync.deleted/cancelled/lineRemoved/qtyChanged` ActivityLog entries + labels. (2) *Material receipt status*: per-line `ReceiptChip` in MaterialsGrid (Not received / Partial x/y / Received, from grid cols E/F, only when a PO exists) + WO-header aggregate chip from `purchaseRequests[].lines[]` — no new endpoint. (3) *Extra flag*: `PurchaseRequestLine.isExtra` (boolean) — set by AddLineRow ad-hoc lines (always extra by definition) and By-Item "Extra" entries (`raiseItemPO` `item.isExtra`, sent from the client — the empty-breakdown fallback alone would mis-flag draft-covered orders); blue "Extra" pill (`ExtraPill`, woCommon) in PurchaseTab lines + WO History purchase table. (4) *PO-from-WO gap check*: full/partial/select/extra flows all pre-existed (CR-023/077/119) — verification only | 🚧 built, pending Dev deploy + verify |
| CR-121 | 2026-09-10 | **Purchase selection bar: covering PR #s, vendor names dropped** — `WorkOrderPurchasePage.jsx` (ByItemView) only. The floating bar's second line no longer lists selected vendor names (unbounded — a 2-vendor pick rendered "— AAKAR PAINTS, 3D TECHNOLOGIES" and grew with each vendor); it now reads just "Creates N purchase order(s)" and appends "· On request: PR-…" listing the draft PR numbers already covering the selected items (`status === 'Requested'` breakdown entries, whose `poNumber` field carries the PR number). WO-grouping rows gained `item: i` so the full (unfiltered) breakdown is reachable there too. No schema/backend changes | 🚧 deployed to Dev, pending live verify |
| CR-120 | 2026-09-10 | **Grid column chooser (all list grids) + Users & Roles module + styled date picker** — three features. (1) *Column chooser*: every main record grid gets a "Columns" toolbar button → panel with show/hide checkboxes + native HTML5 drag-reorder, staged locally, **saved only on Apply, org-wide** (any user's Apply changes the layout for all users; `GridPref` table, `GET/PUT /api/grid-prefs/:gridKey`, no addon gate). New shared `DataTable.jsx` (`DataTable` + `useGridColumns(gridKey, COLUMNS)` + `ColumnChooser`; column def `{key,label,render,align,sortKey,width,lock}`); pure merge in `gridCols.js` appends code-added columns so future columns always surface; `lock` pins primary/action columns. Converted grids (~15 gridKeys): `wo.list`, `wo.purchase.shortfall/.prs/.pos`, `wo.reports.*` (fixed-column reports only — pivot reports with dynamic columns skipped), `wo.bom`, `wo.items`, `recipe.list/.materials/.costs/.quotations`, `sku.items/.properties/.industries/.books`. (2) *Users & Roles*: `Role` (named per-org permission set, JSON `perms`) + `UserRole` (assignment) tables; `perms.js` (`PERM_KEYS` at sub-page granularity — `wo.orders/purchase/bom/reports/settings`, `sku`, `reserve`, `estimate`, `recipe.recipes/materials/costs/configure/quotations`, `users.manage`; 60s cache mirroring `addonCache`; `--selftest`). Enforced server-side on every mount in `index.js` (`requireAddon` first, then `requirePerm`/`prefixPerm` path-map — effective access = org addons ∩ user grants) and client-side (`/auth/me` returns `perms`; sidebar filters entries/children, parent links land on the first visible child; route guards render `NoAccess`). **Default: no access until granted, with two lockout backstops** — `ADMIN_EMAILS` super-admins always get `"*"` (inside `userPerms`, unbypassable), and an org with zero roles is wide open, so deploy is a no-op until the first role is created. Management UI `UsersRolesPage.jsx` at `/access/users` behind the `users.manage` perm (an org "Admin" = a role with it ticked); Users tab = user × role checkboxes (users appear once they've selected the org — ZohoToken ∪ UserRole union, no invite flow), Roles tab = role editor with module checkboxes; `/api/access` routes (role CRUD with org-ownership + hand-cascade, full-replace user role assignment, `clearPermCache` on every write). (3) *DateInput*: shared styled popover calendar (`DateInput.jsx` + pure `dateText.js`, RowMenu's fixed-position/outside-close mechanism, app CSS vars, month/year selects, Today/Clear, dd/mm/yyyy typed input) replaces all 8 native `type="date"` inputs (WorkOrderPage ×4, WorkOrderNewPage, EstimatePage, RecipeBuilderPage, RecipeMaterialsPage). Deliberately not done: per-user column layouts (org-wide by request), `estimate`/`/api/crm` server-side gating (client-only — no sensitive data), per-verb read/write perm split (any-of prefix sets; split when a real leak shows), chooser on dynamic-column pivot reports | 🚧 built, pending Dev deploy + verify |
| CR-119 | 2026-09-09 | **Purchase Request follow-ups: Extra column, blue tabs, Orders column swap** — CR-118 feedback, `WorkOrderPurchasePage.jsx` only. (1) *Extra column* (By Item, both groupings): editable "Extra" qty beside Order Qty (blue-highlighted when > 0). On raise, Order Qty stays SO-attributed as before (per-SO `cf_so_no` PO lines), while Extra is sent as a **separate item entry with `breakdown: []`** → `raiseItemPO` inserts an unattributed PR line (CR-079 path) and `collapseLines` gives it its own **plain PO line with no SO reference** in Books. Frontend-only — merging extra into the one qty would NOT work (the backend scales the WO breakdown to the edited total, smearing the extra across SOs). Extra counts in the floating bar's line/unit totals and the WO-group units total; a checked row with Order Qty 0 + Extra > 0 raises just the plain line. (2) *Blue active tabs*: segmented pills (view switcher, Group by) highlight `--blue` + white like the app's other tab controls (white-chip style dropped). (3) *Orders view*: Work Order is now the first column (bold blue), PO # (with its 🔒 badge) moved to the old Work Order slot; row click → PoSplit unchanged. No schema/backend changes | 🚧 deployed to Dev, pending live verify |
| CR-118 | 2026-09-09 | **Purchase Request screen redesign (reference design)** — user supplied `Reference Designs/Purchase Request Sheet.dc copy.html`; its aesthetics, control placement, filters, and search are applied to `/wo/purchase` on the app's existing color tokens (no palette/font change — reference's purple oklch + IBM Plex deliberately dropped). `WorkOrderPurchasePage.jsx` only. **Page chrome**: header bar ("Purchasing" eyebrow + "Purchase requests" title + right-side meta counts — By Item: work orders · items · vendors via an `onMeta` callback; Requests/Orders: row count); toolbar with **segmented pill switchers** (track `--bg-page`, active chip white + shadow) for the view and, on By Item, the Item/Work Order grouping (lifted to page state; grouping switch still clears selection); **search box** on all three views (right-aligned, `--bg-page`, blue focus ring via a page-local `<style>` block) — By Item matches item name/id, WO numbers, chosen vendor (narrows display only, checked rows still raise); Requests match PR/WO/customer; Orders match PO/vendor/WO/PR. **By Item grid**: uppercase letter-spaced headers, **select-all checkbox** (visible rows), blue accent checkboxes, checked rows tinted `--blue-light`, qty inputs restyled (mono, `--bg-page`; checked → blue border/text), vendor selects **borderless until hover/focus** (red border cue when checked-but-empty kept), WO-group bands gain a **group checkbox** + right-aligned units total. **Floating selection bar** replaces the pinned raise bar: fixed bottom-center dark pill ("N lines selected · N units", "Creates N purchase orders — vendors" / "Pick a vendor on every line"), Clear + blue Raise button; hidden when nothing is selected. Behavior untouched: endpoints, raise-per-vendor flow, splits, breakdown expansion, drill-ins, GridFooter pagination. Deliberately not done: reference's Required+Extra qty split (single editable Order qty kept, user decision), Unit/price/Line-total columns (shortfall API has no rate/unit data), extra group-by modes (Category/Needed-by/Status — no such fields) | 🚧 deployed to Dev, pending live verify |
| CR-117 | 2026-09-09 | **WO create: full page at /wo/new (reference redesign)** — user supplied a reference design; the CR-116 CreateModal becomes a dedicated page. **Frontend**: new `WorkOrderNewPage.jsx` (route `new` in `App.jsx` before `:id`) — header row "New work order" + next-WO-number pill ("WO-… · auto", from the new preview endpoint, silent-fallback to "…"); three cards on the page background: *Sales order* (helper text, CR-116 SO combobox + summary strip + FG-lines checklist, all lifted verbatim), *Schedule* (Machining/Fitting/Completion date inputs, each with a read-only "Days: N" counter via `dueDays()` — the CR-113 two-way Due Days input is gone, counter replaces it; Completion date = `dueDate`), *Details* (Priority as segmented buttons from `WO_PRIORITIES`, click-again clears; Instructions textarea → `notes`). `WorkOrderListPage.jsx`: "+ New Work Order" navigates to `/wo/new`; CreateModal + `creating` state + Modal/WO_PRIORITIES imports deleted. **Backend** (`routes/workorder.js`): `GET /wo/next-number` (settings prefix + `nextNumber`, preview only — create still assigns the real number); `POST /wo` now persists `req.body.notes` (was hardcoded `""`). Deliberately not done: Attachments dropzone from the reference (no file-storage backend — greenfield, deferred), next-number caching, EditModal untouched | 🚧 built, pending deploy + live verify |
| CR-116 | 2026-09-09 | **WO create: single-form flow, SO combobox, project name removed** — user request: the two-step Create WO modal (pick SO from a list → separate details view) becomes one form. `WorkOrderListPage.jsx` CreateModal only: modal widened 620→860; the SO picker is now a **searchable combobox** at the top (type to search, dropdown overlay, picking fills the input with the SO number; editing the input clears the selection) — details render below it on the same view: SO summary band (number · customer · SO date), the CR-113 header fields rearranged into a roomier 3-column grid with larger inputs, then the FG-lines checklist. **Project name input removed** and `projectName` dropped from the create payload (backend/PUT/Edit modal untouched; existing WOs keep showing their stored project). Create button disabled until an SO is selected. Follow-up (same day): WO list column "Status" → **"SO Status"**, "Procurement" → **"Purchase Status"** (+ matching filter labels; detail-rail filter too) — display-only, `status`/`procStatus` fields and URL params unchanged. No schema/backend changes | 🚧 deployed to Dev, pending live verify |
| CR-115 | 2026-09-09 | **CRM widget: header removed, card fills the popup, single top row** — user report: the CR-109 dark header (brand + quote/org line + 3-step indicator) wasted space, the card didn't cover the whole page, and the bottom "Push to Zoho Quote" button was cut off. `functions/skuapi/widget.html` only: `#hdr` block + its CSS deleted along with the JS that fed it (`updateSteps`/`pushed`, org-head fill, the quote-title `getRecord` fetch); `#card` is now full-width/full-height (`100vh`, no 16px page padding, no `min-height: 560px` — that min-height pushed the footer below the fold in short CRM popups). Second pass (same day): widget renamed **"OCTFIS Quote Maker"** (page title + on-screen; loader stub too; the CRM popup title-bar text is the console-side widget/button name — manual rename there); one top row holds the title + the SKU/name searchbar (moved up from the left pane, chips still render inside it) + the "Search parameter…" box + Clear all + collapse — "Filters N/M set" counter removed; **industry dropdown removed** — the org's first industry auto-selects and drives the parameter panel (create-card Industry select untouched; no-industry orgs get a hint + manual-SKU create). Main app untouched | 🚧 deployed to Dev, pending live verify |
| CR-114 | 2026-09-09 | **WO status label rename: "Material Allocation Pending" → "Pending Allocation"** — display-only: `LABEL_OVERRIDE` map inside `spaced()` (`woCommon.jsx`), so every render site (StatusChip, toast, ⋯-menu "→ …" items, detail header) picks it up. Status *code* `MaterialAllocationPending` unchanged everywhere (DB, FLOW/transition maps, URL `status` filter param) | 🚧 deployed to Dev, pending live verify |
| CR-113 | 2026-09-09 | **WO create: user-entered header fields** — user request: after picking the SO in the Create WO modal, the user also fills WO Due Date, WO Due Days, Priority, Machining Completion, Fitting Completion. Reverses CR-110's "Books SO custom fields always win" for these 4 columns: **user-entered wins, SO CF is prefill only**. **Backend** (`workorder/soFields.js`): exported `USER_OWNED` set (`woPriority`, `dueDate`, `machiningDoneDate`, `fittingDoneDate`) + pure `woHeaderFields(so, body)` — `soFields(so)` overlaid with non-empty body values (`priority`→`woPriority`); `POST /wo` spreads it; the `GET /wo/:id` on-open SO re-sync now skips user-owned columns **unless blank** (blank still backfills pre-CR WOs; `buyerOrderNo`/`buyerOrderDate`/`soDate`/`shipmentDate` keep syncing); `GET /wo/so/:soId` returns the 4 CF values for modal prefill; `PUT /wo/:id` whitelist gains `dueDate`/`machiningDoneDate`/`fittingDoneDate` + `priority`→`woPriority`. **Frontend**: CreateModal (`WorkOrderListPage.jsx`) gains a 5-field row after Project name — 3 date inputs, a **two-way Due Days** number input (typing N sets dueDate = today + N; only `dueDate` is stored, days stay derived via `dueDays()`), and a Priority select from shared `WO_PRIORITIES = Low/Medium/High/Urgent` (`woCommon.jsx`); EditModal (`WorkOrderPage.jsx`) gains the same 4 fields. `soFields.test.js` extended with `woHeaderFields` precedence asserts. Deliberately not done: no write-back to Books CFs; clearing a field on an old WO lets the SO refill it on next open | 🚧 deployed to Dev, pending live verify |
| CR-112 | 2026-09-09 | **MSUN UI polish batch** — user feedback on CR-110 + app-wide polish. (1) *WO detail header:* "SO … · customer" subtitle removed (fields live in the header grid; **Project** joins the grid when set); 'WO Due Date' turns red when < 4 days remain. (2) *Left rail:* customer dropped from rows (WO no + chip + `fmtDate` date), selected row darker (`--blue-mid`), and a **sticky filter bar** — search + Status/Priority `FilterSelect`s (client-side, no URL params; `FilterSelect` gained an optional `style` prop to fit the 260px rail). (3) *WO list:* customer + due date **bold**; due date red when < 4 days (incl. overdue). (4) *Rounded tables:* new `.grid-table` class (index.css) — `border-collapse: separate` so the radius actually clips (collapse defeats border-radius; row separators moved to `td`/`th`, `tr:last-child` cleared) — applied at all 11 bordered-table sites (MaterialsGrid, woCommon `Table`, WoItemsTab, BomTab, WorkOrderPage ×2, WorkOrderListPage, CompositeBomPage ×2, WorkOrderPurchasePage, WorkOrderReportsPage); tr-level borderBottoms left in place (no-ops under separate). (5) *Close buttons:* shared `CloseX` (exported from Modal.jsx) — bare red ✕, **bolds on hover** (`.close-x:hover`, first content hover rule in index.css) — replaces the boxed 28×28 X in Modal, WO detail, PO detail (PurchaseTab), SKU item detail. (6) *Title Case sweep:* table headers, VIEWS/tabs ('By Item', 'SO–BOM Status'… — every string comparison renamed with them), buttons ('+ New Work Order', '+ Create Recipe'…), filter labels ("All Statuses"), CSV header maps; enums/`spaced()`/estimate print untouched. (7) *Nav:* sidebar active highlight `--blue-light` → `--blue-mid`. No schema/backend changes | 🚧 deployed to Dev, pending live verify |
| CR-111 | 2026-09-09 | **CRM widget: open filter panel (all parameters visible)** — user request: replace CR-109's two-level "+ Add filter" dropdown with an always-open panel where every parameter and its options are visible at once, ~6×4 grid. Full-card-width `#filter-panel` between the header and the panes: one card per `showInWidget` property in `skuPosition` order (ordinal + caption), a `<select>` of all its values with "— Any —" default (properties with no stored values, i.e. Range/Manual, get a free-text input); set cards highlight teal; header row has an `N/M set` counter, a client-side "Search parameter…" box that filters the cards, "Clear all", and a ▾/▸ collapse toggle (grid capped at 300px, scrolls). Values load via **one** batched `GET /api/industries/:id/property-values` (the CR-088 endpoint) chained after the properties fetch — the lazy per-property fetch is gone, so an industry pick costs exactly 2 sequential requests regardless of parameter count. The panel is the source of truth: `chips` is rebuilt from it (`syncChipsFromPanel`), so search filters, the searchbar chip summary (chip × now resets its dropdown), and the create-card `selectedValues`/generate preview are unchanged downstream. Deliberately not done: group tabs from the mock ("Core Specification" etc. — no grouping field on Property; needs schema + admin UI if wanted), per-option counts | 🚧 deployed to Dev, pending live verify |
| CR-110 | 2026-09-09 | **MSUN WO: SO-derived header panel + list due date/priority** — user asked: WO detail top panel showing WO No/Date, SO No/Date, Customer, Expected Shipment Date, Buyer Order No/Date, WO Due Date/Days, Priority, Machining/Fitting Completion Date; WO list with Due Date/Due Days and a priority filter — all sourced from the Zoho Books SO. **DB**: 8 nullable varchar(255) `WorkOrder` columns via Catalyst MCP — `soDate`, `shipmentDate`, `buyerOrderNo`, `buyerOrderDate`, `woPriority` (`priority` is a Catalyst reserved keyword; API still serves it as `priority`), `dueDate`, `machiningDoneDate`, `fittingDoneDate`. **Backend**: new pure `workorder/soFields.js` — `so.date`/`so.shipment_date` plus SO **custom fields matched by label** (trimmed, case-insensitive: "Buyer Order No", "Buyer Order Date", "Priority", "WO Due Date", "Machining Completion Date", "Fitting Completion Date"; raw `value`, date CFs are `yyyy-mm-dd`); WO create spreads it into the insert; `GET /wo/:id` adds `getSalesOrder` to its parallel reads and folds changed SO fields into the existing fire-and-forget `lastViewedAt` write (one row write; Books failure → stored values serve; auto-backfills pre-CR WOs on first open); list/detail serialize the new fields. **Frontend**: detail header card gains a 13-field label/value grid (CR-057 old-screen layout kept); `format.js` `dueDays()` + shared `<DueDays>` (woCommon) — days left, red "N overdue"; list adds Due date/Due days columns + a priorities `FilterSelect` (URL-persisted). New `soFields.test.js`. Deliberately not done: no PriorityChip (plain text), no priority *column* in the list (filter only, per request), no bulk backfill (open = backfill), list never calls Books | 🚧 deployed to Dev, pending live verify of MSUN's actual CF labels |
| CR-109 | 2026-09-09 | **CRM quote widget: SKU Studio redesign + create-in-Books + single-source file** — user asked: apply the `Zoho CRM Quote Widget/SKU Widget.dc.html` mock's design, size the popup properly, create missing items in Books/CRM from all selected SKU parameters, add existing items to the quote, and surface Size in the filter selection. (1) *Reskin* (`functions/skuapi/widget.html`): IBM Plex, white card on `#e9ecf1`, dark header with brand + quote/Books-org line + live 3-step indicator (find → lines → update; flips on cart/push state); auth/search/subform logic byte-preserved from CR-108. (2) *Popup sizing:* `ZOHO.CRM.UI.Resize({height:780,width:1320})` at picker start (guarded, older-SDK safe) + flex-wrap panels so a capped popup stacks. (3) *Cart:* Map → array — per-line **Disc %** (line total `qty·rate·(1−d/100)`), ▲/▼ reorder, Clear, "Push N lines to Zoho Quote"; write-back adds `Discount` (amount) to both v3/v2 standard-subform shapes and `disc/discount/discountpercent` label aliases for custom subforms. (4) *Create-in-Books:* the no-match card now routes through the generator engine when filters are set — `POST /api/sku/generate` previews name/sku/description from chip `selectedValues` (free text on List props promoted to valueId on exact match, else warned; `missingRequired`/`duplicate` branches disable create), then `POST /api/sku/create-item` (persists `SKUItemValue`s → item stays property-searchable, series suffix recomputed server-side) then **immediate** `POST /api/sku-items/:id/push-zoho` — badge NEW IN BOOKS, or on push failure the line still joins the quote with NEW — PUSH PENDING + a "push later from SKU Items" note; no chips → old manual `POST /api/sku-items` path, still Books-pushed. CRM Product creation stays at quote-push time. (5) *Single source:* the CRM widget is hosted **External** at `/server/skuapi/widget`, so changes ship on `catalyst deploy` alone — no CRM upload; the legacy zip-plugin copy `crm-widget/app/widget.html` is reduced to a `location.replace` stub (an iframe wrapper would orphan the SDK's parent handshake) purely to prevent future divergence. Setup: tick "Show as CRM widget search filter" on **Size** (and any other params) — the menu is purely `showInWidget`-driven, nothing excluded in code. Deliberately not done: rate not stored on SKUItem/Books (quote-line only); Books-side duplicate check (local 409 only); auto-push of CR-021 manual items | 🚧 deployed to Dev, pending live verify |
| CR-108 | 2026-09-09 | **CRM quote widget: property-based search + reliable dual-subform add** — user report: picked items never landed on the quote, search was SKU-text-only, and added lines need production no / size / qty / list price. (1) *Root cause fixed:* the subform key was guessed from the record read (`rec.Quoted_Items ? … : 'Product_Details'`) which silently no-ops on an empty quote — now `discoverSubforms()` asks `ZOHO.CRM.META.getFields({Entity:'Quotes'})` once (cached, warmed at picker start); META missing/failing degrades to read-detection with a hard `Product_Details` default. (2) *Dual write:* one `updateRecord` appends each cart line to the **standard** line items (Product lookup, Quantity, List_Price — v3/v2 shape per key) **and** to the org's **custom Quotes subform**, auto-discovered from metadata; custom columns map by normalized display label — fixed aliases (sku/product code, item/name, qty/quantity, rate/list price) plus property captions from `item.values` (column "Size" ↔ property "Size"); read-only/lookup columns skipped, unmatched left blank. Existing rows re-sent as `{id}` so the replace-semantics update keeps them. (3) *Search redesign* (`functions/skuapi/widget.html`, served route unchanged): two panes per the `Zoho CRM Quote Widget/` mockup — left: search box with removable filter chips + two-level "+ Add filter" menu (flagged properties → values, free-text row for Range/Manual) + results with spec chips and Add buttons + no-match quick-create card; right: line cards (qty/rate inputs, line total), subtotal, "Add to Quote". Industry select scopes filters; auth/org/quick-create flows byte-identical. (4) *Rate prefill:* on add, `Products` searched by `Product_Code` and `Unit_Price` fills the line rate unless manually edited. (5) *Backend:* `Property.showInWidget` bool via Catalyst MCP + `BOOL_COLS` + POST/PUT `/api/properties`; Property Manager gains a "Show as CRM widget search filter" checkbox; `POST /api/sku-items/search` accepts `withValues` → attaches `{caption: valueText}` per item (2 batched ZCQL queries). Deliberately not done: Disc %/reordering from the mockup; no prices stored on SKUItem; META response shape unverified until first live open (fallback covers it) | 🚧 deployed to Dev, pending live verify |
| CR-107 | 2026-09-09 | **Fotedar bug batch: series zeros, series chip, custom-field push** — (1) *Data:* Fotedar Demo org 60083961876 industry "SKU COMPANY NAME" had `seriesStart=1` but `seriesPad=null`, so SKUs got the 4-digit default while the client's set series is 3 — set `seriesPad=3` and renamed all 6 SKUItems (`PKNAAA0001`→`PKNAAA001` etc., via Catalyst MCP); `PKNMULA001` needs a re-push so its Books item (4089653000000104002) picks up the renamed sku. (2) *Frontend:* the generator's series chip hardcoded `/\d{4}$/` (`SKUGeneratorPage.jsx`), so any pad≠4 org (Fotedar India, pad 3) never saw its suffix — now built from `selectedIndustry.seriesPad`. (3) *Backend:* the `Property.zohoCfApiName` mapping was import-only; push now sends it — new `buildCustomFields()` in `zoho/push.js` (mapped properties × the item's `SKUItemValue`s → `[{api_name, value}]`), wired through `pushToZoho` into `createItem`/`updateItem` (`booksApi.js`) and the Manufacturing composite path (`createCompositeItem`/`updateCompositeItemFields`, `inventoryApi.js`); stale "custom fields are never pushed" comments removed. Deliberately not done: no UI change to the pad editor; series numbering gaps in Fotedar Demo left as-is (next = 006) | 🚧 deployed pending |
| CR-106 | 2026-09-05 | **Recipe Engine: Cost Master + quote-time cost editing** — costing values now have a three-tier precedence: **cost-master default** (org-wide, fetched live by element code on every calculation) → **per-material value** in the recipe (option `fixedCosts`) → **per-quotation override** in the wizard; past quotations stay frozen. **DB**: `CostElement.rate` double(15,4) via Catalyst MCP — the default value; on master rows (blank `recipeTemplateId`) it's the org default, on per-recipe rows an optional recipe-level override (blank = inherit master live). **Backend**: `recipeCostElements()` merges the master rate by code into recipe elements at load; `calc.js` value precedence `fixedCosts[code] → element.rate → 0` for FIXED/PERCENTAGE (blank ≠ 0: blank inherits), RATE_QTY computes from material unless an explicit override value exists; `computeQuote` accepts `overrides` `{componentId:{CODE:value}}` merged over the selected option's fixedCosts (frozen in the snapshot like everything else); `POST /cost-elements` creates master rows; `PUT/DELETE /cost-elements/:id` now also handles master rows (no draft guard) and accepts `rate` (blank per-recipe rate = revert to master); per-recipe element create accepts optional `rate`; `new-version` copies raw per-recipe rates (never the merged master value); `/calculate` + `/quotations` pass `overrides` through — self-test extended with default-rate + override cases. **Frontend**: new `RecipeCostMasterPage` (`/recipe/costs`, nav after Materials) — grid CRUD for master elements (label, calcType, default value); builder costing card gains a **Default value** column (editable per recipe, placeholder "from cost master") and the add-element modal a **"From cost master"** picker (prefills code/label/calcType, keeps the rate linked live); `OptionRow` FIXED/PERCENTAGE inputs show the inherited default as placeholder and blank now reverts to it (empty entries no longer saved as explicit 0), read-only rows show the server-computed effective value; wizard review lines are **expandable** — per-element inputs adjust costs for that quotation only ("adjusted" chip, Reset, blank = recipe value), sent as `overrides` to calculate + quotation create. Deliberately not done: percentage placeholders show the default %, not the recomputed amount; no per-quote margin on individual elements beyond value replacement | 🚧 deployed to Dev, pending live verify |
| CR-105 | 2026-09-05 | **Recipe Engine: per-recipe costing rules, editable published recipes, free-text UoM, product-first flow** — user feedback from adding "Personal Computer": every recipe showed the seeded valve elements (CASTING/DRILLING…), recipes seemed uneditable, UoM was a locked 4-option list, and the module landed on the quote wizard before a product/recipe existed. **DB**: `CostElement.recipeTemplateId` varchar(50) via Catalyst MCP — blank = org-default "library" row, set = owned by that recipe version; existing RAVS150 backfilled with per-recipe copies (identical math), the in-flight PC124 draft left empty per user decision. **Backend** (`routes/recipe.js`): `recipeCostElements()` (per-recipe rows only, **new recipes start with zero elements**); `loadBundle` uses it (single line the quote/calculate path sees — snapshots unchanged); new draft-guarded CRUD `POST /recipes/:id/cost-elements` (code auto-derived from label, immutable after create — it keys `fixedCosts`), `PUT`/`DELETE /cost-elements/:id`; `new-version` + recipe `DELETE` + `seed-demo` now copy/clean per-recipe elements; `GET /cost-elements` = defaults library. **Frontend**: `RecipeBuilderPage` Costing rules card is now an editor (label blur-save, calcType select, ↑↓ reorder, delete, + Add modal; empty state offers "+ Add" and "Copy default elements"), card visible before any component exists; published header button is a primary **"Edit recipe"** (opens the new-version modal; 409 → auto-opens the existing draft); component UoM = free-text input with `<datalist>` of defaults + in-use values (no UoM table — backend stores any string); Test tab material/mfg split follows `RATE_QTY` elements instead of hardcoded `CASTING`. **Nav**: sidebar order Recipes → Materials → Configure & Quote → Quotations, `/recipe/*` defaults to Recipes; wizard lists all ERP products — recipe-less ones show "No recipe yet — create one →". Deliberately not done: quotation logic untouched; no UoM master table; no org-defaults management UI ("save as default" when asked) | 🚧 deployed to Dev, pending live verify |
| CR-104 | 2026-09-05 | **Recipe Engine add-on — reusable product recipe/configuration engine (new module)** — prevents variant-SKU explosion: main products stay single ERP items; a recipe defines components → allowed materials → configurable cost elements; sales configure via a guided wizard; quotations freeze an **immutable snapshot** (recipe version + rates), so later recipe/rate edits never change history. UX structure from the approved Claude Design import ("Recipe Engine.dc.html"); theme = existing app tokens. **DB**: 6 new tables via Catalyst MCP (`MaterialType` rates master, `CostElement` seeded CASTING/MACHINING/DRILLING/ASSEMBLY, `RecipeTemplate` versioned Draft→Published→Superseded, `RecipeComponent`, `RecipeComponentOption` with per-material castWeight + fixed costs JSON, `RecipeQuotation` with snapshot JSON) — ids in SCHEMA.md ledger. **Backend**: new addon key `recipe-engine` (opt-in); `recipe/calc.js` pure costing (`RATE_QTY`=rate×castWeight, `FIXED`, `PERCENTAGE`; price = cost × (1+margin%) × (1−disc%) × (1+GST%); `--selftest` with RAVS150 figures); `routes/recipe.js` mounted at `/api/recipe` — materials/cost-elements/products, recipe+component+option CRUD (**every write `assertDraft`-guarded — published recipes 409 as immutable**), `component-order` drag reorder, `publish` (supersedes prior published of same code), `new-version` (deep copy → Draft v max+1), `versions`, `calculate` (server owns all math; wizard/test tab never compute), quotations (create = recompute + freeze snapshot + `QTN-` number via `nextNumber`; `convert` → Order), idempotent `seed-demo` (12 materials CI 70…IC CF8M 480 + published RAVS150 recipe: Casing/Side Cover/Shaft configurable, Fasteners fixed). **Frontend**: sidebar entry with submenu (Configure Product / Quotations / Recipes / Materials), `RecipeLayout` + 7 lazy pages — `RecipeWizardPage` (5-step stepper + sticky summary rail, material chips with server-priced options, margin/discount/GST review, success card), `RecipeQuotationsPage` (record-grid pattern), `RecipeSnapshotPage` (🔒 immutable badge, frozen rates table, convert action), `RecipeMfgPage` (per-component cast-weight totals + material-summary-by-grade chips, display-only expansion of the snapshot), `RecipeListPage`, `RecipeBuilderPage` (Components tab with drag reorder + component drawer, Materials & costing tab with cost-rule list + editable allowed-materials grid, Test recipe tab, Versions timeline), `RecipeMaterialsPage`. Note: legacy costing sheet's CI/WCB CS-cost rows contradict its own rate master; RATE×castWeight is the spec (CF8 rows match exactly). Deliberately not done: nested-component UI (column exists), qty/component override wizard behavior, formula engine, WO/Zoho/MRP integration (Export-to-MRP / Create-WO buttons hidden), cost-visibility-to-sales toggle, old/new-value audit log (changeReason + version timeline only) | 🚧 deployed to Dev (addon on for org 743418751), pending live verify |
| CR-103 | 2026-09-04 | **WO purchase + detail UX batch (6 items)** — (1) By-item PO raise: the expanded per-WO breakdown lists **only Pending lines** (on-PO lines were noise when raising; summary counts + PO numbers kept, toggle hidden when nothing pending) in `WorkOrderPurchasePage.jsx` `RowGroup`. (2) WO header **✎ Edit button hidden** (EditModal + state kept for easy restore). (3) History tab audit trail shows **plain-language activities + actor name** — `friendlyAction()` map (`txn.confirm.reserve` → "Material reserved", `approval.l1.Approved` → "Level 1 approved", …) in `WorkOrderPage.jsx`; `reports.history` resolves distinct `userId`s → AppUser name/email in one ZCQL query and returns `userName` (webhooks show "System"). (4) Materials tab **warehouse From→To selects moved above the grid** (filter-chips row) from the bottom confirm bar; (5) **"Stock last synced · BOM revision" moved into the bottom bar**. (6) **Status chip is display-only** — the chip-as-dropdown is gone; all forward status moves (incl. Completed, QC prompt unchanged) prepend the ⋯ menu. Saved as a standing rule: status chips never act, transitions live in ⋮/⋯ | ✅ shipped |
| CR-102 | 2026-09-04 | **"Allow numerical series" toggles only on the checkbox** — the label wrapped checkbox + text, so clicking the text also toggled it; the wrapper is now a plain `div` (cursor pointer kept on the checkbox itself) in `IndustriesPage.jsx` `seriesFields`. The requested 7-zero cap was already shipped in CR-100 | ✅ shipped |
| CR-101 | 2026-09-04 | **Record grids: row-click edit + ⋮ menu replaces hover pencil/trash** — the hover-revealed edit/delete buttons were easy to miss on tall rows. New always-visible `RowMenu.jsx` (⋮ button → Edit/Delete dropdown, position:fixed so it never clips in scroll containers, closes on outside click/scroll) replaces `RowEditButton`/`RowDeleteButton` (both deleted, `.row-actions` hover CSS removed) across SKU Items, Industries, Properties, Property Manager (props + values), WO Items tab, Admin orgs. Rows with a single edit target are now click-to-edit: SKU Items → detail, Industries → edit dialog, Properties → property manager (value rows already were). Inner links/buttons stopPropagation. Updates the standing record-grid pattern | ✅ shipped |
| CR-100 | 2026-09-04 | **Series number format capped at 7 leading zeros (8 digits)** — the Industries "Number format" field and `POST/PUT /industries` now clamp `seriesPad` to 1–8 (`clampPad` in `industries.js`; frontend `Math.min(8, …)` in `IndustriesPage.jsx`), helper text notes the cap. Existing wider pads stay until edited | ✅ shipped |
| CR-099 | 2026-09-04 | **Work Order batch from customer feedback ("Changes in the WO HARESH.md", items 1–20)** — (1) *Multi-FG grid*: `GET /:id/grid` without `fgId` now returns `{grids}` for every FG via `buildGridsBulk`; `MaterialsGrid.jsx` drops the one-FG-at-a-time selector, shows all FGs with sub-items grouped under FG header rows, keys qty/selection state by `fgId\|itemId`, confirms stock moves **one txn per FG sequentially** (failed FG keeps its typed quantities) and merges Purchase into one WO-level PR. (3) *Warehouse selection*: new `allowWarehouseSelect` OrgSetting (default off); `txn.createDraft` accepts `fromWarehouseId`/`toWarehouseId` overrides (validated against live Zoho warehouses), `confirmTxn` reuses the draft's stored route instead of recomputing (overrides survive); grid confirm bar shows From→To selects when on. (3.3) *Settings redesign*: Zoho-Books-style page — sidebar of server-driven groups (`group` on `SETTING_KEYS`: Warehouses/Approvals/Alerts/Document numbering), content pane, pinned Save, dirty/missing-warehouse dots. (4) Create-WO modal: spinner + caption, Cancel/close disabled while busy. (5) Coverage caption "N missing" → "N not in stock". (7) Action buttons say **"Proceed <Action>"** (Proceed Reserve/Purchase/…) — saved as a standing wording rule. (8) FLOW: `Completed` reachable from MaterialAllocationPending/ReadyForProduction/InProgress (QC prompt + auto-return sweep unchanged). (9) By-item purchase view gains a **Group by Work order** toggle (client-side inversion of the same breakdown data; raise attributes only ticked WO entries). (10) Ad-hoc PR lines: `POST /pr/:prId/lines` (`addPRLine`, requiredQty 0, Draft-only) + "Add item" typeahead row on draft PRs (ItemPicker reused from WoItemsTab). (11) WO filter dropdown on Requests/Orders views. (12) **Per-row vendor + vendor split** on the by-item view: vendor select per line, "⑂ Split" clones a line with its own qty+vendor, Raise groups lines by vendor → one PR+draft PO per vendor (sequential calls). (13) Batch-wise issue: `createTransferOrder` returns its FIFO `pickedLines`; `confirmTxn` appends "item: batch × qty" to `MaterialTxn.notes`; notes shown in History. (15) Fonts unified: dead Vite scaffold (`style.css`/`main.ts`/`counter.ts`) deleted; SKU/Import/GlobalSearch theme constants now point at `var(--font)`/`var(--font-mono)`. (16) History tab gains a **Purchase documents** section (from already-loaded PR data) and `reports.history` is scoped to this WO's txn/PR ids (was org-wide MaterialTxn noise); purchase page detail gains "Open work order →". (17) Grid optional column "PO" → "PO Qty". (18) **Printable movement slip** (`IssueSlip`, wo-print-sheet pattern): 🖨 per confirmed movement in History — txn/TO header, lines, batch notes, signature row. (20) **Red dot on progressed WOs**: new `WorkOrder.lastViewedAt` (stamped fire-and-forget on detail open); `procStatusByWo` piggybacks per-WO max received `lastPoSyncAt`; list + rail show a red dot when a receipt landed after last view (org-wide, PO-receipts-only). Deliberately not done: "User and Roles" (no requirements given), per-user red dot, re-capping reservable against an overridden source warehouse, joint client-side cap for the same RM under two FGs (server re-validates per FG) | ✅ shipped |
| CR-098 | 2026-09-03 | **Menu label casing normalized to Title Case** — sidebar/tab/account-menu labels with lowercase words fixed: Purchase Request, Customer Add-ons, Books Items, Submit to Helpdesk, Switch Organization, Log Out (`App.jsx`); Cancel/Delete Work Order in the WO action menu (`WorkOrderPage.jsx`). Text-only, no route or behavior changes | ✅ shipped |
| CR-097 | 2026-09-03 | **CRM widget moved to externally-hosted URL (single-place deploy)** — replaces CR-096's zet-pack/zip-upload flow: `crm-widget/app/widget.html` now lives at `functions/skuapi/widget.html`, served by new `GET /server/skuapi/widget` route so `catalyst deploy` ships it — no re-zip, no CRM re-upload. Served from a **function** (not the web client) because Catalyst stamps `X-Frame-Options: DENY` on all static hosting; the route sets `Content-Security-Policy: frame-ancestors 'self' https://*.zoho.com` (+ DC variants), which overrides XFO in modern browsers so only Zoho CRM can iframe it (also `Cache-Control: no-cache` so deploys land on next widget open). Widget constants made env-free: `API = '/server/skuapi'`, `APP_ORIGIN = location.origin` (same origin as the API now — the manifest whitelist/CSP dance is gone). The page is self-contained (picker views only) — the main SPA never loads inside CRM. Manual console step (Dhiraj): edit the "SKU Picker" widget → Hosting **External**, Base URL `https://sku-gen-octfis-925638796.development.catalystserverless.com/server/skuapi/widget`. `crm-widget/` kept as reference until the switch is live-verified, then delete. Custom domain later = change the one console URL | 🚧 deployed, pending console switch + live verify |
| CR-096 | 2026-09-03 | **CRM widget: SKU picker on Quote pages (zet-packed)** — realizes the Quotes half of CR-012's picker as a Zoho-hosted widget. New `crm-widget/` zet project (`plugin-manifest.json` + self-contained vanilla-JS `app/widget.html`, no build step; `zet validate && zet pack` → `dist/crm-widget.zip`): button widget on a Quote → auth probe (`GET /auth/me`) → debounced search over `POST /api/sku-items/search` → multi-select cart with qty/rate → quick-create form (`POST /api/sku-items`, 409 shown inline) → write-back as the signed-in CRM user via `ZOHO.CRM.API` (find-or-create `Products` by `Product_Code`, read-merge-write the Quote's line subform — `Quoted_Items`/`Product_Details` key detected on read since subform updates replace all rows) → `Popup.closeReload()`. Auth: silent hidden-iframe OAuth attempt (6 s) falling back to a sign-in popup, both named `sku-auth`; `App.jsx` posts `sku-auth-done` + closes when `window.name === 'sku-auth'`. Backend CORS reworked (`index.js`): origin-reflecting **suffix allowlist** (zoho/zohousercontent/zappsusercontent/catalystserverless/localhost) + `Access-Control-Allow-Credentials` — `ACAO: *` can't carry cookies (session cookie was already `SameSite=None; Secure`). Old SPA-redirect bootstrap `frontend/public/crm-widget.html` deleted. Manual console steps (Dhiraj): upload zip in Setup → Developer Space → Widgets (Hosting Zoho, index `/widget.html`, type Button), Quotes → Links & Buttons → View Page button opening the widget (~900×600). Known limits: third-party cookies required (Safari/FF-strict blocked — widget shows a use-Chrome message), rate entered manually (SKUItem has no price), Deals wait on the CR-012 subform | 🚧 built, pending console registration + live verify |
| CR-095 | 2026-09-03 | **Estimate print — "Template 2" design added alongside Classic** — new toolbar **Design** toggle (`Classic \| Template 2`, default Classic; Classic untouched) on `/#/estimate`. Template 2 ports the "MSUN — Estimate Template 2.pdf" mockup: **Arial** (the PDF's embedded fonts are ArialMT/Arial-BoldMT — system font, no webfont added), header card (logo + company identity), ESTIMATE heading with Offer No/Date/**Valid Until** (offer date + 15 days, new `validUntil()` in `estimateParser.js`) meta table, TO/BUYER + OFFER REFERENCE cards, teal items table with horizontal rules, per-page SUB TOTAL band, and a closing sheet (grand totals box with Sub Total/Discount/P&F Included/Total, T&C + bank details from the same editable terms data, Customer Acceptance / Authorised Signatory row) replacing Classic's CalcSheet+TermsSheet; teal text footer bar replaces the cert-logo strip. Implementation: `EstimateSheet2`/`ClosingSheet2`/`Sheet2Chrome` + `est2-`scoped `CSS2` in `EstimatePage.jsx`, reusing the data layer, `ItemRows`, and the measure-and-pack pagination engine via the same `.est-chrome`/`thead`/`[data-totals]`/`.est-foot-band` hooks. Deliberately not done: in-place T&C editing on the v2 closing sheet (edit via Classic — button hidden in v2), CRM-sourced Incoterms/Prepared By/Enquiry Ref (static: Currency USD only), per-design persistence of the toggle. Also fixed stale `estimateParser.test.js` email assertion (CR-060 contact-email behavior) | ✅ shipped |
| CR-094 | 2026-09-02 | **Series input made literal + default value per property** — two end-user simplifications. (1) The CR-093 "Leading zeros" number field (silently `seriesPad − 1`, so a user typed `2` to get `001`) is replaced by a **"Number format"** text field where the user types the format literally — `001` / `0001` / `00001` — and its digit count is the width (`seriesPad = digits.length`, min 1); the shown value is always `'1'.padStart(pad,'0')` and the helper previews `0001, 0002 … 0010, 0100`. Frontend-only — `seriesPad` was already total width everywhere (`IndustriesPage.jsx` `seriesFields`). Changing the format still restarts the series (accepted, per CR-093). (2) New nullable `PropertyValue.isDefault` (boolean) — a **"Set as default value"** checkbox in the Property Manager value add/edit form marks **one** value per property (a `DEFAULT` badge shows in the value grid); the SKU generator pre-selects it (`SKUGeneratorPage.loadProperties` seeds `initSels` from the default before permalink params / edit-mode selections, so those still override). One-default-per-property is enforced server-side in the shared `POST`/`PUT /property-values` handlers (`clearOtherDefaults` clears siblings — Data Store has no partial-unique index); `store.js` `BOOL_COLS` gains `isDefault`. Deliberately not done: no DB-level uniqueness (app-enforced), no default for Range properties (List values only) | ✅ shipped |
| CR-093 | 2026-09-02 | **SKU series settings reworked: enable checkbox + configurable leading zeros** — the "Numerical Series" number field conflated on/off with a start number that was ignored in practice, and the suffix width was hardcoded to 4 digits. Industries settings now show an **"Allow numerical series" checkbox** (gates the options) and, when on, a **"Leading zeros"** number input with a live preview; the series **always starts at 1**. Leading zeros = width − 1 (2 → `001`, 3 → `0001`). New nullable `Industry.seriesPad` column (int, total digit width; null = 4, so existing industries keep their 4-digit SKUs). `seriesStart` is now purely the on/off flag (`1`/blank). `skuSeries.js` (`nextSuffix`/`nextSeriesSku`/`stripSuffix`) threads a `pad` width instead of the dead `start`; `/generate`, `/create-item`, and bulk `importItems.js` derive `pad = seriesPad || 4`. `IndustriesPage.jsx` Add/Edit dialogs share one `seriesFields` block. Deliberately not done: renumbering existing SKUs when width changes (a width change restarts the series — old suffixes at the previous width no longer match), atomic counter row (same accepted race as CR-089/091) | ✅ shipped |
| CR-092 | 2026-09-02 | **Bulk item import — sheet → auto SKU generation → local items** — new "Import" tab (`/sku/import`, `ImportItemsPage.jsx`): pick a product type, download a per-type CSV template (columns = active property captions in `skuPosition` order + `Item Type`), fill one row per item, upload `.xlsx/.xls/.csv/.tsv/.txt` (reuses `BomTab`'s `readXlsxFile`/`matrixFromText`), get a per-row Success/Fail table + downloadable results. Backend `POST /api/sku-items/import {industryId, rows}` (`importItems.js`) resolves each row's property display-value strings → PropertyValue ROWIDs (case-insensitive) and runs them through the **same** engine as the manual generator, now extracted into a shared `skuBuild.assemble()` (clubbing, name/desc, range validation) that `/sku/generate` also calls. Rows processed **sequentially** so each insert advances the CR-091 industry series max the next row reads (avoids the non-atomic-scan 409 race under bulk load); one bad row never aborts the batch (typed errors: unknown value, out-of-range, missing required, duplicate SKU). Scope: **Items + Manufacturing** (composite BOM stays property-value-derived at push — no component columns). Books push stays **manual** (CR-021) — import creates local `SKUItem` rows only; user clicks "Push all unsynced". Item-level fields (unit/rate/HSN/tax) use existing `createItem` defaults (property columns only). New `importItems.test.js`. Deliberately not done: per-combination "next variant" suffix (kept CR-091 industry-wide series per decision), Books-side duplicate check (local org dup only), explicit component-SKU columns, import-run audit table, atomic counter row | ✅ shipped |
| CR-091 | 2026-09-02 | **SKU numerical series rescoped: per industry, not per combination** — CR-089 sequenced the 4-digit suffix per unique property combination, so every new combination restarted at 0001 (`PKNAAA0001`, `PKNMULA0001`) — user expected one continuous series. `skuSeries.js` now scans all SKUs of the industry (`industryId =` query, newest-first 300-row page, trailing `${sep}NNNN` regex — no base anchor) so the next number is max across the whole industry + 1: `PKNAAA0001` → `PKNMULA0002`. `nextSeriesSku` takes `industryId`; `/generate` + `/create-item` pass it. Editing still keeps an unchanged combination's suffix. Deliberately not done: atomic counter row (same accepted race as CR-089), renumbering of existing 0001s | ✅ shipped |
| CR-090 | 2026-09-01 | **Admin console lists every org ever used** — the entitlements page only showed each user's *last-selected* org: `GET /admin/orgs` enumerated distinct `orgId` from `ZohoToken`, whose single per-user row is overwritten by `saveOrg` on every org switch (ABC → XYZ clobbered ABC). New `Org` registry table (`orgId` unique, `orgName`); `saveOrg` best-effort upserts into it on every selection (select-org + single-org auto-pick both funnel through it), `GET /admin/orgs` unions Org ∪ distinct ZohoToken (legacy backfill, registry name wins — pure `orgUnion` + selftest), `Org` added to the delete-org cascade. UI: org-count badge in the header (pricing count) + missing `work-order` label added to `ADDON_LABELS`. Deliberately not done: no proactive backfill of pre-CR orgs (the ZohoToken union already surfaces them until re-selected) | ✅ shipped |
| CR-089 | 2026-09-01 | **SKU numerical series per property combination** — Industries settings gain a "Numerical Series" number field (`Industry.seriesStart`; blank/0 = off, N≥1 = on + first number for a fresh combination). When on, generated SKUs append a 4-digit suffix after the property segments, sequenced **per unique combination**: `FAB-RED-0001`, `FAB-RED-0002`, `FAB-BLU-0001`. No counter table — next = max existing suffix for the exact prefix + 1 (`skuSeries.js` LIKE scan + regex filter, same philosophy as WO `nextNumber`); `/generate` previews without consuming, `/create-item` recomputes server-side so racing users converge (SKUItem unique constraint 409s the loser); editing keeps the suffix while the combination is unchanged, a changed combination gets a fresh number. Generator shows the series as its own chip. Deliberately not done: atomic counter row (accepted WO-numbering race ceiling), >300-SKU-per-combination paging | ✅ shipped |
| CR-088 | 2026-09-01 | **App-wide 429s / stuck "Loading…" fixed** — Catalyst Dev env hit "Concurrency limit reached for the feature FUNCTIONS": the generator page fired one `/properties/:id/values` request **per property in parallel** (20+ at once, each also paying requireOrg + requireAddon ZCQL queries), saturating the function-concurrency cap until the gateway 429'd/hung everything (access logs: same endpoints 76→273ms, 93→703ms as bursts piled up; app log "redundant initialization attempt" at burst time). Fixes: new batched `GET /api/industries/:id/property-values` (`{propertyId: [values]}`, 2 ZCQL queries + 300-row page loop) replaces the fan-out in SKUGeneratorPage; `enabledAddons` gets a 60s in-memory TTL cache (invalidated by admin org-addons toggle) so requireAddon stops costing one ZCQL on every /api request. Old per-property endpoint kept (PropertyManagerPage still uses it). Follow-ups same day: `/auth/me` runs its user+token lookups in parallel; `requireOrg` gets a 60s userId→orgId cache (cleared on select-org / token save) so most /api requests skip the ZohoToken query too — steady-state cost is now ~1 ZCQL per request (was 3+). Root cause context: Dev-env FUNCTIONS concurrency is **org-wide and duration-scaled** (~10 concurrent at 1s/request shared by all 5 projects); the boffo tracker's 1-min polling from open browser tabs contends for the same pool — long-term fix is a Production env for this project | ✅ shipped |
| CR-087 | 2026-09-01 | **Push-to-Books config dialog + custom-field mapping removed** (MSUN) — clicking Push (single or "Push all unsynced") now opens a dialog: Track Inventory always On, Inventory Tracking radio **None / Serial / Batch** (`track_serial_number`/`track_batch_number`, create-only — immutable in Books after transactions), Inventory Account dropdown fed by new `GET /api/sku-items/stock-accounts` (chart-of-accounts stock type, pre-selected to Finished Goods; empty = server default). Bulk push applies one dialog to the whole batch. **All automatic item custom-field mapping removed** (supersedes CR-027 §3/§4 and CR-033): hardcoded `ITEM_DEFAULT_CFS` + property-derived `zohoCfApiName` push deleted (`buildZohoCustomFields`, `buildItemCfs`, `normalizeCustomFields`, `getItemCfOptions` all dead code, removed) — client fills Item Type / Criticality / Design Type / Source / Size / Drilling manually in Books. Import-side CF reading and `cf_so_no` (CR-078) untouched | ✅ shipped |
| CR-086 | 2026-09-01 | SKU generator: **Tab key walks the property fields** — explicit `tabIndex` on the property `<select>`s and range inputs; macOS Safari/Chrome skip selects on Tab unless the OS "full keyboard access" preference is on, which made keyboard entry look broken since nearly every property is a dropdown | ✅ shipped |
| CR-085 | 2026-09-01 | **Industries tab → account/Settings menu** — the Industries tab leaves the SKU module tab bar (setup-only, rarely touched); it's now an "Industries" item in the top-right account dropdown (visible with the `sku-generator` addon, next to Settings). SKU sidebar entry + `/sku/*` fallback land on `/sku/items` instead of industries; all `/sku/industries…` routes kept for permalinks and deep links (property manager, global search) | ✅ shipped |
| CR-084 | 2026-09-01 | Purchase requests: **modify & delete + reachable from the WO screen** — new `DELETE /api/wo/pr/:prId` (whole request) and `DELETE /api/wo/pr-line/:lineId` (single line; deleting the last line removes the emptied request too), both 409-blocked once a line sits on a Books PO ("delete the PO first" — deleting the PO already resets the PR to Draft). PurchaseTab: red "Delete request" button (confirm modal) on each Draft request + per-line ✕ on lines not yet on a PO; qty/vendor editing unchanged. WO details page gains a **Purchase tab** (reuses PurchaseTab, `GET /:id` already carried `purchaseRequests`) so a raised PR can be re-quantified or deleted right where it was raised (WO-0009: raised 2, wanted 10). Activity log: `pr.delete` / `pr.line.delete` | ✅ shipped |
| CR-083 | 2026-09-01 | WO grid "Request purchase" button **prefills the purchase request** instead of navigating away — click switches the Materials grid to the (CR-077) Purchase action and prefills qty = shortfall for the ticked rows, or for every short row when nothing is ticked; quantities stay editable and the confirm bar's "Request N lines" raises the PR (chip → Requested; PO Raised still comes from confirming the PO). Nothing prefilled → toast + Purchase mode. The standalone `/wo/purchase` page stays reachable from the sidebar "Purchase request" nav | ✅ shipped |
| CR-082 | 2026-09-01 | WO **approval levels setting** — new `OrgSetting` key `approvalLevels` (Disabled / 1 level / 2 levels / Auto) as a dropdown on the WO settings page; unset ("Auto") derives the count from configured approver emails (L2 email → 2, L1 only → 1, none → 0), so no setup means **no approval required at all**. New pure `approvalLevelCount` in `workorder/store.js`; `requiredLevelsMet` now takes a level count (0/1/2). `/approve` 409s when disabled or when the level exceeds the configured count; `/invoice-gate` requires `[1,2].slice(0, count)` (empty = always allowed); WO detail returns `requiredApprovalLevels`. UI: Approve/Reject hidden and Approvals tab shows a "disabled" notice at 0 levels, one card at 1 level; settings page gains a generic `select` field type | ✅ shipped |
| CR-081 | 2026-09-01 | Qty inputs app-wide: **spinner arrows removed** — one global `index.css` rule hides the webkit inner/outer spin buttons and sets `appearance: textfield` on every `input[type="number"]` (11 across the app); inputs stay `type="number"` so non-numeric typing is still rejected | ✅ shipped |
| CR-080 | 2026-09-01 | WO **Close / Reopen** — "Close WO" button on a Completed WO with an **all-items-issued gate**: `POST /:id/status` (to=Closed) builds the grids and 409s (`code:"unissued"`, item list) when any row's net issued < required; the page shows a "N items not fully issued — close anyway?" modal and resends with `force:true` (forced closes log `forced:true`). New pure `unissuedRows` in reports.js (issued-only, unlike rollUp's `complete` which counts reserved) + `unissued.test.js`. **Admin-only `POST /:id/reopen`** (requireAdmin, reason required) moves Closed → Completed and logs `wo.reopen {reason}` to ActivityLog (visible in the History tab); deliberately NOT in FLOW so the generic status endpoint can't reopen. "Reopen WO" button shows only for `user.isAdmin` (user threaded App → WorkOrderLayout → WorkOrderPage), reason textarea modal. No schema change | ✅ shipped |
| CR-079 | 2026-08-31 | By-item Purchase page: **qty always editable** — a row whose pending shortfall is 0 (netted away by another WO's draft PR) no longer locks (`—`, disabled checkbox); every row keeps an enabled checkbox + qty input (covered rows default 0), `raise()` drops zero-qty lines, and `raiseItemPO` accepts a covered/extra item by inserting one unattributed line (empty `workOrderId`/SO) instead of silently skipping it. Fixes "created WO-0010, want to raise purchase, but 987654333 qty cannot be edited" | ✅ shipped |
| CR-078 | 2026-08-31 | SO traceability via **`cf_so_no` custom fields** — every Transfer Order (reserve/de-reserve/issue/return + auto-return) publishes the WO's SO number to the TO's `cf_so_no` field; every addon-raised PO stamps each line item's `cf_so_no` (item custom field) with the SO it traces to, **one PO line per (item, SO)** (`collapseLines` keyed by item+SO — same-SO merge kept, cross-SO lines split; By-item consolidated raise carries per-breakdown SO). PO edits echo `item_custom_fields` through the wholesale PUT so cf_so_no survives qty edits. Orgs lacking either field: create retries once without custom fields — a missing field never blocks a stock move or PO | ✅ shipped |
| CR-077 | 2026-08-31 | Materials grid gets a **Purchase action**: tick items, type any quantity (input never disabled — MAX fills what is still short), confirm raises the purchase request with exactly those lines/qtys (`POST /purchase-request`, dedup-netted server-side). Fixes "qty box was disabled and Request purchase raised the PR directly" | ✅ shipped |
| CR-076 | 2026-08-31 | PO raise: **GST-direction retry** (3032/3033 → re-post once with flipped IGST↔CGST+SGST), **server-side duplicate-PR guard** (`createPR` re-nets posted lines against open draft PRs → 409 when fully covered), and **editable shortfall qty** before raising the PR (PurchaseTab) | ✅ shipped |
| CR-075 | 2026-08-31 | WO "In stock" showed **−2** (WO-0008) — bulk sweep pruned per-warehouse snapshot rows on a breakdown-less payload, grid fell back to the org total (over-promising reservable stock), and the reserve write-through rebuilt Main from a zero baseline. Fixes: `writeStock` prunes only when the payload has a breakdown, bulk rows without a breakdown fall to the item-detail call, grid self-heals when the **Main** row is missing (not just when the item has no row) | ✅ shipped |
| CR-074 | 2026-08-31 | Warehouse-stock report: **pivot to warehouse-per-column, flat grid** (corrects CR-072/073 — Reserve/Issue ARE warehouses in this org) — one row per item, one column per org warehouse (`Item \| SKU \| Head Office \| Reserve \| Issue \| … \| Total \| Available \| Last synced`), grouping removed entirely; **dropdown filters** (warehouse + stock qty: All/In stock/Low&lt;10/Zero, qty evaluated on the selected warehouse's column or Total) replace chips, zero-stock checkbox kept; standard `GridFooter` pagination (25/page). **Available = Main (Head Office) − Issue-warehouse qty** per WO logic (formulas.js routes; falls back to org total when no breakdown). Backend `warehouseStock` pivots server-side → `{ warehouses, mainWarehouseId, issueWarehouseId, items[{stocks{},total,available,syncedAt}] }`; per-group Sync + CR-073 `reserved`/`issued` fields dropped; per-item ⟳ + Sync visible unchanged | ✅ shipped |
| CR-073 | 2026-08-31 | Warehouse-stock report: **Reserve/Issue are consumption columns, not warehouses** (CR-072 correction) — the org's Reserve/Issue locations (`reserveWarehouseId`/`issueWarehouseId` roles from settings) no longer render as collapsible groups; only physical warehouses group. Their per-item quantities pivot into **Reserved** / **Issued** columns (`Item \| SKU \| On hand \| Reserved \| Issued \| Available \| Last synced`) with group-header totals; `syncItem` returns `reserved`/`issued` so the per-item ⟳ patches them live. No "Returned" column — the org has no return location (returns land back in the source warehouse) | ✅ shipped |
| CR-072 | 2026-08-31 | Warehouse-stock report **redesign** (Claude Design mock) — item-led grid with **all warehouses grouped at once**: collapsible group header per warehouse (totals, zero-stock count, per-group **⟳ Sync**), item rows with per-item ⟳ / SKU / color-coded stock (zero grey, low &lt;10 amber) / **Last synced**; **chip filters** (warehouse with counts, All/In stock/Low/Zero) + **"Ignore items with 0 stock" checkbox** + toolbar **Sync visible** (replaces the incremental Sync-stock button; nightly cron + webhooks still cover incremental). Backend: `byOrgAll` (store.js) pages past ZCQL's ~300-row cap on a ROWID cursor; `warehouseStock` returns the full per-warehouse set (org-total-only items land under "Unassigned"), rows gain `warehouseId`+`syncedAt`; `?warehouseId=` server filter dropped (client-side now). Fonts app-wide: Manrope → **Inter** body + **Space Grotesk** display (`--font-display`) as free Styrene-style stand-ins. Design source: user's claude.ai/design project (files inaccessible from session — built from screenshot) | ✅ shipped |
| CR-071 | 2026-08-31 | Warehouse-stock report — **per-item ⟳ refresh** + **SKU column**. Each item row gets a refresh button that live-pulls just that item from Zoho (`POST /api/wo/items/:itemId/sync-stock`, one call) and patches the row in place — no table re-pull, far cheaper than ↻ Full resync. `syncItem` now returns `{stockOnHand, availableStock, warehouses[]}` (org total + per-warehouse breakdown, shaped by extracted pure `stockTargets(item)`) so the patch works in both the default "All warehouses" view and a warehouse-filtered view. SKU shown as its own column (was CSV-only since CR-069) so the existing item/SKU search box is visibly meaningful; subtotal/grand-total colSpans widened. No schema change; new `stocktargets.test.js` | ✅ shipped |
| CR-070 | 2026-08-29 | Cheaper stock sync — **incremental delta + real-time webhooks**. "Sync all stock" now pulls only items changed since a per-org cursor (`OrgSetting.stockSyncCursor` = newest Zoho `last_modified_time`): `listItemsWithStock({since})` lists newest-first and early-stops, so 5 changed items cost ~5 calls not ~143. First run / new **↻ Full resync** button re-pull everything (paged, cursor reset). Also opened the already-built webhook path: `internalAuth` accepts `?secret=` so a Books workflow rule can push per-item changes to `/internal/zoho-event` from its URL alone (real-time, `source:"webhook"`) — WORKORDER.md §4.6 updated | ✅ shipped |
| CR-069 | 2026-08-29 | Warehouse-stock report → one grouped table with **merged warehouse cells** — `WarehouseStock` renders a single `Warehouse \| Item Name \| Stock on hand \| Available` table (was a separate bordered table per warehouse); the warehouse name is a `rowSpan`-merged, lightly shaded (`--bg-page`) cell spanning its item rows + subtotal for at-a-glance grouping. SKU column dropped from screen (kept in CSV); per-warehouse subtotals + grand total unchanged; mirrors the estimate rowSpan pattern | ✅ shipped |
| CR-068 | 2026-08-29 | Warehouse-stock report shows the wrong count for Locations orgs — synced item now reads its **item-level on-hand** (the `warehouseId ''` org-total row) instead of the per-warehouse breakdown. The breakdown is unreliable for Locations-enabled orgs (stock sits in a location the `/items` detail doesn't enumerate → stale 0 rows) and its full set overran ZCQL's ~300-row cap (372 rows → silent truncation). AFR - AIRWIN's on-hand 1 was in the org-total row all along but hidden behind stale 0s. `writeStock` now also drops per-warehouse rows a fresh payload no longer carries; warehouse drill-down dropdown fed from `/settings` (live locations) + server-side `?warehouseId=` filter | ✅ shipped |
| CR-067 | 2026-08-29 | "Sync all stock" 408 fix (follow-up to CR-066) — the full-catalog sweep is now **paged**: `reconcileOrg({full,offset,limit})` processes a 50-item slice and returns `{total,nextOffset,done}`; the report page loops slices until done (button shows `Syncing… N/total`). 6-wide concurrency alone still 408'd a whole Locations-org catalog (one detail call per item); this keeps every request under the 30s ceiling so standalone items (e.g. AFR - AIRWIN, on no open WO) actually land in `ItemStockSnapshot` | ✅ shipped |
| CR-066 | 2026-08-29 | Stock refresh 408 fix — `reconcileOrg` fans per-item stock pulls + composite refreshes out 6-wide (`mapLimit`) instead of a serial loop with 150ms sleeps; a Locations-enabled org's per-item fallback for every item was pushing the sweep past Catalyst's 30s ceiling → 408 → generic "Stock sync failed" toast | ✅ shipped |
| CR-065 | 2026-08-29 | Estimate reads the CRM per-line `Size` field (source of truth) instead of the stale description `Size:` — a same-name item now prints its distinct sizes (26"/19"/20"/…) with each line's price; supersedes CR-062's "no size field" assumption (that metadata was a different org) | ✅ shipped |
| CR-064 | 2026-08-29 | Estimate: print a stacked item's SIZE once per run — blank when it repeats the row above, so a valve + its same-size accessory price lines don't repeat `26" DN 650` on every row (price/qty rows unchanged) | ✅ shipped |
| CR-063 | 2026-08-29 | Estimate items table: stack Size/Qty/List-price/Amount vertically (fixed 10px gaps) in one row per item instead of one `<tr>` per size — a rowspan description no longer stretches a 2-size item's values far apart; many-size items unchanged | ✅ shipped |
| CR-062 | 2026-08-29 | Estimate: drop the redundant `Size:` line from the description spec block — a same-name item whose in-line `Size:` text went stale no longer shows the previous item's size; the SIZE (INCH) column (fed by the size-row lines) is the single source of truth, matching how merge-path items already render | ✅ shipped |
| CR-061 | 2026-08-29 | Warehouse-stock report — new "Warehouse stock" tab on `/wo/reports`: one row per item × warehouse (On hand / Available) from the local `ItemStockSnapshot` cache, warehouse + item-search filters, ⟳ Sync all stock (full-catalog sweep) + CSV export; `ItemStockSnapshot` gains `itemName`/`sku` cached at sync time | ✅ shipped |
| CR-060 | 2026-08-29 | Estimate print polish — Revision No accepts free text (R1/R2) stacked above Revision Date, SR-NO top-aligned, Terms↔Bank gap removed with a divider, customer contact name bold + contact-email fallback, company email on two lines, CalcSheet PAGE nn aligned to the item-page description column | ✅ shipped |
| CR-059 | 2026-08-27 | Estimate print tweaks — CalcSheet PAGE nn moved off its stray line into the totals band, "To, {customer}" one bold line, all table cells vertically centered | ✅ shipped |
| CR-058 | 2026-08-27 | Estimate footer → IAF · IAS · IBR · ISO certification row (individual images replace the baked ISO/IAS/IAF/D&B strip; D&B dropped, MSUN logo header-only); IAF jpeg cleaned of its baked-in transparency checkerboard | ✅ shipped |
| CR-057 | 2026-08-27 | Demo revert: WO details page back to the pre-redesign screen (`WorkOrderPage.jsx` + `MaterialsGrid.jsx` restored from `b9a1248`) — CR-049 redesign + CR-051 movement ledger parked in git (`5d9eb68`) for re-restore after the demo | ✅ shipped |
| CR-056 | 2026-08-26 | Estimate print polish — Revision No numeric (1,2,3…) printed before Revision Date (blank fields omitted), kamal@ email dropped from header, "To," + customer name on one line, CalcSheet ends at its aggregate rows (no stretch-to-footer), PAG NO. middle-aligned + long descriptions wrap | ✅ shipped |
| CR-055 | 2026-08-26 | Estimate print: certificates footer height-capped at 16mm (centered), packing slack widened, and pagination re-measures after the Inter webfont loads — long item text + footer no longer break onto an extra page; geometry verified via headless-Chrome PDF harness | ✅ shipped |
| CR-054 | 2026-08-26 | Estimate print: browser URL/date/title header-footer removed (`@page` margin 0, margins moved into sheet padding) + footer no longer spills to its own page — print geometry now matches the pagination measure pass | ✅ shipped |
| CR-053 | 2026-08-26 | Estimate print: Revision No / Revision Date (toolbar fields, CR-050) now print in the sheet header below Offer Preparation Date when filled in | ✅ shipped |
| CR-052 | 2026-08-26 | Estimate print: MSUN certificates strip as the page footer (fills the CR-050 ISO footer slot) + every sheet's table stretches to the footer — column rules run through the empty space, totals band at the page bottom | ✅ shipped |
| CR-051 | 2026-08-26 | WO Activity tab → in/out movement ledger — each txn a card (↗ out blue / ↙ in green, route chip, TO number, item lines with qty); txn lines enriched with item name/sku/uom; audit events stay as slim rows in the same stream | ✅ shipped |
| CR-050 | 2026-08-26 | MSUN estimate template pass — With Total default, header cleanup (no tagline, bigger centered logo, sales emails), client details from CRM Account/Contact in "To", Revision Date/No (screen-only), discount only on CalcSheet with per-page clubbed amounts, ISO footer slot, T&C bold/color; header band stays first-page-only (CR-041) | ✅ shipped |
| CR-049 | 2026-08-26 | WO details page redesigned to the Claude Design mockup — KPI band + coverage bar, shortage/procurement banners, instant per-line Reserve/Issue/Release/Return, Materials·Items·Activity tabs (Approvals folded into header + banner) | ✅ shipped |
| CR-048 | 2026-08-25 | By-item grid shows Work order / Status / PO number per line — already-requested/ordered lines stay visible (Requested / PO Raised / Received chips) instead of silently vanishing, making the duplicate-PO protection visible | ✅ shipped |
| CR-047 | 2026-08-25 | Requests/Orders grids fix (blank workOrderId broke the ZCQL `IN`, silent 500 → "No purchase requests yet."); Request purchase + short-item pill moved onto the materials action tab line; "Raise request for…" dropdown removed | ✅ shipped |
| CR-046 | 2026-08-25 | Fix SO picker: drop Zoho `filter_by` (code 2 / matches nothing) and gate confirmed on `order_status === "open"` — Books' API never returns status "confirmed" (UI label only) | ✅ shipped |
| CR-045 | 2026-08-25 | PO GST picks inter- vs intra-state (IGST vs CGST+SGST) by vendor state — fixes "IGST cannot be applied… intrastate" (3032) | ✅ shipped |
| CR-044 | 2026-08-25 | Books 110802 fix — set a line-level GST tax on new items and on PO create/edit (India GST edition rejects lines without their own tax) | ✅ shipped |
| CR-043 | 2026-08-25 | Estimate "Our Offer No" = CRM Quote No (MSUN custom `Quote_No`, then `Quote_Number`); dropped the Subject/id fallback | ✅ shipped |
| CR-042 | 2026-08-25 | Transfer Orders carry serial/batch numbers + fall back to a number when Zoho auto-numbering is off; WO picker shows only confirmed, WO-less SOs; approval 2nd level only when configured (Pending after 1st); instant "Sync all" stock pull | ✅ shipped |
| CR-041 | 2026-08-25 | Estimate header band (logo + address) prints on the first page only; continuation/calc/terms pages omit it | ✅ shipped |
| CR-040 | 2026-08-25 | Estimate T&C: Duties & Taxes on Export too, one-time cache reset so all types show A/B; amount columns centered | ✅ shipped |
| CR-039 | 2026-08-22 | Estimate print versions made functional — renamed Standard / With Total / Export / All Item - Trading; totals page only on With Total; Trading skips same-name grouping | ✅ shipped |
| CR-038 | 2026-08-22 | Improvement pass, phase 4: UX & consistency — house-grid compliance on the SKU list, bulk push to Books, stale-sync badge (`SKUItem.lastPushedAt`), URL deep-links for selection/filters, ConfirmModal deletes, modal Enter-to-submit, controlled PR qty + qty-clear guards, shared en-IN formatters, a11y basics | ✅ shipped |
| CR-037 | 2026-08-21 | Improvement pass, phase 3: frontend perf — WO page patches the rail instead of re-fetching the list, purchase lists load lazily per tab and refresh only what's on screen, memoized MaterialsGrid rows, route-level code splitting (main bundle 546→325 kB) | ✅ shipped |
| CR-036 | 2026-08-21 | Improvement pass, phase 2: backend perf — `buildGridsBulk` kills the reports N+1 (~6 queries total), per-request Zoho token memo, WO detail's proc-status scan scoped to the one WO, bulk/parallel Zoho loops (stock reconcile, PO refresh, txn lines, stock self-heal) | ✅ shipped |
| CR-035 | 2026-08-21 | App-wide improvement pass, phase 1: quick wins — missing `--bg-page` token, QC gate modal, ⌘↵ create shortcut, debounced SKU preview, labeled CSV headers, honest helpdesk mailto, loading-vs-empty states, PR-line save toast | ✅ shipped |
| CR-034 | 2026-08-21 | WO status auto-advances on material movement — first reserve → MaterialAllocationPending, first issue → InProgress | ✅ shipped |
| CR-033 | 2026-08-21 | Books push skips custom fields the connected org doesn't have (multi-client safe; no per-client field setup needed) | ✅ shipped |
| CR-032 | 2026-08-21 | Print Estimate from a CRM Quote — deal & quote buttons, checkbox multi-quote print, items parsed from quote line descriptions (flat fallback), two templates (A–F priced / A–D technical), seamless Zoho auto-login | 🚧 in progress |
| CR-031 | 2026-08-21 | WO items editable during production (internal only, Books-item picker, substitution notes); leftover material auto-returns to Main on completion; reconciliation report | 🚧 in progress |
| CR-030 | 2026-08-21 | Unselected Books-item properties skip (not error); edit a generated SKU in the generator with auto Books re-sync incl. property-derived BOM lines | 🚧 in progress |
| CR-029 | 2026-08-18 | Manufacturing SKUs push as Books composite (assembly) items — associated items from Books-item properties, full field mapping, type locked after push | 🚧 in progress |
| CR-028 | 2026-08-13 | BOM page lists Books composite items (no work orders); import can create composite + missing component items in Books; CSV template download | 🚧 in progress |
| CR-027 | 2026-08-11 | Books item field-mapping defaults on push (Pcs unit, serial inventory tracking, Finished Goods / FIFO, §3 constants, §4 param custom fields) | 🚧 in progress |
| CR-026 | 2026-08-11 | Property value can also be created as a standalone Zoho Books item (checkbox + dedupe + "Books items" tracking grid) | 🚧 in progress |
| CR-025 | 2026-08-11 | Club properties into one un-separated SKU segment (Body+Gland, 3-part Seat) | 🚧 in progress |
| CR-024 | 2026-08-08 | CRM Deal context on the SKU generator page — open from a Zoho CRM custom link button, read-only "CRM Info" card | ✅ shipped |
| CR-023 | 2026-08-06 | Purchase Request: item-wise cross-WO view + one-step grouped PO; derived procurement status chip + filter; "Purchase" → "Purchase request" | 🚧 in progress |
| CR-022 | 2026-08-04 | Work Order material-reservation screen redesigned — plain-language table, coverage bars, shortage bar, live confirm bar | ✅ shipped |
| CR-021 | 2026-08-02 | Zoho Books item sync is manual only — drop automatic push on create/edit, keep the "Push" button | ✅ shipped |
| CR-020 | 2026-07-30 | Orders tab lists all Zoho Books POs; delete wrongly-created POs with lock mark | ✅ shipped |
| CR-019 | 2026-07-30 | PR same-item line merge; BOM/Purchase pages get their own grids; item-pipeline report | ✅ shipped |
| CR-018 | 2026-07-30 | WO Zoho-Books UI: split-view detail, Approve ▾, Print PDF, delete; BOM & Purchase as sidebar pages | ✅ shipped |
| CR-017 | 2026-07-28 | Nav: "Order Management" sidebar submenu, Settings → account menu | ✅ shipped |
| CR-016 | 2026-07-27 | PO detail view in Purchase tab: edit lines, issue/cancel, delete | ✅ shipped |
| CR-015 | 2026-07-27 | Purchase tab: vendor list errors + ⟳ re-sync, draft-PR shortfall dedup | ✅ shipped |
| CR-014 | 2026-07-24 | SKU tabs in setup order + combined SKUs page (Zoho Books master–detail) | ✅ shipped |
| CR-013 | 2026-07-23 | Work Order module (MSUN BRD) — BOM, Reserve/Issue/Return, Purchase Request | 🚧 in progress |
| CR-012 | 2026-07-23 | CRM Deal → SKU master item picker (widget) | 📋 specified, blocked on CRM console work |
| CR-011 | 2026-07-23 | Generator chrome cleanup + catalog-wide search | ✅ shipped |
| CR-009 | 2026-07-23 | Vertical generator, SKU/name property gates, per-line Books description | ✅ shipped |
| CR-008 | 2026-07-23 | Zoho field-mapping UI | 🚧 in progress (`feat/zoho-field-mapping`) |
| CR-007 | 2026-07-23 | Multi-DC Zoho login + email-less accounts | ✅ shipped |
| CR-006 | 2026-07-23 | Import: find-or-create PropertyValues | ✅ shipped |
| CR-005 | 2026-07-03 | Multi-add-on platform + reserve read path + record-grid standard | ✅ shipped (reserve write path pending) |
| CR-004 | 2026-07-03 | Org switcher + Books-only OAuth scopes | ✅ shipped |
| CR-003 | 2026-07-02 | Item search, grid filters, pagination, sidebar, branding | ✅ shipped |
| CR-002 | 2026-06-30 | Migrate backend to Catalyst Data Store | ✅ shipped |
| CR-001 | 2026-05-28 | SKU editing + Zoho Books value sync & import | ✅ shipped |

---

## CR-079 — By-item Purchase page: qty always editable (2026-08-31) — ✅ shipped

**Asked:** "I raised the SO, created WO-0010, I want to raise the Purchase
request — but the 987654333 qty cannot be edited. I should have the facility
for that."

**Diagnosis:** "Request purchase" navigates to `/wo/purchase` (By item), where
a row locked (`—`, disabled checkbox) whenever its *pending* `totalQty` was 0.
`totalQty` is netted org-wide against draft PRs (`applyDraftCoverage`), so a
draft PR raised earlier from another WO (WO-0008/0009) swallowed WO-0010's
5-unit need and locked the row even though this WO is still short. The Reserve
grid's disabled input is correct (nothing reservable from 0 stock) and is
untouched.

**Shipped:**
- `WorkOrderPurchasePage.jsx` (ByItemView/RowGroup): the `canOrder` gate is
  gone — every row keeps an enabled checkbox and qty input (a draft-covered row
  defaults to 0, the buyer types what they want); select-all covers all rows;
  `raise()` drops zero-qty lines ("Every selected quantity is zero" if none
  survive).
- `workorder/purchase.js` `raiseItemPO`: an item with qty > 0 but no pending
  WO breakdown (the covered/extra case) is no longer silently skipped — it
  inserts one unattributed PR line (empty `workOrderId`/SO), which the PO
  create and received-qty refresh already tolerate.

**Not done:** attributing the extra qty to the WO the buyer navigated from —
the By-item page is deliberately cross-WO; the existing dedup/netting display
already explains where the pending qty went (`n pending · n on PO`).

## CR-077 — Materials grid: Purchase action with per-line qty (2026-08-31) — ✅ shipped

**Asked:** "I raised the WO, I selected an item, the QTY box was disabled. I hit
Purchase request and it directly raised a PR" — the buyer wants to pick items
and type quantities on the WO's Materials grid and have the purchase request
carry exactly those.

**Diagnosis:** the grid's qty column is capped by the selected *movement*
action (Reserve caps at reservable, which is 0 for a short line → disabled
box), and the "Request purchase" button ignored the selection entirely (it
navigates to `/wo/purchase`, whose shortfall panel raises a PR for every short
item with auto quantities).

**Shipped:** a fifth action, **Purchase**, in the grid's action selector
(`MaterialsGrid.jsx`): the qty input is never disabled (`uncapped` — the cap
only feeds MAX, which fills the remaining shortfall), the "Left to request"
chip counts short lines, and Confirm posts `POST /api/wo/:id/purchase-request`
with the ticked/typed lines instead of a stock move. Server-side CR-076 netting
still applies (quantities already on a draft PR are deducted / fully-covered →
409). The toolbar "Request purchase" navigation button is unchanged.

## CR-076 — PO GST retry, duplicate-PR guard, pre-raise qty (2026-08-31) — ✅ shipped

**Asked:** "Could not raise the purchase order: Zoho books API error: IGST has
to be applied as this is an interstate transaction (code 3032)." Plus: (1) do
not allow a duplicate PR if already raised for the same qty; (2) allow the qty
to be chosen before raising the purchase request.

**Shipped:**
- **GST-direction retry** (`zoho/booksApi.js` `createPurchaseOrder`): the
  inter/intra guess is GSTIN-based (CR-045) and reads intra when the vendor has
  no GSTIN, but Books decides place of supply from the vendor's address. On
  3032/3033 the PO is re-posted once with the flipped tax
  (IGST ↔ CGST+SGST group); any other error still throws. Covers both PO paths
  (`confirmPR`, `raiseItemPO`) at their single Books call site.
- **Duplicate-PR guard** (`workorder/purchase.js`): `createPR` now re-nets the
  posted lines against this WO's open draft-PR lines server-side (new shared
  `openDraftLines` + existing `applyDraftCoverage`; the shortfall endpoint
  reuses the same helper). Fully covered → **409 "Already requested — PR-xxxx
  covers these quantities"**; partially covered → only the remainder is
  requested. A double-click or stale tab can no longer duplicate a request.
- **Editable shortfall qty** (`PurchaseTab.jsx`): the "To purchase" column is
  now a `QtyInput` (commit on blur/Enter, amber while dirty) so the buyer sets
  quantities before raising; zero-qty lines are dropped client-side.

**Not done:** no vendor-address state lookup — the one-retry flip makes it
redundant and needs no state-code table.

## CR-075 — WO "In stock" −2: snapshot prune/write-through chain (2026-08-31) — ✅ shipped

**Asked (WO-0008, item 123456789):** "Available was 10, reserved 2, instock
shows −2. How? In stock should always show qty from Head office, main
identified warehouse."

**Diagnosis (datastore):** In stock (grid column B) *is* the Main-warehouse
row — but three steps corrupted it. The bulk sweep returned org total 22 with
no per-location breakdown; the `stock_on_hand > 0` shortcut trusted it and
`writeStock`'s CR-068 prune **deleted the per-warehouse rows** including Main.
The grid then fell back to the org total (22), so reserving 2 validated. The
reserve TO's write-through (`txn.js adjustSnapshots`) rebuilt Main from the
now-missing baseline: 0 − 2 = **−2** (rows verified: Main −2 / Reserve 2,
source `writethrough`, seconds after TO 4000844000001673101).

**Shipped:**
- `writeStock` prunes stale per-warehouse rows **only when the payload carries
  a breakdown** (`targets.length > 1`) — a total-only payload says nothing
  about warehouses.
- `reconcileOrg` trusts a bulk row only when it has `warehouses[]`/
  `locations[]`; a bare total forces the item-detail call so the Main row stays
  fresh.
- `healStock` (grid) also heals when the **Main row** is missing while
  `mainWarehouseId` is configured — B never silently falls back to the
  over-promising org total for synced items.
- `stocktargets.test.js` gains writeStock prune-rule tests (fake catalyst).

**Repair:** per-item Sync on the affected item rewrites true per-location rows
(replacing −2). If Zoho's own Main location went negative from the TO, that
must be corrected in Zoho (redo the TO from the right location / adjust stock).

**Asked:** "How do we make the sync less expensive? I updated 5 items but the
sync consumes API for all items."

**Diagnosis:** every "Sync all stock" re-pulled the whole catalog — for this
Locations-enabled org that's one `getItemStock` detail call per item (~143),
regardless of how few changed.

**Shipped:**
- **Incremental delta.** `listItemsWithStock(catalyst, { since })`
  (`zoho/inventoryApi.js`) lists `sort_column=last_modified_time&sort_order=D`
  and stops at the first item older than the cursor. `reconcileOrg`
  (`workorder/sync.js`) reads a per-org cursor (`OrgSetting.stockSyncCursor`,
  newest `last_modified_time` seen), pulls only the delta, processes it in one
  request, then advances the cursor. 5 changed → ~5 calls; nothing changed → 1
  list call, 0 detail calls.
- **Full resync fallback.** No cursor (first run) or `?force=1` → the paged
  full sweep (CR-067), which resets the cursor on completion. New **↻ Full
  resync** button next to **⟳ Sync stock** on `/wo/reports`.
- **Webhooks opened.** `internalAuth` (`index.js`) now also accepts a `?secret=`
  query param, so a Books workflow rule can authenticate to
  `/internal/zoho-event` from its URL when it can't send a custom header. The
  per-item push (`handleZohoEvent` → `writeStock`, `source:"webhook"`) was
  already built; this makes it usable. WORKORDER.md §4.6 updated with the
  secret/fallback.
- `maplimit.test.js` gains delta early-stop + cursor-max assertions.

**Not done:** deletions aren't caught by the delta (a removed item just stops
appearing) — a Full resync or the webhook `item` path clears stale rows. Noted
in the plan; revisit if it bites.

## CR-068 — Warehouse-stock report reads item-level on-hand (2026-08-29) — ✅ shipped

**Asked:** After CR-067 the full sync ran (143 items) but AFR - AIRWIN still
showed 0. "After sync ensure to refresh the item count of respective items."

**Diagnosis (datastore):** the sync was correct — AFR - AIRWIN's org-total row
(`warehouseId ''`) had `stockOnHand 1`. But the warehouse-stock report only read
per-warehouse rows (`warehouseId != ''`), and this Locations-enabled org's
breakdown for AFR - AIRWIN was three **stale 0 rows** (its 1 unit sits in a
location the `/items` detail didn't enumerate). Two compounding bugs:
- The item-level total (the authoritative on-hand) was never shown.
- The per-warehouse set is 372 rows — over ZCQL's ~300-row page cap — so the
  report was also silently truncating other items.

**Shipped:**
- `warehouseStock` (`functions/skuapi/workorder/reports.js`): default view now
  returns one **org-total row per item** (143 rows, complete, always matches the
  sync); a specific warehouse pick still returns that warehouse's rows.
- `writeStock` (`functions/skuapi/workorder/sync.js`): after upserting, delete
  per-warehouse rows the fresh payload no longer carries, so an emptied/aged
  location can't leave a stale row behind.
- `WorkOrderReportsPage.jsx`: warehouse dropdown fed from `/api/wo/settings`
  (live locations) instead of the loaded rows; the filter is now server-side
  (`?warehouseId=`).

**Not done:** paginating the default view past ~300 items — `ponytail:` note on
`warehouseStock`; the org-total set is one row per item, so it only bites when a
single org's catalog exceeds ~300 items.

## CR-067 — "Sync all stock" 408 fix: paged full sweep (2026-08-29) — ✅ shipped

**Asked:** User added inventory in Books (AFR - AIRWIN, on-hand 1 at a location)
and it never appeared in the addon after "⟳ Sync all stock", run twice.

**Diagnosis (Catalyst access logs + datastore):**
- AFR - AIRWIN was in **no** addon table (`ItemStockSnapshot`, `SKUItem`,
  `WorkOrderLine`); the report grid shows Books' own figures live, and Books
  reports on-hand 1 — so the data is correct upstream, the addon never captured
  it.
- `POST /api/wo/refresh?full=1` was still hitting **408** (~39s) intermittently
  even after CR-066's 6-wide fan-out. A Locations-enabled org needs one
  `getItemStock` detail call **per item in the whole catalog** (bulk `/items`
  reports 0 with no breakdown), so the full sweep is inherently O(catalog) Zoho
  calls — too much for a single 30s HTTP request. Concurrency capped the burst
  but not the total. When it 408s, nothing is written, so a standalone item on
  no open work order (only the full sweep reaches it) never lands.
- Config lever ruled out: `advancedio`, 256 MB, no timeout override — the ceiling
  is a gateway limit on synchronous HTTP, not CPU.

**Shipped:**
- `reconcileOrg(catalyst, orgId, {full, offset, limit})`
  (`functions/skuapi/workorder/sync.js`) — full mode with `limit` set processes
  `itemIds.slice(offset, offset+limit)` and returns `{total, nextOffset, done}`.
  Non-full (cron/bounded) and full-without-limit paths unchanged.
- `POST /api/wo/refresh` (`routes/workorder.js`) passes `offset`/`limit` through
  (default `limit` 50) and returns the paging cursor.
- `WorkOrderReportsPage.jsx` `syncAll()` loops chunks until `done`, showing
  `Syncing… N/total` on the button.
- `maplimit.test.js` gains a paging-cursor check (covers every id once,
  terminates) across totals 0/1/49/50/51/120.

**Not done:** moving the sweep to a true Catalyst async job (would let it run
off the HTTP clock entirely). Not needed — 50-item chunks clear the ceiling with
margin, and the client loop is stateless. Chosen over per-location bulk calls
(`/items?location_id=`) whose stock-scoping behaviour wasn't verifiable here.

## CR-066 — Stock refresh 408 fix (concurrency cap) (2026-08-29) — ✅ shipped

**Asked:** Live stock sync ("⟳ Refresh stock") was failing with a generic
"Stock sync failed" toast.

**Diagnosis (Catalyst access logs):** `POST /api/wo/refresh` returned **408**
(Request Timeout) at ~39s; earlier runs at 25–27s squeaked under the 30s
function ceiling. `reconcileOrg` pulled each item's stock **serially** with a
150ms sleep between calls. Because the org is Locations-enabled, the bulk
`/items` sweep reports `stock_on_hand 0` with no breakdown, so *every* item fell
to the per-item detail call — an O(n) serial sweep that grew past 30s. A 408
carries no JSON body, so the toast showed its fallback string.

**Shipped:**
- `reconcileOrg` (`functions/skuapi/workorder/sync.js`) now runs the per-item
  stock pulls and the composite refreshes through a new `mapLimit(items, 6, fn)`
  worker-pool helper (6 concurrent) instead of a serial loop. Removed the
  per-call `sleep`/`DELAY_MS`. ~39s sweep drops to a few seconds.
- `maplimit.test.js` covers completeness, the concurrency cap, and empty input.

**Not done:** moving the whole reconcile to a background job (returns instantly,
runs off the 30s clock). Marked with a `ponytail:` comment at `mapLimit`; the
upgrade path when the working set outgrows what 6-wide fits in 30s.

## CR-065 — Estimate uses CRM per-line Size field (2026-08-29) — ✅ shipped

**Asked:** On MSUN-Q-0040 the CRM has several same-name lines with different per-line
SIZE (INCH) values (26"/19"/20"/21"…), but the estimate printed them all at 26" and
collapsed to one size. It should take each line's real size.

**Shipped:**
- `buildEstimate` (`frontend/src/pages/estimateParser.js`) now reads the dedicated
  CRM `line.Size` field as the size source (falling back to the description `Size:`
  only when absent): `sizeVal = String(line.Size||"").trim() || specValue(specs, SIZE_KEY)`.
  The merged same-name item now carries one row per line with its **true, distinct**
  size, each with the line's own price. Split accepts pipe or newline; `specs`-null
  guarded. Test 5c covers per-line-Size-wins-over-stale-description.

**Why the earlier miss:** CR-062 read CRM field metadata from the **wrong org**
(id prefix `3100593…` vs this quote's `1356653…`, org60077311410) and concluded
there was no size field. The field exists (`Size`); this CR uses it. CR-062's
description-`Size:` strip stays (now cosmetic).

**Not done:** the `parseLineDescription` prototype format (multiple sizes in one
description) is unchanged — those lines have no dedicated per-line Size.

## CR-064 — Estimate SIZE printed once per run (2026-08-29) — ✅ shipped

**Asked:** On MSUN-Q-0040, SR 11 shows 13 stacked price rows all at `26" DN 650`
(valve + priced accessories). Same name + same size shouldn't repeat the size text;
keep the prices, print the size once. (Same name + *different* sizes → each size once.)

**Shipped:**
- `ItemRows` (`frontend/src/pages/EstimatePage.jsx`) renders the **Size** stack entry
  only when it's the first row or its `size|mm` differs from the row above; repeats
  render as an empty `<li>` (keeps `min-height:2.1em` alignment). Qty/List-price/Amount
  stacks unchanged — every price row stays.

**Not done:** consecutive-run dedupe only — a non-adjacent repeat of the same size
would print again (rows are grouped, so not an issue in practice). No price/qty
aggregation, no merge-logic change.

## CR-063 — Estimate size-value spacing (2026-08-29) — ✅ shipped

**Asked:** When an item has only 2 sizes, the Size / Qty / List-price / Amount values
have too much space between them; keep a 10px gap between values (many-size items are
already fine).

**Shipped:**
- `ItemRows` (`frontend/src/pages/EstimatePage.jsx`) now emits **one `<tr>` per item**;
  the Size/Qty/List-price/Amount columns each hold an `est-stack` `<ul>` of the item's
  values with a fixed 10px gap, top-aligned in the description-driven row. Dropped the
  per-size `<tr>` + `rowSpan` description machinery.
- `.est-stack` CSS: flex column, `gap:10px`, uniform `min-height:2.1em` per entry so the
  2-line Size column stays aligned row-for-row with the single-line Qty/Price columns.

**Root cause:** the description cell's `rowSpan` stretched a few size rows to fill its
height (inherent to `rowSpan`; the cells were already `vertical-align:top`). Pagination
is height-based (measures each item's whole `<tbody>`), so collapsing to one row is safe.

**Not done:** the single-line Qty/Price columns keep a slightly larger visual gap than
10px because they must stay aligned with the 2-line Size column (unavoidable trade-off).

## CR-062 — Estimate stale in-line Size fix (2026-08-29) — ✅ shipped

**Asked:** Added a new estimate item with the same name but a different size; in
the quote the size showed the same as the previous item instead of the new size.

**Shipped:**
- `parseLineDescription` (`frontend/src/pages/estimateParser.js`) now drops any
  `Size:` spec line from the description block, mirroring the existing merge-path
  filter (`specs.filter(([k]) => !SIZE_KEY.test(k))`). The **SIZE (INCH)** column —
  fed by the size-row lines (`SIZE_RE`) — is the single source of truth, so a
  same-name item whose in-line `Size:` text was left stale can no longer print the
  previous item's size.
- Test 1b in `estimateParser.test.js` asserts the `Size:` spec is stripped while the
  size row still parses.

**Root cause:** the `Quoted_Items` CRM subform has no dedicated size field (verified
via CRM field metadata); both the SIZE column and the block's `Size:` line came from
the one `Description` text, and the two representations could diverge.

**Not done:** no normalization of the source `Description` text itself — the stale
`Size:` line stays in CRM, it's just no longer displayed.

## CR-061 — Warehouse-stock report (2026-08-29) — ✅ shipped

**Asked:** Show warehouse-wise stock of the items, with the necessary filters,
in the reports.

**Shipped:**
- New **Warehouse stock** tab on `/wo/reports` (`WorkOrderReportsPage.jsx`) —
  one row per item × warehouse: Item, SKU, Warehouse, On hand, Available.
  Reads the local `ItemStockSnapshot` cache only (zero per-item Zoho calls);
  warehouse labels come from one live `listWarehouses`.
- Filters: **Warehouse** dropdown + **item/SKU search** (client-side, reusing
  `distinct` from `GridFooter`). Pager + CSV export reflect the filtered rows.
- **⟳ Sync all stock** button → `POST /api/wo/refresh?full=1` (the existing
  full-catalog sweep), then re-pulls the report so the whole catalog can be
  cached on demand.
- Backend: `reports.warehouseStock` (`workorder/reports.js`) +
  `GET /api/wo/reports/warehouse-stock` (`routes/workorder.js`). Single-location
  orgs (no per-warehouse breakdown) fall back to the org-total rows under one
  "All warehouses" label.
- `ItemStockSnapshot` gains `itemName` + `sku` (text), cached in `writeStock`
  from the Zoho item payload so a whole-catalog report has names with no extra
  calls. Backfill is automatic on the next full sweep.

**Not done:** no pivot (warehouse-as-columns) layout — long format only; item
names on rows synced before this change show the item id until the next sweep.

## CR-060 — Estimate print polish (2026-08-29) — ✅ shipped

**Asked:** Revision field should accept text (R1, R2) with the number above the
date; SR-NO column top-aligned; remove the gap between Terms and Bank tables and
add a separator; bold the customer contact person; customer email not showing;
company email on its own two lines; the summary page's "Page 3" number doesn't
line up with the other pages.

**Shipped (`EstimatePage.jsx`, `EstimateTerms.jsx`, `estimateParser.js`):**
- `RevFields`: Revision No input `number → text` (free-form R1/R2); No field
  reordered above Date. Print header stacks Revision No above Revision Date.
- `.est-sr { vertical-align: top }` on the SR-NO cell (flat + rowspan items).
- Terms page: `FillTable` stretch spacer removed so the bank table sits directly
  under the terms; a `.est-tc-sep` hairline divider separates them; FootBand
  still bottom-pinned.
- To block: customer contact name wrapped in `<b>` (mobile stays normal).
- `estimateParser`: email falls back to the contact record (`c.Email`) since the
  account often has none — verify the field against a live quote.
- Company `E:` line split into two stacked lines.
- CalcSheet: `PAGE nn` now a teal `est-t-band` row in the description column,
  aligned with the item pages (shown for priced and non-priced).

**Not done:** the CRM email field name is still a best-guess (`c.Email`); if the
real field differs it needs correcting once a live `_contact` is inspected.

## CR-059 — Estimate print tweaks (2026-08-27) — ✅ shipped

**Asked:** CalcSheet page number rendering wrong (stray "PAGE 03" line under
the table), "To," + customer name on one bold line, all table text vertically
centered in its cell.

**Shipped (`EstimatePage.jsx`):**
- CalcSheet: the floating `PAGE nn` div removed; the number now sits in the
  first cell of the Final Basic Amount teal band (priced) or of the Total Qty
  & Amount row (non-priced), matching the item sheets.
- `To, {name}` is one non-wrapping `est-to-name` line (bold, 15px).
- `.est-hdr td`, `.est-grid th/td`, `.est-tc td`: `vertical-align: top → middle`.

## CR-058 — Estimate footer: certification-logo row (2026-08-27) — ✅ shipped

**Asked:** replace the estimate print footer with the four supplied
certification logos, one centered row, no MSUN logo in the footer (header
only), D&B dropped.

**Shipped**
- `EstimateTerms.jsx` `FootBand` — the single baked-strip `<img>`
  (`MSUN-Footer_Certificates.png`) replaced by a `div.est-foot-band` with four
  `<img>`s from `frontend/public/`: `IAF - LOGO.jpeg`, `IAS - LOGO.jpeg`,
  `IBR APPROVED - LOGO.jpeg`, `ISO - 9002-2015 - LOGO.png`. Each keeps the
  pagination `onLoad` re-measure; a logo that fails to load drops out alone.
- `EstimatePage.jsx` `.est-foot-band` CSS — flex row, centered, `gap: 6mm`,
  imgs capped at 13.6mm (started at the CR-055 16mm budget; reduced 15% after
  the row broke pagination in a real print).
- `IAF - LOGO.jpeg` had the transparency checkerboard baked in — whitened
  (light unsaturated pixels → white) via a one-off Pillow pass.

**Not done:** D&B logo (dropped per user); deploy — held back because the
tree carries the CR-057 demo WO revert and pending estimate edits.

## CR-057 — Demo revert: old WO details screen (2026-08-27) — ✅ shipped

**Asked:** "we want to demo older screen for now" — bring back the Work Order
details page as it was before the CR-049 redesign.

**Shipped:** `frontend/src/pages/WorkOrderPage.jsx` and
`frontend/src/components/MaterialsGrid.jsx` restored from `b9a1248` (the commit
before the redesign): Details · Items · Approvals · History tabs, confirm-bar
materials grid. The CR-049 redesign + CR-051 movement ledger stay committed at
`5d9eb68` — bring them back after the demo with
`git checkout 5d9eb68 -- frontend/src/pages/WorkOrderPage.jsx frontend/src/components/MaterialsGrid.jsx`.
The CR-051 backend enrichment in `txn.js` (txn lines carry name/sku/uom) is
kept — the old page ignores the extra fields.

**Caveat:** the old page assumes the fixed two-level approval flow; the backend
has been dynamic since CR-042 (L2 optional). Fine for a demo, don't ship long.

## CR-052 — Estimate footer image + tables stretch to footer (2026-08-26) — ✅ shipped

**Asked:** use the new `frontend/public/MSUN-Footer_Certificates.png` as the
estimate's printed footer, and stretch every sheet's table down to it (no blank
gap above the footer).

**Shipped**
- [EstimateTerms.jsx](frontend/src/pages/EstimateTerms.jsx) — `FootBand` `src`
  swapped from the never-added `iso-certs.png` to
  `MSUN-Footer_Certificates.png`; the onError render-nothing fallback stays.
- [EstimatePage.jsx](frontend/src/pages/EstimatePage.jsx) — stretch-to-footer:
  `.est-grow { flex: 1 }` on each sheet's main table plus an `est-fill` filler
  row (`height: 100%`, side borders only) that absorbs the leftover page
  height, so real rows keep natural height and only the vertical column rules
  run through the empty space.
  - Item pages: filler tbody between the last item and the `data-totals` band —
    PAGE total sits at the page bottom, just above the footer (user's pick).
  - CalcSheet: filler row before "Total Qty & Amount" — grand-total rows at the
    bottom.
  - TermsSheet: terms table grows; bank table + footer pushed to the bottom.
- Pagination untouched: the budget already subtracts `.est-foot-band`
  offsetHeight and remeasures on image load (CR-050), and the filler rows carry
  no `data-item` so the measure pass ignores them.

**Fixed (same-day follow-up)** — the first cut's filler row was broken: a
flex-stretched multi-row table distributes extra height across *all* rows
(percentage row heights can't resolve against a flex-stretched table), so the
teal PAGE band ballooned on continuation pages and the CalcSheet came out
wrong. Reworked + two more asks from the same review:
- Stretch now lives in `FillTable` (EstimateTerms.jsx) — a dedicated
  single-row table with `flex: 1` between the main table and a separate totals
  table; its one row deterministically takes all the extra height. All three
  tables are `table-layout: fixed` sharing a `Cols` colgroup so the vertical
  rules align. Applied on item pages, CalcSheet, and TermsSheet; `data-totals`
  moved to the totals table so the pagination budget still measures it.
- Header band contents enlarged (no dead space): logo max-height 96→150px,
  address block 13px.
- Revision Date / Revision No moved from the easy-to-miss centered row into
  the toolbar next to the Version select (still screen-only, localStorage
  per quote).

**Not done (and why)**
- Nothing skipped; `.est-foot-band { margin-top: auto }` kept as the safety net
  when the image fails to load.

## CR-051 — WO Activity tab: in/out movement ledger (2026-08-26) — ✅ shipped

**Asked:** the Activity tab's history should look like the job-work in/out
ledger screenshot the user shared — each material movement as a card with a
direction icon, document number, step/route chip, item lines with quantities
and the date, instead of the flat one-line timeline from CR-049.

**Shipped**
- [txn.js](functions/skuapi/workorder/txn.js) — `listTxns` joins the WO's
  `WorkOrderLine` rows once and enriches every txn line with
  `name`/`sku`/`uom` (`{rmItemId, qty}` → `{rmItemId, qty, name, sku, uom}`;
  items later removed from the BOM fall back to the id on the frontend). One
  extra query, no schema change.
- [WorkOrderPage.jsx](frontend/src/pages/WorkOrderPage.jsx) — `ActivityTab`
  rewritten as the ledger: movements render as `TxnCard`s — circular ↗/↙
  direction icon and 3px colored left edge (out = reserve/issue, blue; in =
  release/return, green), uppercase verb + mono txn number + warehouse-route
  chip (`Main → Reserve` etc., derived from type), Transfer Order line, item
  rows (name · sku, dotted leader, bold qty + uom), notes, date top-right;
  Draft/Cancelled cards render muted with a status chip. Audit-trail events
  stay in the same newest-first stream as slim dot rows between cards.

**Not done (and why)**
- "by user" line (in the reference screenshot) — `MaterialTxn.confirmedBy`
  stores a raw Catalyst userId, not a name; add when a userId → email map
  exists.
- Filter tabs above the list — WO histories are short; add if they grow to
  hundreds of txns.

## CR-050 — MSUN estimate template pass (2026-08-26) — ✅ shipped

**Asked (12-item MSUN list):** With Total as the default template; header logo
transparent/bigger/centered with the tagline removed and sales emails added;
"To" section filled from the Zoho CRM Account/Contact behind the quote
(address, phone/email, GSTIN, contact | mobile); Revision Date/No fields on
screen but never printed; discount removed from item pages (page totals only);
"With Print" page-total clubbing = the With Total CalcSheet showing one amount
per page instead of per item; MSUN header on every page; ISO certificate strip
at the page bottom; T&C editor with bold + text color.

**Shipped:**
- Default version `with-total` ([EstimatePage.jsx](frontend/src/pages/EstimatePage.jsx)).
- Header band: tagline deleted, logo `max-height` 64→96px and centered in a
  flex-fill cell, `E: sales@msunvalve.com · sales@marutivalves.com` added to
  the address block ([EstimateTerms.jsx](frontend/src/pages/EstimateTerms.jsx)).
  Band stays first-page-only (CR-041) — an all-pages variant shipped briefly
  and was reverted on user feedback the same day.
- `GET /api/crm/quote/:id` now embeds the raw Account/Contact records behind
  the quote's lookups as `_account`/`_contact` (`getAccount`/`getContact` in
  [crmApi.js](functions/skuapi/zoho/crmApi.js), `.catch(() => null)` in
  [routes/crm.js](functions/skuapi/routes/crm.js) so a broken lookup never
  kills the sheet). Scope `ZohoCRM.modules.READ` already covers both — no
  re-auth. [estimateParser.js](frontend/src/pages/estimateParser.js) maps
  billing address / phone / email / GSTIN / contact mobile into `header.to`
  (GSTIN + account-email field names are best-guess, flagged `ponytail:` —
  correct in that one block after inspecting a real `_account`).
- Revision Date (native date input) + Revision No per quote, `est-noprint`,
  persisted at `localStorage["estimateRev:<quoteId>"]`.
- Item pages: TOTAL-A and DISC rows deleted; the PAGE band shows the **gross**
  page amount. Discount/net appear only on the CalcSheet, whose amount column
  is now one rowSpan cell per page (items still listed separately).
- ISO strip: `FootBand` pinned to each sheet's bottom via `margin-top: auto`,
  drop-in `frontend/public/iso-certs.png` (absent file → renders nothing);
  measure pass subtracts its height and re-measures once per loaded image.
- T&C editing: `contentEditable` saves innerHTML (rendered via
  `dangerouslySetInnerHTML`), edit bar gained Bold + 4 color swatches
  (`document.execCommand`; swatches over a native color input because the
  picker steals the selection). `TERMS_VERSION` bumped for a one-time reset.
  Self-XSS only — terms never leave the browser's localStorage.

**Checks:** `estimateParser.test.js` grew a `_account`/`_contact` → `to` case
(+ fallback asserts); parser & terms self-checks pass; frontend builds.

**Not done (and why):**
- Header/ISO images — user hasn't shared them yet; drop-in files
  (`msun_Invoicelogo_FINAL_LOGO.Png` overwrite, `iso-certs.png`) need no code.
- CRM GSTIN/email field names unverified — one mapping block to correct.
- Revision fields server-side — localStorage per user decision.

---

## CR-049 — WO details page redesign (Claude Design mockup) (2026-08-26) — ✅ shipped

**Asked:** redesign the Work Order details page taking the design pattern from
the claude.ai/design prototype (`Work Orders & Purchase Requests.dc.html`)
while keeping the app's current theme. User chose the full restructure
(mockup tab layout + instant per-row actions) over a visual-only restyle.

**Shipped**
- [MaterialsGrid.jsx](frontend/src/components/MaterialsGrid.jsx) — rewritten
  as the mockup's Materials view: KPI band (Required / Reserved / Issued /
  Short-to-buy, per selected FG) with an overall coverage gradient bar; amber
  shortage banner ("N items short — request purchase") and blue procurement
  banner (`procStatus` prop) replacing the toolbar warning buttons; filter
  chips All / Short / To reserve / Covered; instant per-line actions —
  `Reserve {reservable}` / `Issue {reserved}` / `Release` (dereserve) /
  `Return` (inline row with qty, Issue → Main only — the backend's fixed
  return route) — each a single-line confirmed `POST /txn`; "Reserve
  everything available" posts one txn for every reservable line in view.
  Removed: action-mode segmented toolbar, per-row qty + MAX inputs, checkbox
  bulk-fill, pinned confirm bar, optional-column picker (`COLS`/localStorage),
  per-line CoverageBar. `Empty`/`Banner` exports unchanged (8 importers).
- [WorkOrderPage.jsx](frontend/src/pages/WorkOrderPage.jsx) — header goes
  mockup-style: 20px title + status/proc chips, subtitle `SO · customer ·
  project · date · Rev`, muted finished-goods line, all actions on one row
  (Edit · Approve · ⋯ · ✕). Tabs `Details/Items/Approvals/History` →
  `Materials/Items/Activity`. Approvals tab removed: approve/reject stay in
  the header, the invoice gate shows as a warn banner under the header
  (`/invoice-gate` fetched page-level). Activity = single newest-first
  timeline merging material movements (`wo.transactions`) and the audit trail
  (`/history`), replacing the two-table History tab.
- [woCommon.jsx](frontend/src/components/woCommon.jsx) — `PROC_LABEL`
  exported (procurement banner text).

**Not done (and why)**
- Return-to-Reserve-warehouse select (in the mockup) — the backend's return
  route is fixed Issue → Main (`routeFor` in txn.js); not worth a route param
  until someone asks.
- Partial reserve/issue quantities — instant buttons act on the line's full
  cap; partial amounts survive only on Return. Add per-line qty inputs back if
  partial moves turn out to matter.
- Per-level approval cards (L1/L2 approver, email, timestamp) — approval
  events still appear in Activity; the header button covers the action.

## CR-048 — By-item grid: WO/Status/PO columns, ordered lines stay visible (2026-08-25) — ✅ shipped

**Asked:** (1) the By-item grid should show Item, Work Order, Qty, Status and
PO Number (if raised); (2) keep the cross-WO consolidation (one row per item,
total qty for raising); (3) make the duplicate-PO story visible — a buyer could
not tell whether a PO was already raised because raised lines simply vanished
from the shortfall.

**Why lines vanished (by design, but invisibly):** the shortfall math already
nets out on-order qty and draft-PR coverage, so nothing can be ordered twice —
but the row disappearing looks identical to the need disappearing.

**Shipped**
- [purchase.js](functions/skuapi/workorder/purchase.js) — `shortfallByItem`
  takes a second `orderedLines` param; ordered/requested lines join the same
  per-item buckets with `status` + `poNumber` on every breakdown entry
  (`Pending` for shortfall lines). `totalQty` stays pending-only; ordered qty
  accumulates in `orderedQty`; fully-ordered items survive with `totalQty: 0`.
  Selftest asserts added.
- [workorder.js](functions/skuapi/routes/workorder.js) — the
  `shortfall-by-item` route also fetches PR lines on a PO for open WOs
  (`zohoPoId` set, not cancelled) and maps them plus the existing draft lines to
  ordered entries: per-line status `Requested` / `PORaised` /
  `PartiallyReceived` / `Fulfilled` (from `receivedQty` vs `purchaseQty`),
  `poNumber` = Books PO number (PR number for draft lines). Draft coverage
  math untouched.
- [WorkOrderPurchasePage.jsx](frontend/src/pages/WorkOrderPurchasePage.jsx) —
  six columns (checkbox / Item / Work order / Order qty / Status / PO number).
  Group row: expander in the WO column, qty input only when something is
  pending, "N pending · M on PO" summary, distinct PO numbers. Expanded
  breakdown renders proper sub-rows aligned to the columns with a `ProcChip`
  per line. Only pending lines are selectable/sent to raise; select-all skips
  fully-ordered items.

**Not done (and why)**
- No flat/grouped toggle — the expanded sub-rows *are* the flat per-WO view.
- No transactional idempotency on raise (two concurrent raises of the same
  item could still double-order); the coverage read stays non-transactional —
  revisit only if it ever happens in practice.

## CR-047 — Purchase Requests grid fix + button on the action tab line (2026-08-25) — ✅ shipped

**Reported:** (1) a raised purchase request never appears in the Purchase page's
Requests view; (2) the "Request purchase" button and short-item warning should
sit on the Reserve / De-reserve / Issue / Return tab line, not in a separate
bar; (3) the "Raise request for…" WO dropdown should go — requests belong in
the usual grid with proper status.

**Root cause (verified live against the Catalyst datastore):** consolidated PRs
raised from the By-item view store `workOrderId: ""`. `listAllPRs` fed every
distinct `workOrderId` into `WorkOrder ROWID IN (...)`, and `inList`
([store.js](functions/skuapi/workorder/store.js)) guarded empty *arrays* but not
empty *strings* — `ROWID IN ('')` makes ZCQL reject the whole query ("Invalid
input value for BIGINT column 'ROWID'"), the endpoint 500s, and the frontend's
silent `.catch(() => setPrs([]))` rendered "No purchase requests yet." Broken
since the first consolidated PR (2026-08-13). The same pattern in `listAllPOs`
broke the Orders grid's PR/WO stamping.

**Shipped**
- [store.js](functions/skuapi/workorder/store.js) — `inList` drops `""`/null
  values (one guard fixes `listAllPRs`, `listAllPOs`, and every future caller);
  selftest asserts added.
- [WorkOrderPurchasePage.jsx](frontend/src/pages/WorkOrderPurchasePage.jsx) —
  "Raise request for…" dropdown removed (per-WO drill-in stays via clicking a
  Requests row; By-item "Raise PO" remains the raise path); `loadPrs`/`loadPos`
  now toast on failure instead of silently showing an empty grid.
- [MaterialsGrid.jsx](frontend/src/components/MaterialsGrid.jsx) — amber
  shortage bar deleted; the action tab line now shows an amber
  "⚠ N short · M units missing" pill (click = Short filter) and the
  "Request purchase" button when there is a shortfall.

**Not done (and why)**
- No new per-WO raise entry point to replace the dropdown — the By-item
  consolidated flow (CR-023) is the primary path; add a per-WO shortcut only if
  buyers ask for it.

## CR-046 — SO picker filter_by casing fix (2026-08-25) — ✅ shipped

**Reported:** raising a Work Order against a Confirmed sales order failed with
*"Zoho books API error: Invalid value passed for filter_by (code 2)"*; the New
Work Order SO picker showed nothing.

**Root causes (two, stacked):**
1. `routes/workorder.js` `GET /sales-orders` passed status `"confirmed"`, which
   `booksApi.js` `listSalesOrders` sent as `filter_by=Status.confirmed` — Zoho
   rejects the lowercase value with code 2, and the capitalized
   `Status.Confirmed` clears the error but matches **zero rows**. Zoho's
   salesorders `filter_by` cannot express "confirmed".
2. The client-side guard `creatableSalesOrders` matched
   `status === "confirmed"`, but Books' API **never returns that string** —
   verified against the MSUN org: a UI-"Confirmed" SO comes back as
   `status: "open"` / `order_status: "open"` (header status can drift to
   invoiced / partially_invoiced / overdue while `order_status` stays "open";
   drafts are `order_status` "draft" / "pending_approval"). So even with the
   filter_by gone, the guard emptied the picker.

**Shipped:** dropped the server-side `filter_by` from `listSalesOrders` (and
its unused `status` param); `creatableSalesOrders` now treats an SO as
confirmed when `order_status === "open"` (or a literal `status: "confirmed"`
for editions that report it), and the route passes `order_status` through.
Self-check updated with the real MSUN status shapes. `reserve.js` passed no
status and is unaffected.

**Not done:** the "Purchase Request → By item shows nothing" report needed no
code change — it aggregates the shortfall of *open* work orders, and with the
picker broken no WO could be raised for the SO (once a WO exists, any
still-unordered shortfall appears there; a fully covered item correctly drops
off).

## CR-045 — PO GST: inter- vs intra-state tax by vendor state (2026-08-25) — ✅ shipped

**Reported:** pushing a PO to vendor "3D TECHNOLOGIES" failed with *"IGST cannot
be applied as this is an intrastate transaction (code 3032)."*

**Root cause:** CR-044 set every PO line's tax to the org's 18% GST, and
`getGstTaxId` preferred a single GST-named tax — which resolves to **IGST**
("IGST" matches `/gst/`). IGST is only valid inter-state; for a same-state
(intrastate) vendor Books requires the **CGST+SGST group** and rejects IGST
(3032).

**Shipped (`zoho/booksApi.js`):**
- `pickGstTax(taxes, interState)` — pure selector: inter-state → single IGST;
  intra-state → the CGST+SGST `tax_group` (fallbacks keep a tax on the line so
  110802 can't come back). Self-checked (`node …/booksApi.js --selftest`).
- `getGstTaxId(catalyst, pct, { interState })` uses it; cache key now includes
  direction. Item-create default keeps its previous single-GST behavior
  (`interState: true`) — Books auto-bifurcates an item's *default* tax by place
  of supply, so items are unaffected.
- `getOrgGstStateCode` / `getContactGstStateCode` — GST state code = first two
  digits of the GSTIN (org vs vendor).
- `createPurchaseOrder` computes `interState = orgState && vendorState &&
  orgState !== vendorState` and picks the matching tax. Unknown GSTIN on either
  side → intra (the common local-vendor case, and the reported failure).

**Not done (and why):** no separate inter/intra handling for sales-side
transactions (invoices/SOs) — the app only *creates* POs in Books; sales docs
are raised in Books directly, where its own place-of-supply logic applies. GSTIN
prefix is the state signal; a registered vendor without a GSTIN on file defaults
to intra.

---

## CR-044 — Books 110802: line-level GST tax on items & POs (2026-08-25) — ✅ shipped

**Reported (A.G. Belting):** pushing to Books failed with *"Specify either a Tax
or Tax Exemption or Reverse Charge" (code 110802)* even though a tax was selected.

**Root cause:** in the India GST edition every transaction *line* must carry its
own tax; the header tax dropdown does not back-fill lines. Items were created
`is_taxable: true` but with no default tax, and `createPurchaseOrder` sent lines
with no `tax_id` — so Books rejected the PO.

**Shipped:**
- `getGstTaxId(catalyst, pct)` resolves the org's GST tax id by percentage (memoized
  per org); returns null on non-GST orgs so `tax_id` is simply omitted there.
- `createItem` sets a default `tax_id` (GST 18%) → new items carry a line tax.
- `createPurchaseOrder` puts `tax_id` on every line.
- `poPutBody` echoes each fetched line's `tax_id` so a PO edit (PUT replaces lines
  wholesale) doesn't clear the tax and re-trigger 110802.

**Not done:** existing Books items created before this need a one-time tax backfill
to fix the Books UI path; HSN-driven per-item rates (everything defaults to 18%).

## CR-043 — Estimate offer number = CRM Quote No (2026-08-25) — ✅ shipped

**Asked (MSUN):** the number shown on the estimate should be the Quote No from
the Quotes module.

**Shipped:**
- `estimateParser.js` `buildEstimate`: `offerNo` is now
  `quote.Quote_No || quote.Quote_Number`. MSUN's real quote number lives in a
  **custom** field `Quote_No` (e.g. `MSUN-Q-0021`), not the standard
  `Quote_Number` (which was blank), so binding only to the standard field showed
  nothing / the Subject. `getQuote` fetches the full record so the custom field
  is already present. Removed the `|| quote.Subject || quote.id` fallback that
  made a blank-numbered quote print its free-text Subject ("test Quotation
  print").
- `crmApi.js` `QUOTE_LIST_FIELDS` + `EstimatePage.jsx` deal-quote picker: add
  `Quote_No` (before `Quote_Number`) so the picker's quote-number line matches.

**Not done (and why):** kept the label "Our Offer No" (company terminology on the
Techno Commercial Proposal); only the value binding changed.

---

## CR-042 — Transfer Order fixes, SO-picker gating, dynamic approval, instant stock sync (2026-08-25) — ✅ shipped

**Asked (MSUN):** (1) Transfer Orders fail on serial-tracked items (code 2205) —
if a batch/serial isn't supplied, pick from the first available; (2) TOs fail
with "mandatory Transfer Order Number" (code 6) — only supply one when Zoho isn't
auto-numbering, else a friendly error; (3) the WO-creation list should show only
**Confirmed** SOs and hide SOs that already have a WO; (4) two-level approval flips
to Approved after the first sign-off — it should be Pending for the 2nd level, and
the 2nd level should be required only when a 2nd approver is configured; (5) allow
an instant stock sync so a Zoho inventory adjustment / opening stock reflects at once.

**Shipped:**
- **Serial/batch on TOs** — `zoho/inventoryApi.js`: `pickSerialsBatches` (pure) reads
  the item's in-stock serials/batches at the source warehouse and attaches the first
  N (N = qty) to each transfer line — serials as `serial_numbers`, batch-tracked as
  FIFO-allocated `batches[]`. Untracked items are unaffected. If a tracked item has
  no numbers in stock, a plain "receive stock before moving it" error replaces the
  raw code 2205. Self-checked.
- **TO number fallback (code 6)** — `createTransferOrder` retries once with
  `transfer_order_number` (the MaterialTxn number, via `numberHint` from `confirmTxn`)
  only when Zoho rejects with code 6; auto-numbering orgs never see a number.
  `txn.js` `friendlyTransferError` rewords raw Zoho failures for the UI.
- **SO picker** — `routes/workorder.js` `GET /sales-orders` now requests
  `filter_by=Status.Confirmed`, keeps a `status === 'confirmed'` guard, and drops any
  SO already linked to a WorkOrder (`creatableSalesOrders`, self-checked).
- **Dynamic approval** — 2nd level required only when `approverL2Email` is set. After
  L1 with an L2 pending, the WO sits at the new **PendingApproval** status; it becomes
  Approved once every required level signs off (`requiredLevelsMet`, self-checked). The
  manual status dropdown can no longer skip approvals (`FLOW.Draft` drops `Approved`).
  Invoice gate and the WO page reflect the configured levels.
- **Instant stock sync** — `reconcileOrg(catalyst, orgId, { full })` sweeps the whole
  catalog (stock only) so an adjustment/opening on any item lands; exposed via
  `POST /api/wo/refresh?full=1` and a "Sync all" button on the materials grid. New
  `POST /api/wo/items/:itemId/sync-stock` (`syncItem`) for a single item.

**Not done (and why):** the exact Zoho serial/batch response shape is read defensively
and must be confirmed against the live org on first push (flagged `ponytail:`). No
in-app inventory-adjustment writer — adjustments stay in Zoho, the app only pulls the
effect (user chose the instant-pull option). No per-grid-row sync button — the grid's
items are on open WOs and already covered by "Refresh stock"; "Sync all" covers the rest.

---

## CR-041 — Estimate header band on the first page only (2026-08-25) — ✅ shipped

**Asked (MSUN):** the logo/header that repeats on every printed estimate page
should appear on the first page only.

**Shipped:**
- `EstimatePage.jsx` CSS: one rule
  `.est-print-area .est-sheet:not(:first-child) .est-head-band { display: none; }`.
  Every sheet (item pages, CalcSheet, TermsSheet) is an `est-sheet` sibling
  under `.est-print-area`, so the whole company band (logo + tagline + address)
  is suppressed on all pages after the first, on both screen preview and print.
  `HeadBand` still renders in each sheet; only CSS hides it.

**Not done (and why):** pagination budget is still measured with the full header
band and applied to all of an estimate's pages, so continuation pages under-fill
by ~1 band height (minor bottom whitespace). Safe — never overflows. Left as a
`ponytail:` note; subtract the band height for non-first pages only if it's ever
a complaint.

---

## CR-040 — Estimate T&C A/B on all types + centered amounts (2026-08-25) — ✅ shipped

**Asked (MSUN):** the A. Delivery Of Goods and B. Duties & Taxes terms are
missing from the estimate — add them and arrange them properly; they apply to
**all** estimate types. Also center-align the amount columns.

**Shipped:**
- **Export gets Duties & Taxes** (`estimateTerms.js` `EXPORT_TERMS`): inserted
  `Duties & Taxes / As Per GST Rule @18% Extra.` as B (after Delivery Of Goods,
  before Incoterms). Domestic `DEFAULT_TERMS` already led with A + B; lettering
  is positional so no reordering was needed. All templates now read A = Delivery
  Of Goods, B = Duties & Taxes.
- **One-time cache reset** (`estimateTerms.js`): terms persist per-browser in
  localStorage, so a browser that once saved a term list never picked up the new
  A/B defaults. Added `TERMS_VERSION` + `ensureTermsVersion()` (called at the top
  of `loadTerms`) that clears the stored domestic/export lists once when the
  version changes, so every client re-seeds to current defaults on next load.
- **Amount columns centered** (`EstimatePage.jsx`): `.est-num` changed from
  `text-align: right` → `center`. One class covers every amount value — item
  rows (LIST PRICE / TOTAL AMOUNT), per-page totals (TOTAL-A / DISC / TOTAL),
  and the CalcSheet totals. Headers and totals labels left unchanged.

**Not done (and why):** field-level merge of stored terms — the version bump is
a full reset, so any custom per-browser term edits are discarded. Acceptable for
shared org defaults; revisit only if per-browser customization becomes a real
use case.

---

## CR-039 — Estimate print versions made functional (2026-08-22) — ✅ shipped

**Asked (MSUN):** rename the estimate "Version" pick list and give each option
real behavior: Standard (was General) = current grouping, no totals page;
With Total = current template + totals page; Export = T&C changes to follow;
All Item - Trading = no grouping, every CRM line its own row.

**Shipped:**
- **Pick list renamed** (`EstimatePage.jsx` `TEMPLATE_VERSIONS`): Standard /
  With Total / Export / All Item - Trading; default `standard`.
- **Totals page gated:** the CALCULATION FOR OFFER sheet (`CalcSheet`) renders
  only on With Total; all other versions end with the last item page.
- **Trading = no grouping:** `buildEstimate(quote, { merge })` — with
  `merge: false` the one-CRM-line-per-size collapse is skipped so same-name
  lines each print as their own row. `EstimatePage` now keeps the raw quote
  payloads and re-derives estimates via `useMemo` on version change.
- Parser test: `merge: false` yields one item per line with identical totals.

**Not done:** Export-specific T&C — the changed terms are pending from MSUN;
Export currently prints the same as Standard.

## CR-038 — Improvement pass, phase 4: UX & consistency (2026-08-22) — ✅ shipped

**Asked:** phase 4 (final) of the review-findings plan — ease-of-use and
consistency items.

**Shipped:**
- **SKU grid follows the house pattern (CR-005b):** no row-click edit; hover
  pencil (`RowEditButton`) opens the detail, trash confirms via Modal.
- **Bulk push:** "Push all unsynced" loops SKUs without a `zohoItemId` through
  the existing push endpoint with a progress toast + failure summary.
- **Stale-sync badge:** new `SKUItem.lastPushedAt` (stamped in `pushToZoho`,
  all push paths) + `out()` now exposes `MODIFIEDTIME` as `updatedAt`; a row
  edited after its last push shows amber "Edited · Re-push" instead of a false
  "✓ Synced".
- **URL state:** `?item=` (SKU detail), `?composite=` (BOM drill-in), `?view=`
  (reports tab), and WO-list filters (`status/customer/proc/q`) + SKU search
  `?q=` mirror into the query string — refresh, back and share keep the place.
- **Deletes:** shared `ConfirmModal` (Modal.jsx) replaces `window.confirm` in
  SKUItems / Industries / Properties / PropertyManager; Esc or close = keep.
- **Enter-to-submit:** `Modal` accepts `onSubmit` (children render in a form,
  `ModalBtn` is `type="button"`); wired on Industry add/edit, Property/Value
  add/edit and WO edit. OpModal left click-only — its typeahead owns Enter.
- **Input guards:** PR-line qty is a controlled `QtyInput` (commits on
  blur/Enter, amber border while uncommitted); MaterialsGrid confirms before
  an action/FG switch clears typed quantities.
- **Shared formatters:** `frontend/src/format.js` (`fmtMoney`/`fmtNum`/
  `fmtDate`, en-IN) replaces the four ad-hoc styles (raw WO costs, hardcoded
  ₹, browser-locale `toLocaleString`, `slice(0,10)` dates).
- **A11y:** filter-chip remove is a real `<button aria-label>`; sortable
  headers are keyboard-reachable (`role`, `tabIndex`, Enter/Space); search
  inputs have `aria-label`s; required-field asterisks in OpModal.
- "Import from Zoho" button is always enabled — clicking without an industry
  explains itself instead of a dead greyed button.
- Estimate toolbar/editor chrome uses the app's CSS variables (print sheet
  keeps its own brand styling).

**Not done (deliberate):** no undo-after-delete (toast-with-undo needs a
soft-delete window server-side); MaterialsGrid's qty-clear guard uses a plain
confirm — it protects typed input, Esc = stay, so a Modal adds nothing.

## CR-037 — Improvement pass, phase 3: frontend performance (2026-08-21) — ✅ shipped

**Asked:** phase 3 of the review-findings plan — frontend fetch and render costs.

**Shipped:**
- `WorkOrderPage`: the left rail's `/api/wo` list loads once on mount; after a
  mutation only the single WO is re-fetched and its status patched into the
  rail (each list fetch used to re-trigger the org-wide proc-status scan).
  Rail/detail id comparisons now `String()`-coerced.
- `WorkOrderPurchasePage`: the three lists load lazily — work orders on mount
  (the raise-for dropdown needs them), requests/orders when their tab or the
  PO split first opens. `onChanged` refreshes only lists already loaded, so a
  purchase action no longer re-crawls every Books PO from the By-item tab.
- `MaterialsGrid`: rows extracted into a memoized `GridRow` (+ `useCallback`
  handlers) — typing a quantity re-renders one row, not the whole BOM.
- `App.jsx`: all shell pages are `React.lazy` route chunks behind one
  `<Suspense>` (auth-flow pages stay eager). Main bundle 546 kB → 325 kB
  (gzip 151 → 104) plus on-demand per-page chunks.

**Not done (deliberate):** no data-fetching library (SWR/React Query) — the
axios + targeted-refetch pattern covers current needs.

## CR-036 — Improvement pass, phase 2: backend performance (2026-08-21) — ✅ shipped

**Asked:** phase 2 of the review-findings plan — the backend query hot spots.

**Shipped:**
- `workorder/grid.js` — `buildGridsBulk(catalyst, orgId, pairs)`: loads
  WorkOrderLine / ReservationLine / PurchaseRequest / PurchaseRequestLine /
  ItemStockSnapshot for **all** (WO, FG) pairs with `IN (...)` queries and
  assembles every grid in memory — **~6 queries total** instead of ~6 per pair.
  `buildGrid` unchanged for single-grid callers (txn validation, `/:id/grid`);
  the pure tail is now `assemble()`, the self-heal is `healStock()` and pulls
  missing items in parallel. Selftest asserts bulk output deep-equals per-pair
  `buildGrid` output. Consumers swapped: `reports.js` soBom + shortfall,
  `/purchase/shortfall-by-item`, `/:id/shortfall`.
- `zoho/auth.js` — `loadToken` memoizes the token-row *promise* per userId on
  the catalyst instance (`catalyst.__zohoToken`), so a request's many Books
  calls share one ZohoToken SELECT. Refresh mutates the memoized row in place;
  `saveToken`/`saveOrg` invalidate via `forgetToken` (OAuth callback does
  save → API call → save in one request). Selftest covers all three paths.
- `workorder/purchase.js` — `procStatusByWo` takes an optional `workOrderId`:
  `GET /wo/:id` now scans only that WO's PR lines instead of the whole org's
  purchase history (the org-wide scan remains for the list). The Approval query
  and proc-status moved into the route's existing `Promise.all`.
- `workorder/sync.js` — the nightly/manual stock reconcile uses the bulk
  `listItemsWithStock` (200 items/call) and only falls back to the per-item
  detail (+150 ms sleep) where the bulk payload is ambiguous
  (Locations-enabled zero-stock rows).
- `workorder/purchase.js` — `refreshPurchaseOrders` fetches PO details 5 at a
  time instead of strictly sequentially.
- `workorder/txn.js` — `listTxns` (History tab) and `recompute` load all
  MaterialTxnLine rows in one `txnId IN (...)` query via new `txnLines()`.

**Not done (deliberate):** `listAllPOs` still crawls all Books POs — the
frontend stops re-fetching it on every action in phase 3; server-side
filtering only if that is still slow. `alerts.js` cron could adopt
`buildGridsBulk` later — out of scope here.

## CR-035 — App-wide improvement pass, phase 1: quick wins (2026-08-21) — ✅ shipped

**Asked:** a three-axis review (performance / UI / ease of use) surfaced ~25
findings; fix everything in phases. Phase 1 = the small-diff, high-impact items.

**Shipped:**
- `--bg-page: #f8fafc` added to `:root` (`index.css`) — the variable was used in
  ~10 places (woCommon, MaterialsGrid, BomTab, PurchaseTab, CompositeBomPage…)
  but never defined, so WO-module table headers rendered transparent.
- QC gate (`WorkOrderPage`): `window.confirm` (where Esc/Cancel silently meant
  **Rejected**) replaced with a Modal with explicit Passed / Rejected / Cancel
  buttons; closing the dialog does nothing.
- SKU generator: the advertised ⌘↵/Ctrl+Enter shortcut now actually fires
  Create; the live preview POST is debounced 250 ms; the industries fetch is
  guarded with a toast on failure and shows "Loading…" instead of the
  "No industries" empty state while in flight.
- SKU items grid: first load shows "Loading…" instead of "No SKU items yet".
- Reports CSV export: human column labels (via a key→label map) instead of raw
  object keys like `rmItemId` / `noPo`.
- "Submit to helpdesk" no longer fakes a success toast; it opens a `mailto:`.
- PR-line vendor/qty edits confirm with a success toast like the rest of the app.

**Not done (deliberate):** phases 2–4 of the same review — backend N+1 batching
+ token memo, frontend refetch/code-splitting, UX & consistency (bulk push,
stale-sync badge, URL state, shared formatters, a11y) — tracked in TASKS.md.

## CR-034 — WO status auto-advances on material movement (2026-08-21) — ✅ shipped

**Asked:** the work order stays in Draft even after items are reserved or
issued; the status should change as material moves.

**Shipped:**
- `advanceWoStatus` in `workorder/txn.js`, called from `confirmTxn` (the one
  path every confirm goes through — txn route, grid confirm flag, auto-return):
  first confirmed **reserve** moves Draft/Approved → `MaterialAllocationPending`;
  first confirmed **issue** moves anything up to ReadyForProduction →
  `InProgress`. Each bump is logged as a `wo.status` activity with the txn
  number that triggered it.
- Forward-only: dereserve/return never touch the status, so the completion
  auto-return sweep (CR-031) can't demote a completing WO.
- No frontend change needed — the WO page already refetches after each confirm.

**Not done (deliberate):**
- No auto-advance to ReadyForProduction on "everything reserved" — that needs a
  full-coverage check per FG; the manual status menu covers it. Add if asked.

## CR-033 — Books push tolerates missing custom fields per org (2026-08-21) — ✅ shipped

**Asked:** the SKU → Books push is going multi-client; another client's Books org
may not have our custom fields (the hardcoded `cf_item_type` /
`cf_item_criticality` / `cf_item_source` defaults, or a mapped property field),
and Books rejects the whole item over one unknown field. Ignore fields the org
doesn't have instead of failing; asked whether a per-client field-mapping DB is
needed.

**Shipped:**
- `normalizeCustomFields` (booksApi.js) now filters every outgoing custom field
  against the org's actual item fields (`/settings/fields?entity=item`, already
  fetched for dropdown normalization; cache extended to carry the api_name set).
  Unknown fields are dropped with a `console.warn`; one choke point covers all
  four payload paths (plain/composite × create/update).
- If the metadata fetch itself fails (e.g. missing scope), fields pass through
  unfiltered — the push degrades to prior behavior rather than failing on a
  metadata call.
- Test: `booksApi.test.js` (filtering + fetch-failure passthrough).

**Not done (deliberate):**
- No new mapping table — `Property.zohoCfApiName` is org-scoped and already is
  the per-client add-on-field → Books-field mapping, edited via the existing
  field-mapping screen.
- No per-org override of the default CF *values* (OrgSetting) until a client
  wants different values, not just absent fields.
- Skipped fields surface in logs only, not the UI.

## CR-032 — Print Estimate from CRM Quote (2026-08-21) — 🚧 in progress

**Asked:** print the estimate developed earlier (estimate-prototype) with items
coming from a CRM Quote on the originating Deal; two print options — the A–D
technical template and the A–F priced template.

**Decisions:**
- Entry from the CRM deal link only (same `?dealId=` flow as CR-024's CRM Info
  card); a "Print Estimate →" link on that card opens `/#/estimate?dealId=…`.
- Specs / design groups / size rows are **parsed from the quote line-item
  Description text**; the exact convention isn't pinned yet, so the parser is
  tolerant (`KEY:- VALUE` specs, `DESIGN:- X` group markers, `4" / 100MM QTY 4
  @ 10650` size rows) with a **flat-row fallback** (product name + raw
  description, CRM qty/list-price) when nothing parses.
- Discount % from the quote's `Discount` field; discount row omitted if absent.
- No new OAuth scope — `ZohoCRM.modules.READ` already covers Quotes; stale
  grants surface as the existing 409 → "Connect CRM" reauth flow.

**Shipped:**
- [crmApi.js](functions/skuapi/zoho/crmApi.js) — `getQuote` (full record incl.
  `Quoted_Items`) and `getDealQuotes` (related-records list with explicit
  `fields`), both over the existing `crmRequest`.
- [routes/crm.js](functions/skuapi/routes/crm.js) — `GET /api/crm/deal/:id/quotes`
  (200 + array, empty is valid) and `GET /api/crm/quote/:id` (404 on missing).
- [estimateParser.js](frontend/src/pages/estimateParser.js) — pure module:
  `parseLineDescription`, `buildEstimate` (quote → header + items),
  `computeTotals`; node-runnable self-check in
  [estimateParser.test.js](frontend/src/pages/estimateParser.test.js) asserting
  the prototype's known totals (13,12,800 / 3,93,840 / 9,18,960 / qty 25).
- [EstimatePage.jsx](frontend/src/pages/EstimatePage.jsx) — quote picker
  (auto-selects a lone quote), estimate sheet ported from
  [estimate-prototype/msun-estimate.html](estimate-prototype/msun-estimate.html)
  (rowspan description cell, DESIGN rows, en-IN money), template toggle +
  native `window.print()` (print CSS hides app chrome, A4 12mm).
- Route `/#/estimate` in [App.jsx](frontend/src/App.jsx); "Print Estimate →"
  link in [CrmInfoCard.jsx](frontend/src/components/CrmInfoCard.jsx).
- **Quote-record entry** — `/#/estimate?quoteId=<id>` renders that quote's sheet
  directly, no picker (`readParam` generalized from `readDealId`).
- **Checkbox multi-print** — the deal's quote list is a checkbox list; ticked
  quotes render **one sheet per quote** with a page break between (print CSS
  visibility trick moved to an `.est-print-area` wrapper; `:last-child` break
  reset avoids a trailing blank page). "← Quotes" returns to the list.
- **Seamless login** — a logged-out arrival on a CRM deep link (`dealId`/
  `quoteId` in the URL) skips the login page and bounces silently through Zoho
  OAuth (no password when already signed into Zoho); the deep link survives the
  roundtrip via a `sessionStorage` returnTo (the redirect URI is the SPA root,
  which loses the hash). Once-per-tab guard: a cancelled OAuth falls back to
  the login page instead of looping. Sessions last 30 days, so this only fires
  on first visit or expiry.
- **Sheet polish** — banner is the MSUN + Maruti logo (`frontend/public/msun-logo.png`,
  text-banner fallback until the file is dropped); A–F letter prefixes removed
  from the column headers (toolbar buttons renamed Priced / Technical); orange
  `DESIGN:-` sub-section rows unchanged.
- **Grid totals + page numbers** — totals moved from a separate table into the
  item grid itself (as in the original scan): TOTAL-A and DISC rows in the
  price columns, final row carrying PAGE nn + total qty + TOTAL (technical
  template: PAGE nn + TOTAL QTY row). Sheets number sequentially per print
  (PAGE 01, 02, …); the T&C page stays unnumbered like the original.
- **T&C last page** — the "General Terms & Conditions" page (terms A–N, bank &
  contact grid, logo + factory-address footer) prints as the final page after
  all quote sheets. "✎ Edit T&C" toolbar toggle makes the sheet itself editable
  **in place** (scrolls to it; contentEditable cells save on blur, ✕ / + Add /
  Reset controls appear on the sheet and are `est-noprint`-hidden in print) —
  replaced the original detached editor panel at the top of the page, which
  users didn't find. Edits are **per browser only** (localStorage, user
  decision — no OrgSetting write). Data + normalize/merge in
  [estimateTerms.js](frontend/src/pages/estimateTerms.js)
  (self-check [estimateTerms.test.js](frontend/src/pages/estimateTerms.test.js)),
  components in [EstimateTerms.jsx](frontend/src/pages/EstimateTerms.jsx).
- **Same-product line merge (one-CRM-line-per-size)** — a quote entered as one
  line per size (same product repeated, each line's Description carrying the
  full spec block incl. `Size: 1-1/4" | DN 32`) now prints as **one item**:
  description block once (first line's specs, `Size:` removed), one size/qty/
  rate row per CRM line, sub-sectioned by `Design`/`Design Type` when present
  (orange DESIGN row skipped when absent). Size splits on `|` into the stacked
  inch / DN cells. Lines without a `Size:` spec keep the flat fallback; sr
  numbers reassigned after merging. Parser-level
  ([estimateParser.js](frontend/src/pages/estimateParser.js)), so totals and
  both templates get it for free.
- **Real pagination with per-page totals** — CSS page-breaking couldn't keep an
  item and its totals together, and could never do per-page totals; the page
  now composes physical A4 pages itself
  ([EstimatePage.jsx](frontend/src/pages/EstimatePage.jsx)): a hidden measure
  pass renders each quote as one sheet, reads item-tbody heights, and greedily
  packs items into pages (A4 content height minus measured header/thead/totals,
  16px slack for screen-vs-print width drift). Each page prints as a **full
  sheet** — repeated logo/To/Offer header, its items whole, and TOTAL-A / DISC
  / PAGE-TOTAL rows computed from **that page's items only** (as in the
  original scans). Page numbers run continuously across all selected quotes;
  one re-measure after the logo image loads. Not done: intra-item pagination
  (an item taller than a page overflows). Every page (T&C included) carries
  the logo + factory-address footer bottom-pinned (sheet is a flex column at
  full A4 height; footer height joins the pagination budget); the address text
  is the T&C store's `footer` field, so a T&C edit updates all pages. Leftover
  page height stretches the **last item's last row** (no spacer row), so its
  columns run down to the totals with heading/design/totals heights untouched;
  item detail rows show vertical column lines only (horizontal lines kept on
  item boundaries, design bands, heading, totals); T&C rows accented per the
  reference PDF — delivery/transit red, payment/freight blue, validity
  enlarged — keyword-matched on the row label.
- **Filler space removed + footer collision fix + bigger fonts (2026-08-22)** —
  the measured filler that stretched the item columns down to the totals drew
  its vertical borders into the bottom-pinned footer strip on full pages; the
  filler tbody (and its `fill` math in the pagination pass) is gone, so the
  grid now ends right after the totals rows and the gap to the page-bottom
  footer is clean unbordered white, however many items a page holds. Sheet base
  font 11→12px, grid headers 10→11px (measure pass repacks pages
  automatically). ([EstimatePage.jsx](frontend/src/pages/EstimatePage.jsx))
- **"CALCULATION FOR OFFER" summary page (2026-08-22)** — the grand-total page
  from the reference PDF now prints after the item pages (before T&C): one row
  per item per printed page (PAG nn, description, total qty, total amount —
  PAG cell spans multi-item pages), then TOTAL QTY & AMOUNT (blue), DISCOUNT
  @pct (pct shown only when all selected quotes share one), FINAL BASIC AMOUNT
  (red), and the next sequential PAGE nn. Technical template gets the same
  page without amount columns. Header chrome extracted to a shared
  `SheetChrome` (title varies) so the calc page reuses the To/Offer header.
  ([EstimatePage.jsx](frontend/src/pages/EstimatePage.jsx))
- **Discount from CRM `Select_discount` + teal theme + template-version dropdown
  (2026-08-22)** — discount % now reads the quote's custom `Select_discount`
  field (tolerant of "25%"-style picklist strings), falling back to the
  standard `Discount` field; shows as DISC/DISCOUNT @pct on item pages and the
  calc page ([estimateParser.js](frontend/src/pages/estimateParser.js)). All
  printed pages (items, calc, T&C) restyled to the
  [Sales_Order_Template.html](estimate-prototype/Sales_Order_Template.html)
  theme: Inter, teal #0F7576 headers/bands, tints #EAF2F1/#EFF5F4, #D8E5E4
  gridlines, teal grand-total band rows, teal-ruled footer strip; T&C keyword
  accents recolored teal. Toolbar gains a **Version** dropdown (General ·
  Item Grouped · Export · Trading) threaded as a `version` prop through
  EstimatePages → EstimateSheet/CalcSheet — all four render the same layout
  today; per-version layouts branch there when defined.
- **Company band on top, footer gone, DESIGN rows dropped (2026-08-22)** — the
  orange DESIGN:- group-header rows no longer print (size rows only; parser
  still groups, render skips). The bottom logo/address footer strip is removed
  from every page; instead each page (items, calc, T&C) opens with a
  Sales-Order-style header band — new logo
  `frontend/public/msun_Invoicelogo_FINAL_LOGO.Png` + tagline left, full
  right-aligned address block (company, plot address, M/E line, GSTIN, PAN,
  hardcoded in the shared `HeadBand`, exported from
  [EstimateTerms.jsx](frontend/src/pages/EstimateTerms.jsx) to avoid a
  circular import). Pagination budget no longer reserves footer height; the
  T&C store's `footer` text stays saved but is no longer rendered or editable.
- **CRM setup (console, not code):** Deal custom link button →
  `/app/#/estimate?dealId=${Deal.Id}`; Quote custom link button →
  `/app/#/estimate?quoteId=${Quotes.Quote Id}`. The pre-hash form
  (`/app/?quoteId=…#/estimate`) also works.

**Not done (and why):** description convention pinning (parser tightens once the
CRM format is fixed); Estimates 2–4 layouts, cost sheet, USD export,
Zoho Books estimate push (all deferred from the prototype README); no DB tables
(frontend owns the shape, routes are thin passthroughs); T&C edits are not
shared org-wide (OrgSetting + `PUT /settings` exists if that's wanted later).

---

## CR-031 — WO item editability + completion auto-return + reconciliation report (2026-08-21) — 🚧 in progress

**Asked:** during production items change (missing, misfit, brand issue) — the
user must be able to replace/edit the work order's items until progress is
complete; the picker must only offer items that exist in Zoho Books; once
complete, missing/extra material goes back to warehouse inventory; a per-WO and
an overall report for inventory comparison.

**Decisions:**
- **Internal only.** Edits touch the WO's frozen lines (`WorkOrderLine`) and
  nothing else — the Zoho composite item is never updated (avoids composite
  sprawl) and the Sales Order is never touched. The substitution is instead
  recorded as a note on the WO ("X added — not part of the composite item").
- **Committed lines are kept at qty 0, not deleted.** Removing/replacing a line
  whose material is already reserved/issued flips its `requiredQty` to 0; the
  row survives so the grid still shows it and completion knows to return the
  stock. `guardAgainstCommitted` stays untouched for the import path.
- **Return at completion, not at edit time.** An edit never posts a Transfer
  Order (the stock hasn't physically moved). On the transition to `Completed`,
  everything still in the Reserve warehouse is dereserved (Reserve→Main) and
  any over-issue vs the final requirement is returned (Issue→Main),
  automatically, before the status is written — a Zoho failure aborts the
  transition and a retry sweeps only the remainder. Issued stock *within* the
  requirement is assumed consumed by assembly; unconsumed material is returned
  manually via the grid before completing.
- Editing locks at `Completed`/`Closed`/`Cancelled` (`assertEditable`, 409).

**Shipped:**
- [booksApi.js](functions/skuapi/zoho/booksApi.js) — `searchItems` (one-page
  `search_text` typeahead).
- [routes/workorder.js](functions/skuapi/routes/workorder.js) —
  `GET /api/wo/items?q=` (Books-item picker, min 2 chars);
  `POST /api/wo/:id/lines` (single-op edit: `add`/`setQty`/`remove`/`replace`
  + reason → diff entries → `bom.applyBom`, revision + `BomRevision` with a
  human `note` in the summary, **zero Zoho writes**); `POST /:id/status` runs
  `txn.autoReturnOnComplete` before writing `Completed` and returns the created
  Transfer Orders; `GET /api/wo/reports/reconciliation?workOrderId=`.
- [workorder/txn.js](functions/skuapi/workorder/txn.js) — pure `sweepLines`
  (dereserve = reserved, return = max(0, issued − required)) +
  `autoReturnOnComplete` (per-FG grid → draft + confirm via the existing txn
  path, notes "Auto-return on completion"); selftest cases.
- [workorder/reports.js](functions/skuapi/workorder/reports.js) — pure
  `reconcileRows` (lines ⋈ balances → required/reserved/issued/returned/
  leftover/removedFromBom, orphan balances included) + `reconciliation`
  (per-WO or org-wide, local tables only); selftest cases.
- [WoItemsTab.jsx](frontend/src/components/WoItemsTab.jsx) (new) — Items tab on
  the WO page: record-grid of frozen lines (hover pencil/trash, pager), Add /
  Replace / Remove modals with a debounced Books-item typeahead and a reason
  box, "Changes" list rendering the revision notes, read-only banner when
  locked. Wired in [WorkOrderPage.jsx](frontend/src/pages/WorkOrderPage.jsx)
  (`Items` tab; completion toast lists the auto-return Transfer Orders).
- [WorkOrderReportsPage.jsx](frontend/src/pages/WorkOrderReportsPage.jsx) —
  "Reconciliation" view with WO filter + CSV export.

**Not done (and why):** no auto-return of consumed-range issued stock (the app
cannot know shop-floor consumption); no SO/composite writes (explicitly out of
scope — internal to the add-on by design).

---

## CR-030 — Skip unselected Books-item properties + edit SKU in generator (2026-08-21) — 🚧 in progress

**Asked** (from CR-029 live testing): (1) with 24 parameters a SKU legitimately
uses only some — an unselected Books-item property must not block the
Manufacturing push ("Books-item properties missing a value: …" was wrong);
(2) a generated SKU's *parameters* must be editable afterwards, with the change
reflected in Zoho Books.

**Decisions:** unselected flagged property → skipped (only a *selected* value
that can't resolve still fails, §11.6); edit = reopen the generator prefilled;
**auto-push on save** for Books-linked items — the one deliberate exception to
CR-021's manual-only rule; Manufacturing BOM sync swaps only property-derived
associated items, manual BOM lines and their quantities are never touched.

**Shipped:**
- [zoho/push.js](functions/skuapi/zoho/push.js) — `buildAssociatedItems` skips
  flagged properties without a usable list selection (Range numbers included).
  New pure `mergeMappedLines(existing, desired, poolIds)` + `syncMappedItems`:
  on Manufacturing re-push, the composite's BOM is re-read, lines whose item is
  in the "generator-owned pool" (every `zohoItemId` any flagged property's
  values map to) are replaced by the current selections (existing quantity kept
  when the item stays), all other lines pass through untouched; PUT only when
  something changed.
- Edit-in-generator: `GET /api/sku-items/:id/values`
  ([routes/skuItems.js](functions/skuapi/routes/skuItems.js)) returns the item +
  stored selections; `POST /api/sku/update-item`
  ([routes/sku.js](functions/skuapi/routes/sku.js)) validates (required props,
  duplicate SKU excluding self), updates the row, replaces `SKUItemValue`s, and
  auto-pushes linked items (Books failure → `zohoWarning`, save never fails);
  `/api/sku/generate` takes `excludeItemId` so an unchanged SKU isn't its own
  duplicate.
- [SKUGeneratorPage.jsx](frontend/src/pages/SKUGeneratorPage.jsx) — `?item=<id>`
  edit mode: selections prefilled, industry + type locked, "Update SKU" button,
  zohoWarning toast. [SKUItemsPage.jsx](frontend/src/pages/SKUItemsPage.jsx) —
  "Edit parameters" button in the detail panel.
- Check: [push.test.js](functions/skuapi/zoho/push.test.js) — skip cases +
  `mergeMappedLines` (swap, manual-line preservation, no-change detection).

**Not done (and why):** editing an item's industry (would orphan its values —
industry locked in edit mode). Auto-push on *create* stays off (CR-021).

---

## CR-029 — Manufacturing SKUs push as Books composite items (2026-08-18) — 🚧 in progress

**Asked** (client doc "SKU Generator to Zoho Books Composite Item Automation"): a
Manufacturing SKU must land in Zoho as a **Composite/Assembly item** — associated
items taken from the selected values of properties flagged *Books item*
(`createValuesAsItems`), same descriptions/custom fields/inventory settings as
the Trading path, Taxable, price 0.00, and validation that every flagged
property resolves to a live Books item before the composite is created.

**Decisions:** associated-item quantity always **1** (BOM refined later on the
BOM pages); *Copy from Total* pricing **deferred**; tax = `is_taxable: true`
only (HSN/GST stays manual in Books); **type locks after first push** — Books
can't convert plain↔composite in place, and the lock is what lets `SKUItem.type`
double as the "which Books API does `zohoItemId` belong to" flag (no new column).

**Shipped:**
- [zoho/push.js](functions/skuapi/zoho/push.js) — `pushToZoho` branches on `type`.
  New `pushManufacturing`: update composite fields on re-push (never
  `mapped_items` — a BOM refined on the BOM pages must survive), stale-link
  self-heal, plus **legacy-link heal**: a Manufacturing item pushed pre-CR-029
  holds a plain-item id → composite update 404s → delete the plain item (Books
  refuses if it has transactions; error surfaces) → recreate as composite.
- New `buildAssociatedItems` — flagged active properties → the item's
  `SKUItemValue` selections → each resolved via `pushValueToZoho` (heals stale
  links, reuses twins, links by name, creates). Throws with property captions /
  value names when anything can't resolve (§11.5–11.6). Range values count as
  missing (a number can't be a Books item).
- [zoho/inventoryApi.js](functions/skuapi/zoho/inventoryApi.js) —
  `createCompositeItem` enriched (descriptions in both boxes, normalized custom
  fields incl. §3 defaults via shared `buildItemCfs`, rate 0, `is_taxable`,
  serial tracking, FIFO); new `updateCompositeItemFields` (top-level fields
  only, no `mapped_items`). Work-order BOM callers unaffected.
- [zoho/booksApi.js](functions/skuapi/zoho/booksApi.js) — `is_taxable: true` on
  plain-item create too; `buildItemCfs` extracted; `deleteItem`.
- Type lock: [routes/skuItems.js](functions/skuapi/routes/skuItems.js) PUT
  returns 400 on a type change once `zohoItemId` is set;
  [SKUItemsPage.jsx](frontend/src/pages/SKUItemsPage.jsx) disables the Type
  select with an explanatory tooltip.
- Check: [zoho/push.test.js](functions/skuapi/zoho/push.test.js) — composite
  payload asserts + missing-value validation paths (stubbed catalyst/booksApi).

**Not done (and why):** *Copy from Total* selling price — deferred until needed
(composite rate stays 0.00). Composite-aware Books→app **import** — import
remains Trading-only plain items. Full GST (HSN/tax ids) — org defaults apply,
manual in Books.

---

## CR-028 — BOM page = Books composite items; create in Books; CSV template (2026-08-13) — 🚧 in progress

**Requested:** the BOM sidebar page must not show work orders. Instead it lists the
org's Zoho Books composite items directly; drilling in shows/imports that BOM. The
import must also be able to **create** — a new composite item in Books, and missing
component items as plain inventory items. Add a downloadable sample sheet.

**Shipped (code):**
- **Zoho API** — `listCompositeItems` (paged) + `createCompositeItem`
  (`POST /compositeitems`, minimal body) in `zoho/inventoryApi.js`; `findItemBySku` +
  `createComponentItem` in `zoho/booksApi.js`. Component create deliberately does NOT
  reuse `createItem` — no Finished Goods custom fields / serial tracking / FG account;
  uses the org's "Inventory Asset" stock account via the generalized
  `getStockAccountId` (the old `getFinishedGoodsAccountId` is now a wrapper).
- **Routes** (`routes/workorder.js`, static paths above `/:id`): `GET /api/wo/composites`
  (grid), `GET /composites/:itemId/bom` (cache-first via `bom.getComposite`, `?refresh=1`),
  `POST /composites/:itemId/bom/preview` (matchUpload → Books lookup for unmatched →
  `diffBom`; rows found nowhere returned as `missing`), `POST /composites/:itemId/bom/apply`
  (optional `createMissing` → `updateCompositeItem` → cache refresh), `POST /composites`
  (new composite from a sheet; 400 listing missing SKUs unless `createMissing`).
  No WorkOrderLine / BomRevision / committed-material guard — those stay WO-only.
- **Frontend** — new `CompositeBomPage.jsx` replaces `WorkOrderBomPage.jsx` (deleted) on
  `/wo/bom`: composite-item grid (Name/SKU/Status, search, GridFooter) → drill-in with
  upload/paste/refresh, coloured diff, "create missing items in Books" checkbox, and a
  "New composite item" flow. `BomTab.jsx` gains a "⬇ Download template" button
  (client-side CSV blob `SKU,Name,Qty`) and exports its parse helpers for reuse.
- **Per-WO BOM unchanged** — `BomTab` inside `WorkOrderPage` keeps revisions, the
  committed-material guard, and `/api/wo/:id/bom*`.
- **Books composite-items export accepted** (customer sample sheet) —
  `parseBooksComposites` (`BomTab.jsx`) detects Zoho's own export format
  (`Composite Item Name`/`SKU` + `Mapped Item Name`/`Mapped Quantity`, one row per
  component) and groups it per composite. Grid gets "⬆ Import Books export" →
  `POST /api/wo/composites/import`: matched composites (SKU→name) get `mapped_items`
  replaced, unknown ones created; per-group errors don't abort the rest. Detail
  upload picks the matching group out of a multi-composite export; the
  new-composite form prefills name/SKU from a single-composite export.

**Schema:** no change.

**Not done (deliberately):** no local table for composites (live paged list — the
`CompositeItemCache` only holds drilled-into items).

**Live-org finding:** `POST /compositeitems` rejects a non-tracked item (code 13084
"The composite item should be inventory-tracked") — create now sends
`item_type:"inventory"` + `inventory_account_id` ("Finished Goods" account, falling
back to "Inventory Asset").

---

## CR-027 — Books item field-mapping defaults on push (2026-08-11) — 🚧 in progress

**Requested:** every SKU item pushed/synced to Zoho Books must carry the field-mapping
spec's defaults and mapped values — §1 Units=Pcs + Item Description, §2 inventory
tracking (serial method, Finished Goods account, FIFO), §3 constants (Item Type=Finished
Goods, Criticality=Critical, Source=In-house Manufacturing), §4 SKU parameters (Valve
Type, Connection Type, Surface Treatment, Drilling, Designing Type, Size).

**Shipped (code):**
- **Payload** — `createItem` (`zoho/booksApi.js`) now sends `unit:"pcs"` (§1),
  `product_type:"goods"`, `track_serial_number:true`, `inventory_valuation_method:"fifo"`
  (§2), and `inventory_account_id` (§2). `updateItem` re-sends `unit`; tracking method +
  account are create-only (immutable once the item has transactions).
- **Per-org Finished Goods resolver** — `getFinishedGoodsAccountId` looks up the org's
  account named "Finished Goods" (type `stock`) via `GET /chartofaccounts`, cached per
  org. The id differs per Books org and the app is multi-tenant, so **no env constant**
  (the earlier `ZOHO_INVENTORY_ACCOUNT_ID` idea was dropped).
- **§3 constants pushed explicitly** — `ITEM_DEFAULT_CFS` = `cf_item_type`=Finished
  Goods, `cf_item_criticality`=Critical, `cf_item_source`=In-House Manufacturing, merged
  into every create's `custom_fields`. Books custom-field *default values* fire only on
  UI creation, **not** API create, so defaults-in-Books would not have worked.
- **Dropdown value normalizer** — Books rejects the whole push if a dropdown value
  isn't byte-identical to an option (`code 120124`), and in-use options can't be
  renamed to match (`code 120111`). `normalizeCustomFields` maps each pushed value to
  the exact Books option label, matched loosely (case + all whitespace ignored),
  from a per-org-cached `GET /settings/fields?entity=item`. Keeps app data clean while
  absorbing Books' label quirks; unmatched/ambiguous values pass through so Books
  surfaces a real error instead of a silent wrong option.

**Data (MSUN VALVE org `60077990319`, done via Catalyst MCP):**
- **§4 mapping** — set `Property.zohoCfApiName` on 5 dropdown props: Connection Type→
  `cf_connection_type`, Surface Treatment (G)→`cf_surface_treatment_g`, Drilling→
  `cf_drilling`, Design Type→`cf_design_type`, Size→`cf_size`.
- **Valve Type left UNMAPPED** — Books `cf_valve_type` is a **lookup** (takes a record
  id, not text); pushing a string would fail the whole item create. Needs converting to
  a dropdown in Books, then re-mapping.

**Value-label mismatches — resolved:**
- `cf_surface_treatment_g` "Overlay Wleding " → renamed to "Overlay Welding" in Books
  (option not in use); app value trimmed to match. `cf_design_type` + `cf_size` options
  are in use (locked), so their 4 mismatches (design case + "O -port"; size `DN10 `) are
  handled by the push-time normalizer instead. Connection Type + Drilling matched already.

**Open (Books master-data change — MSUN admin):**
- Convert `cf_valve_type` lookup → dropdown in Books; then map Valve Type (`...82007`).
- Verify `track_serial_number` + serial tracking enabled on a first live push.

---

## CR-026 — Property value as a standalone Zoho Books item (2026-08-11) — 🚧 in progress

**Requested:** some property values *are* real inventory items in Zoho Books. When
adding a value, offer a checkbox to also create it as an individual Books item;
create it immediately on save, check for duplicates first, and keep a separate,
easy-to-scan track of the linked values. (This is the enabling slice of the
"parameter selection = Books item lookup" idea — items 1 / 1.1.)

**Shipped:**
- **Schema** — `PropertyValue.createAsItem` (boolean, nullable) + `zohoItemId`
  (varchar, nullable). `createAsItem` added to `BOOL_COLS` in `store.js`.
- **Books item = name only** — the value's Display Value is the item name; **no
  SKU is sent** (value codes are short and collide across properties, so Books
  auto-handles). Description = the value's description.
- **Backend** — `pushValueToZoho()` in `zoho/push.js` mirrors `pushToZoho`,
  best-effort (no-op until Zoho configured). Dedupe order: (a) already linked →
  `updateItem`; (b) a sibling value of the org with the same name already made the
  item → reuse its id; (c) an item with that exact name exists in Books
  (`findItemByName` via `search_text`) → link; (d) else `createItem`. Resolved
  `item_id` is written back onto the value. Wired into `POST`/`PUT
  /property-values`; a Books failure never fails the value save (returns a
  `zohoWarning`). New `GET /property-values/linked` returns linked values with
  property + industry names.
- **Frontend** — a read-only **Books items** tab (`BooksLinkedValuesPage`,
  `/sku/books-items`) lists every linked value, reusing the standard record-grid
  (GridFooter, industry filter).
- **Gate moved to the property (follow-up, 2026-08-11)** — not all properties are
  Books items, so the per-value checkbox was replaced by a **property-level gate**
  `Property.createValuesAsItems` (added to `BOOL_COLS`). PropForm shows "Values are
  Zoho Books items"; when on, **all** of that property's values sync as items and
  turning it on **backfills** existing values (`backfillPropertyItems`, best-effort).
  Un-flagged properties never create items. Value `POST`/`PUT` now gate on the parent
  property flag (`propertyMakesItems`) instead of `createAsItem`. Property list rows
  show a green `→ BOOKS` chip. `PropertyValue.createAsItem` is retained but unused.

- **Stale-link self-heal (bug fix, 2026-08-12)** — values (and SKU items) whose
  `zohoItemId` pointed at an item since **deleted in Books** made every push
  "succeed" while nothing appeared in Books: dedupe step (a) tried `updateItem`
  on the dead id, Books answered code 2006 (`GET` → 1002), and the best-effort
  wrapper swallowed it. Now `push.js` treats 1002/2006 as "gone": the dead link
  is cleared and the push falls through to re-create + re-link; a twin's borrowed
  id (step b) is verified with `getItem` first for the same reason. Re-saving a
  flagged property re-runs the backfill and heals its values.

**Not done (deliberately):** un-ticking the box does **not** delete the Books
item. The reverse item-lookup *picker* during generation (item 1 proper) is still
future — this CR only builds the value→item linkage it needs.

## CR-025 — Club properties into one un-separated SKU segment (2026-08-11) — 🚧 in progress

**Requested:** some SKU segments are several attributes picked separately that
must appear glued together with **no** separator — Body + Gland material (group 6)
and the 3-part Seat / Surface Treatment / Soft Seat (group 9). Let an admin *club*
properties so their codes concatenate directly, while the industry separator still
sits between segments. Must support autocomplete of existing clubs (avoid typos)
and un-clubbing.

**Shipped:**
- **Schema** — `Property.clubKey` (varchar, nullable). Properties of one industry
  sharing a non-empty `clubKey` form one segment; null = standalone (unchanged).
- **Backend** — `POST /sku/generate` (`routes/sku.js`) now groups codes into
  segments by `clubKey` (first-encounter / `skuPosition` order), joins **within** a
  segment with `""` and **between** segments with `industry.skuSeparator`.
  Name/description stay one entry per property. `properties.js` POST/PUT persist
  `clubKey` (empty string clears it → un-club).
- **Frontend** — `PropForm` gets a **Club** field. The generator's live chip row
  groups clubbed properties into one chip so the display matches the assembled SKU.
- **UI follow-up (2026-08-11)** — the Club field is now a `ClubPicker` combobox:
  the current club shows as a removable chip, existing clubs filter as you type, and
  a `+ Create "…"` row adds a new one (replaces the inconsistent native `<datalist>`).
  Property list rows show an indigo `⛓ <club>` chip (beside REQUIRED/IN NAME) so
  clubbed properties read as clubbed, not as duplicates. UI-only, no schema change.

**Not done (deliberately):** no configurable within-club joiner (user wants none).
Clubbed members should sit at adjacent `skuPosition`s; a club renders at its first
member's position. The legacy `SKUItemValue` backfill can't reverse-split a clubbed
segment (no separator inside) — forward saves are unaffected; clubbed industries
are new.

## CR-024 — CRM Deal context on the SKU generator page (2026-08-08) — ✅ shipped

**Requested:** open the SKU generator from a Zoho CRM Deal via a custom link
button, and show that Deal's details (deal name, account name, …) in a clearly
named section so the user knows which deal they're generating a SKU for. Extend
the existing Zoho auth: fold CRM into the same connection and ask for permission,
rather than a separate integration. (This is the read/display slice of the old
CR-012 widget spec, shipped server-side instead of as a CRM embedded widget.)

**Shipped:**
- **Auth** — added `ZohoCRM.modules.READ` to the single `SCOPES` grant
  (`zoho/auth.js`). New Zoho connects request CRM automatically; an existing
  Books-connected user is re-prompted for consent the first time they open a Deal
  link (Zoho shows the not-yet-granted scope on a plain `/auth/zoho`) — same lazy
  reauth path as the Inventory scope. No new env vars, no schema change.
- **Backend** — `zoho/crmApi.js`: `getDeal` calls CRM v6 `GET /Deals/{id}` (no
  `organization_id`; CRM is scoped by the token's own CRM org). Pure
  `crmReauthNeeded(status, body)` classifies a missing-scope/expired grant (401 /
  `OAUTH_SCOPE_MISMATCH` / `INVALID_TOKEN` / `AUTHENTICATION_FAILURE`). Route
  `GET /api/crm/deal/:id` (`routes/crm.js`, mounted under the `/api`
  auth+requireOrg chain, not add-on gated) → `409 reauth_required` on that,
  `404 not_found` on empty.
- **Frontend** — `components/CrmInfoCard.jsx`: given a `dealId`, fetches the deal
  and renders a labeled **"CRM Info"** card (Deal Name, Account Name, Contact,
  Stage, Amount, Owner). Rendered at the top of `SKUGeneratorPage` only when
  `?dealId=` is present. **Non-blocking**: if CRM isn't authorized it shows a
  small "Connect CRM" link and the generator works normally regardless.
- **Deal context survives search → create** — the SKU items page "+ New" button
  carries `?dealId=` into the generator, so a Deal button can open the item
  search list (`/#/sku/items?dealId=…`) and the CRM Info card still shows on the
  create screen after "+ New".
- **CRM setup (console, not code):** a Deal custom link button →
  `/#/sku/items?dealId=${Deal.Id}` (search-first) or `/#/sku/generator?dealId=${Deal.Id}`.

**Not done (deliberately):** no write-back to the Deal (the CR-012 `Plan_Pricing`
subform append) — this is read-only display; add a broader scope + POST if that
sync is built. No proactive login-time CRM prompt — consent is lazy on first use.

---

## CR-023 — Item-wise Purchase Request across work orders (2026-08-06) — 🚧 in progress

**Requested:** the purchase flow was per–work order — to buy raw materials the
buyer opened each WO's Purchase tab and raised a PR one WO at a time. Wanted
instead: (1) rename the "Purchase" menu to "Purchase request"; (2) an item-wise
view across all open WOs — tick items, pick a vendor, raise one grouped PO with
the total; same item to the same vendor becomes a single grouped PO line; (3) a
back-indicator on the WO once its materials are ordered/received; (4) WO
procurement stages with status chips + filters. BOM "save as new composite"
(item 5) deferred to a follow-up.

**Shipped:**
- **Rename** — nav label `Purchase` → `Purchase request` (`App.jsx`); route
  unchanged (`/wo/purchase`).
- **By-item view** (new default on the Purchase Request page) — `GET
  /api/wo/purchase/shortfall-by-item` aggregates every open WO's shortfall by raw
  material (reusing `shortfallLines` + `applyDraftCoverage`), returning one row
  per item with the per-WO breakdown. UI: checkbox per item, editable order qty,
  expandable "needed by" WOs, and a pinned bar — pick one vendor, **Raise PO**.
- **One-step raise** — `POST /api/wo/purchase/raise` → `raiseItemPO`: a
  consolidated `PurchaseRequest` (no single `workOrderId`) with one
  `PurchaseRequestLine` per (item, contributing WO), then one grouped draft PO
  via the factored-out `createPoForLines` (same-item lines collapse to a single
  Books line — 2.2). `confirmPR` now shares `createPoForLines`.
- **Procurement status** (2.1 + 4) — derived, separate from the manufacturing
  lifecycle: `procurementStatus` per WO (`Requested` / `PO Raised` / `Partially
  received` / `Received`) from its PR lines, surfaced by `procStatusByWo` on `GET
  /api/wo` + `GET /api/wo/:id`. New `ProcChip`/`PROC_TONE` shown on the WO list
  (with a filter) and the WO detail header.
- **Received back-fill** — `refreshPurchaseOrders` now splits a grouped PO line's
  received/billed across the per-WO lines by purchase-qty share (was: full amount
  to each — would double-count).

**Schema:** `PurchaseRequestLine.workOrderId` (string, nullable);
`PurchaseRequest.workOrderId`/`salesOrderId` now optional (empty for a
consolidated PR). No backfill — reads fall back to the parent PR's WO.

**Not done (deliberately):** BOM clone (item 5) — needs a `POST /compositeitems`
path that does not exist yet; tracked as a follow-up. No item→preferred-vendor
mapping (none exists; vendor is chosen manually at raise, as before). The per-WO
Purchase tab still lists only its own PRs — a WO's consolidated PRs surface via
the procurement chip, not that tab.

---

## CR-022 — Work Order material-reservation redesign (2026-08-04) — ✅ shipped

**Requested:** redesign the Work Order reservation screen from the mockup —
Direction 1a ("plain-language table · bulk select · live confirm bar"), wired to
existing endpoints only.

**Shipped:** `MaterialsGrid.jsx` rewritten. Same data (`GET /:id/grid`) and same
actions (`POST /:id/txn`, `POST /refresh`) — the redesign is all presentation.

- **Plain-language columns** replace the A–I BRD letters as the default:
  `Item · Needed · In stock · Reserved · Issued · Coverage · {verb} now`. Needed
  shows the full BOM requirement. The five extra BRD columns (PO/Received/Billed/
  Reservable/Extra reserved) are hidden by default behind the existing column
  picker (storage key bumped to `materialsGridCols2`).
- **Per-row coverage bar** (client-derived): issued (green) + reserved (blue) +
  outstanding — hatched red when short, neutral track otherwise. Caption reads
  `covered` / `{n} left to reserve` / `{n} missing`.
- **Shortage warning bar** when `shortCount > 0`: total units missing, a "Show
  short items" filter shortcut, and "Request purchase" → the existing
  `#/wo/purchase` flow.
- **Filter chips** `All / Short / Fully covered / Left to {verb}` and an item/code
  search, both client-side derivations.
- **Bulk select** + per-row **MAX** + "{verb} everything available" (scoped to
  ticked rows, else the current filter).
- **Live confirm bar** pinned to the bottom (tallies units/lines; Discard /
  confirm), replacing the top Confirm button. Table header goes light (drops the
  navy `#1e3a5f`).
- **Preview harness** (dev-only, not in the app bundle): `materialsPreview.html`
  + `src/dev/materialsPreview.jsx` render the grid with the mockup's eight sample
  lines and stubbed axios — open `/materialsPreview.html` under `npm run dev` to
  see the screen without a backend.

**Not done:** the 1b/1c shortage-resolution panels (transfer from another
warehouse, view incoming PO) — they need net-new backend data (other-warehouse
availability, incoming-PO matching). Out of scope this pass. No backend or schema
change; no `SCHEMA.md`/`ARCHITECTURE.md` effect.

## CR-021 — Manual Zoho Books item sync only (2026-08-02) — ✅ shipped

**Requested:** items sync to Zoho Books automatically on save; make it a
user-triggered action instead — a "Push to ZB" button.

**Shipped:** the manual button and its endpoint (`POST
/sku-items/:id/push-zoho`) already existed — so this CR removed the automatic
push and clarified the button.

- Removed the three fire-and-forget `pushToZoho(...)` calls that fired on save:
  SKU create from the generator (`routes/sku.js`, also dropped the now-unused
  import), and SKU-item create + update (`routes/skuItems.js`). Nothing reaches
  Zoho Books now until the user clicks Push.
- `zoho/push.js`, `zoho/booksApi.js`, and the manual route are unchanged — sync
  logic (create-or-update by `zohoItemId`, custom fields) is identical.
- **Button clarity** (`SKUItemsPage.jsx`): synced rows now read `✓ Synced ·
  Re-push` (was a terminal-looking "Synced"), with a title explaining a click
  re-pushes edits. A `pushingId` state disables the button and shows "Pushing…"
  while a request is in flight, blocking double-clicks.

**Not done:** a "needs re-sync / edited since last push" indicator — needs a new
`zohoSyncedAt` column and a reliable modified-vs-synced comparison (Catalyst
`MODIFIEDTIME` is bumped by the sync write itself). Presence of `zohoItemId`
remains the only sync signal. Add when staleness visibility is actually asked
for.

## CR-020 — Orders tab: all Books POs, delete with lock mark (2026-07-30) — ✅ shipped

**Requested:** POs created directly in Zoho Books (not from a purchase request)
don't appear in the app and can't be deleted from it — the buyer wants to
delete a wrongly-created PO from the Orders tab, with a lock mark on POs that
Books would refuse to delete (receives/bills exist).

**Shipped:**

- **`booksApi.listPurchaseOrders`**: paginated `GET /purchaseorders`
  (`per_page=200`, `has_more_page` loop — same pattern as `listVendors`).
- **`purchase.listAllPOs`** + pure `poListRow` behind new **`GET
  /api/wo/purchase-orders`**: every PO in the Books org; app-created ones
  stamped with their PR # / WO # via one local `PurchaseRequestLine` query;
  `locked` = received or billed status ≠ pending. Selftest asserts added.
- **Gates relaxed for Books-only POs**: `poDetail` and `deletePo` no longer
  404 when no local PR lines reference the PO (Books calls are already
  org-scoped by `organization_id`); `deletePo` skips the shortfall reset and
  logs `po.delete` against the PO itself when nothing local exists.
  `updatePoLines`/`setPoStatus` keep the local-lines gate.
- **Orders grid** now reads the endpoint (was: derived from PR lines): PO # ·
  Date · Vendor · Status · PR # (or "Books") · Work order · Received · Billed
  · Total, 🔒 beside locked PO numbers. Row click opens the PO detail view as
  before — which now works for Books-only POs too.
- **Delete PO button** in the detail view disables with 🔒 + tooltip when the
  PO has receives/bills, pre-empting Books' raw error; Books stays the
  backstop if a receive races in.

**Not done / trade-off:** line editing and Mark Issued/Cancelled for Books-only
POs still go through Zoho Books (only view + delete added here); the Orders
tab now costs one live Books list call per load.

---

## CR-019 — PR line merge, BOM/Purchase grid pages, item-pipeline report (2026-07-30) — ✅ shipped

**Requested:** (1) a PO came out with the same item twice at the same qty —
prevent it; (2) WO, BOM and Purchase pages all lead with the same work-order
sidebar — keep the pages but give BOM and Purchase their own primary content;
(3) a report showing what stage each item is at (PR / PO / received / billed).

**Shipped:**

- **Same-item PR lines merged** (`purchase.collapseLines`, used in `createPR`):
  the shortfall is computed per finished good, so one raw material needed by
  two FGs posted two identical lines; both then landed on one PO and the
  received/billed refresh (matched by `rmItemId`) double-counted. Lines now
  collapse to one per item with summed quantities before insert. Selftest
  asserts added.
- **`/wo/purchase` rewrite** (`WorkOrderPurchasePage.jsx`): Requests/Orders
  grid toggle replaces the WO rail. Requests = all PRs (`GET
  /api/wo/purchase-requests`); Orders = POs derived client-side from PR lines
  (no new endpoint). Status filter, pagination (`GridFooter`), row click drills
  into the existing `PurchaseTab` (per WO, with back bar) or `PoSplit` (per
  PO). "Raise request for…" select keeps the first-request flow for WOs with
  no purchases.
- **`/wo/bom` rewrite** (`WorkOrderBomPage.jsx`): grid of WOs with Finished
  goods, Rev and BOM-imported date (BOMs first, search kept) → row click
  drills into the existing `BomTab` with back bar.
- **Item-pipeline report**: `reports.pipelineRollup` + `reports.itemPipeline`
  (zero Zoho calls, `PurchaseRequestLine` only) behind **`GET
  /api/wo/reports/item-pipeline?workOrderId=&vendorId=`**. One row per item:
  Requested · On draft PR · On draft PO · On open PO · Received · Billed
  (parallel sums, not exclusive buckets), vendor list joined. Third view on
  `/wo/reports` with WO + vendor filters; CSV export works as-is.
- **Extraction**: the reports `Table` grid moved to `woCommon.jsx`, shared by
  Reports/Purchase/BOM pages.

**Not done / trade-off:** existing duplicate draft-PR lines are not migrated —
the one known bad PO is fixable in the PO detail view (remove the extra line;
it returns to the shortfall). No "No PR yet" stage in the pipeline report — it
needs the per-WO shortfall computation and the Shortfall report's "PO raised:
No" column already covers it. Duplicate PRs per WO stay allowed (re-requests
are legitimate); only same-item lines within one PR merge.

---

## CR-018 — Work Order UI restructure, Zoho Books style (2026-07-30) — ✅ shipped

**Requested:** move the per-order tabs into the sidebar menu (Materials becomes
the work order itself; BOM and Purchase become module pages); Approvals and
History stay per order like Zoho Books quotes; Approve/Reject in the toolbar;
Edit; a left list rail; ⋯ menu with Delete and Print PDF; grid view like the
Books quotes list.

**Shipped:**

- **Sidebar submenu** (Order Management): Work Orders `/wo` · BOM `/wo/bom` ·
  Purchase `/wo/purchase` · Reports `/wo/reports`.
- **`/wo/:id` split view** (`WorkOrderPage.jsx` rewrite): 260px left rail of
  all work orders (number, status chip, customer, click to switch) + right
  detail. Toolbar: **✎ Edit** (modal → `PUT /:id`: project, date, costs,
  notes) · **Approve ▾** (targets the first non-approved level; both approved
  → green ✓ chip; per-level buttons remain on the Approvals sub-tab) · status
  lifecycle buttons (unchanged) · **⋯** (Print / PDF, Delete). Sub-tabs:
  **Details** (Materials A–I grid) · Approvals · History. X returns to `/wo`.
- **`/wo/bom`** (`WorkOrderBomPage.jsx`): WO picker rail (rev + BOM date,
  search) → existing `BomTab` unchanged.
- **`/wo/purchase`** (`WorkOrderPurchasePage.jsx`): rail of WOs with PRs
  (count badge, red dot for drafts) + other open WOs → existing `PurchaseTab`
  unchanged. Backed by new **`GET /api/wo/purchase-requests`**
  (`purchase.listAllPRs`, PRs stamped with woNumber/customer).
- **`DELETE /api/wo/:id`**: only Draft/Cancelled; 409 while POs exist or
  material is reserved/issued; cascades all child tables; `ActivityLog` kept
  (`wo.delete` logged). Confirm modal in the UI; menu item disabled otherwise.
- **Print / PDF**: hidden `WoPrintSheet` (header, FGs, BOM materials, costs,
  notes) + `@media print` visibility CSS → `window.print()`; user saves as PDF
  from the browser dialog. No new dependencies.
- **Extraction**: `components/woCommon.jsx` (StatusChip, AccessNotice, style
  consts) and `components/PurchaseTab.jsx` (PurchaseTab + PoSplit, moved
  verbatim); Settings/Reports/List pages re-import from `woCommon`.

**Not done / trade-off:** real server-generated PDF (browser print is enough
until letterhead templates are needed); no grid-view changes to `/wo` (already
matched the Books pattern); left rail loads the full WO list unpaginated —
fine at current volumes.

---

## CR-017 — Nav restructure: Order Management + Settings in account menu (2026-07-28) — ✅ shipped

**Requested:** (1) move the WO Settings tab into the user/account menu; (2) move
Work Orders and Reports into a sidebar submenu; (3) rename the sidebar entry
"Work Order" → "Order Management".

**Shipped (all `App.jsx` + one string in `MaterialsGrid.jsx`):**

- Sidebar entry renamed **Order Management**; it now carries a `children`
  submenu (Work Orders `/wo`, Reports `/wo/reports`) rendered as indented
  NavLinks when the sidebar is expanded — longest-matching child gets the
  highlight, so `/wo/:id` lights Work Orders and `/wo/reports` lights Reports.
  Collapsed sidebar shows the parent icon only.
- The WO content-area tab bar is gone (`WO_TABS` deleted); routes unchanged.
- Account dropdown gains a **Settings** item (gear icon, above "Submit to
  helpdesk", only when the `work-order` addon is enabled) → `/wo/settings`.
- `MaterialsGrid` warehouse hint now points at "Settings (account menu, top
  right)".

**Not done / trade-off:** `GlobalSearch` lived inside the WO tab bar, so the
Order Management pages no longer show the catalog search box (it searches the
SKU catalog; the SKU section keeps it). Re-add to the WO header if missed.

---

## CR-016 — PO detail view: edit lines, issue/cancel, delete (2026-07-27) — ✅ shipped

**Requested:** clear items from / delete a PO from the app, and a Books-like
order-detail view: click the PO in the Purchase tab → master–detail window with
line items, receive/bill status, and actions (edit item, delete, status).

**Shipped:**

- Clicking a PO number on a PR line opens a master–detail split (SKUItemsPage
  CR-014 pattern): left, the WO's POs; right, a live Books detail card —
  number, status chip, vendor, date, SO reference, total, receive/bill status,
  and the line items (qty, rate, received, billed).
- Actions, gated by status (`editable = not billed/closed/cancelled`):
  **Save changes** (qty edits + per-line ✕ remove; removed items return to the
  shortfall), **Mark Issued** (draft only), **Mark Cancelled**, **Delete PO**
  (Modal confirm). Books' own rejections (e.g. deleting a billed PO) surface
  verbatim in a toast; Books is called before any local write.
- `zoho/booksApi.js`: `updatePurchaseOrder`, `deletePurchaseOrder`,
  `setPurchaseOrderStatus` (exported!).
- `workorder/purchase.js`: `poDetail` (org-gated via the PR lines that created
  the PO — cross-org probe 404s), `resetPoLines` (detach PR lines → item back
  in shortfall, PR back to Draft so re-confirm works), `deletePo`,
  `setPoStatus`, `updatePoLines` with pure `poPutBody` (Books PUT replaces
  lines wholesale, so kept lines echo item/rate/description/warehouse from the
  fetched PO; an item counts as removed only when on none of the kept lines).
  Qty edits write back to `purchaseQty` (the grid's on-order column sums it).
  `listPRs` now exposes `poId`. New selftest asserts for `poPutBody`.
- Routes: `GET/PUT/DELETE /api/wo/po/:poId`, `POST /api/wo/po/:poId/status`.

**Not done:** send-PO-email (not requested); qty sync skipped when one item
maps to multiple PR lines (`ponytail:` comment — the PO refresh still corrects
received/billed). POs cancelled/deleted directly inside Books still leave
stale local lines until touched from the app (reconcile gap, pre-existing).

---

## CR-015 — Purchase tab fixes: vendors, duplicate PRs (2026-07-27) — ✅ shipped

**Requested:** (1) vendor dropdown empty when raising a PO; (2) hint when a
PR/PO already covers a shortfall item; (3) SO reference on PO line items;
(4) never merge identical items into one PO line (they can trace to different
SOs); (5) combined-item PO-team template — later; (6) instant vendor re-sync
button (vendor master only, not items — API cost).

**Shipped:**

- **Root cause of the empty dropdown:** `listVendors` and `createPurchaseOrder`
  were defined in `zoho/booksApi.js` but missing from its `module.exports` —
  `GET /api/wo/vendors` (and PR confirm) died with "is not a function", and the
  UI swallowed the 500. Both added to the exports.
- `WorkOrderPage.jsx` (PurchaseTab): vendor fetch errors are no longer
  swallowed — a warn `Banner` shows the backend message (incl. reauth) when a
  draft PR needs a vendor; a **⟳** button next to each vendor select re-fetches
  `/api/wo/vendors` live from Books (point 6 — press after adding the vendor
  there). Shortfall rows render a `prHint` line ("PR-0001 covers 902").
- `workorder/purchase.js`: new pure `applyDraftCoverage(lines, draftLines)` —
  draft (unconfirmed) PR quantities are deducted from the shortfall greedily
  per item, rows fully covered disappear, partially covered rows carry
  `prHint`. Covered by new `--selftest` asserts.
- `routes/workorder.js` `GET /:id/shortfall`: loads the WO's Draft PRs, their
  lines with no `zohoPoId` (lines already on a PO are counted as on-order by
  `poSums` — counting them again would double-deduct), and applies the
  coverage. Raising twice can no longer duplicate a pending request.

**Verified, no change needed:** PO lines already carry `description: "SO
<number>"`, `reference_number` = SO number, notes = `PR · WO · SO` (point 3);
`groupByVendor`/`createPurchaseOrder` map PR lines 1:1 — identical items are
never merged (point 4; comment added).

**Not done:** combined-item list template for the PO team (point 5, deferred by
request); no local vendor cache table — the list is one live paginated Books
call, cheap enough on demand.

---

## CR-014 — SKU tabs in setup order + combined SKUs page (2026-07-24) — ✅ shipped

**Requested:** (1) tab sequence should follow the creation flow — Industries →
Properties → SKU Generation; (2) drop the Recent SKUs rail from the generator;
(3) merge SKU Items and SKU Generator into one tab: the tab shows the items
list, a **New** button opens the generator, and clicking an item uses the Zoho
Books item model (list collapses to a narrow left panel, details on the right).

**Shipped:**

- `App.jsx`: `SKU_TABS` is now Industries → Properties → **SKU Generator**
  (`/sku/items`, the combined page); the separate "SKU Items" tab is gone.
  Default landing (sidebar entry, `/` and `*` redirects) moved to
  `/sku/industries`. `/sku/generator` stays a live route for permalinks.
- `SKUItemsPage.jsx`: **+ New** button → `/sku/generator`. Row click opens the
  master–detail layout — 300px left list (name/SKU, Zoho badge, selected
  highlight) + right detail card (Name/SKU/Description/Type editable, Industry/
  Created read-only, Push to Zoho, Delete, × close back to the full grid). The
  Edit modal is deleted; the hand-rolled pagination footer is replaced with the
  shared `GridFooter`/`usePager`.
- `SKUGeneratorPage.jsx`: Recent SKUs card, `recentSKUs` state and `loadRecent`
  removed. Create Item now navigates to `/sku/items` (new SKU visible at the
  top); "← Back to SKUs" link added above the builder.

**Not done:** no `/sku/items/:id` deep-link route — the selected item is local
state (`ponytail:` comment marks the upgrade path). Grid-mode row actions
(hover trash, Z push) unchanged. Note: this page is a deliberate exception to
the "no row-click edit" grid convention — the user asked for the Zoho Books
row-click master–detail here.

---

## CR-013 — Work Order module, MSUN BRD (2026-07-23) — 🚧 in progress

**Requested:** implement the signed *Work Order Module BRD* for MSUN Pump — the
full manufacturing material flow (BOM → Reserve → De-Reserve → Issue → Return →
Purchase Request) with Main / Reserve / Issue warehouse enforcement, delivered as
one scope. Client asks: a database schema that fits it, record fetching that does
not burn the Zoho API budget, and a module that is easy to use and easy to train.

**What the BRD unblocks:** every reserve write action is a **Transfer Order**
between two of three warehouses — the question that left CR-005's Phase 4 stuck
on `501`s. Mapping is fixed, not configurable: reserve = Main→Reserve,
de-reserve = Reserve→Main, issue = Reserve→Issue, return = Issue→Main.

### Decisions taken

- **Zoho composite item stays the BOM master.** `CompositeItemCache` is the read
  model; `WorkOrderLine` freezes the per-WO requirement so editing a composite
  item cannot retroactively rewrite a closed work order. Revisions push back.
- **Catalyst Data Store is the read model** — no screen and no report calls Zoho
  on load. Zoho is touched on writes (write-through), on webhook events, and on a
  nightly bounded reconcile. See "Record fetching" below.
- **Reserve / De-Reserve / Issue / Return are one ledger** (`MaterialTxn` +
  `MaterialTxnLine`), not four modules — they differ only by `type` and the
  warehouse pair. This is why the UI can be one screen with four actions.
- **Ships as a new `work-order` add-on** that absorbs the existing Reserve page;
  `/api/reserve/*` stays mounted one release for the Books custom button.
- BRD §13's open points (cost-threshold %, approver roles, warehouse naming)
  become `OrgSetting` rows with defaults, so none of them blocks the build.

### Record fetching (the API-budget answer)

1. **Write-through, free** — every Transfer Order and PO is created by us, so the
   API response is written straight to our rows. Reserved / Issued / Returned
   (columns C / D) are our own numbers and never come from Zoho.
2. **Webhook ingestion** — Books workflow rules POST to `/internal/zoho-event`
   (`X-Sync-Secret`, same guard as `/internal/sync-stock`). Manual per-org setup,
   delivery not guaranteed → (3) is mandatory, not optional.
3. **Nightly cron reconcile, bounded** — working set only (RM on non-closed WOs),
   bulk `GET /items?per_page=200` paging, and PO refresh **only for POs we
   created**. This retires `reserve/sync.js`'s `fetchItemNumbers`, which cost
   1 + N purchase-order detail calls *per item*.

**Catalyst Signals** is the alert channel (shortfall, cost threshold), not an
ingestion path. Reports are pure ZCQL over our tables — zero Zoho calls.

### Schema

13 new tables + 2 extended — full definitions in [SCHEMA.md](SCHEMA.md):
`OrgSetting`, `WorkOrder`, `WorkOrderFG`, `WorkOrderLine`, `BomRevision`,
`MaterialTxn`, `MaterialTxnLine`, `PurchaseRequest`, `PurchaseRequestLine`,
`CompositeItemCache`, `Approval`, `AlertLog`, `ActivityLog`; extended
`ReservationLine` (+`workOrderId`, `workOrderFgId`, `requestedPoQty`) and
`ItemStockSnapshot` (+`availableStock`, `source`, `warehouseId` now populated).

### Status

**Code and docs complete; nothing deployed.** All six sub-modules, the three
add-on capabilities, the API surface (`/api/wo`, 29 routes), the four-tab UI and
the reference/training doc ([WORKORDER.md](WORKORDER.md)) are written, load
clean and pass their self-checks. What remains is console and live-org work,
tracked in [TASKS.md](TASKS.md): create the 13 tables, enable the add-on, set the
warehouses, register the cron + Books webhooks, and verify the two Zoho write
payloads (`transferorders`, `purchaseorders`) against a real org — they are
written to the documented shape but have never been posted.

Every non-trivial rule is self-checked without a Data Store:
`node functions/skuapi/workorder/<module>.js --selftest`.

**2026-07-23 fix — Zoho Locations orgs.** First live WO (WO-0001) showed a false
shortage: `ItemStockSnapshot` was empty (no cron/webhook/refresh had ever run)
and the settings warehouse dropdown was missing branch locations, because the
client org has Books **Locations** enabled. Legacy `/warehouses` returns only
warehouse-type entries — branches like "Surat - Head Office" (which held the
stock) never appeared. `listWarehouses` now prefers `GET /locations` (normalised
to the warehouse shape, legacy fallback kept) and `writeStock` reads
`item.locations[]` alongside `item.warehouses[]`. Also found in the live org:
`mainWarehouseId` = `reserveWarehouseId` — must be re-picked in WO Settings once
the full location list shows. The transfer-order payload was verified the hard
way on first Confirm Reserve: Zoho requires `from_location_id`/`to_location_id`,
`line_items[].name` (its absence was the "Invalid value passed for name" code 4)
and `quantity_transfer` — plain `quantity` is ignored. `createTransferOrder`
now sends all three. Follow-up the same day: the snapshot
stayed empty because nothing could trigger a sync (no cron, no webhooks, and
the grid's Refresh button only re-read the local table). `buildGrid` now
self-heals never-synced items with one live pull per item, and the Materials
grid's ⟳ Refresh calls `POST /api/wo/refresh` (full reconcile) before
re-reading. The reconcile's bulk `/items` sweep is gone: on Locations orgs that
payload reports `stock_on_hand: 0` with no per-location breakdown (verified
live), so the reconcile now makes one item-detail call per working-set item —
still bounded by open work orders — and a single item's failure logs instead of
aborting the whole refresh.

### Out of scope (stated to the client)

- "Reports — As per Tej Control" — no specification exists (BRD §13); separate CR.
- Zoho Analytics dashboards — in-app reports ship instead.
- Vendor quotation comparison, PO approval routing, automatic vendor selection
  (BRD §6.6.3); shop-floor consumption past the Issue warehouse (§6.4.3);
  return-to-vendor and scrap handling (§6.5.3); barcode/RFID (§6.7.3).

---

## CR-012 — CRM Deal → SKU master item picker (2026-07-23) — 📋 specified, not started

**Requested:** from a Zoho **CRM Deal**, a reference link opens the SKU
generator. It shows the deal's context (Deal Name, Deal ID, Contact Name). The
user searches the SKU master, multi-selects items, and they transfer back into
the deal's item line grid — so the items that already exist can be ticked and
quoted, and the ones that don't can be found (or built) in the SKU master and
pulled across.

**Decisions taken:** CRM **widget** (iframe + `ZOHO.embeddedApp` SDK), not a new
browser tab. Deal details are read client-side via `ZOHO.CRM.API.getRecord`, so
this needs **no new OAuth scope and no user re-consent** — the widget acts as
the signed-in CRM user. `SCOPES` in [zoho/auth.js](functions/skuapi/zoho/auth.js)
stays Books+Inventory only. Search-existing-and-transfer only; generating a new
SKU inside the widget is out of scope for this CR.

### Verified CRM facts (org `3100593…`, read via CRM metadata API)

- **Deals has no product line grid.** 136 fields; the only subforms are `Plan_A`
  and `Plan_B`, which are Zoho-app *pricing* rows — item column `App_Plan` is a
  lookup to the custom **`Plan_Pricing`** module, not `Products`.
- `Plan_A` / `Plan_B` child fields report `api_create: true` / `api_update: true`
  (`App_Plan`, `Req_Users`, `Large`/`Medium`/`Small`, `Free_Users`, `Parent_Id`),
  so **subforms are API-writable**. The all-`false` `operation_type` on the
  *parent* subform field is just how Zoho reports virtual subform wrappers — not
  a blocker. Worth knowing before anyone re-reads that metadata and panics.
- `Plan_A`'s `User_Month` / `Org_Month` / `Free_Users` / `Large` / `Medium` /
  `Small` columns carry `association_details` pointing at `App_Plan` — CRM
  **auto-fills them** from the looked-up record. A written row only needs the
  lookup + quantity.
- `Plan_Pricing` (28 fields) is an app-subscription catalog: `Name` (display,
  "App / Plan"), `App_Name` picklist, `Zoho_App_Name` text, per-user/per-org
  pricing, S/M/L tiers, `Inactive`. **No SKU field and no unique constraint on
  any field** — nothing to correlate a `SKUItem` against today.
- The `App_Plan` lookup has a **filter configured**
  (`query_details.query_id: 3100593000205746400`). Records we create may fail it
  and never appear in the picker — must be checked in Setup.
- `Products` / `Quotes` / `Sales_Orders` / `Invoices` / `Price_Books` all exist
  as stock modules, but are **not** on this path. `Quotes` returned
  `NO_PERMISSION` for the connected metadata identity — uninspected.
- Books↔CRM product sync status is **undetermined and no longer relevant**: the
  target is `Plan_Pricing`, not `Products`. (Zoho's sync reuses the stock
  Products module, so field metadata can't reveal it either way, and the
  available connector has no record-read tool to probe with.)

### Blocked: CRM-side changes needed first

Neither `Plan_A` nor `Plan_B` fits SKU items — their columns are subscription
pricing (per-user/month, free users, S/M/L tiers), while a `SKUItem` is an
industry/property SKU pushed to Books as `Trading` / `Manufacturing`. A **new
subform is required**, and it must be built in the CRM Setup console by hand —
it cannot be created from this repo.

**To be created in CRM (owner: Dhiraj):**

1. `Plan_Pricing` → add a **`SKU`** text field. This is the correlation key: the
   widget matches on it exactly so repeat transfers update instead of
   duplicating the catalog. Mirrors how `sku` + `zohoItemId` already correlate
   Books items (CR-001 §B).
2. Deals → a **new SKU line subform** with, at minimum: lookup to
   `Plan_Pricing`, quantity, rate, amount. Column list to be confirmed.
3. Confirm whether the new subform's lookup needs a filter, and whether the
   existing `App_Plan` filter (`query_id 3100593000205746400`) would hide
   widget-created records.
4. Register the widget (Setup → Developer Space → Widgets) and add the Deal
   button that launches it.

**⚠ Open — assumption to confirm before any code.** The answers taken so far
combine "a new subform is needed", "add the SKU field to `Plan_Pricing`", and
"the user picks Plan A or Plan B in the widget". Read together, that implies
**two** new subforms — `SKU_Items_A` and `SKU_Items_B` — mirroring the existing
Plan A / Plan B two-scenario quoting pattern, both looking up `Plan_Pricing`
(now SKU-keyed). That is an inference chained across three answers and has
**not** been confirmed. If instead there is one new subform and the A/B choice
was about the existing plan grids, the widget's transfer target changes. Resolve
this before building.

### App-side work (once the CRM changes exist)

- Widget entry route (e.g. `/sku/crm`) — search-and-multi-select over the
  existing SKU master, reusing `POST /api/sku-items/search`.
- `ZOHO.embeddedApp.init()` → `getRecord` for Deal Name / Deal ID / Contact
  Name in the header; `updateRecord` to append subform rows.
- Find-or-create the `Plan_Pricing` record by `SKU`, then append the line.
- Auth: the widget loads inside CRM for a CRM user who may have no SKU-app
  session and no selected Books org — the `App.jsx` gate (Zoho connected **and**
  `orgId` chosen) will block the iframe. Needs a decision; not yet specified.

### Not done / deliberately excluded

- Generating a **new** SKU from inside the widget — search-and-transfer only.
- Editing an item on the way through.
- Any write to `Products`, `Quotes`, or the Books↔CRM sync path.

---

## CR-011 — Generator chrome cleanup + catalog-wide search (2026-07-23)

**Requested:** the generator carried too much chrome above the actual work, the
in/out property transfer from CR-009 wasn't wanted yet, and the search box was
buried in the breadcrumb bar and only searched recently-created SKUs.

- **Transfer UI hidden.** The ◀ / ▶ arrows, *Remove all* / *Add all* and the
  *Not in SKU* section are gone from
  [SKUGeneratorPage.jsx](frontend/src/pages/SKUGeneratorPage.jsx); every property
  is in the SKU. `Property.activeInSku`, the server `isActive()` gate and the
  `NOT IN SKU` badge in the Property Manager **stay** — the feature returns later,
  and the badge is now the only place a stray flag shows.
  - **Data fix:** 24 `Property` rows had been left at `activeInSku = false`, which
    would have emptied the generator once the arrows were hidden. Reset with
    `UPDATE Property SET activeInSku = true WHERE activeInSku = false`.
- **Chrome removed:** the `Home / SKU Generator` breadcrumb bar, the `SKU Generator`
  heading + subtitle, and the `Total SKUs / Industries / This week` tiles (with
  the `stats` state and its `/api/sku-items` fetch). The SKU tab bar is now the
  only header.
- **Catalog-wide search** — new
  [GlobalSearch.jsx](frontend/src/components/GlobalSearch.jsx), rendered on the
  right of the SKU tab bar by `TabBar` in [App.jsx](frontend/src/App.jsx) so it
  shows on every SKU page. ⌘K opens it. Searches **SKU items** via the existing
  `POST /api/sku-items/search` (LIKE on sku + name) and **properties** via
  `GET /api/properties`, filtered client-side on name/caption/industry. No new
  endpoints. Selecting an item opens `/sku/items?q=<sku>` (the page now seeds its
  `q` filter from the query string); selecting a property opens that industry's
  Property Manager. Replaces the generator's old ⌘K palette.
- **Submit to helpdesk** moved from the generator's right rail into the account
  menu (top right). Same stub toast.
- **Default industry:** with no `?industry=` in the URL the generator opens on the
  first industry, so its properties are on screen immediately.

No backend or schema change.

---

## CR-009 — Vertical generator, property gates, per-line Books description (2026-07-23)

**Requested:** with 24 properties per industry the generator's horizontal chip
strip was unreadable (truncated captions, wrapping, popover fighting the wrap).
Plus: choose which properties take part in SKU generation, which appear in the
item **name**, and push the full property breakdown into Zoho Books.

- **Vertical property list** replaces the chip strip + floating popover in
  [SKUGeneratorPage.jsx](frontend/src/pages/SKUGeneratorPage.jsx): one row per
  property (arrow · caption · value control · SKU fragment), split into
  *In SKU generation* / *Not in SKU*. Value pickers are native `<select>` /
  `<input type=number>` — the popover, its three effects, three refs and search
  state are gone. The live SKU line, progress bar, validation rail, recent SKUs
  and ⌘K palette are unchanged.
- **In/out transfer**: the ◀ / ▶ button per row and *Remove all* / *Add all* per
  section `PUT /api/properties/:id { activeInSku }`, so the split is **saved per
  industry** and survives a reload. An excluded property contributes no SKU part,
  no name part, no description line, and no `SKUItemValue` — and an excluded
  *required* property can no longer block creation
  ([itemValues.js](functions/skuapi/itemValues.js)).
- **Selective item name**: new `Property.includeInName`, ticked in the Property
  form. The name is those properties' `PropertyValue.name` joined by a **space**
  (was: every filled property, comma-joined). Fallback in `nameFilter()`
  ([store.js](functions/skuapi/store.js)): while no property of the industry is
  flagged, every filled one is used — names never silently go empty.
- **Books description**: `POST /api/sku/generate` now builds one
  `Caption: Value` line per filled property, newline-joined (was `" | "`-joined
  value fragments). `createItem` / `updateItem` write that block to **both**
  `description` (Sales Information) and `purchase_description`
  ([booksApi.js](functions/skuapi/zoho/booksApi.js)). The SKU code already went
  to the Books `sku` field. The generator shows the block verbatim in a new
  *Item & sales description* card; the item edit form is now a `<textarea>`.
- **Tri-state booleans**: `activeInSku` / `includeInName` are null on rows that
  predate this CR and are coerced by `TRIBOOL_COLS` in `out()` so `"false"` (a
  truthy string) can't silently keep a property in the SKU. Covered by
  [test-props.js](functions/skuapi/test-props.js) — `node test-props.js`.
- **Schema:** `Property.activeInSku`, `Property.includeInName` — applied, see the
  [SCHEMA.md](SCHEMA.md) ledger. `SKUItem.description` needed no change (already
  `text`, max 10000).
- **Not done:** item #5 of the request (a PropertyValue that is itself a stocked
  Zoho Books item) — awaiting the requirement from Dhiraj, tracked in
  [TASKS.md](TASKS.md).

---

## CR-008 — Zoho field-mapping UI (2026-07-23, in progress)

**Requested:** stop typing Books custom-field `api_name`s by hand — pick them
from the fields the connected org actually has.

- `booksApi.listItemCustomFields` + `GET /api/zoho/item-custom-fields`
  ([routes/properties.js](functions/skuapi/routes/properties.js)) feed the mapping screen.
- **Open:** the mapping screen itself (dropdown per property) and a live
  round-trip verification — tracked in [TASKS.md](TASKS.md).

---

## CR-007 — Multi-DC Zoho login + phone-registered accounts (2026-07-23)

**Reported:** users outside the home data centre got `invalid_code` on connect;
Zoho accounts registered with a phone number (no email) could not be created.

- **Multi-DC**: the callback's `location` param is forwarded into the token
  exchange, mapped to accounts/API hosts by `dcHosts()`, and stored per user as
  `ZohoToken.dc` — exchange, profile, refresh and Books/Inventory calls all hit
  the right DC ([zoho/auth.js](functions/skuapi/zoho/auth.js), [routes/zohoAuth.js](functions/skuapi/routes/zohoAuth.js)).
- **Identity anchored on ZUID**, not email: email may be absent, so a stable
  per-ZUID placeholder fills the mandatory unique `AppUser.email` column.
- **Refresh-token loop fixed**: when Zoho returns no refresh token and none is
  stored (grant already on file), bounce once through `prompt=consent` instead
  of erroring forever.
- Schema: `ZohoToken.dc` added — see [SCHEMA.md](SCHEMA.md) ledger.

---

## CR-006 — Import: find-or-create PropertyValues for mapped properties (2026-07-23)

**Requested:** imported Books items should link to real property values, not
free text.

- [zoho/import.js](functions/skuapi/zoho/import.js): for a mapped **List**
  property, the Books custom-field value is matched case-insensitively against
  existing `PropertyValue` rows; on a miss a row is created with an
  auto-generated 4-char SKU code. `SKUItemValue.valueId` is then set.
  `Range` properties keep `valueText` only (no value row to match).
- No schema change.

---

## CR-005b — Record-grid standard: explicit edit, filters, pinned pagination (2026-07-03)

New standard for every record grid (saved as memory `record-grid-pattern`): pinned page-level footer with record count + 10/25/50/100 page-size (**25 default**) + First/Prev/Next/Last; toolbar filters built from the distinct values present in the grid; **no row-click edit** — explicit hover pencil + trash instead.

- Shared [GridFooter.jsx](frontend/src/components/GridFooter.jsx) (`usePager`, `<GridFooter>`, `FilterSelect`, `distinct`) + [RowEditButton.jsx](frontend/src/components/RowEditButton.jsx).
- [IndustriesPage.jsx](frontend/src/pages/IndustriesPage.jsx): row click no longer edits; hover pencil opens the edit modal (name link still navigates to properties); Name/Separator value filters; paginated with pinned footer.
- **Properties tab is now its own grid** — new [PropertiesPage.jsx](frontend/src/pages/PropertiesPage.jsx) (previously the tab re-rendered Industries): all org properties with Industry/Name/Caption/Type/SKU Pos/Unit/Required, filters (Industry/Type/Required), sortable, paginated; pencil/industry-link opens that industry's property manager, trash deletes. Backed by new `GET /api/properties` ([routes/properties.js](functions/skuapi/routes/properties.js)) returning all org properties with `industryName`.
- SKU Items already conformed (25 default, pinned footer, first/last, filters) — untouched.

Follow-ups in the same batch: header account **dropdown** (avatar + org name → org details / Switch organization / Log out) replacing the three-box row; sidebar + grid footers fixed at 44px so the bottom bars align; `ADMIN_EMAILS` gained `dsdigitalmind@gmail.com`; **org delete** in the admin panel (`DELETE /admin/orgs/:orgId` — full cascade across all org-scoped tables + ZohoToken, type-the-org-id confirmation in [AddonAdminPage.jsx](frontend/src/pages/AddonAdminPage.jsx)).

---

## CR-005 — Multi-add-on platform + Reserve/De-reserve read path (2026-07-03)

The app becomes one OCTFIS platform hosting multiple Zoho Books add-ons, gated per customer org. Reserve-specific tasks tracked in [RESERVE-TASKS.md](RESERVE-TASKS.md).

### Layout
- SKU Generator collapsed to **one left-nav entry** with tabs ([App.jsx](frontend/src/App.jsx): `TabBar` + `SkuLayout`): `/#/sku/generator | items | industries | properties` (+ `/sku/industries/:id/properties` drill-down). Old paths (`/sku-generator`, `/admin/*`) redirect; generator permalinks keep their query string.
- **Top-right header bar** (`HeaderBar`): org badge + Switch organization + Logout, moved out of the sidebar footer (footer keeps the powered-by line; the dead field-tags branch was deleted).
- Left nav is now the add-on list — `NAV_LINKS` entries carry an `addon` key and render only if `/auth/me`'s `addons` array includes it.

### Add-on entitlements
- New **OrgAddon** table (orgId, addonKey, enabled). Missing row = disabled, except `sku-generator` which defaults ON (`DEFAULT_ON` in [addons.js](functions/skuapi/addons.js)) — zero migration for existing orgs. Keys: `sku-generator`, `reserve`, `cheque-printing`, `label-printing`.
- `requireAddon(key)` middleware gates each add-on's route group ([index.js](functions/skuapi/index.js)). Reserve is mounted before the bare `/api` mounts because their gate middleware runs on any `/api` path that reaches it.
- Super-admin = `ADMIN_EMAILS` env allowlist ([session.js](functions/skuapi/session.js) `isAdmin`/`requireAdmin`). Admin UI at `/#/admin/addons` ([AddonAdminPage.jsx](frontend/src/pages/AddonAdminPage.jsx)) → `GET /admin/orgs`, `POST /admin/org-addons` ([routes/admin.js](functions/skuapi/routes/admin.js)).
- `/auth/me` now returns `addons` (enabled keys for the selected org) + `isAdmin`.

### Reserve/De-reserve — read path (Phase 3 of RESERVE-TASKS.md)
- OAuth scope: re-added `ZohoInventory.fullaccess.all` ([zoho/auth.js](functions/skuapi/zoho/auth.js)). Old tokens lack it → reserve endpoints return `409 reauth_required`, ReservePage shows a "Reconnect Zoho" callout; SKU-only flows unaffected.
- [booksApi.js](functions/skuapi/zoho/booksApi.js): `apiRequest` generalized (books/v3 | inventory/v1, error carries `zohoCode`/`httpStatus`); added `getSalesOrder`, `listSalesOrders`, `listPurchaseOrdersForItem`, `getPurchaseOrder`. New [inventoryApi.js](functions/skuapi/zoho/inventoryApi.js): `getCompositeItem` (BOM), `listWarehouses`, `getItemStock` + 501 write stubs.
- New tables: **ReservationLine** (SO × FG × component: reserved/issued/returned qtys + `zohoDocs` audit JSON) and **ItemStockSnapshot** (per-item B/E/F/G cache + syncedAt).
- [routes/reserve.js](functions/skuapi/routes/reserve.js): SO picker, SO detail, **grid endpoint computing A–I server-side** (`H = max(0, min(A−C−D−G, B))`, `short` flag), manual `POST /sync`. Write actions return honest 501s until the Zoho document mapping arrives (seam: [reserve/zohoDocs.js](functions/skuapi/reserve/zohoDocs.js)).
- [reserve/sync.js](functions/skuapi/reserve/sync.js): sequential rate-limit-friendly snapshot sync of only grid-referenced items; `syncAllOrgs` behind `POST /internal/sync-stock` (SYNC_SECRET header) for a future Catalyst URL cron.
- [ReservePage.jsx](frontend/src/pages/ReservePage.jsx): SO search/picker or `/#/reserve?soId=…` deep link (Books custom-button target), FG selector, last-sync banner + refresh, read-only grid with red shortage rows.

**Deployed** to SKU-GEN-OCTFIS dev; smoke-tested (auth gates, sync secret 401/200). **Not done:** live grid verification against a real SO (needs reserve enabled + Zoho re-consent), write actions (blocked on reference tables — see RESERVE-TASKS.md open items), cron registration.

---

## CR-003 — Item search + grid filters, pagination, collapsible sidebar, OCTFIS branding (2026-07-02)

Groundwork for the upcoming Zoho CRM quotation-search widget (serverless search endpoint + UI), shipped on the SKU Items page first.

### Search & filters
- `POST /api/sku-items/search` ([routes/skuItems.js](functions/skuapi/routes/skuItems.js)) now takes `q` (free-text LIKE on sku+name), `sku` (LIKE on sku only), `type` (exact, validated Trading/Manufacturing) alongside the existing `industryId` + property `filters`. All present clauses AND-combine.
- **Bug fix — ZCQL's LIKE wildcard is `*`, not SQL's `%`.** `%` patterns silently matched nothing. Fixed in the new free-text path and in the pre-existing property text filter in [itemValues.js](functions/skuapi/itemValues.js) (Range-property text search had never matched anything).
- [SKUItemsPage.jsx](frontend/src/pages/SKUItemsPage.jsx): filter bar now holds free-text search, SKU input, Type select, Industry select (moved from header; Import button stays in header) + the existing property-filter chips. Text inputs debounced 300ms.
- Property filters **auto-apply**: list value → chip on select; range → Enter/Apply (the old two-step "+ Add filter" button read as broken and was removed). "✕ Clear filters" button resets everything at once.

### Pagination
- Client-side pagination footer on the items grid: "Showing X–Y of Z records", page-size select (10/25/50/**25 default**/100), first/prev/next/last as icon buttons, page indicator. Pinned at page level below the scroll area (fixed position/width regardless of grid content). Pages the fetched result set (one 300-row ZCQL page); move to server LIMIT/OFFSET when data outgrows it.

### Sidebar
- Collapsible left panel ([App.jsx](frontend/src/App.jsx)): chevron toggle in the logo header (top), collapses 230→64px (icons-only nav with tooltips, footer hidden), state persisted in `localStorage`. Panel is fixed while content scrolls (structural: `body{overflow:hidden}`, pages scroll internally).

### Branding
- Sidebar top: OCTFIS logo (drop file at `frontend/public/octfis-logo.png`; falls back to the "SK" mark until present) + "SKU Studio / powered by OCTFIS Techno LLP". Sidebar footer: "Powered by OCTFIS Techno LLP" line.
- [index.html](frontend/index.html): title "SKU Studio — OCTFIS", favicon → `octfis-logo.png` (relative path — the old absolute `/favicon.svg` 404'd under `/app/` in prod).

### Refresh 404 fix
- Catalyst web hosting has no SPA fallback, so hard refresh on a path URL 404'd. Switched `BrowserRouter` → `HashRouter` (URLs now `/app/#/…`); Zoho OAuth redirects in [zohoAuth.js](functions/skuapi/routes/zohoAuth.js) updated to `/#/connect?...` form.

**Not done (and why):** Catalyst Search integration for free-text — needs console-side column indexing and SKU tokenization is unverified; the documented swap-in when CRM/scale arrives. Server-side pagination — pointless below one ZCQL page.

---

## CR-003b — List UX: click-to-edit + hover delete (2026-07-02, superseded by CR-005b for grids)

Applied one consistent interaction to every list (documented as the standard in memory `list-row-ux-pattern`):
- Row click opens the **Edit modal** (plain lists) or **selects** (master-detail property list, which drives the values panel).
- Delete moved to a **per-row red trash revealed on hover** — shared [RowDeleteButton.jsx](frontend/src/components/RowDeleteButton.jsx), hover-reveal CSS in [index.css](frontend/src/index.css) (`.row-actions` / `.list-row`, touch fallback).
- Toolbars reduced to **Add + Refresh**; all edit/delete handlers now take the row as an argument (no shared `selected`).
- Applied in [SKUItemsPage.jsx](frontend/src/pages/SKUItemsPage.jsx), [IndustriesPage.jsx](frontend/src/pages/IndustriesPage.jsx) (name still links to its properties page), and [PropertyManagerPage.jsx](frontend/src/pages/PropertyManagerPage.jsx) (properties row = select + hover pencil/trash; values row = click-to-edit + hover trash).

---

## CR-001 — SKU editing + Zoho Books value sync & import (2026-05-28)

### #1 — Existing SKUs are editable
- Backend: `PUT /api/sku-items/:id` ([routes/skuItems.js](functions/skuapi/routes/skuItems.js)) updates name/sku/description/type, 409 duplicate guard via `findSkuRowId(..., excludeId)`. Edit re-pushes to Books by `zohoItemId`, keeping `sku` aligned (why `sku` stays a safe correlation key — see #5).
- Frontend: Edit modal on [SKUItemsPage.jsx](frontend/src/pages/SKUItemsPage.jsx) — select a row → Edit (Toolbar) → name/sku/description/type form → `PUT`. (Previously only backend existed; no UI.)

### #2 — "Add properties to generate SKU" message
- [SKUGeneratorPage.jsx](frontend/src/pages/SKUGeneratorPage.jsx) added a `loadingProps` flag so "Loading…" shows only while fetching. When an industry has zero properties the hero reads "Add properties to generate a SKU" and the empty-state card links to the industry's property manager.

### #3 — Property name above the `?` segment
- [SKUGeneratorPage.jsx](frontend/src/pages/SKUGeneratorPage.jsx) each SKU builder segment now renders the property caption as a small visible label *above* the code/`?` (not just the hover tooltip, which is kept too).

### #4 — Reorderable SKU segments
- Properties drag-reorder in [PropertyManagerPage.jsx](frontend/src/pages/PropertyManagerPage.jsx) (`onDrop` rewrites `skuPosition`); SKU generation honors `ORDER BY skuPosition`. Change the order (e.g. Brand before Weight) by dragging in the property manager.

### #5 — Books value sync + correlation + import  ← this session

**Decisions:** correlation key = `sku` + `zohoItemId` fast-path (no dedicated Books field). Import is **create-only** — existing local items are skipped, never overwritten.

**A. Value sync (push property values → Books item custom fields)**
- `Property.zohoCfApiName` holds the target Books custom-field `api_name`.
- New `buildZohoCustomFields(catalyst, skuItemId)` in [itemValues.js](functions/skuapi/itemValues.js) reads `SKUItemValue`, joins each to its `Property.zohoCfApiName`, and returns `[{ api_name, value: valueText }]` for mapped props only.
- [zoho/push.js](functions/skuapi/zoho/push.js) now passes those custom fields to create/update.
- [zoho/booksApi.js](functions/skuapi/zoho/booksApi.js) `createItem`/`updateItem` forward `custom_fields`.

**B. Correlation identifier**
- No new field. Import matches Books items by `zohoItemId` first, then `sku`. Holds because every local edit re-pushes by `zohoItemId`, keeping the Books `sku` aligned. (Only breaks if a SKU is edited directly in Books *and* the item was never pushed from here.)

**C. Import (Books → SKU generator)**
- New [zoho/import.js](functions/skuapi/zoho/import.js) `importFromBooks(catalyst, industryId)`:
  - `listItems()` pages all Books items.
  - Match by `zohoItemId`/`sku` → skip. New + has a sku → insert `SKUItem` (type defaults to `Trading`), store `zohoItemId`.
  - Reverse-map: per new item, fetch detail (`getItem`, since the list endpoint omits custom fields) and write `SKUItemValue` rows for custom fields whose `api_name` matches a `zohoCfApiName` in the chosen industry (`valueText` only — no PropertyValue id recoverable from free text).
  - Returns `{ total, imported, skipped, valuesMapped, errors }`.
- Route `POST /api/sku-items/import-zoho` ({ industryId }) in [routes/skuItems.js](functions/skuapi/routes/skuItems.js).
- `listItems` / `getItem` added to [zoho/booksApi.js](functions/skuapi/zoho/booksApi.js); fixed its URL builder to use `&` vs `?` correctly for query params.

**UI**
- [PropertyManagerPage.jsx](frontend/src/pages/PropertyManagerPage.jsx): "Zoho Books custom field (api_name)" input on the add/edit property form (the previously deferred field).
- [SKUItemsPage.jsx](frontend/src/pages/SKUItemsPage.jsx): "Import from Zoho" button in the header, enabled once an industry filter is selected; toasts the import report.

**Checks**
- `buildZohoCustomFields` covered by a runnable assert test (mapped-only + empty cases).
- All changed backend modules `require()` clean.

**Not done (and why)**
- Dedicated correlation custom field — unneeded under the `sku`+`zohoItemId` decision. Add only if SKUs start being edited directly inside Books.
- Two-way overwrite / conflict UI on import — out of scope for create-only.
- Range values aren't recoverable on import (free-text Books value → `valueText` only, no PropertyValue id). *(Lifted for List properties by CR-006.)*

---

## Pre-tracker history (reconstructed from git, no CR write-up)

- **CR-004 — Org switcher + Books-only OAuth scopes** (2026-07-03, `8c360ae`):
  header org switcher; OAuth scopes trimmed to Books only (later partially
  re-widened by CR-005, which re-added `ZohoInventory.fullaccess.all`).
- **CR-002 — Migrate backend to Catalyst Data Store** (2026-06-30, `fb730e0`):
  Postgres/Prisma → Catalyst Data Store + first deploy to `SKU-GEN-OCTFIS`.
  `backend/prisma/schema.prisma` kept as a shape reference only.
- Earlier: `e0f5cf5` Zoho Books integration + modular backend (2026-05-28),
  `183a123` initial SKU generator (2026-05-24).
