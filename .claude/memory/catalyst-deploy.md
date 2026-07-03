---
name: catalyst-deploy
description: How to deploy the SKU generator (functions + frontend) to Zoho Catalyst
metadata: 
  node_type: memory
  type: project
  originSessionId: 069999c6-2448-4dba-ba3f-8bd2b61c40ab
---

Deploy target: Catalyst project **SKU-GEN-OCTFIS**, env **Development** (active in `.catalystrc`, so no `--project` flag needed).

`catalyst.json` maps: functions source `functions/` target `skuapi`; client source `frontend/dist`. So the frontend must be built *before* deploy — `catalyst deploy` ships whatever is already in `frontend/dist`, it does not build.

Steps from repo root:
1. Build frontend: `cd frontend && npm run build` (Vite → `frontend/dist`), then `cd ..`.
2. Function deps must be present in `functions/skuapi/node_modules`; if deps changed run `cd functions/skuapi && npm install && cd ../..`.
3. Deploy: `catalyst deploy`.

Scope a partial deploy with `catalyst deploy --only client` or `catalyst deploy --only functions`.

**Why:** the client-source-is-`dist` mapping means a plain `catalyst deploy` silently ships a stale frontend if you skipped the build — build is the easy step to forget.

Related: [[zoho-books-sync]] for the Zoho env vars that must be set in `functions/skuapi/catalyst-config.json` for pushes/imports to work post-deploy.
