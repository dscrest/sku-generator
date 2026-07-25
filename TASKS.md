# Task list — SKU Studio / OCTFIS platform

**Single source of truth for open work.** Everything that is planned, in
progress, or deliberately deferred lives here — no parallel task files.
Work Order reference material (A–I formulas, warehouse map, per-org setup, role
SOPs) lives in [WORKORDER.md](WORKORDER.md); its *tasks* are below.
`RESERVE-TASKS.md` is superseded by it and kept only for CR-005 history.

Related docs: [CHANGES.md](CHANGES.md) (change requests + shipped log),
[SCHEMA.md](SCHEMA.md) (DB), [ARCHITECTURE.md](ARCHITECTURE.md) (system),
[ZOHO_AUTH.md](ZOHO_AUTH.md) (OAuth setup).

Last updated: 2026-07-24.

---

## In progress

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

---

## Done (recent — full detail in CHANGES.md)

- [x] CR-007 Multi-DC Zoho login + phone-registered (email-less) accounts (2026-07-23)
- [x] CR-006 Import find-or-create PropertyValues for mapped properties (2026-07-23)
- [x] CR-005 Multi-add-on platform, entitlements admin, reserve read path, record-grid standard (2026-07-03)
- [x] CR-004 Org switcher + Books-only OAuth scope trim (2026-07-03)
- [x] CR-003 Multi-user Zoho auth + per-org multi-tenancy (2026-07-02)
- [x] CR-002 Backend migrated to Catalyst Data Store, deployed to SKU-GEN-OCTFIS (2026-06-30)
- [x] CR-001 Zoho Books integration + modular backend structure (2026-05-28)
