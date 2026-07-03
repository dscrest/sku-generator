---
name: zoho-oauth-redirect
description: Zoho OAuth redirect URI must be registered in the Zoho API console AND set as ZOHO_REDIRECT_URI — both must match exactly; how to swap when custom domain arrives
metadata: 
  node_type: memory
  type: project
  originSessionId: b9ca38bc-7eba-4462-aa54-8fafe5ddd1e7
---

The Zoho OAuth redirect URI lives in **two places that must match character-for-character**, or login breaks (`Invalid Redirect Uri`, or the `code` lands on the wrong page):
1. **Zoho API console** (api-console.zoho.com → app → Authorized Redirect URIs — must be a **Server-based Application**, and commit the entry with the ⊕ button or it silently doesn't save) — Zoho validates against this.
2. **`ZOHO_REDIRECT_URI`** env var in `functions/skuapi/catalyst-config.json` — what our code sends.

**WORKING config (verified — a real 2nd Zoho Books account signed in successfully):**
- Zoho client type: **Server-based Applications** (NOT Client-based/Self Client — those don't do server-side secret exchange + offline refresh tokens).
- Redirect URI = the **SPA**, with trailing slash:
  `https://sku-gen-octfis-925638796.development.catalystserverless.com/app/`
- Flow: Zoho redirects to `/app/?code=…` → the SPA (`App.jsx`) POSTs the code to `/auth/zoho/exchange` → backend exchanges it server-side (secret + refresh token never touch the browser, only the 2-min code does). The GET `/auth/zoho/callback` route still exists but is unused with this redirect URI.
- Current live client_id: `1000.HHGWWVDWZH3YLIZVVIFCTFO2I46XNY`.

Layout: frontend at `/app`, backend (Advanced I/O fn "skuapi") at `/server/skuapi`. `index.js` strips the `/server/skuapi` prefix. DC = `com` (US — confirmed by `location=us` in the OAuth return). One deployment = one DC/app; all users must be in the same region.

**When the custom `.com` add-on domain is provided**, update all three:
- Console redirect URI → `https://<new-domain>/app/`
- `ZOHO_REDIRECT_URI` → same
- `FRONTEND_URL` → `https://<new-domain>/app`

Auth model is per-user: custom email/password login (`AppUser` table) + Sign-in-with-Zoho, refresh token stored per-user in `ZohoToken.userId`. Scopes: profile.READ + Books + Inventory + CRM. See [[zoho-books-sync]], [[catalyst-deploy]].
