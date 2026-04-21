# Loveworld Analytics

Multi-tenant cross-platform analytics rollup platform for TV channel networks.

## Status

Phase 0 (Foundations). See `docs/plans/` for the design document and implementation plans.

## Repo layout

```
apps/
  web/               SvelteKit 2 dashboard
services/
  api/               Hono REST + OpenAPI
  ingestion/         BullMQ worker
packages/
  contracts/         Shared Zod schemas + connector interface
  db/                Drizzle schema + repositories
  auth/              Better Auth + permissions
  ui/                shadcn-svelte primitives
  connectors/        Source connector implementations (Phase 1+)
docs/
  plans/             Design doc + phase plans
  runbooks/          Operational runbooks (Phase 4)
infra/
  dokploy/           Stack definitions
```

## Local development

Prerequisites: Node 22, pnpm 9, Docker.

```bash
pnpm install
cp .env.example .env
```

Edit `.env` and replace the two `change_me_` placeholders. The API's boot-time
validator rejects any secret starting with `change_me_`, so this is required
before `pnpm dev` will start:

```bash
# AUTH_SECRET (32+ random chars)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# CONNECTOR_KEK_BASE64 (32 random bytes, base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then bring up infra and start the dev servers:

```bash
docker compose up -d              # Postgres + Redis
pnpm db:migrate                   # apply migrations
pnpm dev                          # runs web (5173) + api (3001) + ingestion concurrently
```

### Creating the first admin (Phase 0)

`pnpm admin:create-tenant` creates a tenant + `user` row + `network_admin`
membership, but **does not** create a Better Auth login credential. Until
Phase 1 ships `pnpm admin:set-password`, create the credential via Better
Auth's sign-up endpoint first, then attach the tenant. With `pnpm dev`
running in another terminal:

```bash
# 1. Create user + credential (via Better Auth — uses its own scrypt hasher)
curl -X POST http://localhost:3001/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"<pick-a-password>","name":"Dev Admin"}'

# 2. Attach tenant + network_admin membership to that user
pnpm admin:create-tenant \
  --name "Dev Tenant" \
  --admin-email dev@example.com \
  --admin-name "Dev Admin"
```

Sign in at <http://localhost:5173/login> with the email + password above.

### Port conflicts

If another project on your machine already binds `5432` (Postgres) or `6379`
(Redis), create a local-only `docker-compose.override.yml` (gitignored) to
remap the host ports:

```yaml
services:
  postgres:
    ports: !override
      - "127.0.0.1:5434:5432"
  redis:
    ports: !override
      - "127.0.0.1:6380:6379"
```

Then update `DATABASE_URL` and `REDIS_URL` in `.env` to match. The `!override`
tag is required — Compose concatenates `ports` lists by default.

## Commands

| Command | Description |
|---|---|
| `pnpm lint` | ESLint across all packages |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm test` | Vitest across all packages |
| `pnpm test:e2e` | Playwright E2E suite |
| `pnpm build` | Production build of every deployable |
| `pnpm dev` | Turborepo dev pipeline |

## Deployment

Staging auto-deploys from `main` via GitHub Actions → Dokploy webhook. Production deploys require manual approval via Dokploy UI.

| Environment | URL | Trigger |
|---|---|---|
| Staging | `https://staging.loveworld-analytics.example` | Push to `main` |
| Production | `https://app.loveworld-analytics.example` | Manual approval |

### Rollback

From Dokploy UI: **Services → api (or web / ingestion) → Rollback → select previous image tag**. Takes < 1 minute. Schema rollback is **never** — see `docs/runbooks/R-07-tenant-data-recovery.md` (created in Phase 4).

## Runbooks

- [Tenant onboarding](./docs/runbooks/onboarding.md)
- [Meta app review checklist](./docs/runbooks/meta-app-review-checklist.md)
- Additional runbooks R-01 through R-10 arrive in Phase 4 — see the design document's Section 11.

## Documentation

- [Design document](./docs/plans/2026-04-20-loveworld-analytics-design.md)
- [Phase 0 plan](./docs/plans/2026-04-20-plan-01-foundations.md)
- [Feature flags](./docs/feature-flags.md)
