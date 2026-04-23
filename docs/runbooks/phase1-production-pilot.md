# Runbook: Phase 1 Production Pilot

**Purpose:** deploy Phase 1 to staging/production pilot after the closeout gate is green.

## Required GitHub configuration

- `DOKPLOY_STAGING_WEBHOOK`
- `DOKPLOY_STAGING_TOKEN`
- Package write permission for GHCR through `GITHUB_TOKEN`
- Web image builds use environment-specific public API origins in `.github/workflows/images.yml`

## Required Dokploy secrets

Staging and production secrets are environment-specific external Swarm secrets. The stack files map them to stable in-container aliases.

### Staging

- `lwa_staging_pg_user`
- `lwa_staging_pg_password`
- `lwa_staging_database_url`
- `lwa_staging_auth_secret`
- `lwa_staging_connector_kek`
- `lwa_staging_smtp_user`
- `lwa_staging_smtp_pass`

### Production

- `lwa_production_pg_user`
- `lwa_production_pg_password`
- `lwa_production_database_url`
- `lwa_production_auth_secret`
- `lwa_production_connector_kek`
- `lwa_production_smtp_user`
- `lwa_production_smtp_pass`

## Required Dokploy environment values

- API `AUTH_BASE_URL` points to the public API origin.
- API `ALLOWED_ORIGINS` includes the public web origin.
- API SMTP env points at the real SMTP host/from address for that environment.
- Web `API_BASE_URL` points to the internal API service URL, usually `http://api:3001`.
- Web browser API origin is baked into the environment-specific web image at build time.

## Pre-deploy checks

```bash
pnpm -w turbo lint typecheck test
pnpm build
pnpm phase1:gate
pnpm -F @lwa/web test:e2e
```

Also confirm the target `DEPLOY_SHA` exists for all required GHCR images:

- `ghcr.io/0xanyi/loveworld-analytics-api:<sha>`
- `ghcr.io/0xanyi/loveworld-analytics-ingestion:<sha>`
- `ghcr.io/0xanyi/loveworld-analytics-web-staging:<sha>`
- `ghcr.io/0xanyi/loveworld-analytics-web-production:<sha>`

## Staging smoke after deploy

1. Open `/login` on the staging web URL.
2. Create a pilot tenant with `admin:create-tenant` against staging `DATABASE_URL`.
3. Set password with `admin:set-password`.
4. Run `API_BASE_URL=<staging-api-url> PHASE1_GATE_ORIGIN=<staging-web-url> pnpm phase1:gate` if staging database access is available from the runner.
5. Confirm Source Health, Manual Entry, Hierarchy, and Dashboard pages load.
6. In browser devtools, confirm client-side requests hit the staging public API origin.

## Production pilot constraints

Phase 1 production pilot includes P0 sources and two board tiles only:

- manual satellite
- manual Freeview
- Cloudflare Analytics
- GA4
- TV households tile
- Web visitors tile

The following remain later-phase work:

- YouTube / Smart TV / Meta connectors
- PDF export
- adjustment UI
- CSV export
- tenant team/invite UI
- complete v1 GA runbooks
