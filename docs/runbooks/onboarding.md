# Runbook: Tenant Onboarding

**Audience:** Platform owner

**Frequency:** Once per new tenant (rare after launch — Phase 4 GA)

**Duration:** ~30 minutes hands-on + ~1 overnight backfill

## Prerequisites

- Platform owner has SSH / Dokploy admin access to production
- `DATABASE_URL` for production is available in the platform owner's secret store
- Tenant has provided:
  - Legal/operational name (e.g. "Loveworld Europe")
  - Primary contact email (becomes the first `network_admin`)
  - Hierarchy spec (stations, broadcast channels, language channels) — YAML or spreadsheet

## Steps

1. **Create the tenant + first admin** (platform owner's machine):

   ```bash
   DATABASE_URL=<production_url> pnpm admin:create-tenant \
     --name "Tenant Name" \
     --admin-email tenant.admin@example.org \
     --admin-name "Admin Name"
   ```

2. **Send password setup** — the new admin receives a reset-password email via Better Auth's flow.

3. **Seed hierarchy** — admin logs in, navigates to `/<tenant>/settings/hierarchy`, and builds the tree (Phase 1 UI) or the platform owner runs the bulk-import CLI (Phase 4).

4. **Add connectors** — one at a time (Phase 1+). For each, OAuth or API key flow + attach to hierarchy node(s) + trigger initial backfill.

5. **Invite team** — from `/<tenant>/team`, admin invites station managers, board viewers, analysts with correct roles + scope.

6. **First board dashboard review** — platform owner walks through with stakeholders, exports a PDF board pack.

## Success criteria

- [ ] Tenant login works
- [ ] At least one connector active and ingesting
- [ ] Board dashboard renders with real data for current period
- [ ] First PDF export generated

## Troubleshooting

*To be filled during Phase 4 from real incident experience.*
