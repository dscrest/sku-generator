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

---

## SKU catalog

### Industry
Top-level grouping; defines how a SKU string is assembled.

| Column | Type | Purpose |
|--------|------|---------|
| `name` | string | Industry display name |
| `skuSeparator` | string | Joined between SKU parts (e.g. `-`, `""`) |
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
| `zohoItemId` | string? | Linked Zoho Books `item_id` once pushed |
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
| `warehouseId` | string? | Null = org-total |
| `stockOnHand` / `poQty` / `receivedQty` / `billedQty` | number | B / E / F / G |
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
| `settingKey` | string | `mainWarehouseId`, `reserveWarehouseId`, `issueWarehouseId`, `purchaseTeamEmail`, `approverL1Email`, `approverL2Email`, `shortfallAlertDays`, `costAlertPct`, `woNumberPrefix`, `prNumberPrefix`, `txnNumberPrefix` — the full list is `SETTING_KEYS` in `workorder/store.js` |
| `settingValue` | string(255) | Always stored as text; callers coerce |

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
| `projectName` | string? | BRD's "Project \| SO \| WO" reference |
| `status` | string | `Draft` → `Approved` → `MaterialAllocationPending` → `ReadyForProduction` → `InProgress` → `QualityCheck` → `Completed` → `Closed`; `Cancelled` terminal |
| `qcStatus` | string? | `Passed` \| `Rejected` — required before `Completed` |
| `revision` | number | Current BOM revision, starts 0 |
| `bomImportedAt` | datetime? | Drives the shortfall alert (BOM import + `shortfallAlertDays`) |
| `estimatedCost` / `actualCost` | number? | Cost-threshold alert (FR-ADO-006) |
| `notes` | text? | |

### WorkOrderFG
One finished good on the work order (an SO line). A WO may carry several.

| Column | Type | Purpose |
|--------|------|---------|
| `orgId`, `workOrderId` | string | Keys |
| `fgItemId` | string | Zoho composite item id |
| `fgName` / `fgSku` | string | Denormalised |
| `fgQty` | number | Quantity to produce — the multiplier for column A |

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
| `source` | string | `composite` \| `excel` \| `manual` |
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
| `workOrderId` / `workOrderFgId` / `salesOrderId` | string | Context |
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
| `rmItemId` | string | Zoho item id |
| `qty` | number | Quantity moved by this line |

### PurchaseRequest
The shortfall → purchase bridge (BRD §6.6).

| Column | Type | Purpose |
|--------|------|---------|
| `orgId` | string | Tenant key |
| `prNumber` | string | Human id |
| `workOrderId` / `salesOrderId` | string | Context |
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
| `rmItemId` / `rmName` | string | Item |
| `requiredQty` | number | Shortfall that produced this line |
| `purchaseQty` | number | User-editable, must be > 0 |
| `vendorId` / `vendorName` | string? | Mandatory before Confirm |
| `zohoPoId` / `zohoPoNumber` | string? | The draft PO created on Confirm |
| `poStatus` | string? | Mirrored from Zoho (`draft`, `open`, `billed`, `closed`, `cancelled`) |
| `receivedQty` / `billedQty` | number | Columns **F** / **G** |
| `lastPoSyncAt` | datetime? | |

### CompositeItemCache
Read model for the BOM. Zoho stays master; this makes opening a work order cost
**zero** Zoho calls.

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
| `action` | string | e.g. `wo.status`, `txn.confirm`, `bom.revise` |
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

## Schema change ledger

Newest first. One row per applied schema change; link the CR that requested it.

| Date | CR | Change | Applied |
|------|----|--------|---------|
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
