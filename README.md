# Loveworld Analytics

Multi-tenant cross-platform analytics rollup platform for TV channel networks.

## Status

**Phase 1 in progress.** Phase 0 (Foundations) shipped; Phase 1 (P0 connectors + first dashboard tiles) is 8 of 11 tasks in, with the ingestion pipeline, four P0 connectors, and RBAC-gated API routes all on `main`.

- **P0 connectors**: `manual_satellite`, `manual_freeview`, `cloudflare_analytics`, `ga4`
- **API routes**: auth, `/me`, tenant hierarchy CRUD, connector management, manual entries, metrics board, backfill trigger
- **Ingestion**: BullMQ scheduler, pull handler, rollup refresh, backfill handler with idempotent chunk accounting
- **Tests**: 269 passing across the workspace (crypto · contracts · db · connectors · auth · ingestion · api) + Playwright smoke on web

See `docs/plans/` for the design document and phase plans.

## Repo layout

```
apps/
  web/                SvelteKit 2 dashboard + Playwright e2e

services/
  api/                Hono REST API (auth, tenants, connectors, entries, metrics, backfill)
  ingestion/          BullMQ worker (scheduler, pull, backfill, rollup refresh)

packages/
  contracts/          Shared Zod schemas + Result + SourceConnector protocol
  db/                 Drizzle schema + repositories + migrations + test-utils
  auth/               Better Auth config + Hono middleware + permissions matrix
  crypto/             AES-256-GCM envelope for connector credentials (KEK/DEK)
  connectors/         P0 source connectors + registry + contract test suite
  ui/                 shadcn-svelte primitives
  tsconfig/           Shared TypeScript base configs

docs/
  plans/              Design doc + per-phase implementation plans
  runbooks/           Operational runbooks (expanded in Phase 4)
  feature-flags.md    Flag registry with removal dates

infra/
  dokploy/            Staging + production stack definitions

scripts/
  db-init.sh          Idempotent "create dev database if missing" helper

.github/workflows/
  ci.yml              Lint · typecheck · test · build · Playwright (Postgres 16 + Redis 7 services)
  staging-deploy.yml  Dokploy webhook on push to main
```

Workspace packages (all versioned `0.0.0`, published nowhere):

| Name | Path |
|---|---|
| `@lwa/web` | `apps/web` |
| `@lwa/api` | `services/api` |
| `@lwa/ingestion` | `services/ingestion` |
| `@lwa/contracts` | `packages/contracts` |
| `@lwa/db` | `packages/db` |
| `@lwa/auth` | `packages/auth` |
| `@lwa/crypto` | `packages/crypto` |
| `@lwa/connectors` | `packages/connectors` |
| `@lwa/ui` | `packages/ui` |
| `@lwa/tsconfig` | `packages/tsconfig` |

## Local development

Prerequisites: Node 22 LTS (see `.nvmrc`), pnpm 9.12+ via corepack, Docker.

```bash
pnpm install
cp .env.example .env              # replace every change_me_* value before boot
```

Boot-time validators in `@lwa/auth` and `@lwa/api` reject any secret whose
value starts with `change_me_`, so a forgotten copy-paste fails loudly.
Generate `AUTH_SECRET` and `CONNECTOR_KEK_BASE64` (both 32 random bytes,
base64-encoded):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then bring up infra and start the dev servers:

```bash
docker compose up -d              # Postgres 16 + Redis 7 on 127.0.0.1
bash scripts/db-init.sh           # idempotent: create lwa_dev if missing
pnpm db:migrate                   # apply migrations
pnpm dev                          # runs web (5173) + api (3001) + ingestion via turbo
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

Root (turbo fan-out across the workspace):

| Command | Description |
|---|---|
| `pnpm lint` | ESLint across all packages (scope `src test`) |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm test` | Vitest across all packages |
| `pnpm test:e2e` | Playwright e2e (web) |
| `pnpm build` | Production build of every deployable |
| `pnpm dev` | Turbo dev pipeline (web + api + ingestion) |
| `pnpm format` / `format:check` | Prettier |
| `pnpm db:migrate` | Apply migrations against `DATABASE_URL` |
| `pnpm db:generate` | Regenerate Drizzle SQL + snapshot from `packages/db/src/schema` |
| `pnpm admin:create-tenant` | Create a tenant + admin user (see flags below) |

Targeted:

```bash
pnpm -F @lwa/api test             # one package
pnpm -F @lwa/db typecheck
pnpm -F @lwa/web test:e2e
pnpm -w turbo lint typecheck test # explicit workspace fan-out
```

### `admin:create-tenant`

```bash
pnpm admin:create-tenant \
  --name "LW Europe" \
  --slug lw-europe \          # optional; auto-derived from name if omitted
  --admin-email admin@lw.example \
  --admin-name "Admin Name"   # optional; defaults to "Admin"
```

Idempotent on slug; safe to re-run. Creates the tenant + user + membership
rows only — see [Creating the first admin (Phase 0)](#creating-the-first-admin-phase-0)
above for the full login-credential flow until `pnpm admin:set-password`
ships in Phase 1.

## Deployment

CI runs on every PR and push to `main`:

- Lint, typecheck, test, build (with Postgres 16 + Redis 7 service containers)
- Playwright e2e on `@lwa/web`
- Staging auto-deploy via Dokploy webhook (skips gracefully when secrets are absent)

Production requires manual approval in the Dokploy UI.

| Environment | URL | Trigger |
|---|---|---|
| Staging | `https://staging.loveworld-analytics.example` | Push to `main` |
| Production | `https://app.loveworld-analytics.example` | Manual approval |

### Rollback

From Dokploy UI: **Services → api (or web / ingestion) → Rollback → select previous image tag**. Takes &lt; 1 minute. Schema rollback is **never** — see the Phase 4 data-recovery runbook (`R-07`, scheduled).

## Documentation

- [Design document](./docs/plans/2026-04-20-loveworld-analytics-design.md)
- [Phase 0 plan — Foundations](./docs/plans/2026-04-20-plan-01-foundations.md) ✅
- [Phase 1 plan — P0 connectors + first dashboard tiles](./docs/plans/2026-04-20-plan-02-p0-connectors.md) 🚧
- [Feature flags](./docs/feature-flags.md)

### Runbooks

- [Tenant onboarding](./docs/runbooks/onboarding.md)
- [Meta app review checklist](./docs/runbooks/meta-app-review-checklist.md)
- Additional runbooks `R-01` through `R-10` arrive in Phase 4 — see the design document's Section 11.

## License

MIT — see [`LICENSE`](./LICENSE).
