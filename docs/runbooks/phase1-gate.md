# Runbook: Phase 1 Gate

**Audience:** platform owner / release operator  
**Purpose:** prove a Phase 1 tenant can be created, authenticated, configured with a manual connector, and rendered with non-zero board metrics.

## Prerequisites

- Postgres and Redis are running.
- Migrations have been applied.
- Source registry has been seeded.
- API is running and reachable at `API_BASE_URL` or `AUTH_BASE_URL`.
- `.env` contains production-shaped non-template values for `AUTH_SECRET`, `DATABASE_URL`, `REDIS_URL`, `LWA_KEK_CURRENT`, and `LWA_KEK_V1`.

## Local run

```bash
docker compose up -d
bash scripts/db-init.sh
pnpm db:migrate
pnpm -F @lwa/db seed
pnpm -F @lwa/api dev
```

In a second terminal:

```bash
pnpm phase1:gate
```

## What the gate validates

1. API health endpoint responds.
2. `admin:create-tenant` creates tenant, user, and membership.
3. `admin:set-password` creates a Better Auth credential.
4. Email/password sign-in succeeds through `/api/auth/sign-in/email`.
5. The hierarchy API can create a station node.
6. The connector management API can configure `manual_satellite`.
7. The manual entry API accepts a week of households data.
8. The board metrics API returns a non-zero `tv_households` tile.

## Failure triage

- `source not seeded`: run `pnpm -F @lwa/db seed`.
- `sign-in response did not set cookies`: check `AUTH_SECRET`, `AUTH_BASE_URL`, and Better Auth routes.
- `connector not configured`: check the `/sources` seed and connector registry.
- `board metrics did not become non-zero`: check manual-entry rollup refresh in `services/api/src/routes/entries.ts`.
