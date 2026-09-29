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
Valve Selection (duty inputs → `POST /api/recipe/sizing/select` → pick a model,
which fills the `series` / `model` questions — no dropdowns for them since
CR-224 — then a Motor Operated / Bare Shaft radio; Motor shows the motor/gear
questions, Bare Shaft clears them) → Configuration (the rest, MOC first). A
model linked to a Books valve item (`SizingModel.skuItemId`, CR-226) is quoted
as that item straight away — no SKU generation, no create, no push; an unlinked
model goes on to `/api/sku/generate` →
existing item (duplicate SKU, loaded via `/api/sku-items/search`) or new item
(`/api/sku/create-item` + `/api/sku-items/:id/push-zoho`) → cart → Quote.
Generic by data: questions are the industry's Properties, sizing inputs/outputs
are found by `Property.sizingRole`; an industry without roles renders as a plain
question list. Needs both `sku-generator` and `recipe-engine` add-ons.
**Two steps (CR-246).** Header pills *1 Valve · 2 Configuration*: step 1 is the
Valve Selection + Model Selection cards (`Configuration →` and pill 2 unlock
once a model is picked); step 2 is one vertical row per question (`qRow`:
number · caption · answer · ✕, click → the options expand inline, one row open
at a time, an answer opens the next unanswered row — the MSUN Quote Maker's
parameter-list look), MOC first, Motor Selection rows only when Motor Operated,
Bare Shaft = the MOC row alone; the SKU / BOM / Qty / Base / Add footer shows
on step 2 only. A product without sizing roles renders step 2 alone.
**Saved cart + Edit (CR-246).** `Save` (and every push) stores the cart on the
CRM record — `ConfigQuote` (`docKey` `quotes:<id>` / `deals:<id>`, `crmRowIds`)
+ `ConfigQuoteLine` (row per line: the line, its `config` = product + answers
+ Motor/Bare + sizing input + picked model, and its `bom` snapshot) via
`GET/POST /api/recipe/config-quote`; reopening the widget restores it. A card's
**Edit** reloads the line's answers (same product, `/sizing/select` re-run with
the saved input, model re-picked, step 2) and "Add to lines" becomes *Update
line* (qty / UOM / disc kept, loose component lines re-derived). Pushing again
replaces the rows the widget wrote before — `keepRows` drops the ids in
`ownedRowIds`, the record is re-read after the update and the last N rows of
each subform become the new owned set — while rows typed by hand in CRM stay.
Deal → Create Quote saves the same cart under the new Quote's key. A card's
**BOM** button shows the component list as it read when the line was added.
The cart card shows the line total and *Price detail* only (no "Unit" caption).
A new SKU is always saved to the SKU master and **never pushed to Books from
this widget** (CR-238) — the line carries the *pending* chip until it is pushed
from the SKU Items page. `widget.html` (MSUN) still has the per-line **Push to
Books** switch (default from `OrgSetting cfgNoAutoPush`, CR-184).
**BOM items (CR-194, CR-224, CR-227).** On pick, when the sizing model carries a
`recipeCode` or a linked Books item, the widget posts both plus every answer
text to `POST /api/recipe/sizing/bom` and lists the Product Design's components
first (design by code, else the design whose Product is that item; material
per component = the option an answer names, else the lone option, else blank;
item = the component's linked SKU-master item, else the material's Books
item). Once the MOC is answered the widget then lists, under
the SKU, every Books item in item category *MOC caption → MOC answer*
(`GET /api/recipe/category-items`, e.g. MOC → CI: Casing CI, Side Cover CI…)
and then posts every answer to `POST /api/recipe/component-map/resolve` for
the matched component items (a `missing` component the design already lists
is not reported) — display only, the quote still gets one valve
line, and only the Component Map feeds the Books BOM — and, since CR-261, the
**work order**: a valve whose SO names a saved quote (`ConfigQuote.quoteNo` /
record id found in the SO's Reference#, custom fields or `zcrm_*` fields) gets
its WO lines from `resolveBomLines` on the quote's frozen answers
(`WorkOrderFG.configJson`, `workorder/quoteBom.js`), not from the valve's
composite, which keeps its placeholder raw material and is never written from
such a WO (assembly, BOM apply). The same route also resolves **by item** (`{ skuItemId }`, CR-200) from
the SKU's stored answers, which is how the Quote Maker gets the same list. The rule is data, not code: `ComponentMap` rows ("when these answers hold,
component X is item Y × qty", most conditions wins — `recipe/componentMap.js`),
maintained in **Product Configurator → Components** (CR-253): the end user
sees one row per component and a flat form — *same item always* or *depends on
one question: answer → item* — saved as a unit through
`PUT /api/recipe/component-map/component` (`groupRows` / `planSync` in the same
module diff-sync the rows; rows keyed on 2+ answers stay "advanced", edited per
row on `/recipe/component-map/:id`); **Test** on the grid resolves picked
answers through the same `/resolve` route. The same matcher feeds
`zoho/push.js` `buildAssociatedItems`, so a pushed Manufacturing item's Books
composite BOM = flagged-value items + mapped components; mapped items join the
generator-owned pool, so a re-push swaps them and leaves manual lines alone.
Map conditions use SKU-active questions only — duty answers are not stored on
the item. A condition on a question hidden from the widget (`showInWidget`
off) never matches from the configurator — the widget does not send it (CR-228
re-keyed Ricon's Motor rows for that reason).
**Capacity-banded answers (CR-228).** A List value may carry `capMin` /
`capMax` (Properties page value form): whenever the `capacity`-role input
changes, `autoPick` selects, per question, the value whose band contains the
TPH (overlapping edges → the higher band) and leaves questions with no hit
alone; the select stays editable. Ricon's Motor HP follows its geared-motor
sheet this way.
**Design cost (CR-211).** When the org's SKU setting `cfgDesignRate` is on and
the picked sizing model carries a `recipeCode`, the widget posts the code plus
every answer text to `POST /api/recipe/sizing/price`; the server picks each
configurable component's material option by answer text (the MOC —
`calc.js selectByMaterial`), runs `computeQuote` for one unit and the widget
fills the Base price box unless sales typed in it (no cost line is shown,
CR-238). Switch off or no linked design = no request. The BOM side of
`recipeCode` is the `/sizing/bom` list above (CR-227), display only.
**Price ladder (CR-220).** Every cart line has a class — *Mfg* (item type
`Manufacturing`, cream) or *BO* (bought-out, `Trading`, blue), switchable in
the line's Price detail popover. The line's Base price (manual, CRM
`Unit_Price` prefill, or the design cost) runs through the org's % set for
that class (`OrgSetting priceLadder`, Settings → Product Configurator → Price ladder, CR-229):
Base → OH → Margin → P&F → Other → Disc, **each step = previous ÷ (1 − pct)**
(`recipe/ladder.js`, mirrored inside the widget). The result is the unit
price sent to CRM as `List_Price`; per-line totals show on the cards (the
footer totals block was removed, CR-238). Orgs with no % set price at base. Column-matchable keys `Item
Class`, `Base Price`, `OH`, `Margin`, `P & F`, `Other`, `Disc` are offered to
Quoted_Items / custom-subform columns of those labels (`paramVals`). Next:
system plans (map rows that point at a configurable sub-product), saved plans
and team-filtered print views — see TASKS.md CR-220.
**Loose components (CR-195).** A map row with `asQuoteLine` ("Goes as: Separate
quote line") is a component sold on its own — a loose motor: the widget adds it
to the cart as its own quote line (qty × valves) and `push.js` keeps it out of
the composite BOM; the answer that decides it is an ordinary SKU-active question
(Ricon: *Motor supply* Fitted / Loose). Service items need nothing special — a
row pointing at a service item lands on the composite and `workorder/bom.js`
skips it for the WO lines. The grid imports rows from Excel/CSV (parsed in the
browser, one create call per row); `POST /api/recipe/seed-rav-map` seeds Ricon's
sample rows by caption / answer / item name.
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
label as a badge. A newly created Product also gets the fixed picklists
`Product Type = goods` and `Item Classification = Finished Good` (CR-199),
found by field label in the Products metadata and skipped when absent.
**Component items (CR-200).** When the org has the `recipe-engine` add-on
(`/auth/me` addons), every cart line resolves its components once via
`POST /api/recipe/component-map/resolve { skuItemId }` — the item's stored
answers against the Component Map, exactly what `push.js` builds the Books
composite from. Rows show under the cart card; map rows flagged "separate quote
line" become their own Trading line (id `<valve>:<item>`), removed with the
valve. Orgs without the add-on make no call.
**Home dashboard (CR-232).** The same `/widget` URL also serves a CRM widget of
type *Dashboard* (Home → Add Component → Widget). There `PageLoad` carries no
`Entity`; the widget treats that as dashboard mode: `moduleName = null`, no
record id, Create Quote only — a fresh Draft quote (no Deal/Account/Contact,
Subject = first line name) that is opened via `ZOHO.CRM.UI.Record.open` after
create, since there is no popup to close-and-reload.

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
re-copy + re-zip + re-upload (recipe in TASKS.md CR-131); the same applies
after editing `searchableSelect.js`, whose copy it carries (CR-265). Uses the Books
ZFAPPS SDK only for record context (invoice → salesorder fallback), resize and
close; data + persistence go through skuapi (`/api/packing`, no addon gate)
with the same `?t=` token dance. Plans persist in `PackingList`/`PackingBox`;
print goes through an off-screen iframe srcdoc: the Export/Domestic sheet is A4
portrait, split by `paginateSheet()` into fixed-height pages (repeated header,
stretch-to-bottom fill, page numbers, closing block on the last page — CR-188);
stickers are one A4-landscape page per package. Packages number per type
(`kindNo`/`kindTotal`, CR-187). Header fields (ports, Inco Terms, Buyer Order
No & Date, Exporter's Ref. No. …) come from Books **custom fields** on the SO,
invoice and organization profile, matched by label
(`headerFromCustomFields` in routes/packing.js, CR-205); the org's last saved
plan only seeds what no custom field supplies. `GET /api/packing/doc` is the
widget's auth probe too (no separate `/auth/me`) and runs its Books/ZCQL reads
in parallel.

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

**Per-user permissions (CR-120/239, `perms.js`):** after `requireAddon` (org
bought the module), `requirePerm(key)` / `prefixPerm(map)` check the user's
grants — union of their `Role.perms` via `UserRole`, 60s cache. Keys are a
matrix: a module key alone = View (page access; every older gate keeps
working), `<mod>.create|edit|delete|export` = verbs, `wo.action.*` = WO
action grants (`assertAction`). The middleware derives the verb from the
HTTP method (`verbFor`: GET view · PUT/PATCH edit · DELETE delete · POST =
edit when the path carries a record id else create · `READ_POST`
computations = view) and 403s "Your role cannot <verb> <Module>". The role
named **Admin** (reserved per org) = `["*"]`; `ADMIN_EMAILS` super-admins and
orgs with zero roles also resolve to `["*"]` (lockout backstops). Managed at
`/api/access` (behind `users.manage`), UI at `/settings/users` (CR-137).

### Users & Roles — `routes/access.js` (mounted `/api/access`, gated by `requirePerm("users.manage")`)
`ensureAdmin()` (`perms.js`) runs inside `userPerms` for any org that has
roles but no Admin role, and before every roles read/write here: the org
gets an Admin role assigned to its `users.manage` holders or — if none — to
everyone who has selected the org, so bootstrapping changes nobody's access
and a locked-out user repairs the org just by loading the app.

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/access/roles` | List (`{id,name,perms,users,locked}`) / create org roles (`perms` ⊆ `PERM_KEYS`; name `Admin` reserved → 400) |
| PUT/DELETE | `/api/access/roles/:id` | Update / delete; Admin → 403; delete while assigned → 409 |
| GET | `/api/access/users` | Org users (ZohoToken ∪ UserRole union) with `roleIds` |
| PUT | `/api/access/users/:userId/roles` | Full-replace the user's role assignments; removing the last Admin holder → 400 |

### Grid prefs — `routes/gridPrefs.js` (mounted `/api/grid-prefs`, any authed org user, no addon/perm gate)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/grid-prefs/:gridKey` | Org-wide column layout `{order, hidden}` for one grid |
| PUT | `/api/grid-prefs/:gridKey` | Save layout (column chooser Apply) — shared by all org users |

### Activity — `routes/activity.js` (mounted `/api/activity`, any authed org user, no addon/perm gate; CR-233)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/activity?entityType=&entityId=` | Audit trail for one record (History tab on every details page): org-scoped `ActivityLog` rows newest first, cap 200, actor names resolved (`workorder/reports.js auditRows`, shared with the WO History feed). Writers: every WO module plus `routes/recipe.js` (`recipe.*`, `material.*`, `cost_element.*`, `sizing_model.*`, `component_map.*`, `quotation.*`), `routes/skuItems.js` + `routes/sku.js` (`sku.*`) |

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
| PUT | `/api/property-values/:id` | Partial update; toggling `createAsItem` true best-effort creates the Books item. Both create and update take `capMin` / `capMax` (CR-228 auto-pick band; blank → null) |
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
| POST | `/api/sku-items/refresh-zoho` | Re-sync the SKU master from Books (CR-226): every Books item with a SKU matched by `zohoItemId` then `sku` → `name` / `sku` / blank `zohoItemId` updated, composites become Manufacturing (never demoted), unmatched items created in `{ industryId }`. Returns `{ total, updated, created, composites, skipped, errors }` |
| POST | `/api/sku-items/backfill-values` | One-shot, idempotent backfill of SKUItemValue for legacy items by reverse-matching SKU tokens |
| POST | `/api/sku-items/import-zoho` | Import new items from Zoho Books into an industry. Body `{ industryId }`. Create-only — items already linked (by `zohoItemId`, then `sku`) are skipped. Reverse-maps Books custom fields → SKUItemValue via `zohoCfApiName`. Returns `{ total, imported, skipped, valuesMapped, errors }` |
| POST | `/api/sku-items/import` | Bulk sheet import (CR-092/127). Body `{ industryId, rows, format? }` — rows parsed client-side. Default format = app template (property captions, `importItems.js`); `format: "books"` = Zoho Books item sheet (`booksImport.js`: fixed columns → `SKUItem.booksData` JSON, `"<caption> (Custom Field)"` → properties; provided SKU kept, blank SKU generated via assemble+series; CR-189: unknown List-property cells find-or-create a `PropertyValue` with an auto code, `Item ID` → `zohoItemId` with link-first dedupe, result carries `valuesCreated`; CR-255: money cells like `INR 1,200.00` parse; CR-257/258: `industryId` applies to every row; left out, each row goes to the product type named like its `Category Name` and fails when none is; a blank-SKU row builds its SKU from the filled properties and reports blank required ones as `warning`, results carry `productType`). When the org's `skuAutoPushImport` setting is on, each created row is pushed sequentially; results carry `pushed`/`pushError` |
| GET/PUT | `/api/sku-items/settings` | SKU-module org settings (`OrgSetting` via the generic workorder/store helpers). Keys: `skuAutoPushImport` → `{ autoPushImport }` (CR-127); `skuSeriesMode` (`off`/`continuous`/`params`) + `skuSeriesPad` → `{ seriesMode, seriesPad }` (CR-136 — org-wide numerical series; GET resolves the legacy per-industry `seriesStart` fallback when mode unset). UI: SkuSettingsPage (Settings hub → SKU Settings, tabs Series / Item defaults / Zoho Books, CR-229) and ConfiguratorSettingsPage (Settings → Product Configurator: `priceLadder` + `designRate` only — each page PUTs just its own keys; absent keys are left untouched). CR-209: `skuItemFields` → `{ itemFieldCatalog, itemFields }` — org-wise extra item fields (HSN Code, Manufacturer) from `itemFields.js`; the SKU Generator / SKU Items forms render only the enabled ones and send `fields:{}` which the create/update routes merge into `SKUItem.booksData` |
| GET | `/api/sku-items/manufacturers` | Names from the Books Manufacturer master (`booksApi.listManufacturers`, CR-210/CR-231: undocumented `GET /books/v3/manufacturers` → `manufacturers[].name`, probed live; Books v3 only — Inventory v1 refuses Books-only orgs; 5-min cache per org) — the dropdown source for the Manufacturer item field (`ITEM_FIELDS.manufacturer.source`); fetched only by orgs that enabled the field. Item-field rules (`digits`, `maxLen`, `lengths`) travel with `itemFieldCatalog`; the server re-checks them (`itemFieldError` → 400) on every item write |

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
| GET | `/api/wo/warehouses` | Live warehouse list + the org Main for the per-WO Main picker and the WO header (CR-259), plus `pickMain` (org setting `pickMainPerWo`) and `notMain` (Reserve + Issue ids, left out of the picker) (CR-260). Open to any WO user (`wo.orders`), unlike `/api/wo/settings` |
| GET | `/api/wo/sales-orders?q=` · `/api/wo/so/:soId` | SO picker + detail for the create flow; the detail carries the SO-owned header fields (`soDate`, `shipmentDate`/`dueDate`, `buyerOrderNo/Date`, `freightCharge`, `delivery`, `booking`, `transporter`, `priority`) under the same names as `GET /wo/:id` so the create / edit form fills read-only on pick (CR-252) |
| GET | `/api/wo/vendors` | Books vendors for the Purchase Request screen |
| GET | `/api/wo/items?q=` | Books-item typeahead for the WO Items tab (CR-031) — only existing Books items |
| GET | `/api/wo/composites` | All Books composite items — the global BOM page's grid (CR-028) |
| GET | `/api/wo/composites/:itemId/bom` | Composite BOM, cache-first (`?refresh=1` forces Zoho) |
| POST | `/api/wo/composites/:itemId/bom/preview` | Sheet vs composite diff; unmatched rows resolved against Books, rest → `missing` |
| POST | `/api/wo/composites/:itemId/bom/apply` | Write `mapped_items` to Books; `createMissing` creates plain component items first |
| POST | `/api/wo/composites` | Create a new Books composite item from a sheet |
| POST | `/api/wo/composites/import` | Bulk import of a Books composite-items export — update matched composites, create unknown ones |
| GET/POST | `/api/wo` | List work orders / create from an SO (seeds each FG's BOM from its composite item). List rows carry `attention` (red dot: PO receipt since last open) and `soQtyChange {fgName, from, to}` (red ▲/▼: SO line qty awaiting Apply / Dismiss, CR-245) |
| GET/PUT | `/api/wo/:id` | Work order with FGs, purchase requests, transactions, approvals. GET also re-syncs the SO-derived header fields (`soFields.js`, CR-110) from Books into the row — one Books call, stored values serve if it fails. PUT edits `woDate`, `machiningDoneDate`, `fittingDoneDate` (CR-251), `priority`, `tcRequired`, `notes`, `mainWarehouseId` |
| POST | `/api/wo/:id/status` | Status transition, incl. the QC gate (Rejected → back to In Progress). Entering Ready for Machining / Fitting in Progress needs the machining / fitting date — `400 {code:"needDate", fields}` until the client resends them (CR-170). `Completed` is refused (409) while any line has reserved qty > 0 — issue or de-reserve first (CR-151); it then auto-returns over-issued material to Main via `txn.autoReturnOnComplete` — a Zoho failure aborts the transition (CR-031) |
| POST | `/api/wo/:id/lines` | Single-op item edit during production (CR-031): `add`/`setQty`/`remove`/`replace` + reason (`bom.applyLineOp`). Internal only — never writes to the composite item or SO; committed lines are kept at qty 0 for the completion sweep; locked at Completed/Closed/Cancelled |
| POST | `/api/wo/:id/replace` | Replace defective material (CR-203, `wo.action.return`): `{ fgId, lines:[{itemId, qty, tracking?, replacement?}], reason, photoFileId? }` → one confirmed `return` txn Issue → Main, a `DefectReturn` row per line (blocks those units from reuse), the BOM swap for a different item, activity `defect.raised`, email to `storeIssueEmail` |
| POST | `/api/wo/:id/so-line` | A line Sales added to the SO after create (CR-250): `{ lineItemId }` seeds it as a finished good + BOM (`seedFg`, shared with create; `wo.fg.added`); `{ lineItemId, ack:true }` dismisses (`so.line.dismissed`). Pending lines come from `WorkOrder.soLinesJson`, refreshed on `GET /:id` and by the `salesorder` webhook |
| POST | `/api/wo/:id/fg/:fgId/qty` | Apply a Sales Order quantity change (CR-204): `{ qty }` rescales live BOM lines by `perUnitQty` (committed guard, one BomRevision, `wo.fgqty`); `{ ack:true }` only acknowledges the SO qty (`so.qty.dismissed`) |
| GET | `/api/wo/defects?status=` | Store issues (CR-203, `wo.defects`): every defect with names resolved; `pending` count feeds the sidebar badge |
| POST/GET | `/api/wo/defects/photo` · `/api/wo/defects/:id/photo` | Photo upload (raw `image/*` body ≤6 MB → Catalyst File Store folder `defects`; open to any WO user) · stream it back |
| POST | `/api/wo/defects/:id/action` | Store Issue Manager decision `{ action: repaired \| adjusted \| returned_to_vendor, reason }`; `adjusted` posts a Zoho inventory adjustment (−qty at Main with the picks) and re-syncs the item; all three log `defect.<status>` on the WO |
| GET | `/api/wo/:id/bom` | Frozen BOM lines + revision history |
| POST | `/api/wo/:id/fg/:fgId/assemble` | `{ qty, prefix, components?: [{ itemId, tracking }] }` (CR-176 picks) → Zoho Inventory bundle at any shop-floor stage once the FG is fully issued (`wo.action.assemble`, CR-126/150/172; 409 otherwise); driven from Details → Assembly; returns `bundleNumber`, `serials[]`, `serialRange`, `assembledQty` |
| DELETE | `/api/wo/:id/assembly/:asmId` | Body `{ reason }` (required, audit trail). Undo one assembly (CR-202, `wo.action.assemble`, WO must be on the shop floor): Zoho first — delete its Transfer Order, then its bundle — then the `WoAssembly` row, `assembledQty` and FG status; a Zoho refusal changes nothing locally. An assembly without a stored TO id (pre-CR-202) has its TO resolved by number — row, else the `fg.assemble` History entry — via `inventoryApi.findTransferOrderByNumber` (CR-212). Serials are not reclaimed. Driven from the WO "Show Completed Items" tab's ⋮ (CR-208 name; sits after Purchase) |
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
Reusable recipe/configuration engine — recipes (live when created, edited in place; no draft / publish / versions since CR-266)
compose a main ERP product from components with selectable materials and
configurable cost elements; quotations freeze an immutable JSON snapshot.
Costing math lives in `recipe/calc.js` (pure, `--selftest`); demo data in
`recipe/seedData.js`. Server owns all pricing — the UI never computes cost.

| Method | Path | Purpose |
|--------|------|---------|
| CRUD | `/api/recipe/materials(/:id)` | Rates master (delete 409s when referenced; use Inactive) |
| GET | `/api/recipe/cost-elements` | Per-org cost columns (lazy-seeds CASTING/MACHINING/DRILLING/ASSEMBLY) |
| GET | `/api/recipe/products` | Thin SKUItem list for the wizard (independent of sku-generator gate); rows carry `type` (CR-263) |
| GET | `/api/recipe/products/composites` | The Books org's active composite items as `SKUItem` rows `[{ id, sku, name }]` — the Product Design form's Main product list. `zoho/import.js syncComposites` promotes matched rows to `Manufacturing` and adds the ones the SKU master lacks, so `productItemId` stays a `SKUItem` ROWID (CR-264) |
| CRUD | `/api/recipe/recipes(/:id)` + `/components` + `/options` | Recipe builder; every design is writable in place (`assertEditable` refuses only a Superseded pre-CR-266 copy); `GET /recipes` hides Superseded rows; `DELETE` works on any design. `POST /recipes` takes `uom` + `components[]` in one request — the Books-style **New / Edit** page (`RecipeNewPage.jsx` at `recipes/new` and `recipes/:id/edit`, CR-221; edit = `PUT /recipes/:id` + `PUT /recipes/:id/components-bulk` + `DELETE /components/:id`); components carry `skuItemId` (own-org `SKUItem`, `skuItemRef`) |
| PUT | `/api/recipe/recipes/:id/component-order` | Drag-and-drop reorder |
| POST | `/api/recipe/recipes/:id/clone` · PUT `/status` | Clone `{code, name}` = deep copy (`copyRecipeInto`) under a new code, live at once, no Books link (CR-230); status `{status}` Published (= Active) ↔ Archived (= Inactive) only. `/publish`, `/new-version` and `GET /versions` were removed in CR-266 |
| POST | `/api/recipe/recipes/:id/calculate` | Cost/price for a selection (wizard review + builder Test tab; nothing saved) |
| GET/POST | `/api/recipe/quotations(/:id)` · POST `/:id/convert` | Create = recompute + freeze snapshot + `QTN-` number; convert → `Order` |
| GET/POST/PUT/DELETE | `/api/recipe/sizing-models(/:id)` | Product Configurator sizing master (`SizingModel`, CR-181); perm `recipe.sizing` |
| POST | `/api/recipe/sizing/select` | `{industryId, tph, bd, rpm, group}` → `recipe/sizing.js` `selectModels`: `reqCap`, per-series best fit (+ one size up, ties, `tooBig`); options carry the `model`/`series` question value ids and `item {id, sku, name, type, zohoItemId}` from `SizingModel.skuItemId`, else from the linked Product Design's `productItemId` (CR-226). Perm `recipe.configure` |
| POST | `/api/recipe/sizing/price` | `{recipeCode, answers[]}` → design cost for the widget's Rate box (CR-211): 404 unless `OrgSetting cfgDesignRate` is `true`; Published version of the code, else newest; `calc.js selectByMaterial` (option `materialCode` = any answer text, else the lone option, else 400 naming the component) → `computeQuote` qty 1 → `{recipe, unitCost, lines}`. Perm `recipe.configure` |
| POST | `/api/recipe/sizing/bom` | `{recipeCode?, skuItemId?, answers[]}` → the picked model's Product Design component list for the widget's BOM box (CR-227): design by code (Published, else newest), else the design whose `productItemId` is the own-org `skuItemId`; per component the material option an answer names, else the lone option, else blank (never 400s, not gated by `cfgDesignRate`); line `{component, qty, uom, required, material, sku, name, inBooks}` from `RecipeComponent.skuItemId` → `SKUItem`, else `MaterialType.zohoItemName`; no design → `{recipe:null, lines:[]}`. Perm `recipe.configure` |
| GET/POST | `/api/recipe/config-quote?docKey=` · `/config-quote/:docKey` | CRM Product Configurator saved cart per record (CR-246): GET → `{ crmRowIds, lines | null }`; POST `{ crmRowIds, lines, quoteNo? }` (quote number for the WO lookup, CR-261) upserts `ConfigQuote` and replaces its `ConfigQuoteLine` rows (a line over 9500 chars → 413, the BOM snapshot trimmed to fit). `docKey` = `quotes:<id>` \| `deals:<id>`; perm `recipe.configure` |
| POST | `/api/recipe/seed-rav` | Idempotent RAV starter: Industry + 26 questions + values + 43 sizing models (`recipe/seedData.js`), bulk inserts |
| GET | `/api/recipe/books-items?q=` \| `/books-composites` | Books lookups (CR-143): material-link typeahead; composite picker for first push |
| GET | `/api/recipe/category-items?parent=&child=` | Books items under item category parent → child (CR-224; `booksApi.listCategories` cached per org + `listItemsByCategory`), unknown pair → `[]`. Configurator's MOC list. Perm `recipe.configure` |
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
| `itemFields.js` | Org-wise extra item fields (CR-209): `ITEM_FIELDS` catalogue (`hsn_or_sac`, `manufacturer` — key = Books item API field), `enabledKeys` from `OrgSetting skuItemFields`, `pickItemFields` / `mergeBooksData` into `SKUItem.booksData`, `catalogueFields` for the composite push. An entry's optional `source` is an app route returning the allowed values — the forms render a dropdown from it (Manufacturer → Books master, CR-210). Self-checked (`itemFields.test.js`) |
| `routes/*.js` | The route handlers above (`auth`, `zohoAuth`, `industries`, `properties`, `propertyValues`, `sku`, `skuItems`, `reserve`, `admin`) |
| `zoho/auth.js` | OAuth config, multi-DC host resolution (`dcHosts`), token load/exchange/refresh, org selection |
| `zoho/booksApi.js` | Zoho Books v3 / Inventory v1 client (`createItem`, `updateItem`, `getOrganizations`, `listItems`, `getItem`, `listItemCustomFields`, SO/PO reads, `stampSalesOrderWo` — the SO's `cf_work_order_no_and_date` custom field, CR-173) |
| `zoho/inventoryApi.js` | `getCompositeItem`/`updateCompositeItem`/`updateCompositeItemFields`/`listCompositeItems`/`createCompositeItem` (BOM + CR-029 full payload), `listWarehouses`, `getItemStock` + write stubs |
| `zoho/push.js` | `pushToZoho` — best-effort create-or-update, no-op until configured, branching on `SKUItem.type` (CR-029): Trading → plain Books item, Manufacturing → composite/assembly item with associated items from `createValuesAsItems` properties (`buildAssociatedItems`, resolves each value via `pushValueToZoho`; unselected flagged properties are skipped — CR-030 — only a selected value that can't resolve fails). A Manufacturing re-push also swaps the composite's property-derived BOM lines (`mergeMappedLines`/`syncMappedItems` — manual lines and quantities untouched, write only on change). Type locks after first push, so `type` also says which Books API `zohoItemId` belongs to. Invoked by the manual `POST /sku-items/:id/push-zoho` route and by `POST /sku/update-item` for already-linked items (CR-030's exception to CR-021's no-auto-push rule) |
| `zoho/import.js` | `importFromBooks` — create-only import of Books items, mapping custom fields to SKUItemValue (find-or-create PropertyValue) |
| `reserve/sync.js` | Legacy per-item stock sync (superseded by `workorder/sync.js`'s bulk reconcile) |
| `reserve/zohoDocs.js` | Legacy seam — the real document mapping now lives in `workorder/formulas.js` `ROUTES` |
| `workorder/formulas.js` | **Columns A–I, the four warehouse routes, per-action caps, balance transitions.** `componentQtys` (what N assembled units consume per line, shared with assembly.js) and the row's `consumed` / `returnable = issued − consumed` — the Return/Replace cap since CR-230. Self-checked |
| `workorder/status.js` | WO lifecycle table (CR-160): FLOW, `BACK` (one step back on the shop floor, CR-171), done/edit-locked/holdable sets, material + assembly + stage-date gates, `nextStatuses(wo)` / `prevStatuses(wo)`. Self-checked |
| `workorder/store.js` | `OrgSetting` KV + defaults, warehouse map, `routeFor`, document numbering, `ActivityLog`. Self-checked |
| `workorder/bom.js` | Composite-item cache, requirement freeze, upload matching, three-way diff, committed-material guard. Self-checked |
| `workorder/grid.js` | Assembles the A–I grid from our own tables (BOM ⋈ snapshot ⋈ balances ⋈ PR lines) |
| `workorder/txn.js` | The material ledger: draft → confirm → one Transfer Order, write-through snapshots, `recompute`. Self-checked. Since CR-203 every plan/confirm runs the defective block list (`planLines(…, blocked)`, `assertPicksAllowed`, `createTransferOrder.blockedEntry`) |
| `workorder/blocks.js` | Defective-material block list (CR-203): open `DefectReturn` rows → per-item `{ qty, batches, serials }`; `applyBlocks` trims any Zoho item pool, `blockedPick` judges explicit picks, `entryFor` limits batch blocks to Main. Pure, self-checked |
| `workorder/defects.js` | Defective material (CR-203, split CR-244): `raise` (return txn + DefectReturn rows + activity + email — reason and photo only), then two independent manager decisions: `replace` (`replacementPlan` pure; optional BOM swap via `bom.applyLineOp`, idempotent through `replacementItemId`; reserve top-up → issue with the manager's picks → `purchase.createPR` for the shortfall; row updated last so a refused leg is retryable) + `replacementOptions` (`grid.mainStock` − blocked, `txn.trackingPool`), and `action` (repaired / adjusted → `inventoryApi.createInventoryAdjustment` + `syncItem` / returned_to_vendor). `list` honours `status=open` (disposition pending OR replacement awaiting). File Store photo save/stream (folder `defects`). Self-checked |
| `workorder/soFields.js` | SO header fields (CR-110) + SO quantity change detection (CR-204): `soQtyChanges` (pure), `syncSoQty` (persists + `so.qty.changed`), `soQtyPending` (badge rule), `soQtyChange` (list arrow `{fgName, from, to}`, CR-245). New SO lines (CR-250): `parseSoLines`, `soNewLines` (pure), `syncSoLines` (persists `WorkOrder.soLinesJson` + `so.line.added`). Tested (`soFields.test.js`) |
| `workorder/assembly.js` | `assembleFg` (CR-126/150/172/175/176): any shop-floor stage, FG fully issued (`formulas.fullyIssued`); validates the modal's per-component batch/serial picks (`componentQtys` + `applyPicks`, explicit picks win over FIFO) before any Zoho call; pushes the WO BOM to the composite, then one Zoho Inventory bundle (`POST /inventory/v1/bundles`) **at the Issue location** (assemblies are single-location), one serial per unit, then a best-effort Transfer Order Issue → Main for the finished good (`transferOrderNumber` / `transferWarning`, TO id kept on the row since CR-202); records `WoAssembly` and FG progress. `deleteAssembly` (CR-202) reverses one: Zoho TO then bundle (`inventoryApi.deleteTransferOrder` / `deleteBundle`), then the local row + FG progress; `listAssemblies` feeds the WO Assembly tab (full `serials[]`, TO number) |
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
(`SettingsLayout.jsx`). Zoho-Setup style (CR-229): the main sidebar is hidden
under `/settings/*`; the hub's own left panel lists sections in groups
(General / Add-ons) + search, filtered by the same addon/perm rules as the
main nav; a section with several pages opens with a `TabBar`
(`components/TabBar.jsx`, shared with the SKU Generator tabs). Product
Configurator's *Configure & Quote* / *Quotations* pages have no menu entry
(deep-link only). Old paths (`/sku/industries*`,
`/sku/properties`, `/sku/settings`, `/wo/settings`, `/access/users`,
`/admin/addons`) redirect into the hub.

| Route | Page | Purpose |
|-------|------|---------|
| `/sku/items` | `SKUItemsPage` | The "SKU Generator" tab: browse/search items (free-text + SKU/Type/Industry/property filters, paginated grid); Toolbar **+ New** → `/sku/generator`, Import / Refresh / Push all unsynced. Row click → `/sku/items/:id`; old `?item=` links redirect there (CR-233) |
| `/sku/items/:id` | `SKUItemPage` | Record page (CR-233): rail of items (search, Industries, Books), header name · sku · Books state · **Edit** (read-only until then) · More ▾ Open in Generator / Push to Zoho / Delete · ✕, tabs Details · History |
| `/recipe/recipes` · `/recipe/recipes/:id` | `RecipeListPage` · `RecipeBuilderPage` | Product Designs grid → record page: rail (Statuses, Products), header · Push to Books · Edit · More ▾ Clone / Mark Inactive-Active / Delete, tabs Overview (details + Associated Items) · Components · Materials & costing · History (CR-230, CR-233; no Publish / Versions since CR-266 — status shows Active / Inactive via `statusLabel` in `recipeShared.jsx`). New/Edit form = `RecipeNewPage` — Component table + **Services** table (CR-254: a `RecipeComponent` with `allowMaterial=false` + `skuItemId` → a Books service item; `bomLines` pushes it as its own composite line) |
| `/recipe/quotations` · `/recipe/quotations/:id` | `RecipeQuotationsPage` · `RecipeSnapshotPage` | Quotations grid → record page: rail, Convert to sales order, More ▾ Manufacturing requirement / Print, tabs Snapshot · History (CR-233) |
| `/recipe/component-map` · `/recipe/component-map/new` · `/recipe/component-map/edit?industryId&component` | `RecipeComponentMapPage` · `ComponentEditPage` | Components (CR-253): two sections like the Books composite item (CR-254) — **Associated Items** and **Associated Services** (a component whose item is a Books service, `booksData.product_type`; `?kind=service` form = service item · fixed qty · UOM · status only) — one grid row per component (Item = `SKU — name` or `By <question> · n/m answers`, `+n rules` when advanced rows exist), row click / Add → the flat form (Product · Component · Item: same always / depends on a question → Answer · Item table · Quantity · Required · Goes as · Status · Advanced rules), Test modal (answers → resolved lines + missing), Excel import; `/recipe/component-map/:id` stays the per-row record page for advanced rows |
| `/recipe/materials(/:id)` · `/recipe/costs(/:id)` · `/recipe/sizing(/:id)` · `/recipe/component-map/:id` | master grid pages · `MasterDetailPage` | Each master grid (row click → details; New = the grid's modal) and one config-driven record page (`pages/MasterDetailPage.jsx`, CR-233): rail, Edit (same form as the grid, exported from the master file), More ▾ Duplicate (Component Map) / Mark Inactive-Active / Delete, tabs Details · History |
| `/sku/generator` | `SKUGeneratorPage` | The "+ New" sub-page (kept as a route for permalinks), in the record shell (CR-240): the same items rail as `/sku/items/:id` (`SkuRail`), header **New** (or the edited item's SKU) · live SKU chip · **Create / Save** · ✕; opens on the first industry; vertical list of all its properties → live SKU + name + description preview → create item, then back to the list (or to the item when editing via `?item=`) |
| `/settings/org` | `OrgSettingsPage` | Settings hub: org profile + Switch Org, Books connection/Reconnect, admin-only add-on matrix (embeds `AddonAdminPage`) |
| `/settings/users` | `UsersRolesPage` | Settings hub: roles + user↔role assignment (`users.manage`) |
| `/settings/sku` | `SkuSection` | Settings hub: tab strip Series · Item defaults · Zoho Books · Industries · Properties; index → `series` |
| `/settings/sku/:tab` (`series` / `items` / `books`) | `SkuSettingsPage` | Series: numerical series mode + format. Item defaults: default item type + labels, extra item fields (CR-209), UOM list (CR-216). Zoho Books: push defaults, auto-push import, widget auto-push. One component, one Save across the three tabs |
| `/settings/configurator` | `ConfiguratorSettingsPage` | Product Configurator (addon `recipe-engine`): price ladder (CR-220) + rate-from-design-costing toggle (CR-211) |
| `/settings/sku/industries` | `IndustriesPage` | Manage industries |
| `/settings/sku/industries/:id/properties` | `PropertyManagerPage` | Manage one industry's properties + values (incl. Books custom-field mapping) |
| `/settings/sku/properties` | `PropertiesPage` | All org properties in one grid, filterable by industry/type/required |
| `/sku/books-items` | `BooksLinkedValuesPage` | The "Books items" tab: read-only grid of property values also created as standalone Zoho Books items (CR-026), filterable by industry |
| `/wo` | `WorkOrderListPage` | Work order grid; **+ New** → `/wo/new` |
| `/wo/new` · `/wo/:id/edit` | `WorkOrderNewPage` | One flat form for create and edit shaped like the Zoho Books New Sales Order page (CR-252): label-left / control-right rows — Sales order (search picker; read-only when editing) · Customer · Main warehouse — Work Order# (auto) · WO Date · Expected Shipment (read-only = due date) · Machining / Fitting dates · Priority segments · TC Required — a two-column read-only block of the SO's own fields (SO Date, Buyer Order No/Date, Freight Charge, Delivery, Booking, Transporter) — a finished-goods item table (tick + qty on create; plain rows with size on edit) — Special Instruction — Cancel · Create / Save. Create → `POST /api/wo`, Save → `PUT /api/wo/:id`; the CR-251 amber hint arrives via router state |
| `/wo/:id` | `WorkOrderPage` | Zoho-Books-style split view (CR-018): left rail of all work orders, right detail with toolbar (✎ Edit → `/wo/:id/edit` · Approve ▾ two-level dropdown · status actions · ⋯ Print PDF / Print Material Issue Copy — CR-190, `woIssueCopy.js` rolls all confirmed issues up per material and reuses `IssueSlip` / Delete) and sub-tabs **Details** (the A–I Materials grid), Approvals, History |
| `/wo/bom` | `CompositeBomPage` | Global BOM page (CR-028): grid of Books composite items (no work orders) → row drills into upload/paste + coloured diff, apply straight to Books (optionally creating missing component items); "New composite item" builds one in Books from a sheet |
| `/wo/purchase` | `WorkOrderPurchasePage` | Global Purchase page ("Purchasing"): By Item (per-RM shortfall raise; PR-number links + "Associated WO ▾" breakdown toggle per row, CR-144) + Requests/Orders grids (Orders = all Books POs via `/api/wo/purchase-orders`, 🔒 when received/billed) → row drills into `PurchaseTab` (per WO), `PrCard` editor (per PR, incl. consolidated cross-WO ones) or `PoSplit` (per PO) |
| `/wo/defects` | `WoDefectsPage` | Store issues (CR-203 / CR-244, `wo.defects`): defective-material returns with photo, batch/serials, reason, **Replacement** column and defective-units status; default filter Open. ⋮ → Replace — Reserve & Issue / Replace — Raise PR (`ReplaceModal`: optional `ItemPicker`, live reservable/short from `replacement-options`, reason, then `TrackingPicker`) and Restock — repaired / Trash — write off / Return to vendor (`ReasonModal`). Sidebar pill = open count (`?status=open`), fetched on navigation |
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
`distinct`, `SearchInput`, `matches` — every grid's search box and matcher, CR-262;
`matches` lives in `gridCols.js` so the node self-check can import it), `RowEditButton.jsx`, `RowDeleteButton.jsx`, `Modal.jsx`,
`Menu.jsx` (header dropdown — WO ⋯, every record page's "More ▾"; CR-230),
`RecordPage.jsx` (`RecordRail` items panel + `RecordPage` header · tabs · body — the
record-page pattern, CR-233), `HistoryTab.jsx` (`AuditList` + the audit-trail tab over
`/api/activity`), `PushZohoDialog.jsx`, `pages/MasterDetailPage.jsx` (config-driven record page for masters),
`Toolbar.jsx`, `SKUPreview.jsx`, `GlobalSearch.jsx` (⌘K catalog search over SKU
items + properties, rendered in the SKU tab bar). Record conventions (CR-233): a grid
with pinned footer pagination (25 default), a search box and value-based filters (CR-262), a labelled **+ New** primary button at the right end of the Toolbar (CR-240),
⋮ RowMenu; row click opens the record page (left items panel, related tabs ending in
History, Edit, More ▾ for the important actions); no page titles or captions.

Searchable dropdowns (CR-265): every pick list filters as you type. `components/searchableSelect.js`
(plain ES5, no imports) is installed once in `main.jsx` and listens on the document: a click or an
opening key on any native `<select>` is intercepted and a panel (search box + list built from
`select.options`) opens in place of the OS popup. A pick sets `selectedIndex` and dispatches native
`input` + `change`, so React `onChange` and widget `onchange` handlers run unchanged — pages keep
writing plain `<select>`, nothing opts in or out. The panel is appended to `<body>`
(`position: fixed`, z-index 2000, above Modal 500 and DateInput 1000), stops its own mousedown /
scroll / keydown from reaching the outside-click, scroll and Escape closers of whatever it was
opened from, and closes when its select leaves the DOM. Touch devices (`hover: none`) keep the OS
picker. The widgets cannot share a file, so `functions/skuapi/widget.html`, `configurator.html`,
`packing.html` and `books-widget/app/widget.html` carry the module body pasted at the top of their
`<script>`; `searchableSelect.test.js` asserts the copies are verbatim. `PickList.jsx` (free-text
typeahead input, CR-231) and the `<datalist>` inputs are separate and already filter.

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
