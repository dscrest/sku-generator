# SKU Generator — System Architecture

A web app for building structured SKU codes per industry from configurable
properties/values, storing the generated items, and syncing them to Zoho Books.

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

## Database (Catalyst Data Store tables)

Every table has system columns: `ROWID` (17-digit string PK → exposed as `id`),
`CREATEDTIME` (→ `createdAt`), `MODIFIEDTIME`, `CREATORID`. Foreign keys are
plain string columns (no DB-level relations or cascade — cascades are done by
hand in code).

### Industry
The top-level grouping; defines how a SKU string is assembled.

| Column | Type | Purpose |
|--------|------|---------|
| `name` | string | Industry display name |
| `skuSeparator` | string | String joined between SKU parts (e.g. `-`, `""`) |

### Property
A configurable attribute of an industry that contributes one segment to the SKU.

| Column | Type | Purpose |
|--------|------|---------|
| `name` | string | Internal name |
| `caption` | string | Label shown in the generator UI |
| `unit` | string? | Optional unit shown in descriptions (e.g. `mm`) |
| `valueType` | string | `List` (pick from PropertyValue) or `Range` (free number) |
| `skuPosition` | number | Order of this segment in the assembled SKU |
| `rangeMin` / `rangeMax` | number? | Bounds enforced for `Range` properties |
| `required` | bool | If true, SKU creation is blocked until a value is given |
| `industryId` | string FK | Owning Industry |
| `zohoCfApiName` | string? | Zoho Books custom-field api_name. If set, this property's value syncs into that Books custom field on push, and is read back on import. |

### PropertyValue
The allowed options for a `List`-type property.

| Column | Type | Purpose |
|--------|------|---------|
| `displayValue` | string | Human-readable option label |
| `name` | string | Name fragment contributed to the item name |
| `sku` | string | Code fragment contributed to the SKU string |
| `description` | string? | Description fragment |
| `propertyId` | string FK | Owning Property |

### SKUItem
A generated, persisted product.

| Column | Type | Purpose |
|--------|------|---------|
| `name` | string | Assembled item name |
| `sku` | string | Assembled SKU code (**unique** — enforced by lookup + DB constraint) |
| `description` | string? | Assembled description |
| `type` | string | `Trading` or `Manufacturing` |
| `industryId` | string FK | Source industry |
| `zohoItemId` | string? | Linked Zoho Books `item_id` once pushed |

### SKUItemValue
Structured record of which property→value choices produced a SKUItem (so items
are searchable by property after creation; the SKUItem row only keeps joined
strings).

| Column | Type | Purpose |
|--------|------|---------|
| `skuItemId` | string FK | Owning SKUItem |
| `propertyId` | string FK | Which property |
| `valueId` | string? | PropertyValue ROWID (List) or null (Range) |
| `valueText` | string | Display text / raw range number, used for LIKE search |

### ZohoToken
Single-row OAuth state for the Zoho Books connection.

| Column | Type | Purpose |
|--------|------|---------|
| `refreshToken` | string | Long-lived OAuth refresh token |
| `accessToken` | string? | Cached short-lived access token |
| `expiresAt` | datetime? | Access-token expiry (`yyyy-MM-dd HH:mm:ss`) |
| `orgId` / `orgName` | string? | Selected Zoho Books organization |

---

## API

Base path in production: `/server/skuapi`. All JSON. CORS is permissive (`*`).

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
| POST | `/api/sku/generate` | **Preview only.** Body `{ industryId, selectedValues }`. Assembles `{ sku, name, description, missingRequired[], duplicate }` without saving. Validates Range bounds. |
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

### Zoho OAuth — `routes/zohoAuth.js` (mounted `/auth/zoho`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/zoho` | Redirect to Zoho consent screen |
| GET | `/auth/zoho/callback` | OAuth callback → exchange code, auto-select org if only one, redirect to frontend |
| GET | `/auth/zoho/status` | `{ connected, orgId, orgName }` — drives the app gate |
| GET | `/auth/zoho/orgs` | List Zoho Books organizations |
| POST | `/auth/zoho/select-org` | Persist chosen org. Body `{ orgId, orgName }` |
| POST | `/auth/zoho/disconnect` | Delete the ZohoToken row |

---

## Function / module list (backend)

| File | Role |
|------|------|
| `index.js` | Express app: CORS, prefix-strip, per-request `req.catalyst` init, route mounting, error handler |
| `store.js` | Shared Data Store helpers (below) |
| `itemValues.js` | SKUItemValue persistence, required-field gating, property search, legacy backfill, Books custom-field building |
| `routes/*.js` | The route handlers above |
| `zoho/auth.js` | OAuth config, token load/exchange/refresh, org selection |
| `zoho/booksApi.js` | Thin Zoho Books v3 client (`createItem`, `updateItem`, `getOrganizations`, `listItems`, `getItem`) |
| `zoho/push.js` | `pushToZoho` — best-effort create-or-update of a Books item (incl. custom fields), no-op until configured |
| `zoho/import.js` | `importFromBooks` — create-only import of Books items into an industry, reverse-mapping custom fields to SKUItemValue |

### `store.js` helpers
- `rowList(zcqlRows)` — ZCQL returns each row keyed by table name; flattens to plain objects.
- `out(row)` — maps a raw row to API shape: `ROWID→id`, `CREATEDTIME→createdAt`, drops `MODIFIEDTIME`/`CREATORID`, coerces number cols (`skuPosition`, `rangeMin`, `rangeMax`) and bool cols (`required`).
- `idOk(v)` — guards that an id is all-digits before it reaches ZCQL (injection guard).
- `zStr(v)` — single-quotes + escapes a ZCQL string literal.
- `findSkuRowId(catalyst, sku, excludeId?)` — explicit uniqueness lookup so dupes return a friendly `409` instead of a raw constraint `500`.

### `itemValues.js` functions
- `saveItemValues` — write SKUItemValue rows for a new item's selections.
- `missingRequired` — required-property captions with no value (hard gate for create).
- `deleteItemValues` — manual cascade delete of an item's values.
- `searchItemIds` — per-filter ZCQL, in-memory AND intersection → matching item id Set.
- `backfillItemValues` — reconstruct values for legacy items by splitting their SKU on the industry separator and matching value codes.
- `buildZohoCustomFields` — map an item's stored values to Books `[{ api_name, value }]` for properties that have a `zohoCfApiName`.

---

## Frontend pages

| Route | Page | Purpose |
|-------|------|---------|
| `/sku-generator` | `SKUGeneratorPage` | Pick industry + property values → live preview → create item |
| `/sku-items` | `SKUItemsPage` | Browse/search/edit/delete items (free-text + SKU/Type/Industry/property filters, paginated grid), manual Zoho push, import from Zoho (per industry) |
| `/admin/industries` | `IndustriesPage` | Manage industries |
| `/admin/industries/:id/properties` | `PropertyManagerPage` | Manage an industry's properties + values |
| `/connect` | `ZohoConnectPage` | Shown until Zoho is connected (app gate) |
| (org select) | `OrgSelectPage` | Shown when connected but no org chosen |

App access is gated in `App.jsx`: it polls `/auth/zoho/status` on load and
blocks the main UI until `connected` **and** `orgId` are set.

---

## Configuration / env vars

Set in `functions/skuapi/catalyst-config.json` → `env_variables`:

| Var | Purpose |
|-----|---------|
| `ZOHO_DC` | Zoho data center (`com`, `eu`, `in`, …) — used in all Zoho URLs |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` | OAuth app credentials; absent → all Zoho calls are skipped (best-effort no-op) |
| `ZOHO_ORG_ID` | Default Books org (overridden by saved `orgId`) |
| `ZOHO_REDIRECT_URI` | OAuth callback (defaults to localhost in dev) |
| `FRONTEND_URL` | Where the OAuth callback redirects back to |

> Note: live OAuth secrets are currently committed in `catalyst-config.json` —
> rotate and move to Catalyst environment secrets before this is anything but a
> dev project.
