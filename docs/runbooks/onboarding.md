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

2. **Enable admin login** — *Phase 0 manual workaround*:

   The admin CLI in Phase 0 creates a `user` row but not Better Auth's
   `account` credential row, so the admin cannot yet log in via password.
   Until Phase 1 adds a `--password` flag to `admin:create-tenant` or a
   Better Auth self-service setup flow:

   - Generate a bcrypt-compatible hash for the admin's chosen password (see
     Better Auth's docs for the expected format).
   - Insert the account row directly via psql:

     ```sql
     INSERT INTO account (id, user_id, provider_id, account_id, password)
     VALUES (
       gen_random_uuid(),
       '<user-id-from-step-1>',
       'credential',
       '<user-id-from-step-1>',
       '<bcrypt-hash>'
     );
     ```

   Then the admin can log in at `/login` with email + password. This step
   will be replaced by `pnpm admin:set-password` in Phase 1.

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
