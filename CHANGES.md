# Change requests & change log

**Every change starts here.** A change request gets a CR id, a section in this
file (newest first) with what was asked, what shipped, and what was deliberately
not done. Schema effects go to [SCHEMA.md](SCHEMA.md); resulting work goes to
[TASKS.md](TASKS.md); structural effects go to [ARCHITECTURE.md](ARCHITECTURE.md).

| CR | Date | Title | Status |
|----|------|-------|--------|
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
