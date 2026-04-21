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

1. **Create the admin user + credential** — *Phase 0 manual workaround* (platform owner's machine):

   `admin:create-tenant` (step 2) creates the tenant + user + membership
   rows but Phase 0 ships no way to set a login credential from the CLI.
   Until Phase 1 adds `pnpm admin:set-password` (or an invite +
   password-reset flow), create the user + Better Auth credential via the
   sign-up endpoint first — this uses Better Auth's own scrypt hasher and
   writes all `account` columns correctly:

   ```bash
   curl -X POST https://<production-api-url>/api/auth/sign-up/email \
     -H 'Content-Type: application/json' \
     -d '{"email":"tenant.admin@example.org","password":"<temp-password>","name":"Admin Name"}'
   ```

   Share the temporary password with the admin via a secure channel (not
   email); they should change it on first login via `/account/password`
   (Phase 1 UI) or a password-reset flow.

2. **Create the tenant and attach the admin** (platform owner's machine):

   ```bash
   DATABASE_URL=<production_url> pnpm admin:create-tenant \
     --name "Tenant Name" \
     --admin-email tenant.admin@example.org \
     --admin-name "Admin Name"
   ```

   The CLI finds the existing user by email (case-insensitive) and creates
   only the tenant + `network_admin` membership rows. The admin can now
   sign in at `/login` with the email + temporary password from step 1.

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
