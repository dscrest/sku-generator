# Database schema — Catalyst Data Store

**Canonical source of truth for every table and column.** Any schema change
(new table, new column, type/constraint change) must be:
1. requested + rationalised as a CR in [CHANGES.md](CHANGES.md),
2. applied in the Catalyst console (Data Store → table),
3. reflected here **and** appended to the [Schema change ledger](#schema-change-ledger) at the bottom,
4. any dependent task recorded in [TASKS.md](TASKS.md).

Live project: `SKU-GEN-OCTFIS`. `backend/prisma/schema.prisma` is the **legacy
Postgres shape** — reference only, no Postgres in production.

## Conventions

- Every table has system columns: `ROWID` (17-digit string PK → exposed as `id`),
  `CREATEDTIME` (→ `createdAt`), `MODIFIEDTIME`, `CREATORID`.
- Foreign keys are plain string columns. **No DB-level relations or cascade** —
  cascades are done by hand in code (see `deleteItemValues`, `DELETE /admin/orgs/:orgId`).
- Multi-tenancy: every business table carries `orgId` (the Zoho Books org id).
  Reads go through `orgClause(catalyst)`, writes take `req.orgId`, cross-row
  access is checked with `ownsRow()` — all in `functions/skuapi/store.js`.
  `AppUser` is the only business table **not** org-scoped (a user may belong to
  several orgs over time; the org lives on `ZohoToken`).
- Numbers/booleans come back from ZCQL as strings; `out()` in `store.js` coerces
  the known numeric/bool columns.
- ZCQL `LIKE` wildcard is `*`, **not** `%`.

---

## Tenancy & identity

### AppUser
App-level login (email+password or Zoho OAuth). Not org-scoped.

| Column | Type | Purpose |
|--------|------|---------|
| `email` | string, **unique, mandatory** | Login id, lowercased. Phone-registered Zoho accounts have no email → a stable per-ZUID placeholder is stored |
| `name` | string? | Display name |
| `zuid` | string? | Zoho user id — the anchor for OAuth identity |
| `passwordHash` | string? | `scrypt$<salt>$<hash>`; null for OAuth-only users |

Sessions are **stateless** (signed cookie, HMAC-SHA256) — there is no session table.

### ZohoToken
Per-user OAuth state for the Zoho connection (keyed by `userId`).

| Column | Type | Purpose |
|--------|------|---------|
| `userId` | string FK → AppUser | Owner |
| `refreshToken` | string | Long-lived OAuth refresh token |
| `accessToken` | string? | Cached short-lived access token |
| `expiresAt` | datetime? | Access-token expiry (`yyyy-MM-dd HH:mm:ss`) |
| `dc` | string? | Zoho data centre for this user (`com`, `in`, `eu`, …) — drives accounts/API hosts. Absent = default `ZOHO_DC` |
| `orgId` / `orgName` | string? | Selected Zoho Books organization (the tenant key for everything else) |

### OrgAddon
Per-customer add-on entitlements. Missing row = disabled, except `sku-generator`
which defaults ON (`DEFAULT_ON` in `addons.js`) so legacy orgs need no seed rows.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `addonKey` | string | `sku-generator` \| `reserve` \| `cheque-printing` \| `label-printing` |
| `enabled` | bool | |

### Org
**Registry, not tenant data (CR-090):** one row per org ever selected, upserted
best-effort by `saveOrg`. Exists because `ZohoToken` keeps only each user's
*last* org — the admin console unions this with distinct ZohoToken orgs.
Removed by the `DELETE /admin/orgs/:orgId` cascade.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string, **unique, mandatory** | Zoho Books org id |
| `orgName` | string? | Last-seen org name |

### Role
Named per-org permission set (Users & Roles, CR-120). A user's effective
permissions = union of their assigned roles' `perms`. **An org with zero Role
rows is wide open** (`userPerms` returns `["*"]`); `routes/access.js`
`ensureAdmin()` creates the reserved **`Admin`** role (CR-239) on the first
roles read/write and assigns it to every existing org user (or to existing
`users.manage` holders), so enforcement never starts by locking anyone out.
`ADMIN_EMAILS` super-admins always get `["*"]` regardless.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | varchar(50), **mandatory** | Tenant key |
| `name` | varchar(100), mandatory | Role display name. **`Admin` (case-insensitive) is reserved**: full access (`["*"]`), cannot be edited/deleted, org must keep ≥1 holder |
| `perms` | text | JSON array of permission keys (`PERM_KEYS` in `perms.js`, CR-239 shape): a module key alone = View/page access (`wo.orders`, `wo.purchase`, `wo.bom`, `wo.defects`, `wo.reports`, `wo.settings`, `sku`, `reserve`, `estimate`, `recipe.*`, `users.manage`), `<mod>.create` / `.edit` / `.delete` / `.export` = verbs, `wo.action.*` = WO action grants. Rows holding only bare keys (pre-CR-239) are read as all-verb grants (`expandLegacy`). Empty for Admin (name decides) |

### UserRole
Role assignment, per org (a user can hold different roles in different orgs).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | varchar(50), **mandatory** | Tenant key |
| `userId` | varchar(50), mandatory | AppUser ROWID |
| `roleId` | varchar(50), mandatory | Role ROWID (a role with assignments cannot be deleted — 409; the last Admin assignment cannot be removed — 400) |

### GridPref
Org-wide grid column layout for the column chooser (CR-120) — one row per
org × grid, written by **any** authenticated org user on Apply.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | varchar(50), **mandatory** | Tenant key |
| `gridKey` | varchar(50), mandatory | Grid id, e.g. `wo.list`, `sku.items`, `recipe.materials` |
| `config` | text | JSON `{order:[keys], hidden:[keys]}` (≤9500 chars enforced) |

---

## SKU catalog

### Industry
Top-level grouping; defines how a SKU string is assembled.

| Column | Type | Purpose |
|--------|------|---------|
| `name` | string | Industry display name |
| `skuSeparator` | string | Joined between SKU parts (e.g. `-`, `""`) |
| `seriesStart` | int? | **Legacy numerical-series on/off flag (CR-089, CR-093; superseded by CR-136).** The series is now configured org-wide via `OrgSetting` `skuSeriesMode`/`skuSeriesPad`; this column only serves the fallback when that key is unset (null/0 = off; ≥1 = continuous). No longer editable in the UI |
| `seriesPad` | int? | **Legacy series suffix width (CR-093; superseded by CR-136).** Fallback width when `skuSeriesPad` is unset. Null = default 4 |
| `orgId` | string | Tenant key |

### Property
A configurable attribute of an industry contributing one segment to the SKU.

| Column | Type | Purpose |
|--------|------|---------|
| `name` | string | Internal name |
| `caption` | string | Label shown in the generator UI |
| `unit` | string? | Optional unit shown in descriptions (e.g. `mm`) |
| `valueType` | string | `List` (pick from PropertyValue) or `Range` (free number) |
| `skuPosition` | number | Order of this segment in the assembled SKU |
| `rangeMin` / `rangeMax` | number? | Bounds enforced for `Range` properties |
| `required` | bool | If true, SKU creation is blocked until a value is given |
| `activeInSku` | bool? | Takes part in SKU generation. **null = active** (rows predating CR-009). False ⇒ no SKU part, no name part, no description line, no `SKUItemValue`, and it cannot gate creation |
| `includeInName` | bool? | Value contributes to the item name. If **no** property of the industry is true, every filled property is used (pre-CR-009 behaviour) — see `nameFilter()` in `store.js` |
| `industryId` | string FK | Owning Industry |
| `zohoCfApiName` | string? | Zoho Books custom-field `api_name`. If set, this property's value syncs into that Books custom field on push and is read back on import |
| `clubKey` | string? | **Clubbing (CR-025).** Properties of the same industry sharing a non-empty `clubKey` concatenate their SKU codes with **no** separator into one segment (e.g. Body + Gland). Null = standalone segment. The industry separator still applies between segments; a club renders at its first member's `skuPosition` |
| `createValuesAsItems` | bool? | **CR-026 gate.** When true, every value of this property is created/synced to Zoho Books as an item (best-effort). Turning it on backfills existing values. Un-flagged properties never create items — replaces the per-value `PropertyValue.createAsItem` toggle |
| `showInWidget` | bool? | **CR-108.** Property appears as a filter parameter in the CRM quote widget's "Add filter" menu. Null/false = hidden |
| `sizingRole` | string(20)? | **CR-181.** Product Configurator sizing role: `capacity` (TPH), `density` (kg/ltr), `speed` (RPM), `group` (type answer that filters `SizingModel.groupValue`) are inputs; `series` / `model` are filled by the picked sizing option. Blank = ordinary question. The configurator widget shows the sizing block only when an industry has `model` + `capacity` + `density` roles |
| `booksCategoryId` | string(50)? | **CR-286.** Zoho Books item category whose active items are this property's values. Set on the property form when `createValuesAsItems` is on; **Sync from Books** (`POST /properties/:id/sync-books`) creates / links / renames `PropertyValue` rows from it, never deletes. Null = no sync key |
| `valuesFromCf` | bool? | **CR-288.** This property's values are the **options of the Books dropdown custom field** named by `zohoCfApiName`. Sync from Books lands each option as a `PropertyValue` (name match, never deletes); a value added in the app is appended to the field's options (best-effort). Exclusive with `createValuesAsItems` — the API exposes the pair as `valueSource` = `manual` / `items` / `options` (`store.js valueSourceOf`). Null/false = not option-backed |
| `orgId` | string | Tenant key |

### PropertyValue
Allowed options for a `List`-type property.

| Column | Type | Purpose |
|--------|------|---------|
| `displayValue` | string | Human-readable option label |
| `name` | string | Name fragment contributed to the item name |
| `sku` | string | Code fragment contributed to the SKU string |
| `description` | string? | Description fragment |
| `propertyId` | string FK | Owning Property |
| `createAsItem` | bool? | **CR-026 (superseded).** Old per-value "create as Books item" toggle; the gate moved to `Property.createValuesAsItems`. Column kept, no longer read |
| `zohoItemId` | string? | **CR-026.** Linked Books `item_id` once created; presence = already linked (update instead of re-create) and drives the "Books items" tracking grid |
| `isDefault` | bool? | **CR-094.** Marks the one value pre-selected for its property in the SKU generator. At most one true per property — enforced in the `POST`/`PUT /property-values` handlers (`clearOtherDefaults`), no DB-level uniqueness. Null/false = not default |
| `capMin` / `capMax` | double(4)? | **CR-228.** Capacity band: the CRM configurator pre-selects this value when the industry's `capacity`-role input (TPH) falls in `[capMin, capMax]` (overlapping edges → the higher band; `configurator.html autoPick`). Null = no auto-pick. Set on the Properties page value form |
| `orgId` | string | Tenant key |

> Import can **create** PropertyValue rows: a Books custom-field value that matches
> no existing option (case-insensitive) is inserted with an auto-generated 4-char
> SKU code, so imported items link to a real value instead of free text.

### SKUItem
A generated, persisted product.

| Column | Type | Purpose |
|--------|------|---------|
| `name` | string | Assembled item name — the `includeInName` properties' value names, space-joined |
| `sku` | string | Assembled SKU code — **unique per org**, enforced by `findSkuRowId()` lookup + DB constraint |
| `description` | string? | One `Caption: Value` line per filled property, newline-joined. **Must hold ~900 chars** (24 lines) — widen to `text` if it is a short varchar |
| `type` | string | `Trading` or `Manufacturing` |
| `industryId` | string FK | Source industry |
| `zohoItemId` | string? | Linked Zoho Books `item_id` once pushed — also set at create time by the Books API import and by the Books-sheet import's `Item ID` column (CR-189) |
| `lastPushedAt` | datetime? | When the SKU last landed in Books (stamped by `pushToZoho`); compared to `MODIFIEDTIME` for the "Edited · Re-push" stale-sync badge (CR-038) |
| `booksData` | text? | JSON of Zoho Books item fields captured by the Books-sheet import (rate, hsn_or_sac, unit, product_type, item_type, package_details, …) — merged into the Books push payload; `_`-prefixed keys are reference-only (CR-127) |
| `uom` | string(20)? | **CR-206.** Item unit from the configurator widget (`Nos`, `Kgs`, `MM` … — `recipe/componentMap.js` `UOMS`, free text tolerated). Sent as the Books item `unit` on push (beats `booksData.unit`); null = legacy `pcs` |
| `orgId` | string | Tenant key |

### SKUItemValue
Which property→value choices produced a SKUItem (so items stay searchable by
property; the SKUItem row only keeps the joined strings).

| Column | Type | Purpose |
|--------|------|---------|
| `skuItemId` | string FK | Owning SKUItem |
| `propertyId` | string FK | Which property |
| `valueId` | string? | PropertyValue ROWID (List) or null (Range) |
| `valueText` | string | Display text / raw range number, used for LIKE search |
| `orgId` | string | Tenant key |

> Rows are written by the generator (`saveItemValues`), the Books import /
> refresh (mapped custom fields, `replaceMappedValues`) and — for a Books-only
> org (CR-295) — the composite's BOM lines (`replaceBomValues`: one row per
> line whose Books item is a value of a category-backed property, replaced per
> item on every refresh of that composite).

---

## Reserve add-on

### ReservationLine — table id `69851000000054976`
Mutable reservation state per SO × FG × component.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId`, `salesOrderId`, `fgItemId`, `componentItemId` | string | Keys (Zoho ids) |
| `warehouseId` | string? | Null until the reserved-warehouse mapping lands |
| `reservedQty` / `issuedQty` / `returnedQty` | number | Grid columns C / D (net) |
| `zohoDocs` | text | JSON audit of Zoho documents written per action (Phase 4) |

### ItemStockSnapshot — table id `69851000000056456`
Synced cache of Zoho stock numbers (grid columns B/E/F/G).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId`, `itemId` | string | Keys |
| `warehouseId` | string? | Null/"" = org-total |
| `itemName` / `sku` | string? | Item label cached from Zoho (warehouse-stock report, CR-061) |
| `stockOnHand` / `availableStock` / `poQty` / `receivedQty` / `billedQty` | number | B / avail / E / F / G |
| `syncedAt` | datetime | "Last sync" banner = max per org |

Grid column formulas: see [WORKORDER.md](WORKORDER.md).

---

## Work Order add-on (CR-013)

**Live in `SKU-GEN-OCTFIS` (Development) as of 2026-07-23.** Table ids:
`OrgSetting` 69851000000080705 · `WorkOrder` 69851000000084605 ·
`WorkOrderFG` 69851000000077940 · `WorkOrderLine` 69851000000083652 ·
`BomRevision` 69851000000081456 · `MaterialTxn` 69851000000082438 ·
`MaterialTxnLine` 69851000000079610 · `PurchaseRequest` 69851000000084964 ·
`PurchaseRequestLine` 69851000000089011 · `CompositeItemCache` 69851000000085676 ·
`Approval` 69851000000091035 · `AlertLog` 69851000000088299 ·
`ActivityLog` 69851000000081815.

Conventions applied: ids `varchar(50)`, names `varchar(255)`, quantities
`double(15,4)`, JSON/notes `text(10000)`. Only `orgId` is mandatory on every
table — cascades and referential integrity stay in code, as elsewhere.

Implements the MSUN Work Order BRD. Every table carries `orgId`. Ids referencing
Zoho (`salesOrderId`, `rmItemId`, `zohoPoId`, …) are Zoho's ids as strings; ids
referencing our own rows are 17-digit Catalyst ROWIDs as strings.

### OrgSetting
Per-org configuration as key/value, so BRD §13's unanswered items don't each
become a column. Read via `workorder/settings.js`.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `settingKey` | string | `mainWarehouseId`, `reserveWarehouseId`, `issueWarehouseId`, `pickMainPerWo` (`true` = a new work order must carry its own Main, CR-260), `woBomSource` (blank = work order BOM direct from the Books composite, `template` = from the quote configuration / Product Design, CR-270), `purchaseTeamEmail`, `approverL1Email`, `approverL2Email`, `approvalLevels` (`0`/`1`/`2`; unset = derive from approver emails, CR-082), `shortfallAlertDays`, `costAlertPct`, `woNumberPrefix`, `prNumberPrefix`, `txnNumberPrefix` — the full list is `SETTING_KEYS` in `workorder/store.js`; SKU-module keys (`skuSeriesMode`, `cfgNoAutoPush`, `skuItemFields`, `cfgDesignRate` = CR-211 design-cost switch for the CRM Product Configurator, `priceLadder` = CR-220 JSON `{"mfg":{"oh","margin","pf","other","disc"},"bo":{…}}` % sets per line class for the configurator's Base → … → Disc ladder, `uomList` = CR-216 comma-separated units of measure for every UOM dropdown (blank = the standard list in `recipe/componentMap.js`), …) are read by `settingsOut()` in `routes/skuItems.js`, `cfgFgCategoryId` (Books item category of the Quote Maker's Finished Goods, blank = every Books item, CR-287), `cfgWidgetBooksOnly` (`true` = a widget miss says "create it in Zoho Books", no create card, CR-287) |
| `settingValue` | string(255) | Always stored as text; callers coerce |
| `settingText` | text(10000) | Large JSON settings that overflow `settingValue` (CR-192): keys `estimateTpl` (one row per quote T&C template, `{ name, terms[] }`, template id = ROWID — the only key with many rows per org) and `estimateBank` (shared bank/contact table). `settingValue` stays blank on these rows, so `settings()` ignores them |

> Named `settingKey`/`settingValue`, not `key`/`value` — the bare words are
> reserved in enough SQL dialects to not be worth risking in ZCQL.

### WorkOrder
The BRD's BOM header — one per Work Order, linked to a confirmed Sales Order.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `woNumber` | string | Human id, `<prefix><n>` — unique per org |
| `woDate` | string | `yyyy-MM-dd` |
| `salesOrderId` / `salesOrderNumber` | string | Zoho SO link |
| `customerId` / `customerName` | string | Denormalised from the SO so lists cost no API |
| `projectName` | string? | Retired (CR-159): no longer written or shown; column kept |
| `status` | string | CR-160: `Draft` → `PendingApproval` (only when 2 approval levels apply — explicit `approvalLevels` setting, or an L2 approver email when unset; 0 levels = no approval needed, CR-082) → `Approved` → `ReadyForMachining` → `MachiningInProgress` → `ReadyForFitting` → `FittingInProgress` → `ReadyForDispatch` → `Completed` → `Dispatched` → `Closed`; `Hold` (from any open status, resumes to `heldFrom`) and `Cancelled` (de-reserves) on the side. Only the approval flow reaches `Approved`; Draft → ReadyForMachining directly only when approval levels = 0. Reserve/issue allowed from `ReadyForMachining` to `ReadyForDispatch`; Assemble only at `ReadyForDispatch`; `Completed` needs every FG assembled ≥ 1 + nothing reserved (CR-151); leaving `MachiningInProgress` / `FittingInProgress` needs `machiningDoneDate` / `fittingDoneDate`. Closing gates on all items issued (warn + force to override); `Closed` → `Dispatched` only via the admin-only `/reopen` route with a reason (CR-080). Table lives in `workorder/status.js` |
| `heldFrom` | string? | Status to resume to while `status = Hold`; cleared on resume (CR-160) |
| `qcStatus` | string? | `Passed` \| `Rejected` \| `NotApplicable` — required before `Completed`; Rejected records only, status stays (CR-160); NotApplicable completes like Passed (CR-161) |
| `revision` | number | Current BOM revision, starts 0 |
| `bomImportedAt` | datetime? | Drives the shortfall alert (BOM import + `shortfallAlertDays`) |
| `estimatedCost` / `actualCost` | number? | Retired (CR-159): no longer written or shown; columns kept. The cost-threshold alert (FR-ADO-006, `alerts.js`) is a no-op with estimate 0 |
| `notes` | text? | |
| `lastViewedAt` | datetime? | When the WO detail was last opened (stamped fire-and-forget by `GET /:id`) — drives the unseen-progress red dot (CR-099); org-wide, not per-user |
| `soDate` / `shipmentDate` | string? | SO date / expected shipment date, denormalised from the Books SO and re-synced on every detail open (CR-110) |
| `buyerOrderNo` / `buyerOrderDate` | string? | SO custom fields "Buyer Order No" / "Buyer Order Date", label-matched (CR-110) |
| `freightCharge` / `delivery` / `booking` / `transporter` | string? | SO custom fields "Freight Charge" / "Delivery" / "Booking" / "Transporter", label-matched, re-synced on every open (CR-161) |
| `tcRequired` | string? | `Yes` \| `No` \| blank — test certificate required; user-entered at create / Edit (CR-161) |
| `soLinesJson` | string? | **CR-250.** JSON `{ seen: [SO line ids], pending: [{ lineItemId, itemId, name, sku, qty }] }` — SO lines Sales added after create that await Add / Dismiss on Details. `null` = pre-CR row, baselined on first open. Written by create, `GET /:id`, the `salesorder` webhook and `POST /:id/so-line` |
| `mainWarehouseId` | string? | **CR-249.** This WO's Main warehouse (Books warehouse id); blank = the org `mainWarehouseId` setting. `store.warehouses(…, wo)` swaps `main` for it, so column B stock, reserve source, return / de-reserve target, assembly FG target and WO-scoped PO delivery follow it. Editable only while nothing is reserved / issued |
| `woPriority` | string? | User-entered at WO create (Low/Medium/High/Urgent; SO custom field "Priority" is prefill only, CR-113) — column named `woPriority` because `priority` is a Catalyst reserved keyword; API serves it as `priority` (CR-110) |
| `dueDate` | string? | = `shipmentDate` — the SO's Expected Shipment (built-in `shipment_date`, or a CF labelled "Expected Shipment (Date)"), re-synced on every open (CR-159); due *days* are computed client-side, never stored (CR-110) |
| `machiningDoneDate` / `fittingDoneDate` | string? | Machining / Fitting date, asked on → Ready for Machining (fitting optional) and again on → Fitting in Progress if fitting is still blank (CR-160, CR-170); shown on the WO header card. Editable from ✎ Edit / `PUT /:id` since CR-251 (auto-opened after an SO qty / line change) |

`woPriority` is the only user-owned column (`USER_OWNED`, `workorder/soFields.js`): the on-open SO re-sync only backfills it when blank (CR-113); every other SO-derived column re-syncs on every open.

### WorkOrderFG
One finished good on the work order (an SO line). A WO may carry several.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId`, `workOrderId` | string | Keys |
| `fgItemId` | string | Zoho composite item id |
| `fgName` / `fgSku` | string | Denormalised |
| `fgSize` | string? | The Books item's "Size" custom field, label-matched (CR-159). Fetched once at create (`GET /items/:id`); `null` = never fetched (pre-CR-159 rows, backfilled on next WO open), `""` = item has no Size |
| `fgQty` | number | Quantity to produce — the multiplier for column A |
| `assembledQty` | number | Units turned into FG stock via Zoho assemblies (CR-126) |
| `status` | string? | `Closed` once `assembledQty ≥ fgQty`; blank otherwise (CR-126) |
| `soLineItemId` | string? | **CR-204.** The Books SO `line_item_id` this FG was created from (blank on older rows → matched by item) |
| `soQty` | number? | **CR-204.** The SO line quantity as last seen (WO open / `salesorder` webhook). `null` = never synced |
| `soAckQty` | number? | **CR-204.** The SO quantity the planner acknowledged — set at create, by Apply and by Dismiss. `soQty ≠ soAckQty` = the amber "SO qty" badge |
| `configJson` | text? | **CR-261.** Frozen quote configuration `{ quoteNo, industryId, sel, values }` of a valve configured in the CRM Product Configurator (≤9500 chars). Set at create when the SO names a saved quote; blank otherwise. Present = the BOM comes from the Component Map for these answers and the FG never writes to the shared Books composite. **CR-270:** also holds the Product Design that fed the BOM — `{ designId, designCode, designName }`, alone or added to the quote configuration |

### WorkOrderLine
The **frozen RM requirement** for this WO — the BOM as it stood when imported.
Zoho's composite item stays the master; this exists so a later composite-item
edit cannot retroactively rewrite a closed work order.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId`, `workOrderId`, `workOrderFgId` | string | Keys |
| `rmItemId` | string | Zoho item id of the raw material |
| `rmName` / `rmSku` / `uom` | string? | Denormalised |
| `perUnitQty` | number | From `composite_item.mapped_items[].quantity` |
| `requiredQty` | number | Column **A** = `perUnitQty × fgQty` |
| `source` | string | `composite` \| `excel` \| `manual` \| `self` (non-composite SO item is its own one-line BOM, CR-152) \| `quote` (resolved from the FG's `configJson`, CR-261) \| `design` (the FG's Product Design → Materials → Books items, CR-270) |
| `diffStatus` | string? | `unchanged` \| `new` \| `qtyChanged` \| `removed` — drives the import diff colours |
| `prevQty` | number? | Previous `requiredQty` when `diffStatus = qtyChanged` |
| `revision` | number | Revision this line belongs to |

### BomRevision
Audit of every BOM change (FR-ADO-003 + the auditability NFR).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId`, `workOrderId` | string | Keys |
| `revision` | number | |
| `changedBy` | string | AppUser ROWID |
| `changedAt` | datetime | |
| `summary` | text | JSON `{ added:[], removed:[], changed:[] }` |
| `pushedToZoho` | bool | Whether the composite item was updated |
| `zohoCompositeUpdatedAt` | datetime? | |

### MaterialTxn
**One ledger for all four movements.** Reserve, de-reserve, issue and return
differ only by `type` and the warehouse pair, so they share a table, a status
flow (`Draft` → `Confirmed`), and one UI.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `txnNumber` | string | Human id |
| `type` | string | `reserve` \| `dereserve` \| `issue` \| `return` |
| `workOrderId` / `workOrderFgId` / `salesOrderId` | string | Context. `workOrderFgId` is filled only when the txn touches one FG; a multi-FG txn (CR-277) leaves it blank and each `MaterialTxnLine` names its FG |
| `status` | string | `Draft` \| `Confirmed` \| `Cancelled` |
| `fromWarehouseId` / `toWarehouseId` | string | Filled from the fixed routing table below |
| `zohoTransferOrderId` / `zohoTransferOrderNumber` | string? | The document this action wrote |
| `zohoStatus` | string? | Mirrored from Zoho on webhook/reconcile |
| `p2pLinkId` | string? | Pairs the de-reserve ↔ re-reserve of a P2P transfer (FR-DRS-002) |
| `confirmedBy` | string? | AppUser ROWID |
| `confirmedAt` | datetime? | |
| `notes` | text? | |

Warehouse routing is a constant, not configuration:

| `type` | from | to |
|--------|------|----|
| `reserve` | Main | Reserve |
| `dereserve` | Reserve | Main |
| `issue` | Reserve | Issue |
| `return` | Issue | Main |

### MaterialTxnLine

| Column | Type | Purpose |
|--------|------|---------|
| `orgId`, `txnId`, `workOrderLineId` | string | Keys |
| `workOrderFgId` | varchar 50? | The FG this line belongs to (CR-277) — a txn may span every FG of the WO; blank on lines written before CR-277 (then the txn's `workOrderFgId`) |
| `rmItemId` | string | Zoho item id |
| `qty` | number | Quantity moved by this line |
| `trackingJson` | text? | Explicit serial/batch picks (CR-123): `{"serials":[…]}` or `{"batches":[{batch_id,batch_number,qty}]}`. Empty = FIFO auto-pick. Text cap 10000 ≈ 400 serials/line — draft creation rejects bigger picks ("split the movement") |

### PurchaseRequest
The shortfall → purchase bridge (BRD §6.6).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `prNumber` | string | Human id |
| `workOrderId` / `salesOrderId` | string? | Context — **empty for a consolidated (cross-WO) PR** (CR-023) |
| `status` | string | `Draft` \| `Confirmed` \| `Cancelled` |
| `createdBy` | string | AppUser ROWID |
| `confirmedAt` | datetime? | |

### PurchaseRequestLine
**Grid columns E / F / G are summed from here**, per RM per WO — not from the
item-level snapshot. More correct (the BRD tracks PO *on the project*) and far
cheaper: the reconcile only ever refreshes POs we created.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId`, `purchaseRequestId` | string | Keys |
| `workOrderId` | string? | The WO this line was raised for (CR-023). Empty on pre-CR-023 lines → read falls back to the parent PR's `workOrderId`. Drives the per-WO procurement status. |
| `rmItemId` / `rmName` | string | Item |
| `requiredQty` | number | Shortfall that produced this line |
| `purchaseQty` | number | User-editable, must be > 0 |
| `vendorId` / `vendorName` | string? | Mandatory before Confirm |
| `zohoPoId` / `zohoPoNumber` | string? | The draft PO created on Confirm |
| `poStatus` | string? | Mirrored from Zoho (`draft`, `open`, `billed`, `closed`, `cancelled`) |
| `receivedQty` / `billedQty` | number | Columns **F** / **G** |
| `lastPoSyncAt` | datetime? | |
| `srcItemId` / `srcName` | string? | CR-285: the WO raw material this line was raised for when Books unit conversion replaced it with the Convert Item (now in `rmItemId` / `rmName`). Blank = not converted. Grid E/F/G and draft coverage key on `srcItemId \|\| rmItemId` |
| `srcQty` | number | CR-285: `purchaseQty` in source-item units; rescaled by the PO reconcile when Books edits the qty |
| `convFactor` | number | CR-285: the Books item weight (kg) used as the multiplier; 0 = not converted. Grid quantities ÷ this |
| `isExtra` | boolean | Extra material beyond the WO requirement (CR-122): ad-hoc AddLineRow lines and By-Item "Extra" entries. Read back as string — compare `=== true \|\| === "true"` |

### WoAssembly
One Zoho assembly (bundle) created from a work order FG (CR-126). Partial
assemblies each get a row; `WorkOrderFG.assembledQty` is the running sum.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId`, `workOrderId`, `workOrderFgId` | string | Keys |
| `fgItemId` | string | Zoho composite item id |
| `qty` | number | Units assembled by this bundle |
| `zohoBundleId` / `zohoBundleNumber` | string? | The Zoho Inventory bundle |
| `zohoTransferOrderId` / `zohoTransferOrderNumber` | string? | **CR-202.** The Issue → Main Transfer Order created for the finished good, so Delete assembly can remove it. Blank on rows from before CR-202 (delete then warns to remove the TO in Zoho) |
| `serialNumbers` | text? | **CR-150.** JSON array of the finished-good serials this bundle produced (`["KGV2026001", …]`, `<ValveTypeCode><YYYY><NNN>`); 10000 chars ⇒ ≤700 units per assembly |
| `createdBy` | string? | AppUser ROWID |

### DefectReturn — table id `69851000000295789` (CR-203)
One defective-material line pulled off a work order. The units went back to
Main through an ordinary `return` MaterialTxn (`txnId`); while the row is
`pending` or `returned_to_vendor` its quantity / batches / serials are
**blocked** from every pool the app reads (`workorder/blocks.js`).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` (mandatory), `workOrderId`, `workOrderFgId`, `itemId` | varchar 50 | Keys |
| `issueNumber` | varchar 50? | Human id from the org's Store issue series (`siNumberPrefix`, default `SI-`, CR-279); blank on rows raised earlier |
| `woNumber` v50, `fgName` v255, `itemName` v255, `itemSku` v100 | string | Denormalised for the Store issues grid |
| `qty` | double | Defective units |
| `trackingJson` | text | The picks, `MaterialTxnLine.trackingJson` shape: `{serials:[…]}` / `{batches:[{batch_id,batch_number,qty}]}`; blank for untracked items |
| `reason` / `actionReason` | text | Why it was defective / why the manager decided as they did |
| `photoFileId` / `photoType` | varchar 50 | Catalyst File Store file id (folder `defects`) + mime; blank = no photo |
| `status` | varchar 50 | `pending` → `repaired` (usable again) / `adjusted` (Zoho inventory adjustment −qty at Main) / `returned_to_vendor` (stays blocked) |
| `txnId` | varchar 50 | The return `MaterialTxn` — a **Draft** from raise until the first Store action confirms it (CR-280) |
| `returnedAt` | datetime? | When that return Transfer Order fired (CR-280); null = the units are still in the Issue warehouse (blocked there) |
| `replacementItemId` / `replacementName` | string | The different item the store manager chose (CR-244; before that, the shop-floor pick). Written right after the BOM swap so a refused reserve can be retried without a second swap |
| `replacementStatus` | varchar 50 | **CR-244.** `''` = awaiting the manager's replacement decision → `issued` (reserved & issued) / `pr_raised` (purchase request only) / `both` / `legacy` (rows raised before CR-244, backfilled). Independent of `status` — a row is "open" while either is undecided |
| `replacementRef` | varchar 255 | **CR-244.** Display only: the Transfer Order and/or PR numbers the decision produced ("TO-12, TO-13, PR-0007") |
| `zohoAdjustmentId` | varchar 50 | Set by the `adjusted` action |
| `raisedBy` / `actionedBy` | varchar 50 | AppUser ROWID |
| `raisedAt` / `actionedAt` | datetime | |

### CompositeItemCache
Read model for the BOM. Zoho stays master; this makes opening a work order cost
**zero** Zoho calls. Also filled by the Quote Maker's Books-only refresh
(CR-295, `refreshFromBooks({ compositesOnly })` → `getComposite(…, force)`).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId`, `fgItemId` | string | Keys |
| `name` / `sku` | string? | |
| `mappedItems` | text | JSON of `composite_item.mapped_items[]` |
| `syncedAt` | datetime | |

### Approval
Two-level sign-off (FR-ADO-007); gates invoice creation.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `entityType` | string | `WorkOrder` \| `MaterialTxn` \| `ItemIssueReturn` |
| `entityId` | string | ROWID of that row |
| `approvalLevel` | number | 1 or 2 (`level` is reserved in some SQL dialects) |
| `status` | string | `Pending` \| `Approved` \| `Rejected` |
| `approverEmail` | string | |
| `actedAt` | datetime? | |
| `remarks` | text? | |

### AlertLog
Dedupe only — stops the daily cron re-alerting on the same work order.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `kind` | string | `shortfall` \| `costThreshold` |
| `refId` | string | WorkOrder ROWID |
| `sentAt` | datetime | |
| `channel` | string | `signal` \| `email` |

### ActivityLog
One table covers the auditability NFR for every status transition in every
sub-module.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `entityType` / `entityId` | string | What was touched |
| `action` | string | e.g. `wo.status`, `wo.reopen` (detail carries the reason, CR-080), `txn.confirm`, `bom.revise` |
| `userId` | string | AppUser ROWID |
| `loggedAt` | datetime | (`at` is reserved in some SQL dialects) |
| `detail` | text? | JSON before/after |

### Extended existing tables

`ReservationLine` gains `workOrderId`, `workOrderFgId`, `requestedPoQty` — it
stays the **running balance** (C / D) so the grid is one query; the ledger above
is authoritative and `POST /api/wo/:id/recompute` rebuilds the balances from it.

`ItemStockSnapshot` gains `availableStock` and `source` (`cron` \| `webhook` \|
`writethrough`), and starts populating the already-nullable `warehouseId` — one
row per item × warehouse plus the org-total row (`warehouseId` null).
`poQty`/`receivedQty`/`billedQty` stay for the legacy reserve read path but are
superseded by `PurchaseRequestLine`.

Grid column formulas: see [WORKORDER.md](WORKORDER.md).

---

## Recipe Engine add-on (CR-104)

Reusable product recipe/configuration engine — recipes compose a main ERP
product from components with selectable materials and configurable cost
elements; quotations freeze an immutable snapshot. **Never creates variant
SKUs.** Routes under `/api/recipe` behind `requireAddon("recipe-engine")`;
math in `functions/skuapi/recipe/calc.js`.

### MaterialType — table id `69851000000259232`
Central per-org rate master. Rate edits affect **new** calculations only —
quotation snapshots freeze the rate used, so no history table.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `code` | string(50) | e.g. `CI`, `WCB`, `IC CF8M` |
| `name` | string(255) | Display name (defaults to code) |
| `rate` | number | ₹ per UOM (double 15,4) |
| `uom` | string(20) | Default `KG` |
| `effectiveFrom` | string(20) | Informational date |
| `status` | string(20) | `Active` \| `Inactive` |
| `zohoItemId` | string(50) | Linked Zoho Books raw-material item id (CR-143) — set via the Materials-page picker; required for recipe → Books composite push |
| `zohoItemName` | string(255) | Books item display name, denormalized at pick time |

### CostElement — table id `69851000000258095`
Configurable cost columns. Since CR-105 each recipe version owns its elements
(`recipeTemplateId` set); rows with blank `recipeTemplateId` are the org
"defaults library" (lazy-seeded CASTING "CS Cost" `RATE_QTY`, MACHINING "M/C",
DRILLING "Drill Etc", ASSEMBLY "Assembly") offered by the builder's
"Copy default elements" button. New recipes start with zero elements.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `recipeTemplateId` | string(50) | Owning RecipeTemplate ROWID; blank = org-default library row (CR-105) |
| `code` | string(50) | e.g. `CASTING` — immutable once created (keys option `fixedCostsJson`) |
| `label` | string(100) | UI label, e.g. `CS Cost` |
| `calcType` | string(20) | `RATE_QTY` (rate × castWeight) \| `FIXED` \| `PERCENTAGE` (% of running subtotal) |
| `sequence` | int | Calculation/display order |
| `rate` | number | Default value (CR-106): org default on master rows; optional per-recipe override, blank = inherit master live. Precedence: option `fixedCosts[code]` / quote override → `rate` → 0 |

### RecipeTemplate — table id `69851000000261063`
One row per design (CR-266: live when created, edited in place — no draft,
publish or versions). Before CR-266 it was one row per (code, version), and
publishing superseded the prior published version of the same code.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `code` | string(50) | Lineage key, e.g. `RCP-RAVS150-STD` |
| `name` | string(255) | |
| `productItemId` | string(50) | `SKUItem` ROWID (main ERP product; may be blank) |
| `productCode` / `productName` | string | Denormalized for lists + snapshots |
| `version` | int | Always 1 for new rows; unused since CR-266 |
| `status` | string(20) | `Published` = Active (set at create), `Archived` = Inactive. `Superseded` = an old version from before CR-266 (read-only, hidden from the list); `Draft` is legacy and no longer written |
| `effectiveFrom` | string(20) | |
| `changeReason` | string(255) | Version timeline text |
| `updatedBy` | string(50) | AppUser id |
| `booksCompositeItemId` | string(50) | Linked Zoho Books composite item id (CR-143). Copied into new versions so the lineage keeps pushing to the same composite; written by `POST /recipes/:id/push-books` outside `assertDraft` (works on Published recipes — link storage is not a recipe edit) |
| `uom` | string(20) | **CR-221.** Unit of the finished product, canonicalised against the org UOM list (`normUom`); blank = unset |

### RecipeComponent — table id `69851000000258454`

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `recipeId` | string(50) | RecipeTemplate ROWID |
| `code` / `name` | string | e.g. `CASING` / Casing |
| `question` | string(255) | Wizard question shown to sales |
| `sequence` | int | Order (drag reorder) |
| `qty` | number | Per finished unit |
| `uom` | string(20) | |
| `required` | bool | |
| `allowMaterial` | bool | Sales pick the material (configurable component) |
| `allowQtyOverride` / `allowComponentOverride` | bool | Flags stored; no wizard behavior yet (v1) |
| `parentComponentId` | string(50) | Nesting hook — column only, no UI (v1) |
| `skuItemId` | string(50) | **CR-221.** Optional linked `SKUItem` ROWID; own-org only (`skuItemRef`), blank = unlinked. **CR-236:** no longer written by the New/Edit page or the builder drawer (a component is a plain name; its Books items are the allowed materials via `RecipeComponentOption`) — still read by `POST /sizing/bom`. **CR-271:** set on a goods row by Product Designs v2 (Item (ZB) column); the work order takes that item × qty ahead of the row's materials |
| `price` | double(15,4)? | **CR-284.** Sell price of a service component (Product Designs v2 → Services, column 69851000000318864). `POST /sizing/bom` returns it as `price`; the configurator quotes a ticked service as its own line at this price. Null / 0 = the CRM Product's price |

### RecipeComponentOption — table id `69851000000259591`
Allowed material per component with its per-material costing inputs.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `componentId` | string(50) | RecipeComponent ROWID |
| `recipeId` | string(50) | Denormalized — whole recipe loads in 3 flat org queries |
| `materialId` / `materialCode` | string(50) | MaterialType ROWID + denormalized code |
| `castWeight` | number | kg per unit — feeds `RATE_QTY` |
| `fixedCostsJson` | text(10000) | `{"MACHINING":2000,…}` keyed by CostElement code |
| `enabled` | bool | Unticked = hidden from sales without deleting |
| `skuItemId` | string(50)? | **CR-290.** `SKUItem` ROWID of this material's own Books item on this component (Casing → CI = item X, WCF = item Y; column 69851000000353374); own-org only (`skuItemRef`). Read ahead of `MaterialType.zohoItemId` by `designBom.designLines` and `POST /sizing/bom`; blank = the Materials-page link. Set per material sub-line on the Product Designs form |

### RecipeComponentAttr — table id `69851000000251298`
Attribute (Property) attached to a component — the single-form builder's
attribute picker. Full-replace per component on save; no other table
references an attr row.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `componentId` | string(50) | RecipeComponent ROWID |
| `recipeId` | string(50) | Denormalized — whole recipe loads in flat org queries |
| `propertyId` | string(50) | Property ROWID (Range properties excluded — values pick from PropertyValue) |
| `propertyName` | string(255) | Denormalized Property caption/name |
| `unit` | string(50) | Denormalized Property unit |
| `required` | bool | |
| `defaultValueId` | string(50) | PropertyValue ROWID, optional |
| `sequence` | int | Display order within the component |

### SizingModel — table id `69851000000275543` (CR-181)
Product Configurator sizing master: one row per model with its capacity. The
CRM configurator widget proposes, per series inside the asked group, the
smallest Active model whose `capacity` covers the duty (`recipe/sizing.js`).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string(50) | Tenant key |
| `industryId` | string(50) | Industry ROWID — the product (RAV / DVT / Sift) |
| `groupValue` | string(50) | Display text of the `group`-role question's value (`Drop through`, `Blow Through`, `Sanitary`, `IC`, `CB`); matched case-insensitively |
| `series` | string(50) | Sheet column (`Square`, `RAVH-S Square`, `Round`, `Round Old`, `RAVH-S IC`, `RAVS`, `CB`, `RAVB Square`); must equal a value of the `series`-role question |
| `modelCode` | string(50) | e.g. `RAVH 150`; must equal a value of the `model`-role question (name match — no value id stored) |
| `capacity` | double(15,4) | ltr/rev |
| `recipeCode` | string(50) | `RecipeTemplate.code` lineage (survives versions). Read by `POST /api/recipe/sizing/price` (CR-211): the widget's design cost for the picked model (Published version, else newest); blank = no rate lookup. Also read by `POST /api/recipe/sizing/bom` (CR-227): the design's component list shown under the picked model (blank → the design whose `productItemId` is the linked Books item, else none) |
| `status` | string(20) | `Active` \| `Inactive` |
| `skuItemId` | string(50)? | **CR-226.** `SKUItem` ROWID of the Books valve item the configurator quotes for this model (column 69851000000293592); blank = the widget generates a new SKU for the pick. Set on the Sizing Models grid; `POST /api/recipe/sizing/select` returns it as `item` |

### SizingMaterial — table id `69851000000319828` (CR-281)
Material-efficiency master for the Product Configurator: one row per material
processed with its efficiency %. `POST /api/recipe/sizing/select` takes
`materialId` and sizes for Volume × efficiency ÷ 100 (`recipe/sizing.js`
`eff`). Managed on Recipe → Material Efficiency; Ricon's 83-row sheet seeds via
`POST /api/recipe/seed-rav-materials`.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string(50) | Tenant key (69851000000320535) |
| `industryId` | string(50) | Industry ROWID — the product (69851000000326152) |
| `name` | string(100) | Material processed, e.g. `Bolier Fly Ash` (sheet spelling kept) (69851000000326153) |
| `efficiency` | double(15,4) | Percent 1–100 (69851000000326154) |
| `status` | string(20) | `Active` \| `Inactive` — Inactive rows are hidden from the widget (69851000000326155) |

### GearedMotor — table id `69851000000327224` (CR-284)
Geared-motor selection master for the Product Configurator: Ricon's brand sheet
as one row per brand × drive configuration × TPH band × RPM band × HP → model.
The CRM widget narrows the rows client-side by step 1's TPH / RPM and the
picks Drive → TPH band → RPM band → model; the pick rides the quote line
(`config.motor`) and the work order takes `skuItemId`. Managed on Recipe →
Geared Motors; the 107 sheet rows seed via `POST /api/recipe/seed-rav-motors`.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string(50) | Tenant key (69851000000327583) |
| `industryId` | string(50) | Industry ROWID — the product (69851000000327584) |
| `brand` | string(50) | `Bonfiglioli`, `PBL (Elecon)`, `Elmech`, `SEW` (69851000000327585) |
| `driveConfig` | string(50) | `Chain Drive Only` \| `Chain Drive + Coupling (Low RPM)` \| `Direct Drive` (69851000000327586) |
| `tphMin` / `tphMax` | double(15,4) | Capacity band, inclusive (69851000000327587 / 69851000000327588) |
| `rpmMin` / `rpmMax` | double(15,4) | Speed band, inclusive; `Below 12` on the sheet is stored 1–11, a fixed RPM is min = max (69851000000327589 / 69851000000327590) |
| `hp` | string(20) | Motor HP as text — the sheet says `1.5/2`, `2 or 3` (69851000000327591) |
| `model` | string(100) | Brand model code, e.g. `R47DIBE90S4` (69851000000327592) |
| `skuItemId` | string(50)? | `SKUItem` ROWID of the Books motor item the work order takes for the pick; blank = noted on the quote line only. Seed links by item name = model (69851000000327593) |
| `status` | string(20) | `Active` \| `Inactive` — Inactive rows are hidden from the widget (69851000000327594) |

### ComponentMap — table id `69851000000291466` (CR-194)
Product Configurator component map: "when these answers hold, component X is
item Y × qty". Matched by `recipe/componentMap.js` — per `component` the Active
row with the most conditions wins. Read by the configurator widget
(`POST /api/recipe/component-map/resolve`) and by `zoho/push.js` for the Books
composite BOM of a Manufacturing item.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string(255) | Tenant key |
| `industryId` | string(255) | Industry ROWID — the product |
| `component` | string(255) | Free-text component name (`Body casting`, `Motor`); groups competing rows |
| `conditionsJson` | text | `[{propertyId, valueId}]`, AND-ed; `[]` = always. SKU-active List questions only. Guarded to ≤ 9500 chars |
| `skuItemId` | string(255) | Component `SKUItem` ROWID |
| `qty` | double(15,4) | Per-unit qty (default 1) |
| `uom` | string(20)? | **CR-206.** Unit of `qty` (`Nos`, `Kgs`, `MM` …; `normUom`, blank/null reads as `Nos`). Shown in the widget's component list and inherited by separate-line quote lines |
| `qtyPropertyId` | string(255)? | When set, qty = the numeric answer of this Range question (companion flanges); answer ≤ 0 drops the line |
| `required` | boolean | Component with a required row and no match → `missing` (widget shows it red, Books push fails) |
| `asQuoteLine` | boolean | **CR-195.** "Goes as: Separate quote line" — the matched component is sold loose: the widget adds it to the cart as its own quote line and `push.js` leaves it out of the composite BOM. Default false = BOM line |
| `status` | string(255) | `Active` \| `Inactive` |

### ConfigQuote — table id `69851000000294788` (CR-246)
The CRM Product Configurator widget's saved cart, one per CRM record per org
(`routes/recipe.js` `GET /config-quote`, `POST /config-quote/:docKey`). Seed of
the planned `PlanQuote` (system quote, CR-C).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | varchar(50), **mandatory** | Tenant key |
| `docKey` | varchar(80), mandatory | `quotes:<crm quote id>` \| `deals:<crm deal id>` (a Deal → Create Quote saves the same cart under both) |
| `crmRowIds` | text | JSON array of the Quoted_Items / custom-subform row ids the widget wrote and still owns — dropped from `keepRows` and replaced on the next push; rows typed by hand in CRM are never in it |
| `quoteNo` | varchar(100)? | **CR-261.** The CRM quote number (`Quote_No`, else `Quote_Number`) — what the converted Books SO carries; the work order finds the cart by it (`workorder/quoteBom.js`). Blank on Deal carts and on carts saved before CR-261 (filled on the next save) |

### ConfigQuoteLine — table id `69851000000312383` (CR-246)
Row per cart line — replaced wholesale on every save (PackingBox pattern).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | varchar(50), **mandatory** | Tenant key |
| `quoteId` | varchar(20), mandatory | ConfigQuote ROWID (string FK, hand-cascaded) |
| `seq` | int, mandatory | Cart order |
| `lineJson` | text | The widget line ≤9500 chars: `{id, sku, name, type, values, qty, uom, rate, disc, cls, rateTouched, badge, parent, config}`; `config = {industryId, sel, motorOp, sizingInput, pick:{modelCode, series}}` is what Edit re-opens (absent on loose component lines, which follow their `parent`). Over the cap → 413, never truncated |
| `bomJson` | text | `[{c, item, qty, cls}]` — the component list as shown under the SKU when the line was added; trimmed from the end to fit 9500 chars |

### RecipeQuotation — table id `69851000000258813`
Self-contained quotation with the **immutable configuration snapshot**.
Recipe/rate edits never touch existing rows; the snapshot is recomputed and
frozen server-side at create (`POST /api/recipe/quotations`).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `qtnNo` | string(50) | `QTN-0001` via `nextNumber` (same accepted race as WO numbers) |
| `status` | string(20) | `Quotation` → `Order` |
| `productCode` / `productName` / `recipeCode` | string | Denormalized |
| `recipeVersion` | int | |
| `qty` | number | Order quantity |
| `marginPct` / `discountPct` / `gstPct` | number | Pricing inputs (frozen) |
| `unitCost` / `unitPrice` / `orderValue` | number | Computed at freeze |
| `snapshotJson` | text(10000) | Full frozen config (lines, rates, element costs, labels). **Note:** Catalyst caps text at 10000 via API (100k requested, not honored) — quote create rejects >9.5 KB snapshots (413) instead of truncating; fits ~40 component lines |
| `createdBy` | string(50) | AppUser id |

---

## Packing List — Books widget (CR-131)

One saved packing plan per SO/invoice per org, edited and printed from the
Zoho Books widget (`/server/skuapi/packing`, `routes/packing.js`).

### PackingList — table id `69851000000264458`

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | varchar(50), **mandatory** | Tenant key |
| `docKey` | varchar(80), mandatory | `so:<salesorder_id>` (invoice resolves to its linked SO so both pages open the same plan; a WO with a linked SO resolves here too — CR-134), `inv:<invoice_id>` when the invoice has no SO, or `wo:<workorder ROWID>` for a WO with no SO |
| `variant` | varchar(10) | `export` \| `domestic` — last used print variant |
| `header` | text | JSON ≤9500 chars: consignor/consignee blocks + export refs (exporterRef, invoiceNoDate, countryOrigin, workorderNoDate, portLoading, placeReceipt, portDischarge, adCode, preCarriage, incoTerms, buyerOrderNoDate, lcNo) |

### PackingBox — table id `69851000000255819`

Row per package — no plan-size cap from the 10000-char text limit.
Replaced wholesale on every save; package numbers are a single 1..N series
derived from `seq` order at render (CR-164; was two BOX/PALLET counters),
never stored. A package holds one or more items.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | varchar(50), **mandatory** | Tenant key |
| `listId` | varchar(20), mandatory | PackingList ROWID (string FK, hand-cascaded) |
| `seq` | int, mandatory | Render order |
| `kind` | varchar(10) | `wooden` \| `corrugated` \| `pallet` \| `loose` (CR-164); legacy `box` rows read as `wooden` |
| `dims` | varchar(100) | Box size text `L X B X H` (cm), printed on the sheet's PACKING DETAILS cell and the sticker |
| `grossWeight` | double(2) | Gross weight of the whole package, kg (CR-164, col 69851000000275516). Rows saved before it carry gross in `itemsJson[0].grossWeight`; read as a fallback |
| `itemsJson` | text | JSON array `[{itemId, name, hsn, size, qty, weightPc, netWeight}]` — one entry per item in the package (multi-item since CR-164) |

---

## Schema change ledger

Newest first. One row per applied schema change; link the CR that requested it.

| Date | CR | Change | Applied |
|------|----|--------|---------|
| 2026-10-22 | [CR-290](CHANGES.md) | `RecipeComponentOption.skuItemId` (varchar 50, nullable, 69851000000353374) — Books item per material on a design component. Added via Catalyst MCP (Development). Undo: drop the column; the form stops sending it; resolvers fall back to `MaterialType.zohoItemId` | ✅ live (Dev) |
| 2026-10-22 | [CR-292](CHANGES.md) | No schema change — `SKUItem.booksData` gains `rate` (Books selling rate) on API refresh | n/a |
| 2026-10-19 | [CR-288](CHANGES.md) | `Property.valuesFromCf` (boolean, nullable, 69851000000352278) — values are the options of the mapped Books dropdown field. Added via Catalyst MCP (Development) | ✅ live (Dev) |
| 2026-10-19 | [CR-287](CHANGES.md) | No schema change — new `OrgSetting` keys `cfgFgCategoryId` (Books item category whose items are the Quote Maker's Finished Goods; blank = every Books item) and `cfgWidgetBooksOnly` (`true` = a miss shows "create it in Zoho Books", no create card) | ✅ n/a |
| 2026-10-19 | [CR-286](CHANGES.md) | `Property.booksCategoryId` (varchar 50, nullable, 69851000000351416) — Books item category that feeds the property's values via Sync from Books. Added via Catalyst MCP (Development) | ✅ live (Dev) |
| 2026-10-19 | [CR-285](CHANGES.md) | `PurchaseRequestLine.srcItemId` varchar(50), `srcName` varchar(255), `srcQty` double(15,4), `convFactor` double(15,4) — source item / qty / weight multiplier behind a unit-converted purchase line (MSUN) | ✅ live (Dev, Catalyst MCP) |
| 2026-10-09 | [CR-284](CHANGES.md) | No schema change — data (Ricon, RAV industry 69851000000296720, via Catalyst MCP): `Property` rows **Brand** (`zohoCfApiName = cf_brand`) and **Range** (`cf_range`), List, hidden from the widget, off the SKU, positions 28–29; Motor HP already maps `cf_capacity`. Their `PropertyValue` rows are auto-created by Refresh from Zoho | ✅ live (Dev) |
| 2026-10-09 | [CR-284](CHANGES.md) | New table `GearedMotor` (69851000000327224: `orgId`, `industryId`, `brand`, `driveConfig` varchar 50, `tphMin`/`tphMax`/`rpmMin`/`rpmMax` double 4dp, `hp` varchar 20, `model` varchar 100, `skuItemId` varchar 50, `status` varchar 20) — geared-motor selection sheet for the configurator; `RecipeComponent.price` (double 4dp, nullable, 69851000000318864) — service sell price per design. Added via Catalyst MCP (Development). Data: seed via `POST /api/recipe/seed-rav-motors` after deploy | ✅ live (Dev); 107 rows for Ricon RAV inserted via Catalyst MCP 2026-10-09, `skuItemId` blank (no item names matched) |
| 2026-10-08 | [CR-281](CHANGES.md) | New table `SizingMaterial` (69851000000319828: `orgId`, `industryId`, `name` varchar 100, `efficiency` double 4dp, `status`) — material processed × efficiency % for the configurator. Added via Catalyst MCP (Development). Data (Ricon, RAV industry 69851000000296720): the 83 sheet rows inserted via Catalyst MCP on 2026-10-08 | ✅ live (Dev) |
| 2026-10-07 | [CR-280](CHANGES.md) | `DefectReturn.returnedAt` (datetime, nullable, 69851000000326125) — the defective-return TO now fires on the first Store action. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-10-07 | [CR-279](CHANGES.md) | `DefectReturn.issueNumber` (varchar 50, nullable, 69851000000318632) — Store issue series; new `OrgSetting` key `siNumberPrefix`. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-10-07 | [CR-277](CHANGES.md) | `MaterialTxnLine.workOrderFgId` (varchar 50, nullable, 69851000000322271) — per-line FG for one-TO-per-action txns. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-30 | [CR-271](CHANGES.md) | No schema change — `RecipeComponent.skuItemId` written on goods rows by Product Designs v2; `SKUItem.booksData` gains `last_modified_time` (Books stamp of the last custom-field read) | n/a |
| 2026-09-29 | [CR-270](CHANGES.md) | No schema change — new `OrgSetting` key `woBomSource`; data (Dev, via Catalyst MCP): row `woBomSource = template` for org `60079238204` (69851000000312956); `WorkOrderLine.source` gains the value `design`; `WorkOrderFG.configJson` gains the design shape `{ designId, designCode, designName }` | n/a |
| 2026-09-29 | [CR-266](CHANGES.md) | No schema change — `RecipeTemplate.status` meaning: `Published` = Active from create, `Draft` no longer written; `version` / `changeReason` unused. Data (Dev, via Catalyst MCP): 6 `Draft` rows → `Published` (69851000000256280, …264177, …276254, …293685, …297835, …314161); 2 `Draft` v2 rows → `Superseded` (69851000000252309, …313126); 2 `Draft` v2 rows left as they are pending the user's pick (69851000000312281, …252320) | ✅ live (Dev), 2 rows pending |
| 2026-09-29 | [CR-261](CHANGES.md) | `ConfigQuote.quoteNo` varchar 100 nullable (column 69851000000293965) — CRM quote number, the SO → quote link; `WorkOrderFG.configJson` text nullable (column 69851000000312879) — frozen quote configuration of a configured valve. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-28 | [CR-250](CHANGES.md) | `WorkOrder.soLinesJson` text nullable (column 69851000000312756) — new SO lines awaiting Add / Dismiss. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-28 | [CR-249](CHANGES.md) | `WorkOrder.mainWarehouseId` varchar 255 nullable (column 69851000000314101) — per-WO Main warehouse, blank = org setting. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-28 | [CR-246](CHANGES.md) | New tables `ConfigQuote` (69851000000294788: `orgId` varchar 50 mandatory 69851000000288882, `docKey` varchar 80 mandatory 69851000000288883, `crmRowIds` text 69851000000288884) + `ConfigQuoteLine` (69851000000312383: `orgId` varchar 50 mandatory 69851000000313284, `quoteId` varchar 20 mandatory 69851000000313285, `seq` int mandatory 69851000000313286, `lineJson` text 69851000000313287, `bomJson` text 69851000000313288) — the CRM Product Configurator's saved cart per record. Added via Catalyst MCP (Development) | ✅ live (Dev) |
| 2026-09-23 | [CR-228](CHANGES.md) | `PropertyValue.capMin` + `PropertyValue.capMax` (double 4dp, nullable, columns 69851000000292998 / 69851000000297831) — capacity band that pre-selects the value in the CRM configurator. Added via Catalyst MCP (Development). Data (Ricon): 8 Motor `ComponentMap` rows lose the Motor supply condition, 8 Loose rows `Inactive`; `Property` Motor HP `zohoCfApiName = cf_capacity`; bands on the six Motor HP values | ✅ live (Dev) |
| 2026-09-23 | [CR-226](CHANGES.md) | `SizingModel.skuItemId` (varchar 50, nullable, column 69851000000293592) — linked Books valve item for the configurator. Added via Catalyst MCP (Development) | ✅ live (Dev) |
| 2026-09-23 | [CR-216](CHANGES.md) | No schema change — new `OrgSetting` key `uomList` (comma-separated units of measure, ≤255 chars, ≤20 chars per unit; blank = the standard list `Nos,Pcs,Kgs,Gms,Mtr,CM,MM,Ltr,Set,Box`). Written by `PUT /api/sku-items/settings` (`uoms`), read by `GET /api/recipe/uoms`, the settings GET and `normUom()` at item / Component Map writes | ✅ n/a |
| 2026-09-23 | [CR-220](CHANGES.md) | No schema change — new `OrgSetting` key `priceLadder` (JSON in `settingValue`, ~110 chars: per-class OH/Margin/P&F/Other/Disc % for the CRM Product Configurator price ladder; unset = all 0 = unit price equals base). Written by `PUT /api/sku-items/settings` | ✅ n/a |
| 2026-09-23 | [CR-211](CHANGES.md) | No schema change — new `OrgSetting` key `cfgDesignRate` (`true` = CRM Product Configurator fills Rate from the picked model's Product Design; row 69851000000293588 for Ricon 60079238204). `SizingModel.recipeCode` now read by `POST /api/recipe/sizing/price`. Data via Catalyst MCP (Dev): 7 `MaterialType` plate/rod rows, recipes `RCP-RAVS150` (69851000000312150) + `RCP-RAVH150-SS` (69851000000299877) with components/options/cost elements | ✅ n/a |
| 2026-09-23 | [CR-210](CHANGES.md) | No schema change — Manufacturer values still stored as text in `SKUItem.booksData.manufacturer`; the dropdown source is the Books master, read live | ✅ n/a |
| 2026-09-23 | [CR-209](CHANGES.md) | No schema change — new `OrgSetting` key `skuItemFields` (comma-separated enabled extra item fields from `itemFields.js` `ITEM_FIELDS`: `hsn_or_sac`, `manufacturer`; blank = org sees none). Values stored in the existing `SKUItem.booksData` JSON under the Books field keys. Data seed via Catalyst MCP (Dev): row 69851000000294624 for Fotedar India 907623451 = `hsn_or_sac,manufacturer` | ✅ n/a |
| 2026-09-23 | [CR-206](CHANGES.md) | `ComponentMap.uom` (varchar 20, nullable, 69851000000288661) + `SKUItem.uom` (varchar 20, nullable, 69851000000312154) — unit of the component qty / the item's Books unit. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-26 | [CR-244](CHANGES.md) | `DefectReturn.replacementStatus` (varchar 50, nullable) + `DefectReturn.replacementRef` (varchar 255, nullable) — the store manager's replacement decision, separate from the disposition `status`. Added via Catalyst MCP 2026-09-28 — column ids `69851000000299964` (`replacementStatus`), `69851000000299965` (`replacementRef`). Legacy backfill (`UPDATE … SET replacementStatus = 'legacy'`) ran against an empty table — no pre-CR rows existed in Dev | ✅ live (Dev) |
| 2026-09-23 | [CR-204](CHANGES.md) | `WorkOrderFG.soLineItemId` (varchar 50, nullable, 69851000000293584), `WorkOrderFG.soQty` (double 4dp, nullable, 69851000000293585), `WorkOrderFG.soAckQty` (double 4dp, nullable, 69851000000297740) — SO line link, last-seen SO qty, acknowledged SO qty. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-23 | [CR-203](CHANGES.md) | New table `DefectReturn` (69851000000295789; columns 69851000000294578–600: `orgId` mandatory, `workOrderId`, `workOrderFgId`, `itemId`, `woNumber`, `fgName`, `itemName`, `itemSku`, `qty` double 4dp, `trackingJson` text, `reason` text, `actionReason` text, `photoFileId`, `photoType`, `status`, `txnId`, `replacementItemId`, `replacementName`, `zohoAdjustmentId`, `raisedBy`, `actionedBy`, `raisedAt` datetime, `actionedAt` datetime). Catalyst File Store folder `defects` is created by the function on first upload. New `OrgSetting` key `storeIssueEmail`. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-23 | [CR-202](CHANGES.md) | `WoAssembly.zohoTransferOrderId` (varchar 100, nullable, 69851000000293580) + `WoAssembly.zohoTransferOrderNumber` (varchar 100, nullable, 69851000000293581) — the FG transfer order per assembly, for Delete assembly. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-22 | [CR-199](CHANGES.md) | No schema change — CRM Products create from the quote widgets now sends fixed picklists `Product Type = goods`, `Item Classification = Finished Good` (resolved by field label; skipped when the module lacks the field) | n/a |
| 2026-09-23 | [CR-221](CHANGES.md) | `RecipeTemplate.uom` (varchar 20, nullable, 69851000000291975) + `RecipeComponent.skuItemId` (varchar 50, nullable, 69851000000288714) — Books-style New page: product unit + Associate Items link to the SKU master. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-22 | [CR-197](CHANGES.md) | No schema change — data (Ricon org 60079238204, via Catalyst MCP): demo `RecipeTemplate` 69851000000296717 and its `RecipeComponent` / `RecipeComponentOption` / per-recipe `CostElement` rows deleted; Draft `RecipeTemplate` 69851000000291888 `RCP-RAVH100-SSQ` inserted with 6 components, 4 CI options, 4 cost elements. `POST /api/recipe/seed-demo` removed | ✅ n/a |
| 2026-09-22 | [CR-195](CHANGES.md) | `ComponentMap.asQuoteLine` (boolean, default false, column id 69851000000294542) — component sold as its own quote/SO line, excluded from the composite BOM. Added via Catalyst MCP (Development). Data seed (not schema): `POST /api/recipe/seed-rav-map` adds the RAV question `Motor supply` (Fitted/Loose) + 7 sample map rows for Ricon | ✅ live (Dev) |
| 2026-09-21 | [CR-194](CHANGES.md) | New table `ComponentMap` (69851000000291466: `orgId`, `industryId`, `component`, `conditionsJson` text, `skuItemId`, `qty` double 4dp, `qtyPropertyId`, `required` boolean default false, `status`). Added via Catalyst MCP (Development) | ✅ live (Dev) |
| 2026-09-21 | [CR-192](CHANGES.md) | `OrgSetting.settingText` text(10000) — quote T&C templates JSON (keys `estimateTpl` ×N, `estimateBank`) | ✅ live (Dev, via MCP) |
| 2026-09-18 | [CR-184](CHANGES.md) | No schema change — `OrgSetting` key `cfgNoAutoPush` (`true` = CRM widgets save new items to the SKU master without pushing to Books; blank = push at once) replaces `cfgNoAutoCreate`, which is now ignored | ✅ n/a |
| 2026-09-17 | [CR-182](CHANGES.md) | No schema change — new `OrgSetting` key `cfgNoAutoCreate` (`true` = the Product Configurator widget does NOT create new items by default; blank = auto-create on) | ✅ n/a |
| 2026-09-17 | [CR-181](CHANGES.md) | New table `SizingModel` (69851000000275543: `orgId`, `industryId`, `groupValue`, `series`, `modelCode`, `capacity` double 4dp, `recipeCode`, `status`) + `Property.sizingRole` (varchar 20, nullable, 69851000000286486). Both added via Catalyst MCP (Development) | ✅ live (Dev) |
| 2026-09-16 | [CR-180](CHANGES.md) | No schema change — new `OrgSetting` keys `skuTypeLabelTrading` and `skuTypeLabelManufacturing` (org display label for each stored item type, ≤60 chars; blank = `Direct Purchase` / `In-House Manufacturing`). The label is also the value the CRM quote widget writes to `Products.Item_Source` | n/a |
| 2026-09-16 | [CR-167](CHANGES.md) | No schema change — `PackingBox.dims` keeps the `"L X W X H"` string; the widget now edits it as three numeric fields. Item weight comes live from Books `package_details`, nothing stored | n/a |
| 2026-09-16 | [CR-166](CHANGES.md) | No schema change — new `OrgSetting` keys `skuPushTracking` (`none`/`serial`/`batch`, blank = serial) and `skuPushAccountId` (Books stock account id, blank = Finished Goods default) — push-dialog defaults | n/a |
| 2026-09-16 | [CR-164](CHANGES.md) | `PackingBox.grossWeight` (double, 2 decimals, nullable, 69851000000275516) — per-package gross weight, added via Catalyst MCP. `PackingBox.kind` values become `wooden`/`corrugated`/`pallet`/`loose` (no DDL; varchar(10) fits). New `OrgSetting` key `companyEmail` (generic key/value table) | ✅ live (Dev) |
| 2026-09-15 | [CR-161](CHANGES.md) | `WorkOrder.freightCharge` (69851000000286353), `delivery` (69851000000276556), `booking` (69851000000277765), `transporter` (69851000000281313), `tcRequired` (69851000000277767) — all varchar 255, nullable. Added via Catalyst MCP. `qcStatus` gains the value `NotApplicable` | ✅ live (Dev) |
| 2026-09-15 | [CR-160](CHANGES.md) | `WorkOrder.heldFrom` (varchar 50, nullable, 69851000000277763) — status to resume to after Hold. Added via Catalyst MCP. Data remap via ZCQL (Dev): 7 rows `MaterialAllocationPending` → `ReadyForMachining`, 2 rows `InProgress` → `MachiningInProgress`; `machiningDoneDate` / `fittingDoneDate` back in use (written by the status transition) | ✅ live (Dev) |
| 2026-09-15 | [CR-159](CHANGES.md) | `WorkOrderFG.fgSize` (varchar 100, nullable, 69851000000277727) — the Books item's "Size" CF. Added via Catalyst MCP. `WorkOrder.projectName` / `estimatedCost` / `actualCost` / `machiningDoneDate` / `fittingDoneDate` retired (kept, no longer written); `WorkOrder.dueDate` now mirrors `shipmentDate` | ✅ live (Dev) |
| 2026-09-14 | [CR-152](CHANGES.md) | No schema change — `WorkOrderLine.source` gains the value `self`; session cookie attributes now `SameSite=None; Secure; Partitioned` | n/a |
| 2026-09-14 | [CR-150](CHANGES.md) | `WoAssembly.serialNumbers` (text 10000, nullable, 69851000000277358) — finished-good serials per bundle. Added via Catalyst MCP. Also new `OrgSetting` key `serialSeq` (`"YYYY:N"`, the org's year-scoped serial counter; no schema) | ✅ live (Dev) |
| 2026-09-12 | [CR-145](CHANGES.md) | No schema change — new `OrgSetting` key `skuDefaultItemType` (existing generic key/value table) holds the org's default item type for the SKU create forms (`Trading`/`Manufacturing`; unset = Trading) | n/a |
| 2026-09-12 | [CR-143](CHANGES.md) | `MaterialType.zohoItemId` (varchar 50, nullable, 69851000000281011) + `MaterialType.zohoItemName` (varchar 255, nullable, 69851000000281012) + `RecipeTemplate.booksCompositeItemId` (varchar 50, nullable, 69851000000276248) — recipe → Books composite push linkage. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-10 | [CR-131](CHANGES.md) | 2 new tables via Catalyst MCP — `PackingList` (69851000000264458: `orgId` v50 mandatory 69851000000267114, `docKey` v80 mandatory 69851000000267116, `variant` v10 69851000000267117, `header` text 69851000000267118), `PackingBox` (69851000000255819: `orgId` v50 mandatory 69851000000269178, `listId` v20 mandatory 69851000000269179, `seq` int mandatory 69851000000269180, `kind` v10 69851000000269181, `dims` v100 69851000000269182, `itemsJson` text 69851000000269183). Packing-list plans for the Books widget. Note: the MCP Create_Column call rejects a `description` field with PATTERN_NOT_MATCHED — omit it | ✅ live (Dev) |
| 2026-09-10 | [CR-127](CHANGES.md) | `SKUItem.booksData` (text 10000, nullable, column id 69851000000255768) — Zoho Books item fields JSON captured by the Books-sheet import, merged into the push payload. Added via Catalyst MCP. Also new `OrgSetting` key `skuAutoPushImport` (no schema). Data seed (not schema): OCTFIS Demo2 (org 894544992) Fabric industry 69851000000252349 + Yarn 69851000000252350, 14 properties, 47 property values per the user's fabric/yarn coding sheets | ✅ live (Dev) |
| 2026-09-10 | [CR-126](CHANGES.md) | New `WoAssembly` table via Catalyst MCP (69851000000256661: `orgId` v50 mandatory 69851000000265343, `workOrderId` v50 mandatory 69851000000265344, `workOrderFgId` v50 mandatory 69851000000265345, `fgItemId` v50 69851000000265346, `qty` double 69851000000265347, `zohoBundleId` v100 69851000000265348, `zohoBundleNumber` v100 69851000000265349, `createdBy` v50 69851000000265350) + `WorkOrderFG.assembledQty` (double, 69851000000252351) + `WorkOrderFG.status` (varchar 50, 69851000000252352). Assembly progress per FG | ✅ live (Dev) |
| 2026-09-10 | [CR-123](CHANGES.md) | `MaterialTxnLine.trackingJson` (text 10000, nullable, 69851000000256659) — explicit serial/batch picks per movement line. Added via Catalyst MCP | ✅ live (Dev) |
| 2026-09-10 | [CR-122](CHANGES.md) | `PurchaseRequestLine.isExtra` (boolean, nullable, 69851000000260810) — extra purchase material flag. Added via Catalyst MCP. Also 4 new `OrgSetting` keys (no schema): `companyName`/`companyAddress`/`companyGstin`/`companyLogoUrl` (CR-124 print header) | ✅ live (Dev) |
| 2026-09-10 | [CR-120](CHANGES.md) | 3 new tables via Catalyst MCP — `GridPref` (69851000000255365: `orgId` varchar 50 mandatory 69851000000254717, `gridKey` varchar 50 69851000000252343, `config` text 69851000000252344), `Role` (69851000000261639: `orgId` 69851000000256650, `name` varchar 100 69851000000256651, `perms` text 69851000000256652), `UserRole` (69851000000260444: `orgId` 69851000000260803, `userId` 69851000000260804, `roleId` 69851000000260805). Column chooser layouts + Users & Roles permissions | ✅ live (Dev) |
| 2026-09-09 | recipe attrs | New `RecipeComponentAttr` table (69851000000251298) — `orgId` (varchar 50, mandatory), `recipeId`/`componentId`/`propertyId`/`defaultValueId`/`unit` (varchar 50), `propertyName` (varchar 255), `required` (boolean), `sequence` (int). Backs the recipe single-form attribute picker (`routes/recipe.js`); code shipped ahead of the table — created via Catalyst MCP at deploy time | ✅ live |
| 2026-09-09 | [CR-110](CHANGES.md) | 8 `WorkOrder` varchar(255) nullable columns — `soDate` (69851000000260430), `shipmentDate` (69851000000264216), `buyerOrderNo` (69851000000252328), `buyerOrderDate` (69851000000260432), `woPriority` (69851000000251249, `priority` rejected as reserved keyword), `dueDate` (69851000000254597), `machiningDoneDate` (69851000000260434), `fittingDoneDate` (69851000000254599) — SO-derived header fields, re-synced from Books on every WO detail open. Added via Catalyst MCP | ✅ live |
| 2026-09-09 | [CR-108](CHANGES.md) | `Property.showInWidget` (boolean, nullable) — property shows as a filter parameter in the CRM quote widget. Added via Catalyst MCP (column id 69851000000265151) | ✅ live |
| 2026-09-05 | [CR-106](CHANGES.md) | `CostElement.rate` (double 15,4, nullable) — default value: org default on master rows, optional recipe-level override on per-recipe rows (blank = inherit master live). Added via Catalyst MCP (column id 69851000000251191) | ✅ live |
| 2026-09-05 | [CR-105](CHANGES.md) | `CostElement.recipeTemplateId` (varchar 50, nullable) — owning RecipeTemplate ROWID; blank = org-default library row. Added via Catalyst MCP (column id 69851000000259980). Data backfill: RAVS150 (69851000000256208) got per-recipe copies of the 4 org elements; PC124 draft intentionally left with none | ✅ live |
| 2026-09-05 | [CR-104](CHANGES.md) | Recipe Engine: 6 new tables via Catalyst MCP — `MaterialType` (69851000000259232), `CostElement` (69851000000258095), `RecipeTemplate` (69851000000261063), `RecipeComponent` (69851000000258454), `RecipeComponentOption` (69851000000259591), `RecipeQuotation` (69851000000258813). Deviations: `question`/`changeReason` capped at varchar(255) by the API (500 requested); text columns capped at 10000 (snapshot size guarded in code) | ✅ live |
| 2026-09-04 | [CR-099](CHANGES.md) | `WorkOrder.lastViewedAt` (datetime, nullable) — last detail open, for the unseen-progress red dot. Added via Catalyst MCP (column id 69851000000252178). Also: new `OrgSetting` row `allowWarehouseSelect` (existing key/value table) gates per-txn warehouse overrides | ✅ live |
| 2026-09-02 | [CR-094](CHANGES.md) | `PropertyValue.isDefault` (boolean, nullable) — the one value pre-selected for its property in the SKU generator; one-per-property is app-enforced (no DB uniqueness). Added via Catalyst MCP (column id 69851000000256009) | ✅ live |
| 2026-09-02 | [CR-093](CHANGES.md) | `Industry.seriesPad` (int, nullable) — numerical-series suffix width (total digits); null = default 4, leading zeros = seriesPad − 1. Added via Catalyst MCP (column id 69851000000260038) | ✅ live |
| 2026-09-01 | [CR-090](CHANGES.md) | New `Org` table — `orgId` (varchar 50, unique, mandatory), `orgName` (varchar 255, nullable) — registry of every org ever selected, for the admin console. Added via Catalyst MCP (table id 69851000000233001) | ✅ live |
| 2026-09-01 | [CR-089](CHANGES.md) | `Industry.seriesStart` (int, nullable) — numerical-series start; null/0 = off, N≥1 appends per-combination 4-digit SKU suffix. Added via Catalyst MCP (column id 69851000000234005) | ✅ live |
| 2026-09-01 | [CR-082](CHANGES.md) | No schema change — new `OrgSetting` row `approvalLevels` (existing generic key/value table) holds the org's required approval level count (`0`/`1`/`2`; unset = derive from approver emails) | n/a |
| 2026-08-29 | [CR-070](CHANGES.md) | No schema change — new `OrgSetting` row `stockSyncCursor` (existing generic key/value table) holds the per-org delta cursor for incremental stock sync | n/a |
| 2026-08-29 | [CR-068](CHANGES.md) | No schema change — warehouse-stock report reads `ItemStockSnapshot` org-total rows; `writeStock` now deletes stale per-warehouse rows (same columns) | n/a |
| 2026-08-29 | [CR-067](CHANGES.md) | No schema change — full stock sweep is paged via `reconcileOrg` offset/limit; writes the same `ItemStockSnapshot` rows | n/a |
| 2026-08-29 | [CR-061](CHANGES.md) | `ItemStockSnapshot` + `itemName`, `sku` (text, nullable) — item label cached at sync time for the warehouse-stock report; backfilled by the next full sweep | ✅ live |
| 2026-08-21 | [CR-031](CHANGES.md) | No schema change — `BomRevision.summary` (existing JSON text) gains an optional `note` key; `WorkOrderLine.requiredQty = 0` rows are now legal (removed-while-committed lines kept for the completion sweep) | n/a |
| 2026-08-11 | [CR-026](CHANGES.md) | `Property.createValuesAsItems` (boolean, nullable, default false) — property-level gate: all of the property's values sync to Books as items (replaces per-value `createAsItem`) | ✅ live |
| 2026-08-22 | [CR-038](CHANGES.md) | `SKUItem.lastPushedAt` (datetime, nullable) — last successful Books push; drives the stale-sync badge. Added via Catalyst MCP (column id 69851000000187037) | ✅ live |
| 2026-08-11 | [CR-026](CHANGES.md) | `PropertyValue.createAsItem` (boolean, nullable, default false) + `PropertyValue.zohoItemId` (varchar 64, nullable) — create a value as a standalone Books item + the link | ✅ live |
| 2026-08-11 | [CR-025](CHANGES.md) | `Property.clubKey` (varchar 255, nullable) — properties sharing a club concatenate SKU codes with no separator | ✅ live |
| 2026-08-06 | [CR-023](CHANGES.md) | `PurchaseRequestLine.workOrderId` (varchar 50, nullable) — WO a line was raised for; consolidated PRs leave `PurchaseRequest.workOrderId`/`salesOrderId` empty. No backfill (read falls back to parent PR) | ✅ live |
| 2026-07-23 | [CR-013](CHANGES.md) | 13 Work Order tables: `OrgSetting`, `WorkOrder`, `WorkOrderFG`, `WorkOrderLine`, `BomRevision`, `MaterialTxn`, `MaterialTxnLine`, `PurchaseRequest`, `PurchaseRequestLine`, `CompositeItemCache`, `Approval`, `AlertLog`, `ActivityLog` | ✅ live |
| 2026-07-23 | [CR-013](CHANGES.md) | `ReservationLine` + `workOrderId`, `workOrderFgId` (string), `requestedPoQty` (number) | ✅ live |
| 2026-07-23 | [CR-013](CHANGES.md) | `ItemStockSnapshot` + `availableStock` (number), `source` (string); `warehouseId` now populated | ✅ live |
| 2026-07-23 | [CR-009](CHANGES.md) | `Property.activeInSku` (boolean, nullable, no default) — property takes part in SKU generation | ✅ live |
| 2026-07-23 | [CR-009](CHANGES.md) | `Property.includeInName` (boolean, nullable, no default) — property's value appears in the item name | ✅ live |
| 2026-07-23 | [CR-009](CHANGES.md) | Checked `SKUItem.description` — already `text` (max 10000), holds the 24-line block | n/a — no change needed |
| 2026-07-23 | [CR-006](CHANGES.md) | No schema change — import now writes `PropertyValue` rows via the existing columns | n/a |
| 2026-07-23 | [CR-007](CHANGES.md) | `ZohoToken.dc` (string, nullable) — per-user Zoho data centre | ✅ live |
| 2026-07-03 | [CR-005](CHANGES.md) | `OrgAddon` table (orgId, addonKey, enabled) | ✅ live |
| 2026-07-03 | [CR-005](CHANGES.md) | `ReservationLine` + `ItemStockSnapshot` tables (reserve read path) | ✅ live |
| 2026-07-02 | [CR-003](CHANGES.md) | `orgId` added to every business table (multi-tenancy) | ✅ live |
| 2026-07-02 | [CR-003](CHANGES.md) | `AppUser` table + `ZohoToken.userId` / `orgId` / `orgName` (multi-user auth) | ✅ live |
| 2026-06-30 | [CR-002](CHANGES.md) | Migration Postgres/Prisma → Catalyst Data Store (all tables recreated) | ✅ live |
| 2026-05-28 | [CR-001](CHANGES.md) | `Property.zohoCfApiName`, `SKUItem.zohoItemId` (Zoho Books sync) | ✅ live |

### Pending / requested (not applied)

| CR | Change | Blocked on |
|----|--------|-----------|
| — | `AppUser.role` column (replace the `ADMIN_EMAILS` env allowlist) | Admin self-service being needed |

> Per-warehouse `ItemStockSnapshot` rows are no longer blocked — the MSUN BRD
> fixed the Main / Reserve / Issue convention; folded into CR-013 above.
