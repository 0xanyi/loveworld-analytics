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
docker compose up -d              # Postgres + Redis
cp .env.example .env
pnpm db:migrate                   # apply migrations to local Postgres
pnpm admin:create-tenant --name "Dev Tenant" --admin-email you@example.com
pnpm dev                          # runs web + api + ingestion concurrently
```

## Commands

| Command | Description |
|---|---|
| `pnpm lint` | ESLint across all packages |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm test` | Vitest across all packages |
| `pnpm test:e2e` | Playwright E2E suite |
| `pnpm build` | Production build of every deployable |
| `pnpm dev` | Turborepo dev pipeline |

## Documentation

- [Design document](./docs/plans/2026-04-20-loveworld-analytics-design.md)
- [Phase 0 plan](./docs/plans/2026-04-20-plan-01-foundations.md)
