# SKU Generator — System Architecture

A web app for building structured SKU codes per industry from configurable
properties/values, storing the generated items, and syncing them to Zoho Books.

## Project docs (keep these current)

| Doc | Holds | Update when |
|-----|-------|-------------|
| [CHANGES.md](CHANGES.md) | Change requests (CR-nnn): what was asked, what shipped, what was skipped | **Every** change — open the CR before coding |
| [SCHEMA.md](SCHEMA.md) | Canonical DB schema + schema-change ledger | Any table/column/type/constraint change |
| [TASKS.md](TASKS.md) | The single task list (open / deferred / done) | Work starts, finishes, or gets deferred |
| ARCHITECTURE.md (this file) | System shape: stack, API surface, modules, pages, config | Routes, modules, pages, or env vars change |
| [WORKORDER.md](WORKORDER.md) | Work Order module: A–I formulas, warehouse map, per-org setup (cron + Books webhooks), role SOPs | Work Order behaviour or setup changes |
| [RESERVE-TASKS.md](RESERVE-TASKS.md) | **Superseded by WORKORDER.md** — kept for the CR-005 history | — |
| [ZOHO_AUTH.md](ZOHO_AUTH.md) | Zoho OAuth setup & troubleshooting | OAuth flow, scopes, or redirect URIs change |

## Stack & topology

| Layer | Tech | Where |
|-------|------|-------|
| Frontend | React 18 + Vite + React Router, plain CSS vars | `frontend/`, served at `/app/` on Catalyst |
| Backend | Express on Catalyst **Advanced I/O Function** (`node18`, 256MB) | `functions/skuapi/` |
| Data | Catalyst **Data Store** (NoSQL-ish tables, queried with ZCQL) | Catalyst project `SKU-GEN-OCTFIS` |
| External | Zoho Books v3 + Inventory v1 + CRM v6 read (one OAuth grant) | `functions/skuapi/zoho/` |

The function is mounted by Catalyst at `/server/skuapi`. `index.js` strips that
prefix so routes match local dev. In dev, Vite proxies `/server/skuapi` →
`http://localhost:3001`.

`backend/prisma/schema.prisma` is the **legacy Postgres schema** — kept only as
the canonical shape reference. The live data layer is Catalyst Data Store; there
is no Postgres in production.

```
Browser (React @ /app)
   │  fetch /server/skuapi/...
   ▼
Catalyst API Gateway ──► Advanced I/O Function "skuapi" (Express)
   │                         │ zcql() / datastore()
   │                         ▼
   │                      Catalyst Data Store
   └─ OAuth redirect ─► Zoho Accounts ──► Zoho Books API (item sync)
```

### SPA inside a Zoho Books Web Tab (CR-152)

Catalyst static hosting (`/app/`) stamps `X-Frame-Options: DENY`, so the same
build is *also* served from the function at `/server/skuapi/app/`
(`npm run build` in `frontend/` copies `dist/` → `functions/skuapi/app/`,
gitignored) behind the shared `frameable` CSP middleware in `index.js`
(`frame-ancestors` = Zoho DCs). Works unchanged because Vite `base: './'`,
HashRouter and an absolute axios base URL make the bundle location-agnostic.
Session cookie is `SameSite=None; Secure; Partitioned` (CHIPS) so it exists
inside the frame without being sendable cross-site. Inside a frame the login
page opens Zoho OAuth in the `sku-auth` popup (accounts.zoho refuses to render
framed); App.jsx in the popup hands the session token back over the
origin-checked postMessage handshake and `POST /auth/adopt?t=` sets the cookie
in the frame's partition. The Web Tab URL must carry the trailing slash: the
bundle's asset URLs are relative and resolve against the browser's address
bar. The gateway itself forwards `/app` and `/app/` identically (as `/app`),
so `index.html` is an explicit `GET /app` route — express.static's directory
index never fires and a slash redirect would loop.

### CRM Product Configurator widget (CR-181)

`functions/skuapi/configurator.html`, served at `GET /configurator` (same
`serveWidget` / `frame-ancestors` path as `/widget`; CRM hosting **External**,
detail-page button on Quotes + Deals). Guided flow: Product (= Industry) →
Feed data → `POST /api/recipe/sizing/select` → pick a model (fills the
`series` / `model` questions) → remaining questions → `/api/sku/generate` →
existing item (duplicate SKU, loaded via `/api/sku-items/search`) or new item
(`/api/sku/create-item` + `/api/sku-items/:id/push-zoho`) → cart → Quote.
Generic by data: questions are the industry's Properties, sizing inputs/outputs
are found by `Property.sizingRole`; an industry without roles renders as a plain
question list. Needs both `sku-generator` and `recipe-engine` add-ons.
A new SKU is always saved to the SKU master; the per-line **Push to Books**
switch (default from `OrgSetting cfgNoAutoPush`, CR-184) decides whether it is
pushed at once or later from the SKU Items page. Same switch in `widget.html`.
**Component items (CR-194).** Once the SKU is ready the widget posts every
answer to `POST /api/recipe/component-map/resolve` and lists the matched
component items under the SKU — display only, the quote still gets one valve
line. The rule is data, not code: `ComponentMap` rows ("when these answers hold,
component X is item Y × qty", most conditions wins — `recipe/componentMap.js`),
maintained in **Product Configurator → Component Map**. The same matcher feeds
`zoho/push.js` `buildAssociatedItems`, so a pushed Manufacturing item's Books
composite BOM = flagged-value items + mapped components; mapped items join the
generator-owned pool, so a re-push swaps them and leaves manual lines alone.
Map conditions use SKU-active questions only — duty answers are not stored on
the item. `SizingModel.recipeCode` is still unread.
Boot/auth, cart and quote write-back are a **verbatim copy** of `widget.html`
(kept separate so the live Quote Maker is never at risk) — a fix to that shared
logic must be applied to both files until they are extracted.

### CRM quote widget (CR-108/109)

One real widget file: `functions/skuapi/widget.html`, served at `GET /widget`
with a `frame-ancestors` CSP (Zoho DCs only — Catalyst static hosting stamps
`X-Frame-Options: DENY`, functions don't). The CRM widget is configured with
hosting **External** pointing straight at that URL — widget changes go live on
`catalyst deploy`, no CRM upload. `crm-widget/` (the old zip-upload plugin) is
**legacy/unused**; its `app/widget.html` is kept only as a `location.replace`
stub to the hosted URL in case a packed widget ever comes back (never wrap it
in an iframe — the Zoho SDK handshakes with `window.parent`). Auth is
cookie-free (`?t=` session token via postMessage handoff). Widget item-create
routes through the generator engine
(`/api/sku/generate` → `/api/sku/create-item` → `/api/sku-items/:id/push-zoho`)
so property values persist and the item lands in Books; the CRM Product is
created at push-to-quote time via the JS SDK. The Product also gets
`Item_Source` = the org's label for the item type (SKU Settings `typeLabels`,
CR-180: `Trading` → Direct Purchase, `Manufacturing` → In-House Manufacturing)
whenever the org's Products module has that field; cart lines show the same
label as a badge.

### Books packing-list widget (CR-131)

Same serving pattern (shared `serveWidget()` in index.js):
`functions/skuapi/packing.html` at `GET /packing`. Books has **no
External-hosting option** and a loader stub does not work (Books modal
widgets stay dark until the zip-hosted page itself completes
`ZFAPPS.extension.init()`), so `books-widget/dist/packinglist.zip` ships a
**self-contained copy** of packing.html as `app/widget.html` with
`plugin-manifest.json` (`service: FINANCE`, locations `invoice.details.button`
+ `salesorder.details.button`, `widget_type: modal`). packing.html is
origin-independent (absolute `CATALYST` URLs, text/plain bodies) so the same
file runs from `/packing` or from Zoho's widget hosting — after editing it,
re-copy + re-zip + re-upload (recipe in TASKS.md CR-131). Uses the Books
ZFAPPS SDK only for record context (invoice → salesorder fallback), resize and
close; data + persistence go through skuapi (`/api/packing`, no addon gate)
with the same `?t=` token dance. Plans persist in `PackingList`/`PackingBox`;
print goes through an off-screen iframe srcdoc: the Export/Domestic sheet is A4
portrait, split by `paginateSheet()` into fixed-height pages (repeated header,
stretch-to-bottom fill, page numbers, closing block on the last page — CR-188);
stickers are one A4-landscape page per package. Packages number per type
(`kindNo`/`kindTotal`, CR-187).

Standalone mode (CR-134): `?woId=`/`?soId=`/`?invoiceId=` query params skip
ZFAPPS entirely — the Work Order page's "Print Packing List" ⋯ action opens
`/packing?woId=<id>` in a new tab (same-origin cookie auth, silentAuth
fallback). A WO with a linked SO shares the `so:<id>` plan with the Books
widget; without one the plan is keyed `wo:<ROWID>` with lines from the WO's
finished goods and invoice no/date typed manually.

---

## Database

**Canonical schema lives in [SCHEMA.md](SCHEMA.md)** — tables, columns, tenancy
rules, and the schema-change ledger. Summary only here:

| Group | Tables |
|-------|--------|
| Tenancy & identity | `AppUser`, `ZohoToken`, `OrgAddon` |
| SKU catalog | `Industry`, `Property`, `PropertyValue`, `SKUItem`, `SKUItemValue` |
| Reserve / stock | `ReservationLine`, `ItemStockSnapshot` |
| Work Order — config | `OrgSetting` |
| Work Order — BOM | `WorkOrder`, `WorkOrderFG`, `WorkOrderLine`, `BomRevision`, `CompositeItemCache` |
| Work Order — material | `MaterialTxn`, `MaterialTxnLine` |
| Work Order — purchase | `PurchaseRequest`, `PurchaseRequestLine` |
| Work Order — governance | `Approval`, `AlertLog`, `ActivityLog` |

Every business table except `AppUser` carries `orgId` (the Zoho Books org) and is
read through `orgClause()` / `ownsRow()` in `store.js`. No DB-level relations —
cascades are hand-written in code.

---

## API

Base path in production: `/server/skuapi`. All JSON. CORS is permissive (`*`).

### App auth — `routes/auth.js` (mounted `/auth`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/register` | Create an AppUser (email + password, scrypt-hashed) |
| POST | `/auth/login` | Verify password → signed session cookie (`sku_session`, 30d) |
| POST | `/auth/logout` | Clear the session cookie |
| GET | `/auth/me` | Current user + selected org + `addons` (enabled keys) + `perms` (granted permission keys, `["*"]` = unrestricted) + `isAdmin` |

Sessions are stateless: `base64url({uid,iat}).HMAC-SHA256` — no session table.
`requireAuth` gates everything under `/api` and `/admin`; `requireOrg` then
pins `req.orgId` from the user's ZohoToken.

**Per-user permissions (CR-120, `perms.js`):** after `requireAddon` (org
bought the module), `requirePerm(key)` / `prefixPerm(map)` check the user's
grants — union of their `Role.perms` via `UserRole`, sub-page keys
(`PERM_KEYS`), 60s cache. `ADMIN_EMAILS` super-admins and orgs with zero
roles resolve to `["*"]` (lockout backstops). Managed at `/api/access`
(role CRUD + assignment, behind the `users.manage` key), UI at `/settings/users` (CR-137).

### Users & Roles — `routes/access.js` (mounted `/api/access`, gated by `requirePerm("users.manage")`)
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/access/roles` | List / create org roles (`perms` ⊆ `PERM_KEYS`) |
| PUT/DELETE | `/api/access/roles/:id` | Update / delete (hand-cascades UserRole rows) |
| GET | `/api/access/users` | Org users (ZohoToken ∪ UserRole union) with `roleIds` |
| PUT | `/api/access/users/:userId/roles` | Full-replace the user's role assignments |

### Grid prefs — `routes/gridPrefs.js` (mounted `/api/grid-prefs`, any authed org user, no addon/perm gate)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/grid-prefs/:gridKey` | Org-wide column layout `{order, hidden}` for one grid |
| PUT | `/api/grid-prefs/:gridKey` | Save layout (column chooser Apply) — shared by all org users |

### Industries — `routes/industries.js` (mounted `/api/industries`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/industries` | List all industries (ordered by name) |
| POST | `/api/industries` | Create. Body: `{ name, skuSeparator? }` |
| PUT | `/api/industries/:id` | Update name/separator |
| DELETE | `/api/industries/:id` | Delete + manual cascade of its Properties and PropertyValues |

### Properties — `routes/properties.js` (mounted `/api`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/industries/:id/properties` | Properties of an industry (ordered by `skuPosition`) |
| GET | `/api/properties` | All properties of the org, each with `industryName` (drives the Properties grid) |
| GET | `/api/zoho/item-custom-fields` | Books item custom fields of the connected org — feeds the field-mapping picker (CR-008) |
| POST | `/api/properties` | Create. Requires `name, caption, valueType, skuPosition, industryId` |
| PUT | `/api/properties/:id` | Partial update |
| DELETE | `/api/properties/:id` | Delete + cascade its PropertyValues |

### Property values — `routes/propertyValues.js` (mounted `/api`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/properties/:id/values` | Values of a property (ordered by `displayValue`) |
| GET | `/api/property-values/linked` | Values with a `zohoItemId`, plus property/industry names — the "Books items" tracking grid (CR-026) |
| POST | `/api/property-values` | Create. Requires `displayValue, name, sku, propertyId`. `createAsItem:true` best-effort creates a Books item (SKU = uppercased name, CR-163 — Books orgs with "SKU mandatory" reject SKU-less items with code 2112) + stores `zohoItemId` (CR-026) |
| PUT | `/api/property-values/:id` | Partial update; toggling `createAsItem` true best-effort creates the Books item |
| DELETE | `/api/property-values/:id` | Delete |

> **Clubbing (CR-025):** properties sharing a non-empty `Property.clubKey`
> concatenate their SKU codes with no separator into one segment; `POST
> /api/sku/generate` groups by `clubKey`, joining within a club with `""` and
> between segments with the industry separator.

### SKU generation — `routes/sku.js` (mounted `/api/sku`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sku/generate` | **Preview only.** Body `{ industryId, selectedValues, excludeItemId? }`. Assembles `{ sku, name, description, missingRequired[], duplicate }` without saving (`excludeItemId` keeps an edited item from being its own duplicate — CR-030). Validates Range bounds. Skips properties with `activeInSku = false`; `name` = the `includeInName` properties, space-joined; `description` = one `Caption: Value` line per filled property |
| POST | `/api/sku/create-item` | Persist a SKUItem. Gates on required props + SKU uniqueness, saves SKUItemValue rows, fires best-effort Zoho push. Body `{ name, sku, description, type, industryId, selectedValues }` |
| POST | `/api/sku/update-item` | Edit-in-generator save (CR-030). Body `{ itemId, name, sku, description, selectedValues }` (type not editable). Replaces the item's SKUItemValue rows; a Books-linked item **auto-pushes** (the one exception to CR-021) — a Books failure returns `zohoWarning`, never fails the save |

`selectedValues` is `{ propertyId: value }` where `value` is a PropertyValue
ROWID (List props) or a raw number string (Range props).

### SKU items — `routes/skuItems.js` (mounted `/api/sku-items`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sku-items?industryId=` | List items (optionally filtered), newest first, each with `industry.name` |
| POST | `/api/sku-items/search` | AND-combined search. Body `{ industryId?, q?, sku?, type?, filters:[{propertyId, valueId?, text?}] }` — `q` = LIKE on sku+name, `sku` = LIKE on sku, `type` = exact. NB: ZCQL LIKE wildcard is `*`, not `%` |
| POST | `/api/sku-items` | Direct create (no generation) + Zoho push |
| PUT | `/api/sku-items/:id` | Update (400 on a type change once pushed — CR-029) |
| DELETE | `/api/sku-items/:id` | Delete + cascade its SKUItemValue rows |
| GET | `/api/sku-items/:id/values` | Item + stored selections (`{ propertyId: valueId \| rangeText }`) — feeds the generator's edit mode (CR-030) |
| POST | `/api/sku-items/:id/push-zoho` | Manual (re)push a single item to Zoho Books |
| POST | `/api/sku-items/backfill-values` | One-shot, idempotent backfill of SKUItemValue for legacy items by reverse-matching SKU tokens |
| POST | `/api/sku-items/import-zoho` | Import new items from Zoho Books into an industry. Body `{ industryId }`. Create-only — items already linked (by `zohoItemId`, then `sku`) are skipped. Reverse-maps Books custom fields → SKUItemValue via `zohoCfApiName`. Returns `{ total, imported, skipped, valuesMapped, errors }` |
| POST | `/api/sku-items/import` | Bulk sheet import (CR-092/127). Body `{ industryId, rows, format? }` — rows parsed client-side. Default format = app template (property captions, `importItems.js`); `format: "books"` = Zoho Books item sheet (`booksImport.js`: fixed columns → `SKUItem.booksData` JSON, `"<caption> (Custom Field)"` → properties; provided SKU kept, blank SKU generated via assemble+series; CR-189: unknown List-property cells find-or-create a `PropertyValue` with an auto code, `Item ID` → `zohoItemId` with link-first dedupe, result carries `valuesCreated`). When the org's `skuAutoPushImport` setting is on, each created row is pushed sequentially; results carry `pushed`/`pushError` |
| GET/PUT | `/api/sku-items/settings` | SKU-module org settings (`OrgSetting` via the generic workorder/store helpers). Keys: `skuAutoPushImport` → `{ autoPushImport }` (CR-127); `skuSeriesMode` (`off`/`continuous`/`params`) + `skuSeriesPad` → `{ seriesMode, seriesPad }` (CR-136 — org-wide numerical series; GET resolves the legacy per-industry `seriesStart` fallback when mode unset). UI: SkuSettingsPage (Settings hub → SKU Settings → SKU Series, CR-137) |

### CRM — `routes/crm.js` (mounted `/api/crm`, not add-on gated)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/crm/deal/:id` | Read-only Zoho CRM Deal (v6 `GET /Deals/{id}` via `zoho/crmApi.js`) for the "CRM Info" card on the generator page. Needs the `ZohoCRM.modules.READ` scope → `409 reauth_required` if the grant predates it; `404 not_found` if the deal is gone. Opened from a CRM custom link button: `/#/sku/generator?dealId=<id>` (CR-024) |
| GET | `/api/crm/deal/:id/quotes` | Quotes related to a deal (v6 related-records, explicit `fields` list) for the estimate page's picker. Always 200 + array — empty means the deal has no quotes (CR-032) |
| GET | `/api/crm/quote/:id` | Full quote incl. `Quoted_Items` subform for the estimate sheet (`/#/estimate?dealId=…`, `EstimatePage.jsx` + `estimateParser.js`). Same reauth/404 semantics as `/deal/:id` (CR-032) |
| GET, POST/PUT/DELETE | `/api/crm/estimate-terms`, `…/templates[/:id]`, `…/bank` | Org-wide quote T&C (CR-192). GET → `{ templates:[{id,name,terms}], bank }` (empty = never saved, client uses built-in seeds). Template CRUD + shared bank table need the `estimate` perm; JSON in `OrgSetting.settingText` (`estimateTpl` rows, `estimateBank`) |

### Admin — `routes/admin.js` (mounted `/admin`, requireAuth + requireAdmin via `ADMIN_EMAILS`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/orgs` | All orgs ever seen (from ZohoToken) with resolved add-on flags |
| POST | `/admin/org-addons` | Upsert one entitlement. Body `{ orgId, addonKey, enabled }` |
| DELETE | `/admin/orgs/:orgId` | Permanently delete an org: all rows in every org-scoped table incl. ZohoToken (disconnects its users; AppUser logins survive) |

### Work Order — `routes/workorder.js` (mounted `/api/wo`, gated by `requireAddon("work-order")`)
| Method | Path | Purpose |
|--------|------|---------|
| GET/PUT | `/api/wo/settings` | Org config (warehouses, alert recipients, thresholds, number prefixes) + live warehouse list |
| GET | `/api/wo/sales-orders?q=` · `/api/wo/so/:soId` | SO picker + detail for the create flow |
| GET | `/api/wo/vendors` | Books vendors for the Purchase Request screen |
| GET | `/api/wo/items?q=` | Books-item typeahead for the WO Items tab (CR-031) — only existing Books items |
| GET | `/api/wo/composites` | All Books composite items — the global BOM page's grid (CR-028) |
| GET | `/api/wo/composites/:itemId/bom` | Composite BOM, cache-first (`?refresh=1` forces Zoho) |
| POST | `/api/wo/composites/:itemId/bom/preview` | Sheet vs composite diff; unmatched rows resolved against Books, rest → `missing` |
| POST | `/api/wo/composites/:itemId/bom/apply` | Write `mapped_items` to Books; `createMissing` creates plain component items first |
| POST | `/api/wo/composites` | Create a new Books composite item from a sheet |
| POST | `/api/wo/composites/import` | Bulk import of a Books composite-items export — update matched composites, create unknown ones |
| GET/POST | `/api/wo` | List work orders / create from an SO (seeds each FG's BOM from its composite item) |
| GET/PUT | `/api/wo/:id` | Work order with FGs, purchase requests, transactions, approvals. GET also re-syncs the SO-derived header fields (`soFields.js`, CR-110) from Books into the row — one Books call, stored values serve if it fails |
| POST | `/api/wo/:id/status` | Status transition, incl. the QC gate (Rejected → back to In Progress). Entering Ready for Machining / Fitting in Progress needs the machining / fitting date — `400 {code:"needDate", fields}` until the client resends them (CR-170). `Completed` is refused (409) while any line has reserved qty > 0 — issue or de-reserve first (CR-151); it then auto-returns over-issued material to Main via `txn.autoReturnOnComplete` — a Zoho failure aborts the transition (CR-031) |
| POST | `/api/wo/:id/lines` | Single-op item edit during production (CR-031): `add`/`setQty`/`remove`/`replace` + reason. Internal only — never writes to the composite item or SO; committed lines are kept at qty 0 for the completion sweep; locked at Completed/Closed/Cancelled |
| GET | `/api/wo/:id/bom` | Frozen BOM lines + revision history |
| POST | `/api/wo/:id/fg/:fgId/assemble` | `{ qty, prefix, components?: [{ itemId, tracking }] }` (CR-176 picks) → Zoho Inventory bundle at any shop-floor stage once the FG is fully issued (`wo.action.assemble`, CR-126/150/172; 409 otherwise); driven from Details → Assembly; returns `bundleNumber`, `serials[]`, `serialRange`, `assembledQty` |
| POST | `/api/wo/:id/bom/preview` | Diff vs the composite item or an uploaded sheet — writes nothing |
| POST | `/api/wo/:id/bom/apply` | Apply the diff, record a `BomRevision`, push back to the composite item |
| GET | `/api/wo/:id/grid?fgId=` | The A–I grid — **read entirely from our tables, zero Zoho calls** |
| POST | `/api/wo/:id/txn` | Reserve / de-reserve / issue / return (`confirm:true` drafts + confirms in one call) |
| POST | `/api/wo/txn/:txnId/confirm` \| `/cancel` | Confirm writes the Zoho Transfer Order; confirmed cannot be cancelled |
| POST | `/api/wo/:id/recompute` | Rebuild the running balances from the ledger |
| GET | `/api/wo/:id/shortfall` | Shortfall rows pre-filled as purchase-request lines |
| GET/POST | `/api/wo/:id/purchase-request(s)` | List / raise a purchase request |
| PUT | `/api/wo/pr-line/:lineId` | Set vendor + quantity on a line |
| POST | `/api/wo/pr/:prId/confirm` | One **draft PO per vendor**, delivery = Main warehouse (CR-170), required qty SO-referenced, over-ordered excess as a separate SO-less extra line |
| GET | `/api/wo/purchase/shortfall-by-item` | Shortfall of **every open WO** aggregated per raw material, with per-WO breakdown (CR-023) |
| POST | `/api/wo/purchase/raise` | Item-wise raise: selected items + one vendor → **consolidated cross-WO PR + one grouped draft PO** (CR-023) |
| GET | `/api/wo/purchase-orders` | Orders grid: every Books PO, app-created ones stamped with PR/WO, `locked` when received/billed |
| GET/PUT/DELETE | `/api/wo/po/:poId` (+ POST `/status`) | Live Books PO detail · edit lines · delete (Books-only POs too) · issue/cancel |
| POST | `/api/wo/:id/approve` · GET `/invoice-gate` | Two-level approval; the gate blocks invoicing until both |
| GET | `/api/wo/reports/so-bom` · `/reports/shortfall` · `/reports/item-pipeline` · `/reports/reconciliation?workOrderId=` | ZCQL-only reports (reconciliation: required vs reserved/issued/returned/leftover per item, per-WO or org-wide — CR-031) |
| GET | `/api/wo/:id/history` · POST `/api/wo/refresh` | Audit trail · manual reconcile |

`POST /internal/reconcile` (nightly cron) and `POST /internal/zoho-event`
(Books workflow-rule webhook sink) are in `index.js`, both `X-Sync-Secret`
guarded. Setup procedure: [WORKORDER.md](WORKORDER.md).

### Reserve — `routes/reserve.js` (mounted `/api/reserve`, gated by `requireAddon("reserve")`) — superseded by `/api/wo`
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/reserve/sales-orders?q=` | SO picker (Books list) |
| GET | `/api/reserve/so/:soId` | SO header + line items (FG selector) |
| GET | `/api/reserve/grid?soId=&fgItemId=` | BOM ⋈ snapshot ⋈ ReservationLine with A–I computed server-side |
| POST | `/api/reserve/sync` | Manual stock refresh for this org's snapshot items |
| POST | `/api/reserve/(actions)` | 501 until Phase 4 (see RESERVE-TASKS.md) |

`POST /internal/sync-stock` (in `index.js`, `X-Sync-Secret` header = `SYNC_SECRET`) syncs all reserve-enabled orgs — the future cron target.

Old-scope tokens (pre-Inventory) make reserve endpoints return `409 {error:"reauth_required"}` — the UI offers a Zoho reconnect; SKU flows keep working.

### Product Configurator (was Recipe Engine) — `routes/recipe.js` (mounted `/api/recipe`, gated by `requireAddon("recipe-engine")`, CR-104)
Reusable recipe/configuration engine — recipes (versioned, Draft-only writable)
compose a main ERP product from components with selectable materials and
configurable cost elements; quotations freeze an immutable JSON snapshot.
Costing math lives in `recipe/calc.js` (pure, `--selftest`); demo data in
`recipe/seedData.js`. Server owns all pricing — the UI never computes cost.

| Method | Path | Purpose |
|--------|------|---------|
| CRUD | `/api/recipe/materials(/:id)` | Rates master (delete 409s when referenced; use Inactive) |
| GET | `/api/recipe/cost-elements` | Per-org cost columns (lazy-seeds CASTING/MACHINING/DRILLING/ASSEMBLY) |
| GET | `/api/recipe/products` | Thin SKUItem list for the wizard (independent of sku-generator gate) |
| CRUD | `/api/recipe/recipes(/:id)` + `/components` + `/options` | Recipe builder; every write `assertDraft`-guarded (published = immutable 409) |
| PUT | `/api/recipe/recipes/:id/component-order` | Drag-and-drop reorder |
| POST | `/api/recipe/recipes/:id/publish` \| `/new-version` · GET `/versions` | Publish supersedes prior published of same code; new-version deep-copies to Draft |
| POST | `/api/recipe/recipes/:id/calculate` | Cost/price for a selection (wizard review + builder Test tab; nothing saved) |
| GET/POST | `/api/recipe/quotations(/:id)` · POST `/:id/convert` | Create = recompute + freeze snapshot + `QTN-` number; convert → `Order` |
| POST | `/api/recipe/seed-demo` | Idempotent RAVS150 demo (12 materials + published recipe) |
| GET/POST/PUT/DELETE | `/api/recipe/sizing-models(/:id)` | Product Configurator sizing master (`SizingModel`, CR-181); perm `recipe.sizing` |
| POST | `/api/recipe/sizing/select` | `{industryId, tph, bd, rpm, group}` → `recipe/sizing.js` `selectModels`: `reqCap`, per-series best fit (+ one size up, ties, `tooBig`); options carry the `model`/`series` question value ids. Perm `recipe.configure` |
| POST | `/api/recipe/seed-rav` | Idempotent RAV starter: Industry + 26 questions + values + 43 sizing models (`recipe/seedData.js`), bulk inserts |
| GET | `/api/recipe/books-items?q=` \| `/books-composites` | Books lookups (CR-143): material-link typeahead; composite picker for first push |
| POST | `/api/recipe/recipes/:id/push-books` | Create/overwrite the linked Books composite's `mapped_items` from the recipe's default BOM (`bomLines` in `recipe/calc.js`); link stored on `RecipeTemplate.booksCompositeItemId`, works on Published recipes (no `assertDraft`) |

Frontend: `/recipe/*` (`RecipeLayout` in `App.jsx`) — `configure` (5-step sales
wizard), `quotations` (+ `/:id` snapshot, `/:id/mfg` manufacturing requirement),
`recipes` (+ `/:id` builder: Components / Materials & costing / Test / Versions),
`materials`.

### Zoho OAuth — `routes/zohoAuth.js` (mounted `/auth/zoho`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/zoho` | Redirect to Zoho consent screen |
| GET | `/auth/zoho/callback` | OAuth callback → exchange code (forwarding the `location`/DC param), auto-select org if only one, redirect to frontend |
| POST | `/auth/zoho/exchange` | Exchange a code from the frontend-held callback (hash-router path) |
| GET | `/auth/zoho/status` | `{ connected, orgId, orgName }` — drives the app gate |
| GET | `/auth/zoho/orgs` | List Zoho Books organizations |
| POST | `/auth/zoho/select-org` | Persist chosen org. Body `{ orgId, orgName }` |
| POST | `/auth/zoho/disconnect` | Delete the ZohoToken row |

---

## Function / module list (backend)

| File | Role |
|------|------|
| `index.js` | Express app: CORS, prefix-strip, per-request `req.catalyst` init, auth/org/add-on gates, route mounting, `/internal/sync-stock`, error handler |
| `session.js` | Password hashing (scrypt), signed session cookies, `requireAuth` / `requireAdmin`, AppUser helpers |
| `addons.js` | Add-on keys, `DEFAULT_ON`, `enabledAddons`, `requireAddon(key)` gate |
| `store.js` | Shared Data Store helpers incl. org scoping (below) |
| `itemValues.js` | SKUItemValue persistence, required-field gating, property search, legacy backfill, Books custom-field building |
| `routes/*.js` | The route handlers above (`auth`, `zohoAuth`, `industries`, `properties`, `propertyValues`, `sku`, `skuItems`, `reserve`, `admin`) |
| `zoho/auth.js` | OAuth config, multi-DC host resolution (`dcHosts`), token load/exchange/refresh, org selection |
| `zoho/booksApi.js` | Zoho Books v3 / Inventory v1 client (`createItem`, `updateItem`, `getOrganizations`, `listItems`, `getItem`, `listItemCustomFields`, SO/PO reads, `stampSalesOrderWo` — the SO's `cf_work_order_no_and_date` custom field, CR-173) |
| `zoho/inventoryApi.js` | `getCompositeItem`/`updateCompositeItem`/`updateCompositeItemFields`/`listCompositeItems`/`createCompositeItem` (BOM + CR-029 full payload), `listWarehouses`, `getItemStock` + write stubs |
| `zoho/push.js` | `pushToZoho` — best-effort create-or-update, no-op until configured, branching on `SKUItem.type` (CR-029): Trading → plain Books item, Manufacturing → composite/assembly item with associated items from `createValuesAsItems` properties (`buildAssociatedItems`, resolves each value via `pushValueToZoho`; unselected flagged properties are skipped — CR-030 — only a selected value that can't resolve fails). A Manufacturing re-push also swaps the composite's property-derived BOM lines (`mergeMappedLines`/`syncMappedItems` — manual lines and quantities untouched, write only on change). Type locks after first push, so `type` also says which Books API `zohoItemId` belongs to. Invoked by the manual `POST /sku-items/:id/push-zoho` route and by `POST /sku/update-item` for already-linked items (CR-030's exception to CR-021's no-auto-push rule) |
| `zoho/import.js` | `importFromBooks` — create-only import of Books items, mapping custom fields to SKUItemValue (find-or-create PropertyValue) |
| `reserve/sync.js` | Legacy per-item stock sync (superseded by `workorder/sync.js`'s bulk reconcile) |
| `reserve/zohoDocs.js` | Legacy seam — the real document mapping now lives in `workorder/formulas.js` `ROUTES` |
| `workorder/formulas.js` | **Columns A–I, the four warehouse routes, per-action caps, balance transitions.** Self-checked |
| `workorder/status.js` | WO lifecycle table (CR-160): FLOW, `BACK` (one step back on the shop floor, CR-171), done/edit-locked/holdable sets, material + assembly + stage-date gates, `nextStatuses(wo)` / `prevStatuses(wo)`. Self-checked |
| `workorder/store.js` | `OrgSetting` KV + defaults, warehouse map, `routeFor`, document numbering, `ActivityLog`. Self-checked |
| `workorder/bom.js` | Composite-item cache, requirement freeze, upload matching, three-way diff, committed-material guard. Self-checked |
| `workorder/grid.js` | Assembles the A–I grid from our own tables (BOM ⋈ snapshot ⋈ balances ⋈ PR lines) |
| `workorder/txn.js` | The material ledger: draft → confirm → one Transfer Order, write-through snapshots, `recompute`. Self-checked |
| `workorder/assembly.js` | `assembleFg` (CR-126/150/172/175/176): any shop-floor stage, FG fully issued (`formulas.fullyIssued`); validates the modal's per-component batch/serial picks (`componentQtys` + `applyPicks`, explicit picks win over FIFO) before any Zoho call; pushes the WO BOM to the composite, then one Zoho Inventory bundle (`POST /inventory/v1/bundles`) **at the Issue location** (assemblies are single-location), one serial per unit, then a best-effort Transfer Order Issue → Main for the finished good (`transferOrderNumber` / `transferWarning`); records `WoAssembly` and FG progress |
| `workorder/serial.js` | Finished-good serial series (CR-150): `<ValveTypeCode><YYYY><NNN>`, one counter per year across prefixes in `OrgSetting serialSeq`; prefix from the FG item's `cf_valve_type` code before the dash (CR-177), else the SKU item's Valve Type value, else typed. Self-checked (`serial.test.js`) |
| `workorder/purchase.js` | Shortfall → purchase request → one draft PO per vendor; item-wise cross-WO raise (`raiseItemPO`, consolidated PR) and derived per-WO procurement status (CR-023); refreshes only the POs we created. Self-checked |
| `workorder/sync.js` | Bounded nightly reconcile + the Books webhook dispatcher + `tokenForOrg` |
| `workorder/alerts.js` | Shortfall + cost-threshold evaluation, email delivery, `AlertLog` dedupe. Self-checked |
| `workorder/reports.js` | SO-BOM + shortfall roll-ups, ZCQL only. Self-checked |
| `recipe/sizing.js` | Product Configurator sizing (CR-181): `selectModels` — Req. Cap from TPH/BD/RPM, next-size-up per series, ties, `tooBig`, required speed. Pure. Self-checked (`node recipe/sizing.js --selftest`) |

### `store.js` helpers
- `rowList(zcqlRows)` — ZCQL returns each row keyed by table name; flattens to plain objects.
- `out(row)` — maps a raw row to API shape: `ROWID→id`, `CREATEDTIME→createdAt`, drops `MODIFIEDTIME`/`CREATORID`, coerces number cols (`skuPosition`, `rangeMin`, `rangeMax`) and bool cols (`required`).
- `idOk(v)` — guards that an id is all-digits before it reaches ZCQL (injection guard).
- `zStr(v)` — single-quotes + escapes a ZCQL string literal.
- `findSkuRowId(catalyst, sku, excludeId?)` — explicit uniqueness lookup so dupes return a friendly `409` instead of a raw constraint `500`.
- `isActive(prop)` / `nameFilter(properties)` — the CR-009 property gates. Both treat a null flag as the pre-CR-009 behaviour (in the SKU / in the name). Self-checked by `node functions/skuapi/test-props.js`.

### `itemValues.js` functions
- `saveItemValues` — write SKUItemValue rows for a new item's selections.
- `missingRequired` — required-property captions with no value (hard gate for create).
- `deleteItemValues` — manual cascade delete of an item's values.
- `searchItemIds` — per-filter ZCQL, in-memory AND intersection → matching item id Set.
- `backfillItemValues` — reconstruct values for legacy items by splitting their SKU on the industry separator and matching value codes.
- `buildZohoCustomFields` — map an item's stored values to Books `[{ api_name, value }]` for properties that have a `zohoCfApiName`.

---

## Frontend pages

HashRouter (`/app/#/…`) — Catalyst web hosting has no SPA fallback.
Left nav renders one entry per **enabled add-on**; SKU Generator is one entry
with a tab bar (`SkuLayout` in `App.jsx`). Default landing is `/sku/items`.
All settings live in the **Settings hub** (CR-137): header gear → `/settings/*`
(`SettingsLayout.jsx`, own left sidebar + search; sections filtered by the same
addon/perm rules as the main nav). Old paths (`/sku/industries*`,
`/sku/properties`, `/sku/settings`, `/wo/settings`, `/access/users`,
`/admin/addons`) redirect into the hub.

| Route | Page | Purpose |
|-------|------|---------|
| `/sku/items` | `SKUItemsPage` | The "SKU Generator" tab: browse/search items (free-text + SKU/Type/Industry/property filters, paginated grid), **+ New** → `/sku/generator`, Zoho push/import. Row click → Zoho-Books master–detail (narrow left list + right edit panel) |
| `/sku/generator` | `SKUGeneratorPage` | The "+ New" sub-page (kept as a route for permalinks): opens on the first industry; vertical list of all its properties → live SKU + name + description preview → create item, then back to the list |
| `/settings/org` | `OrgSettingsPage` | Settings hub: org profile + Switch Org, Books connection/Reconnect, admin-only add-on matrix (embeds `AddonAdminPage`) |
| `/settings/users` | `UsersRolesPage` | Settings hub: roles + user↔role assignment (`users.manage`) |
| `/settings/sku` | `SkuSettingsHub` | Settings hub: card landing → SKU Series / Industries / Properties |
| `/settings/sku/series` | `SkuSettingsPage` | Numerical series mode + format, auto-push import |
| `/settings/sku/industries` | `IndustriesPage` | Manage industries |
| `/settings/sku/industries/:id/properties` | `PropertyManagerPage` | Manage one industry's properties + values (incl. Books custom-field mapping) |
| `/settings/sku/properties` | `PropertiesPage` | All org properties in one grid, filterable by industry/type/required |
| `/sku/books-items` | `BooksLinkedValuesPage` | The "Books items" tab: read-only grid of property values also created as standalone Zoho Books items (CR-026), filterable by industry |
| `/wo` | `WorkOrderListPage` | Work order grid + "new from sales order" flow (tick the FG lines, BOMs seed from Zoho) |
| `/wo/:id` | `WorkOrderPage` | Zoho-Books-style split view (CR-018): left rail of all work orders, right detail with toolbar (Edit modal · Approve ▾ two-level dropdown · status actions · ⋯ Print PDF / Print Material Issue Copy — CR-190, `woIssueCopy.js` rolls all confirmed issues up per material and reuses `IssueSlip` / Delete) and sub-tabs **Details** (the A–I Materials grid), Approvals, History |
| `/wo/bom` | `CompositeBomPage` | Global BOM page (CR-028): grid of Books composite items (no work orders) → row drills into upload/paste + coloured diff, apply straight to Books (optionally creating missing component items); "New composite item" builds one in Books from a sheet |
| `/wo/purchase` | `WorkOrderPurchasePage` | Global Purchase page ("Purchasing"): By Item (per-RM shortfall raise; PR-number links + "Associated WO ▾" breakdown toggle per row, CR-144) + Requests/Orders grids (Orders = all Books POs via `/api/wo/purchase-orders`, 🔒 when received/billed) → row drills into `PurchaseTab` (per WO), `PrCard` editor (per PR, incl. consolidated cross-WO ones) or `PoSplit` (per PO) |
| `/wo/reports` | `WorkOrderReportsPage` | SO–BOM status + shortfall/pending + item pipeline (WO/vendor filters), CSV export |
| `/settings/wo` | `WorkOrderSettingsPage` | Warehouse map, alert recipients, thresholds, number prefixes (`wo.settings`) |
| `/reserve` | `ReservePage` | Superseded by `/wo` — kept one release for the Books custom button |
| `/estimate` | `EstimatePage` | Print estimates from CRM Quotes (CR-032, no sidebar entry). Deal button (`?dealId=`) → checkbox list of the deal's quotes → one sheet per ticked quote (page-break between); Quote button (`?quoteId=`) → that sheet directly. Sheet ported from `estimate-prototype/` (specs/design/size rows parsed from line descriptions via `estimateParser.js`, flat fallback), A–F priced / A–D technical toggle, native print. Editable "General Terms & Conditions" last page (`estimateTerms.js` + `EstimateTerms.jsx`): template picked from the org's Settings → Quote T&C list (`/settings/quote-terms`, CR-192), in-place edits apply to that print only. Logged-out deep links auto-login via Zoho OAuth (sessionStorage returnTo) |
| (in `/settings/org`) | `AddonAdminPage` | Super-admin: per-org add-on entitlements + org delete (embedded card, no own route) |
| (login) | `LoginPage` | Email+password or Zoho login |
| `/connect` | `ZohoConnectPage` | Shown until Zoho is connected (app gate) |
| (org select) | `OrgSelectPage` | Shown when connected but no org chosen |

Legacy paths (`/sku-generator`, `/sku-items`, `/admin/industries`, …) redirect;
generator permalinks keep their query string.

Shared components: `GridFooter.jsx` (`usePager`, `<GridFooter>`, `FilterSelect`,
`distinct`), `RowEditButton.jsx`, `RowDeleteButton.jsx`, `Modal.jsx`,
`Toolbar.jsx`, `SKUPreview.jsx`, `GlobalSearch.jsx` (⌘K catalog search over SKU
items + properties, rendered in the SKU tab bar). Grid conventions: pinned footer pagination
(25 default), value-based filters, hover pencil/trash — **no row-click edit**
(exception: `SKUItemsPage` row click opens its master–detail panel, CR-014).

App access is gated in `App.jsx`: it loads `/auth/me`, then blocks the main UI
until Zoho is `connected` **and** an `orgId` is selected.

---

## Configuration / env vars

Set in `functions/skuapi/catalyst-config.json` → `env_variables`:

| Var | Purpose |
|-----|---------|
| `ZOHO_DC` | Default Zoho data center (`com`, `eu`, `in`, …). Per-user DC on `ZohoToken.dc` overrides it |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` | OAuth app credentials; absent → all Zoho calls are skipped (best-effort no-op) |
| `ZOHO_ORG_ID` | Default Books org (overridden by saved `orgId`) |
| `ZOHO_REDIRECT_URI` | OAuth callback (defaults to localhost in dev) |
| `FRONTEND_URL` | Where the OAuth callback redirects back to |
| `ADMIN_EMAILS` | Comma-separated super-admin login emails (entitlement management) |
| `SYNC_SECRET` | Shared secret for `/internal/sync-stock`, `/internal/reconcile` and `/internal/zoho-event` |
| `ALERT_FROM_EMAIL` | From-address for Work Order shortfall / cost alerts (falls back to the recipient) |
| `SESSION_SECRET` | Session-cookie HMAC key. Falls back to `ZOHO_CLIENT_SECRET` if unset (see TASKS.md) |

> Note: live OAuth secrets are currently committed in `catalyst-config.json` —
> rotate and move to Catalyst environment secrets before this is anything but a
> dev project.
