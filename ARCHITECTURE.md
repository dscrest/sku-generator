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
| External | Zoho Books v3 API (OAuth) | `functions/skuapi/zoho/` |

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
| GET | `/auth/me` | Current user + selected org + `addons` (enabled keys) + `isAdmin` |

Sessions are stateless: `base64url({uid,iat}).HMAC-SHA256` — no session table.
`requireAuth` gates everything under `/api` and `/admin`; `requireOrg` then
pins `req.orgId` from the user's ZohoToken.

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
| POST | `/api/property-values` | Create. Requires `displayValue, name, sku, propertyId` |
| PUT | `/api/property-values/:id` | Partial update |
| DELETE | `/api/property-values/:id` | Delete |

### SKU generation — `routes/sku.js` (mounted `/api/sku`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sku/generate` | **Preview only.** Body `{ industryId, selectedValues }`. Assembles `{ sku, name, description, missingRequired[], duplicate }` without saving. Validates Range bounds. Skips properties with `activeInSku = false`; `name` = the `includeInName` properties, space-joined; `description` = one `Caption: Value` line per filled property |
| POST | `/api/sku/create-item` | Persist a SKUItem. Gates on required props + SKU uniqueness, saves SKUItemValue rows, fires best-effort Zoho push. Body `{ name, sku, description, type, industryId, selectedValues }` |

`selectedValues` is `{ propertyId: value }` where `value` is a PropertyValue
ROWID (List props) or a raw number string (Range props).

### SKU items — `routes/skuItems.js` (mounted `/api/sku-items`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sku-items?industryId=` | List items (optionally filtered), newest first, each with `industry.name` |
| POST | `/api/sku-items/search` | AND-combined search. Body `{ industryId?, q?, sku?, type?, filters:[{propertyId, valueId?, text?}] }` — `q` = LIKE on sku+name, `sku` = LIKE on sku, `type` = exact. NB: ZCQL LIKE wildcard is `*`, not `%` |
| POST | `/api/sku-items` | Direct create (no generation) + Zoho push |
| PUT | `/api/sku-items/:id` | Update + re-push to Zoho |
| DELETE | `/api/sku-items/:id` | Delete + cascade its SKUItemValue rows |
| POST | `/api/sku-items/:id/push-zoho` | Manual (re)push a single item to Zoho Books |
| POST | `/api/sku-items/backfill-values` | One-shot, idempotent backfill of SKUItemValue for legacy items by reverse-matching SKU tokens |
| POST | `/api/sku-items/import-zoho` | Import new items from Zoho Books into an industry. Body `{ industryId }`. Create-only — items already linked (by `zohoItemId`, then `sku`) are skipped. Reverse-maps Books custom fields → SKUItemValue via `zohoCfApiName`. Returns `{ total, imported, skipped, valuesMapped, errors }` |

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
| GET/POST | `/api/wo` | List work orders / create from an SO (seeds each FG's BOM from its composite item) |
| GET/PUT | `/api/wo/:id` | Work order with FGs, purchase requests, transactions, approvals |
| POST | `/api/wo/:id/status` | Status transition, incl. the QC gate (Rejected → back to In Progress) |
| GET | `/api/wo/:id/bom` | Frozen BOM lines + revision history |
| POST | `/api/wo/:id/bom/preview` | Diff vs the composite item or an uploaded sheet — writes nothing |
| POST | `/api/wo/:id/bom/apply` | Apply the diff, record a `BomRevision`, push back to the composite item |
| GET | `/api/wo/:id/grid?fgId=` | The A–I grid — **read entirely from our tables, zero Zoho calls** |
| POST | `/api/wo/:id/txn` | Reserve / de-reserve / issue / return (`confirm:true` drafts + confirms in one call) |
| POST | `/api/wo/txn/:txnId/confirm` \| `/cancel` | Confirm writes the Zoho Transfer Order; confirmed cannot be cancelled |
| POST | `/api/wo/:id/recompute` | Rebuild the running balances from the ledger |
| GET | `/api/wo/:id/shortfall` | Shortfall rows pre-filled as purchase-request lines |
| GET/POST | `/api/wo/:id/purchase-request(s)` | List / raise a purchase request |
| PUT | `/api/wo/pr-line/:lineId` | Set vendor + quantity on a line |
| POST | `/api/wo/pr/:prId/confirm` | One **draft PO per vendor**, delivery = Reserve warehouse, SO referenced |
| GET | `/api/wo/purchase-orders` | Orders grid: every Books PO, app-created ones stamped with PR/WO, `locked` when received/billed |
| GET/PUT/DELETE | `/api/wo/po/:poId` (+ POST `/status`) | Live Books PO detail · edit lines · delete (Books-only POs too) · issue/cancel |
| POST | `/api/wo/:id/approve` · GET `/invoice-gate` | Two-level approval; the gate blocks invoicing until both |
| GET | `/api/wo/reports/so-bom` · `/reports/shortfall` · `/reports/item-pipeline` | ZCQL-only reports |
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
| `zoho/booksApi.js` | Zoho Books v3 / Inventory v1 client (`createItem`, `updateItem`, `getOrganizations`, `listItems`, `getItem`, `listItemCustomFields`, SO/PO reads) |
| `zoho/inventoryApi.js` | `getCompositeItem` (BOM), `listWarehouses`, `getItemStock` + write stubs |
| `zoho/push.js` | `pushToZoho` — best-effort create-or-update of a Books item (incl. custom fields), no-op until configured. Invoked **only** by the manual `POST /sku-items/:id/push-zoho` route (not on create/update — CR-021) |
| `zoho/import.js` | `importFromBooks` — create-only import of Books items, mapping custom fields to SKUItemValue (find-or-create PropertyValue) |
| `reserve/sync.js` | Legacy per-item stock sync (superseded by `workorder/sync.js`'s bulk reconcile) |
| `reserve/zohoDocs.js` | Legacy seam — the real document mapping now lives in `workorder/formulas.js` `ROUTES` |
| `workorder/formulas.js` | **Columns A–I, the four warehouse routes, per-action caps, balance transitions.** Self-checked |
| `workorder/store.js` | `OrgSetting` KV + defaults, warehouse map, `routeFor`, document numbering, `ActivityLog`. Self-checked |
| `workorder/bom.js` | Composite-item cache, requirement freeze, upload matching, three-way diff, committed-material guard. Self-checked |
| `workorder/grid.js` | Assembles the A–I grid from our own tables (BOM ⋈ snapshot ⋈ balances ⋈ PR lines) |
| `workorder/txn.js` | The material ledger: draft → confirm → one Transfer Order, write-through snapshots, `recompute`. Self-checked |
| `workorder/purchase.js` | Shortfall → purchase request → one draft PO per vendor; refreshes only the POs we created. Self-checked |
| `workorder/sync.js` | Bounded nightly reconcile + the Books webhook dispatcher + `tokenForOrg` |
| `workorder/alerts.js` | Shortfall + cost-threshold evaluation, email delivery, `AlertLog` dedupe. Self-checked |
| `workorder/reports.js` | SO-BOM + shortfall roll-ups, ZCQL only. Self-checked |

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
with a tab bar (`SkuLayout` in `App.jsx`). Tabs follow the setup order:
Industries → Properties → SKU Generator (`/sku/items`, the combined
list+generator page — CR-014); default landing is `/sku/industries`.

| Route | Page | Purpose |
|-------|------|---------|
| `/sku/items` | `SKUItemsPage` | The "SKU Generator" tab: browse/search items (free-text + SKU/Type/Industry/property filters, paginated grid), **+ New** → `/sku/generator`, Zoho push/import. Row click → Zoho-Books master–detail (narrow left list + right edit panel) |
| `/sku/generator` | `SKUGeneratorPage` | The "+ New" sub-page (kept as a route for permalinks): opens on the first industry; vertical list of all its properties → live SKU + name + description preview → create item, then back to the list |
| `/sku/industries` | `IndustriesPage` | Manage industries |
| `/sku/industries/:id/properties` | `PropertyManagerPage` | Manage one industry's properties + values (incl. Books custom-field mapping) |
| `/sku/properties` | `PropertiesPage` | All org properties in one grid, filterable by industry/type/required |
| `/wo` | `WorkOrderListPage` | Work order grid + "new from sales order" flow (tick the FG lines, BOMs seed from Zoho) |
| `/wo/:id` | `WorkOrderPage` | Zoho-Books-style split view (CR-018): left rail of all work orders, right detail with toolbar (Edit modal · Approve ▾ two-level dropdown · status actions · ⋯ Print PDF / Delete) and sub-tabs **Details** (the A–I Materials grid), Approvals, History |
| `/wo/bom` | `WorkOrderBomPage` | Global BOM page: grid of WOs (FGs, Rev, BOM date; BOMs first) → row drills into `BomTab` (upload + coloured diff + revisions) |
| `/wo/purchase` | `WorkOrderPurchasePage` | Global Purchase page: Requests/Orders grids (Orders = all Books POs via `/api/wo/purchase-orders`, 🔒 when received/billed) → row drills into `PurchaseTab` (per WO) or `PoSplit` (per PO) |
| `/wo/reports` | `WorkOrderReportsPage` | SO–BOM status + shortfall/pending + item pipeline (WO/vendor filters), CSV export |
| `/wo/settings` | `WorkOrderSettingsPage` | Warehouse map, alert recipients, thresholds, number prefixes |
| `/reserve` | `ReservePage` | Superseded by `/wo` — kept one release for the Books custom button |
| `/admin/addons` | `AddonAdminPage` | Super-admin: per-org add-on entitlements + org delete |
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
