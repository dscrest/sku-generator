# Change requests & change log

**Every change starts here.** A change request gets a CR id, a section in this
file (newest first) with what was asked, what shipped, and what was deliberately
not done. Schema effects go to [SCHEMA.md](SCHEMA.md); resulting work goes to
[TASKS.md](TASKS.md); structural effects go to [ARCHITECTURE.md](ARCHITECTURE.md).

| CR | Date | Title | Status |
|----|------|-------|--------|
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
