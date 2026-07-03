# Change tracker

Running log of feature work, newest first. One section per request batch.

---

## Batch: Record-grid standard — explicit edit, filters, pinned pagination (2026-07-03)

New standard for every record grid (saved as memory `record-grid-pattern`): pinned page-level footer with record count + 10/25/50/100 page-size (**25 default**) + First/Prev/Next/Last; toolbar filters built from the distinct values present in the grid; **no row-click edit** — explicit hover pencil + trash instead.

- Shared [GridFooter.jsx](frontend/src/components/GridFooter.jsx) (`usePager`, `<GridFooter>`, `FilterSelect`, `distinct`) + [RowEditButton.jsx](frontend/src/components/RowEditButton.jsx).
- [IndustriesPage.jsx](frontend/src/pages/IndustriesPage.jsx): row click no longer edits; hover pencil opens the edit modal (name link still navigates to properties); Name/Separator value filters; paginated with pinned footer.
- **Properties tab is now its own grid** — new [PropertiesPage.jsx](frontend/src/pages/PropertiesPage.jsx) (previously the tab re-rendered Industries): all org properties with Industry/Name/Caption/Type/SKU Pos/Unit/Required, filters (Industry/Type/Required), sortable, paginated; pencil/industry-link opens that industry's property manager, trash deletes. Backed by new `GET /api/properties` ([routes/properties.js](functions/skuapi/routes/properties.js)) returning all org properties with `industryName`.
- SKU Items already conformed (25 default, pinned footer, first/last, filters) — untouched.

Follow-ups in the same batch: header account **dropdown** (avatar + org name → org details / Switch organization / Log out) replacing the three-box row; sidebar + grid footers fixed at 44px so the bottom bars align; `ADMIN_EMAILS` gained `dsdigitalmind@gmail.com`; **org delete** in the admin panel (`DELETE /admin/orgs/:orgId` — full cascade across all org-scoped tables + ZohoToken, type-the-org-id confirmation in [AddonAdminPage.jsx](frontend/src/pages/AddonAdminPage.jsx)).

---

## Batch: Multi-add-on platform + Reserve/De-reserve read path (2026-07-03)

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

## Batch: Item search + grid filters, pagination, collapsible sidebar, OCTFIS branding (2026-07-02)

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

## Batch: List UX — click-to-edit + hover delete

Applied one consistent interaction to every list (documented as the standard in memory `list-row-ux-pattern`):
- Row click opens the **Edit modal** (plain lists) or **selects** (master-detail property list, which drives the values panel).
- Delete moved to a **per-row red trash revealed on hover** — shared [RowDeleteButton.jsx](frontend/src/components/RowDeleteButton.jsx), hover-reveal CSS in [index.css](frontend/src/index.css) (`.row-actions` / `.list-row`, touch fallback).
- Toolbars reduced to **Add + Refresh**; all edit/delete handlers now take the row as an argument (no shared `selected`).
- Applied in [SKUItemsPage.jsx](frontend/src/pages/SKUItemsPage.jsx), [IndustriesPage.jsx](frontend/src/pages/IndustriesPage.jsx) (name still links to its properties page), and [PropertyManagerPage.jsx](frontend/src/pages/PropertyManagerPage.jsx) (properties row = select + hover pencil/trash; values row = click-to-edit + hover trash).

---

## Batch: SKU editing + Zoho Books value sync

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
- Range values aren't recoverable on import (free-text Books value → `valueText` only, no PropertyValue id).
