---
name: zoho-books-sync
description: What must be configured for Zoho Books push/import to work after deploy
metadata: 
  node_type: memory
  type: project
  originSessionId: 069999c6-2448-4dba-ba3f-8bd2b61c40ab
---

Zoho Books sync (item push + import) is **best-effort no-op until configured** — if `ZOHO_CLIENT_ID`/`ZOHO_CLIENT_SECRET` are unset, every Zoho call is skipped silently (see `zoho/auth.js` `isConfigured`).

Env vars live in `functions/skuapi/catalyst-config.json` → `deployment.env_variables` (template: `catalyst-config.example.json`):
- `ZOHO_DC` — data center (`com`, `eu`, `in`, …); used in all Zoho URLs.
- `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` — OAuth app creds. Absent → sync disabled.
- `ZOHO_ORG_ID` — default Books org (overridden by the org saved in the ZohoToken row).
- `ZOHO_REDIRECT_URI` — OAuth callback (defaults to localhost in dev; set to the deployed callback in prod).
- `FRONTEND_URL` — where the OAuth callback redirects back after connect.

After deploy, connect once at runtime: hit `/auth/zoho` (consent) → callback stores the refresh token in the `ZohoToken` Data Store table → select org (`/auth/zoho/select-org` or auto if only one). The app is gated in `App.jsx` until `connected` **and** `orgId` are set.

Value sync uses `Property.zohoCfApiName` → Books item custom fields (both directions). Import is create-only, per industry, matched by `zohoItemId` then `sku`.

**Why it matters:** deploy alone doesn't enable sync — creds must be in the config *and* an OAuth connect + org selection done in the live app.

Security: live OAuth secrets are currently committed in `catalyst-config.json` — rotate and move to Catalyst env secrets before this is more than a dev project.

Related: [[catalyst-deploy]].
