# Zoho OAuth 2.0 — How Login & Per-User Tokens Work in SKU Studio

This document captures the full discussion: how Zoho OAuth 2.0 works (grounded in the
[v8 OAuth Overview](https://www.zoho.com/crm/developer/docs/api/v8/oauth-overview.html)
and [Authorization Request](https://www.zoho.com/crm/developer/docs/api/v8/auth-request.html) docs),
how our app implements "Sign in with Zoho" + custom login, and — the key question —
**how one registered client (one Client ID/Secret) authenticates many different Zoho
users, each with their own refresh token, using native Zoho Books authentication.**

---

## 0. The redirect-URI point (clearing the confusion)

- `dummyurl.com` in the earlier screenshot was a **placeholder** left in the Zoho
  API Console. It must be replaced.
- Our **live domain** is the Catalyst URL:
  `https://sku-gen-octfis-925638796.development.catalystserverless.com`
- But the **registered redirect URI is NOT `/app/`.** `/app/` is the frontend
  (the React UI). The redirect URI must be the **backend callback** that receives
  the `code` and exchanges it server-side (so the Client Secret never touches the
  browser):

  ```
  https://sku-gen-octfis-925638796.development.catalystserverless.com/server/skuapi/auth/zoho/callback
  ```

  That callback does its work, then redirects the user's browser to `/app/`.

**Rule from the docs:** `redirect_uri` *"must match the registered URI exactly"* — so
the string above must be identical in three places: the Zoho Console, our
`ZOHO_REDIRECT_URI` env var, and what our code sends. It already matches in our env
var; the only remaining step is pasting it into the Console.

---

## 1. The three tokens (from the Zoho v8 docs)

| Token | What it is | Lifetime | Where it comes from |
|-------|-----------|----------|---------------------|
| **Grant token** (a.k.a. authorization `code`) | Temporary token sent to the browser after the user consents | **2 minutes** | The `/oauth/v2/auth` redirect |
| **Access token** | Sent on every API call to read/write the user's Zoho data | **1 hour** | Exchanging the grant token, or refreshing |
| **Refresh token** | Used to silently mint new access tokens forever | **Unlimited until revoked** by the user | Returned **once**, only when `access_type=offline` |

Key consequences (this is the whole design):

- The **grant token dies in 2 minutes** → you must exchange it immediately (our
  callback does this the instant Zoho redirects back).
- The **access token dies in 1 hour** → you refresh it on demand. The user never
  sees this; it's a server-to-server call.
- The **refresh token never expires** → you **store it in your DB** and reuse it
  indefinitely. This is the one durable secret per user.
- To even *get* a refresh token, the authorization request **must** include
  `access_type=offline`. Without it you get an access token only, and the user
  would have to re-consent every hour. (We send `offline`.)

> Note on limits: Zoho caps the number of live refresh tokens per user *per client*
> (historically ~20). Beyond the cap, the **oldest refresh token is auto-revoked**.
> In practice we store exactly one per user and overwrite on re-connect, so we
> never hit it.

---

## 2. The endpoints & parameters

### 2a. Authorization request (browser redirect)

```
GET https://accounts.zoho.com/oauth/v2/auth
      ?client_id={CLIENT_ID}
      &response_type=code
      &redirect_uri={REDIRECT_URI}      # must match the console exactly
      &scope={comma,separated,scopes}
      &access_type=offline              # REQUIRED to receive a refresh token
      &prompt=consent                   # forces the consent screen every time
```

On approval Zoho redirects to your `redirect_uri` with:

- `code={grant_token}` — exchange within 2 minutes
- `location={domain}` — the user's data-center region (e.g. `us`, `in`, `eu`)
- `accounts-server={url}` — which accounts server to hit for the token call

> Our screenshot showed `location=us`, confirming this account lives in the **US**
> data center → `accounts.zoho.com` / `zohoapis.com` → our `ZOHO_DC=com`. ✔

### 2b. Exchange the grant token for tokens (server-side POST)

```
POST https://accounts.zoho.com/oauth/v2/token
      ?code={grant_token}
      &grant_type=authorization_code
      &client_id={CLIENT_ID}
      &client_secret={CLIENT_SECRET}
      &redirect_uri={REDIRECT_URI}
```

Response (once):

```json
{
  "access_token":  "1000.xxxx",
  "refresh_token": "1000.yyyy",   // present ONLY with access_type=offline
  "api_domain":    "https://www.zohoapis.com",
  "token_type":    "Bearer",
  "expires_in":    3600
}
```

### 2c. Refresh the access token (server-side POST, no user involved)

```
POST https://accounts.zoho.com/oauth/v2/token
      ?refresh_token={STORED_REFRESH_TOKEN}
      &grant_type=refresh_token
      &client_id={CLIENT_ID}
      &client_secret={CLIENT_SECRET}
```

Response — a **new access token**, no new refresh token:

```json
{ "access_token": "1000.zzzz", "expires_in": 3600, "api_domain": "https://www.zohoapis.com", "token_type": "Bearer" }
```

### 2d. Calling the API (Books)

```
Authorization: Zoho-oauthtoken {ACCESS_TOKEN}
GET https://www.zohoapis.com/books/v3/items?organization_id={ORG_ID}
```

### Data centers (pick by the user's `location`)

| Region | Accounts server | API domain |
|--------|-----------------|-----------|
| US | accounts.zoho.com | zohoapis.com |
| India | accounts.zoho.in | zohoapis.in |
| Europe | accounts.zoho.eu | zohoapis.eu |
| Australia | accounts.zoho.com.au | zohoapis.com.au |
| Japan | accounts.zoho.jp | zohoapis.jp |

---

## 3. THE KEY ANSWER — one client, many Zoho users

> "How to reuse the Client ID and token for generating a new refresh token and
> authenticate different Zoho users using native Zoho Books authentication."

**You do NOT register a new app per user.** One registered app = one `client_id` +
`client_secret`, and it is **shared by every user**. What differs per user is the
**refresh token**, which each user generates by logging in with *their own* Zoho
account. This is exactly "native Zoho Books authentication": the user is bounced to
Zoho's own login/consent screen, authenticates as themselves, and Zoho hands *us* a
refresh token scoped to *that* user's data.

```
                        ┌─────────────────────────────────────────┐
   ONE registered app   │  client_id  = 1000.2XADEAG…             │
   (reused for all)     │  client_secret = e0c04ac6…              │
                        └─────────────────────────────────────────┘
                                        │  same client for everyone
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                                ▼
   User A logs in                  User B logs in                   User C logs in
   with THEIR Zoho              with THEIR Zoho                  with THEIR Zoho
        │                               │                                │
   refresh_token_A               refresh_token_B                  refresh_token_C
        │                               │                                │
        ▼                               ▼                                ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  ZohoToken table  (one row per user, keyed by userId)                 │
   │  userId=A → refresh_token_A   |   userId=B → refresh_token_B   | …     │
   └──────────────────────────────────────────────────────────────────────┘
```

**How each new user gets their refresh token (the reusable recipe):**

1. Send the user to `GET /oauth/v2/auth` with the **shared** `client_id`,
   `access_type=offline`, and your scopes. (In our app: they click **Sign in with
   Zoho** → `/server/skuapi/auth/zoho`.)
2. They log into **their own** Zoho account and approve. Zoho redirects the `code`
   to your one registered `redirect_uri`.
3. Your server exchanges the `code` (§2b) using the **shared** `client_id` +
   `client_secret` → gets **that user's** `access_token` + `refresh_token`.
4. Identify who they are (call `/oauth/user/info` with the access token → email +
   ZUID), then **store their `refresh_token` in your DB keyed to that user.**
5. From then on, whenever you need to call Books/Inventory/CRM *as that user*, load
   their refresh token and mint a fresh access token (§2c). No user interaction.

That's the entire multi-user model. "Reusing the Client ID" simply means every
user's flow points at the same app; "generating a new refresh token" happens
automatically per user in step 3; "authenticating different Zoho users via native
Zoho Books auth" is steps 1–2 (Zoho's own login screen).

---

## 4. How SKU Studio implements it

### Data model
- **`AppUser`** table (our "custom login" add-on): `email`, `name`, `passwordHash`
  (scrypt), `zuid` (the Zoho user id, for Sign-in-with-Zoho).
- **`ZohoToken`** table: `userId` (→ AppUser), `refreshToken`, `accessToken`,
  `expiresAt`, `orgId`, `orgName`. **One row per user.**

### Two ways to log in
1. **Custom login** — email + password against `AppUser`
   (`POST /auth/register`, `POST /auth/login`). Session = an HMAC-signed,
   httpOnly cookie. No Zoho needed to sign in; they click "Connect Zoho" later to
   link a refresh token.
2. **Sign in with Zoho** — the native flow above. The callback finds-or-creates the
   `AppUser` (by ZUID, then email), stores the per-user refresh token, and sets the
   session cookie — identity **and** data connection in one step.

### The refresh logic (server-side, automatic)
`functions/skuapi/zoho/auth.js → getAccessToken()`:
1. Load the user's `ZohoToken` row.
2. If `accessToken` is still valid (>30s left) → use it.
3. Else POST `grant_type=refresh_token` with the stored refresh token + shared
   client creds → get a new access token → save it back with a new `expiresAt`.

The user id is resolved per request: `requireAuth` stashes it on the request's
Catalyst instance, so every downstream Books/Inventory/CRM call automatically uses
**that logged-in user's** token — no signature threading.

### Scopes we request
```
AaaServer.profile.READ,        # identity (email/name/ZUID) for Sign-in-with-Zoho
ZohoBooks.fullaccess.all,      # Books items sync
ZohoInventory.fullaccess.all,  # Inventory
ZohoCRM.modules.ALL            # CRM records
```

### Relevant files
| Concern | File |
|---------|------|
| Passwords, cookies, `requireAuth`, AppUser helpers | `functions/skuapi/session.js` |
| OAuth URL, code exchange, refresh, profile, per-user tokens | `functions/skuapi/zoho/auth.js` |
| Custom login routes (`/register`,`/login`,`/logout`,`/me`) | `functions/skuapi/routes/auth.js` |
| Zoho callback: identity + link/find-or-create + save token | `functions/skuapi/routes/zohoAuth.js` |
| `/api` gate + route mounting | `functions/skuapi/index.js` |
| Login screen (password + Sign in with Zoho) | `frontend/src/pages/LoginPage.jsx` |
| Auth gating (login → connect → org → app) | `frontend/src/App.jsx` |

---

## 5. Setup / operational checklist

**In the Zoho API Console** (api-console.zoho.com → your app):
1. Set **Authorized Redirect URI** to (exactly, no trailing slash):
   `https://sku-gen-octfis-925638796.development.catalystserverless.com/server/skuapi/auth/zoho/callback`
2. Ensure the app is authorized for the scopes in §4 (Books, Inventory, CRM,
   profile).

**In `functions/skuapi/catalyst-config.json` env** (already set):
```
ZOHO_DC=com
ZOHO_CLIENT_ID=1000.2XADEAG…
ZOHO_CLIENT_SECRET=e0c04ac6…
ZOHO_REDIRECT_URI=https://…/server/skuapi/auth/zoho/callback
FRONTEND_URL=https://…/app
```
(Optional `SESSION_SECRET` — falls back to the client secret.)

**When the custom `.com` add-on domain is provided**, update in lockstep:
- Console redirect URI → `https://<new-domain>/server/skuapi/auth/zoho/callback`
- `ZOHO_REDIRECT_URI` → same
- `FRONTEND_URL` → `https://<new-domain>/app`

**Deploy:** `cd frontend && npm run build` → `catalyst deploy`.

**Verify:**
- `GET /server/skuapi/auth/me` → `401` when logged out.
- `GET /server/skuapi/auth/zoho` → 302 to `accounts.zoho.com` with the real
  `redirect_uri` and `access_type=offline`.

---

## 6. Security notes
- Client Secret and refresh tokens live **only server-side** (env + Data Store);
  the browser never sees them.
- Code exchange is server-to-server; the browser only ever holds the 2-minute
  grant token in transit.
- Session cookie is httpOnly + SameSite=Lax + Secure, HMAC-signed (tamper-proof,
  stateless).
- Login returns the same error for unknown-email and wrong-password (no account
  enumeration).
- `ponytail:` registration is currently open to anyone with the URL — gate it
  (invite/allowlist) before this leaves internal use.
