# Memory index

- [Catalyst deploy](catalyst-deploy.md) — build frontend → `frontend/dist`, then `catalyst deploy` to SKU-GEN-OCTFIS
- [Zoho Books sync](zoho-books-sync.md) — env vars + OAuth connect needed for push/import; no-op until configured
- [Record grid pattern](record-grid-pattern.md) — every grid: pinned footer pagination (25 default), value-based filters, hover pencil/trash (NO row-click edit); reuse GridFooter.jsx
- [List row UX pattern](list-row-ux-pattern.md) — superseded for grids by record-grid-pattern; hover trash + Add+Refresh toolbar still apply
- [Zoho OAuth redirect](zoho-oauth-redirect.md) — redirect URI must match in Zoho console + ZOHO_REDIRECT_URI; swap list when custom domain arrives
- [Multi-tenant model](multi-tenant-model.md) — catalog scoped by Zoho orgId; requireOrg + orgClause/ownsRow enforce isolation
