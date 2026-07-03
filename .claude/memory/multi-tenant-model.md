---
name: multi-tenant-model
description: Catalog data is multi-tenant scoped by Zoho orgId — how isolation is enforced across tables and queries
metadata: 
  node_type: memory
  type: project
  originSessionId: b9ca38bc-7eba-4462-aa54-8fafe5ddd1e7
---

The SKU catalog is **multi-tenant, scoped by Zoho `orgId`** ("shared catalog per Zoho org"): users of the same Zoho org share one catalog; different orgs are fully isolated. The org comes from the logged-in user's `ZohoToken.orgId`.

Enforcement (see `functions/skuapi/`):
- `index.js` — `requireOrg` middleware on `/api` loads the user's org and stashes `req.orgId` + `req.catalyst.__orgId` (400 if no org selected). Runs after `requireAuth`.
- `store.js` — `reqOrg(catalyst)`, `orgClause(catalyst)` (→ `orgId = '...'`), and `ownsRow(catalyst, table, id)` (guards update/delete by ROWID against cross-tenant access).
- Every catalog table carries an `orgId` column: `Industry`, `Property`, `PropertyValue`, `SKUItem`, `SKUItemValue`. Every read filters by it, every insert stamps `req.orgId`, every update/delete checks `ownsRow` first. Helpers in `itemValues.js` / `zoho/import.js` read `catalyst.__orgId` — no signature threading (same pattern as `__userId`).
- `SKUItem.sku` unique constraint was **dropped** (Data Store has no composite unique); uniqueness is now per-org via the org-scoped `findSkuRowId`. Tiny TOCTOU race on simultaneous double-submit — acceptable for internal use.

Backfill done 2026-07-02: all pre-existing null-`orgId` rows assigned to OCTFIS SUPER MART (`743418751`, the original testing org). Connected orgs so far: OCTFIS SUPER MART `743418751`, Innervation IT Solutions `912482224`.

Auth is per-user; data is per-org. See [[zoho-oauth-redirect]].

Since 2026-07-03 the org is also the **entitlement key**: `OrgAddon` table + `requireAddon(key)` middleware (`addons.js`) gate each add-on's route group per org (`sku-generator` defaults ON, others opt-in). Super-admin = `ADMIN_EMAILS` env var. Details in ARCHITECTURE.md / RESERVE-TASKS.md.
