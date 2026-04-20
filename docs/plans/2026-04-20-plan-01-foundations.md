# Loveworld Analytics — Plan 01: Phase 0 Foundations

> **REQUIRED SUB-SKILL:** Use `/skill:subagent-driven-development` (recommended) or `/skill:executing-plans` to implement this plan task-by-task.

**Goal:** Stand up the empty but production-shaped Loveworld Analytics platform — monorepo, shared packages, three services scaffolded, auth working end-to-end, one tenant created, login visible, CI green, staging deployed — so that Phase 1 (P0 connectors) can land without any infrastructure work.

**Architecture:** pnpm workspaces + Turborepo monorepo with three services (`apps/web`, `services/api`, `services/ingestion`) and five shared packages (`db`, `contracts`, `auth`, `ui`, `connectors`). Postgres + Redis for state and queues. Better Auth for identity. Hono + Zod + OpenAPI for the API. SvelteKit 2 for the UI. Dokploy Swarm for deployment. Everything is wired for local dev via docker-compose and staging deploy on merge to `main`.

**Tech Stack:**
- Runtime: Node 22 LTS, pnpm 9.x, TypeScript 5.5+
- Build: Turborepo 2.x, Vite, tsup
- Backend: Hono 4.x + `@hono/zod-openapi`, BullMQ 5.x, Drizzle 0.32+, Better Auth
- Frontend: SvelteKit 2 + Svelte 5, Tailwind 4, shadcn-svelte
- DB/Queue: Postgres 16, Redis 7
- Test: Vitest 1.x, Playwright 1.44+, testcontainers
- Deploy: Docker + Dokploy Swarm, Cloudflare

**Related design doc:** `docs/plans/2026-04-20-loveworld-analytics-design.md` — consult this for the "why" behind any decision in this plan.

**Scope boundary for Phase 0:** NO connector implementations, NO metric_record/adjustment/rollup tables, NO ingestion logic beyond the worker skeleton. Those land in Plans 02-05. Phase 0 delivers the box every subsequent plan lives inside.

---

## Task roadmap (10 tasks)

| # | Task | Checkpoint |
|---|---|---|
| 1 | Repo init + monorepo config + local dev infra |   |
| 2 | `packages/db` — Drizzle schema + migrations (tenant, user, membership, hierarchy, source, connector_config, audit_log) |   |
| 3 | `packages/contracts` — SourceConnector interface, shared Zod primitives, Result type |   |
| 4 | `packages/auth` — Better Auth setup, permission matrix, tenant middleware |   |
| 5 | `packages/ui` — shadcn-svelte init + shared primitives | **✅ After Task 5: all shared packages compile, all tests green. Confirm before continuing.** |
| 6 | `services/api` — Hono skeleton, `/health`, Better Auth routes, `/me`, OpenAPI |   |
| 7 | `services/ingestion` — BullMQ worker skeleton, empty connector registry |   |
| 8 | `apps/web` — SvelteKit scaffold, login flow, empty tenant dashboard shell |   |
| 9 | Admin CLI + first tenant + end-to-end login smoke |   |
| 10 | CI pipeline + Dokploy staging stack + Meta app review checklist |   |

Each task ends with a commit. Phase 0 is done when Task 10 lands on `main`, staging is reachable, and the E2E login smoke passes.

---

## Task 1: Repository initialisation, monorepo config, and local dev infrastructure

**TDD scenario:** Trivial setup — use judgment. Verification is "commands run, expected output appears."

**Files:**
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.editorconfig`
- Create: `LICENSE`
- Create: `README.md`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `scripts/db-init.sh`

**Why this task exists:** Establishes the empty skeleton every later task builds on. After this task: `pnpm install` works, `pnpm turbo lint` works against zero packages, Postgres and Redis are running locally, and the workspace has consistent code style + editor settings.

- [ ] **Step 1: Initialise git**

Run from `/Users/0xanyi/workspace/loveworld-analytics/`:

```bash
cd /Users/0xanyi/workspace/loveworld-analytics
git init
git branch -M main
```

Expected: `Initialized empty Git repository in .../.git/`

- [ ] **Step 2: Write `.gitignore`**

Create `.gitignore`:

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
build/
.svelte-kit/
.turbo/
.vite/
*.tsbuildinfo

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Env & secrets
.env
.env.local
.env.*.local
!.env.example

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp

# Test artefacts
coverage/
playwright-report/
test-results/

# DB & queue data (local docker)
.data/
```

- [ ] **Step 3: Write `.nvmrc` and `.editorconfig`**

Create `.nvmrc`:

```
22
```

Create `.editorconfig`:

```ini
root = true

[*]
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
charset = utf-8
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Write `LICENSE` and `README.md`**

Create `LICENSE` (MIT — change later if org policy dictates otherwise):

```
MIT License

Copyright (c) 2026 Loveworld Analytics contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Create `README.md`:

````markdown
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
````

- [ ] **Step 5: Write root `package.json`**

Create `package.json`:

```json
{
  "name": "loveworld-analytics",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "turbo run test:e2e",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "db:migrate": "pnpm --filter @lwa/db migrate",
    "db:generate": "pnpm --filter @lwa/db generate",
    "admin:create-tenant": "pnpm --filter @lwa/api admin:create-tenant"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "eslint": "^9.10.0",
    "prettier": "^3.3.3",
    "turbo": "^2.1.0",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 6: Write `pnpm-workspace.yaml` and `turbo.json`**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "services/*"
  - "packages/*"
```

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".svelte-kit/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "cache": false
    }
  }
}
```

- [ ] **Step 7: Write `tsconfig.base.json`**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": false,
    "checkJs": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

- [ ] **Step 8: Write `eslint.config.mjs`, `.prettierrc`, `.prettierignore`**

Create `eslint.config.mjs`:

```js
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["**/dist/**", "**/.svelte-kit/**", "**/.turbo/**", "**/build/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];
```

Also add to root `package.json` `devDependencies`:

```bash
pnpm add -Dw @eslint/js typescript-eslint globals
```

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "printWidth": 110,
  "trailingComma": "all",
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

Install the Svelte prettier plugin:

```bash
pnpm add -Dw prettier-plugin-svelte
```

Create `.prettierignore`:

```
node_modules/
dist/
build/
.svelte-kit/
.turbo/
pnpm-lock.yaml
```

- [ ] **Step 9: Write `docker-compose.yml`, `.env.example`, `scripts/db-init.sh`**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: lwa-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: lwa
      POSTGRES_PASSWORD: lwa_dev
      POSTGRES_DB: lwa_dev
    ports:
      - "5432:5432"
    volumes:
      - ./.data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lwa -d lwa_dev"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: lwa-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - ./.data/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
```

Create `.env.example`:

```bash
# Core
NODE_ENV=development
LOG_LEVEL=debug

# Postgres
DATABASE_URL=postgres://lwa:lwa_dev@localhost:5432/lwa_dev

# Redis
REDIS_URL=redis://localhost:6379

# Better Auth
AUTH_SECRET=change_me_to_random_32_chars_min
AUTH_BASE_URL=http://localhost:5173

# API
API_PORT=3001
API_BASE_URL=http://localhost:3001

# Ingestion worker
INGESTION_CONCURRENCY=4

# KEK for connector credential encryption (32 bytes, base64)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CONNECTOR_KEK_BASE64=change_me_generate_random_32_bytes_base64
CONNECTOR_KEK_VERSION=1

# Email (magic links + alerts) — fill when configured
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@example.com
```

Create `scripts/db-init.sh` and make it executable:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Idempotent: creates the dev database if it doesn't exist.
# Used by contributors on first setup.

DB_NAME="${POSTGRES_DB:-lwa_dev}"
DB_USER="${POSTGRES_USER:-lwa}"

echo "→ Ensuring database '$DB_NAME' exists on container lwa-postgres..."
docker exec lwa-postgres psql -U "$DB_USER" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" \
  | grep -q 1 \
  || docker exec lwa-postgres psql -U "$DB_USER" -c "CREATE DATABASE $DB_NAME"
echo "✓ Database ready."
```

```bash
chmod +x scripts/db-init.sh
```

- [ ] **Step 10: Install deps, start local infra, verify**

```bash
pnpm install
docker compose up -d
docker compose ps
```

Expected: Both `lwa-postgres` and `lwa-redis` healthy.

```bash
pnpm turbo lint --filter=./
```

Expected: Runs with zero tasks (no packages yet), exits 0.

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "chore: initial monorepo scaffold with local dev infrastructure

- pnpm workspaces + Turborepo 2.x
- TypeScript 5.5 strict config
- ESLint flat config + Prettier
- docker-compose for local Postgres 16 + Redis 7
- Env template and db-init helper"
```

---

## Task 2: `packages/db` — Drizzle schema + initial migrations

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/schema/tenant.ts`
- Create: `packages/db/src/schema/user.ts`
- Create: `packages/db/src/schema/membership.ts`
- Create: `packages/db/src/schema/hierarchy-node.ts`
- Create: `packages/db/src/schema/source.ts`
- Create: `packages/db/src/schema/connector-config.ts`
- Create: `packages/db/src/schema/audit-log.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/repositories/tenant.ts`
- Create: `packages/db/src/repositories/hierarchy.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/seeds/sources.ts`
- Create: `packages/db/test/tenant.test.ts`
- Create: `packages/db/vitest.config.ts`

**Why this task exists:** The database schema is the backbone of every other service. Establishing the Drizzle schema, migration tooling, and repository pattern now means every later task just imports typed repositories. Ten source rows get seeded so that Phase 1 connector configs have something to reference.

- [ ] **Step 1: Create package scaffold**

Create `packages/db/package.json`:

```json
{
  "name": "@lwa/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./repositories/*": "./src/repositories/*.ts"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run",
    "generate": "drizzle-kit generate",
    "migrate": "tsx src/migrate.ts",
    "seed": "tsx src/seeds/run.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.33.0",
    "postgres": "^3.4.4"
  },
  "devDependencies": {
    "@lwa/tsconfig": "workspace:*",
    "drizzle-kit": "^0.24.0",
    "tsx": "^4.19.0",
    "vitest": "^1.6.0",
    "testcontainers": "^10.13.0"
  }
}
```

Create `packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Create `packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://lwa:lwa_dev@localhost:5432/lwa_dev",
  },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 2: Write the tenant and user schemas**

Create `packages/db/src/schema/tenant.ts`:

```ts
import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const tenant = pgTable(
  "tenant",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    slugIdx: uniqueIndex("tenant_slug_idx").on(t.slug),
  }),
);

export type Tenant = typeof tenant.$inferSelect;
export type NewTenant = typeof tenant.$inferInsert;
```

Create `packages/db/src/schema/user.ts` — Better Auth's required tables. We hand-author them to keep schema ownership in our migrations:

```ts
import { pgTable, uuid, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  name: text("name").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const account = pgTable("account", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const twoFactor = pgTable("two_factor", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
```

- [ ] **Step 3: Write the membership, hierarchy, source, connector_config, and audit schemas**

Create `packages/db/src/schema/membership.ts`:

```ts
import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { user } from "./user";

export const roleEnum = pgEnum("role", [
  "network_admin",
  "station_manager",
  "board_viewer",
  "analyst",
]);

export const tenantMembership = pgTable(
  "tenant_membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    scopeNodeIds: uuid("scope_node_ids").array().default([]).notNull(),
    invitedBy: uuid("invited_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => ({
    uniqueMembership: uniqueIndex("tenant_membership_user_tenant_idx").on(t.userId, t.tenantId),
  }),
);

export type TenantMembership = typeof tenantMembership.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
```

Create `packages/db/src/schema/hierarchy-node.ts`:

```ts
import { pgTable, uuid, text, jsonb, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";

export const hierarchyNodeTypeEnum = pgEnum("hierarchy_node_type", [
  "station",
  "broadcast_channel",
  "language_channel",
]);

export const hierarchyNode = pgTable(
  "hierarchy_node",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    type: hierarchyNodeTypeEnum("type").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => hierarchyNode.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    slugIdx: uniqueIndex("hierarchy_node_tenant_slug_idx").on(t.tenantId, t.slug),
    tenantIdx: index("hierarchy_node_tenant_idx").on(t.tenantId),
    parentIdx: index("hierarchy_node_parent_idx").on(t.parentId),
  }),
);

export type HierarchyNode = typeof hierarchyNode.$inferSelect;
export type HierarchyNodeType = (typeof hierarchyNodeTypeEnum.enumValues)[number];
```

Create `packages/db/src/schema/source.ts`:

```ts
import { pgTable, uuid, text, integer, pgEnum } from "drizzle-orm/pg-core";

export const sourceCategoryEnum = pgEnum("source_category", [
  "tv_broadcast",
  "web",
  "streaming",
  "social",
  "app",
]);

export const authMethodEnum = pgEnum("auth_method", [
  "oauth2",
  "api_key",
  "service_account",
  "none",
]);

export const source = pgTable("source", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: sourceCategoryEnum("category").notNull(),
  authMethod: authMethodEnum("auth_method").notNull(),
  schemaVersion: integer("schema_version").default(1).notNull(),
});

export type Source = typeof source.$inferSelect;
```

Create `packages/db/src/schema/connector-config.ts`:

```ts
import { pgTable, uuid, text, jsonb, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { source } from "./source";

export const connectorConfigStatusEnum = pgEnum("connector_config_status", [
  "active",
  "error",
  "paused",
]);

export const connectorConfig = pgTable("connector_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenant.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => source.id),
  credentialsCiphertext: text("credentials_ciphertext"),
  credentialsKekVersion: text("credentials_kek_version"),
  schedule: text("schedule").notNull().default("0 3 * * *"),
  enabled: boolean("enabled").default(true).notNull(),
  status: connectorConfigStatusEnum("status").default("active").notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ConnectorConfig = typeof connectorConfig.$inferSelect;
```

Create `packages/db/src/schema/audit-log.ts`:

```ts
import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { user } from "./user";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenant.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => user.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (t) => ({
    tenantTimeIdx: index("audit_log_tenant_time_idx").on(t.tenantId, t.occurredAt),
    actionIdx: index("audit_log_action_idx").on(t.action),
  }),
);

export type AuditLog = typeof auditLog.$inferSelect;
```

Create `packages/db/src/schema/index.ts`:

```ts
export * from "./tenant";
export * from "./user";
export * from "./membership";
export * from "./hierarchy-node";
export * from "./source";
export * from "./connector-config";
export * from "./audit-log";
```

- [ ] **Step 4: Write the client and repositories**

Create `packages/db/src/client.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10, idle_timeout: 20 });
  return drizzle(client, { schema });
}
```

Create `packages/db/src/repositories/tenant.ts`:

```ts
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { tenant, type NewTenant, type Tenant } from "../schema/tenant";

export function tenantRepo(db: Database) {
  return {
    async create(input: NewTenant): Promise<Tenant> {
      const [row] = await db.insert(tenant).values(input).returning();
      if (!row) throw new Error("tenant insert returned no rows");
      return row;
    },
    async getById(id: string): Promise<Tenant | undefined> {
      return db.query.tenant.findFirst({ where: eq(tenant.id, id) });
    },
    async getBySlug(slug: string): Promise<Tenant | undefined> {
      return db.query.tenant.findFirst({ where: eq(tenant.slug, slug) });
    },
    async archive(id: string): Promise<void> {
      await db.update(tenant).set({ archivedAt: new Date() }).where(eq(tenant.id, id));
    },
  };
}
```

Create `packages/db/src/repositories/hierarchy.ts`:

```ts
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { hierarchyNode, type HierarchyNode } from "../schema/hierarchy-node";

type NewHierarchyNode = typeof hierarchyNode.$inferInsert;

export function hierarchyRepo(db: Database) {
  return {
    async create(input: NewHierarchyNode): Promise<HierarchyNode> {
      const [row] = await db.insert(hierarchyNode).values(input).returning();
      if (!row) throw new Error("hierarchy_node insert returned no rows");
      return row;
    },
    async listForTenant(tenantId: string, includeArchived = false): Promise<HierarchyNode[]> {
      const where = includeArchived
        ? eq(hierarchyNode.tenantId, tenantId)
        : and(eq(hierarchyNode.tenantId, tenantId), isNull(hierarchyNode.archivedAt));
      return db.query.hierarchyNode.findMany({ where });
    },
    async getById(id: string): Promise<HierarchyNode | undefined> {
      return db.query.hierarchyNode.findFirst({ where: eq(hierarchyNode.id, id) });
    },
  };
}
```

Create `packages/db/src/index.ts`:

```ts
export * as schema from "./schema";
export { createDb, type Database } from "./client";
export { tenantRepo } from "./repositories/tenant";
export { hierarchyRepo } from "./repositories/hierarchy";
```

- [ ] **Step 5: Write source seed data and migrate script**

Create `packages/db/src/seeds/sources.ts`:

```ts
import type { Database } from "../client";
import { source } from "../schema/source";
import { sql } from "drizzle-orm";

const SOURCES = [
  { key: "manual_satellite", name: "Satellite (Manual)", category: "tv_broadcast", authMethod: "none" },
  { key: "manual_freeview", name: "Freeview (Manual)", category: "tv_broadcast", authMethod: "none" },
  { key: "castnet_events", name: "CastNet Player Events", category: "web", authMethod: "api_key" },
  { key: "cloudflare_analytics", name: "Cloudflare Analytics", category: "web", authMethod: "api_key" },
  { key: "ga4", name: "Google Analytics 4", category: "web", authMethod: "service_account" },
  { key: "youtube", name: "YouTube Data API", category: "streaming", authMethod: "oauth2" },
  { key: "smart_tv_telemetry", name: "Smart TV App Telemetry", category: "app", authMethod: "api_key" },
  { key: "meta_graph", name: "Meta Graph (FB + IG)", category: "social", authMethod: "oauth2" },
  { key: "tiktok", name: "TikTok Business API", category: "social", authMethod: "oauth2" },
  { key: "x", name: "X (Twitter) API", category: "social", authMethod: "api_key" },
] as const;

export async function seedSources(db: Database): Promise<void> {
  for (const s of SOURCES) {
    await db
      .insert(source)
      .values(s)
      .onConflictDoUpdate({
        target: source.key,
        set: { name: s.name, category: s.category, authMethod: s.authMethod },
      });
  }
}
```

Create `packages/db/src/seeds/run.ts`:

```ts
import { createDb } from "../client";
import { seedSources } from "./sources";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const db = createDb(url);
await seedSources(db);
console.log("✓ Seeded sources");
process.exit(0);
```

Create `packages/db/src/migrate.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

const client = postgres(url, { max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("✓ Migrations applied");
await client.end();
process.exit(0);
```

- [ ] **Step 6: Write the failing test**

Create `packages/db/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    setupFiles: [],
    pool: "forks",
  },
});
```

Create `packages/db/test/tenant.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { tenantRepo } from "../src/repositories/tenant";
import type { Database } from "../src/client";
import * as schema from "../src/schema";

let container: StartedPostgreSqlContainer;
let db: Database;
let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  client = postgres(container.getConnectionUri(), { max: 5 });
  db = drizzle(client, { schema });
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe("tenantRepo", () => {
  it("creates a tenant and retrieves it by slug", async () => {
    const repo = tenantRepo(db);
    const created = await repo.create({ name: "Loveworld Europe", slug: "lw-europe" });
    expect(created.id).toBeDefined();
    const fetched = await repo.getBySlug("lw-europe");
    expect(fetched?.name).toBe("Loveworld Europe");
  });

  it("archives a tenant", async () => {
    const repo = tenantRepo(db);
    const created = await repo.create({ name: "Temp", slug: "temp" });
    await repo.archive(created.id);
    const fetched = await repo.getById(created.id);
    expect(fetched?.archivedAt).not.toBeNull();
  });
});
```

Install test deps:

```bash
pnpm -F @lwa/db add -D @testcontainers/postgresql
```

- [ ] **Step 7: Run test to verify it fails (no migration files yet)**

```bash
pnpm -F @lwa/db test
```

Expected: FAIL — "migration folder not found" or similar.

- [ ] **Step 8: Generate migrations and re-run**

```bash
pnpm -F @lwa/db generate
```

Expected: creates `packages/db/drizzle/0000_<name>.sql` and `packages/db/drizzle/meta/_journal.json`.

```bash
pnpm -F @lwa/db test
```

Expected: PASS — both test cases green.

- [ ] **Step 9: Apply migrations to local dev DB and seed**

```bash
source .env.example  # or copy to .env
export DATABASE_URL=postgres://lwa:lwa_dev@localhost:5432/lwa_dev
pnpm -F @lwa/db migrate
pnpm -F @lwa/db seed
```

Verify:

```bash
docker exec lwa-postgres psql -U lwa -d lwa_dev -c "\dt"
```

Expected: lists `tenant`, `user`, `session`, `account`, `verification`, `two_factor`, `tenant_membership`, `hierarchy_node`, `source`, `connector_config`, `audit_log`.

```bash
docker exec lwa-postgres psql -U lwa -d lwa_dev -c "SELECT key, category FROM source ORDER BY key"
```

Expected: 10 source rows, all connector keys from the design doc.

- [ ] **Step 10: Create a workspace tsconfig package for reuse**

Create `packages/tsconfig/package.json`:

```json
{
  "name": "@lwa/tsconfig",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./base": "./base.json",
    "./node": "./node.json",
    "./svelte": "./svelte.json"
  }
}
```

Create `packages/tsconfig/base.json`:

```json
{
  "extends": "../../tsconfig.base.json"
}
```

Create `packages/tsconfig/node.json`:

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"]
  }
}
```

Create `packages/tsconfig/svelte.json`:

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler"
  }
}
```

Then update `packages/db/tsconfig.json` to reference it:

```json
{
  "extends": "@lwa/tsconfig/node",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Add `@lwa/tsconfig` as a devDependency of `@lwa/db`:

```bash
pnpm -F @lwa/db add -D @lwa/tsconfig@workspace:*
pnpm install
```

- [ ] **Step 11: Verify typecheck + lint + test**

```bash
pnpm turbo typecheck test --filter=@lwa/db
```

Expected: all tasks pass.

- [ ] **Step 12: Commit**

```bash
git add .
git commit -m "feat(db): drizzle schema + migrations for tenant, user, membership, hierarchy, source, connector_config, audit_log

- Better Auth tables hand-authored in our schema for ownership
- hierarchy_node self-references for station/broadcast/language tree
- 10 source rows seeded for Phase 1+ connector configs
- Tenant and hierarchy repositories with typed Drizzle queries
- Testcontainers-based integration test verifying full migration flow
- Shared @lwa/tsconfig package"
```

---

## Task 3: `packages/contracts` — SourceConnector interface + shared Zod + Result

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/result.ts`
- Create: `packages/contracts/src/metric-category.ts`
- Create: `packages/contracts/src/granularity.ts`
- Create: `packages/contracts/src/connector-error.ts`
- Create: `packages/contracts/src/metric-record.ts`
- Create: `packages/contracts/src/source-connector.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/result.test.ts`
- Create: `packages/contracts/test/metric-record.test.ts`
- Create: `packages/contracts/vitest.config.ts`

**Why this task exists:** The contracts package is the platform's source of truth. Every service imports types and schemas from here. Defining the `SourceConnector` interface now — before any connector exists — locks the shape that Phase 1+ will implement against.

- [ ] **Step 1: Package scaffold**

Create `packages/contracts/package.json`:

```json
{
  "name": "@lwa/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@lwa/tsconfig": "workspace:*",
    "vitest": "^1.6.0"
  }
}
```

Create `packages/contracts/tsconfig.json`:

```json
{
  "extends": "@lwa/tsconfig/node",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Create `packages/contracts/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 2: Write the failing tests**

Create `packages/contracts/test/result.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ok, err, isOk, isErr, type Result } from "../src/result";

describe("Result", () => {
  it("ok() produces a success result", () => {
    const r: Result<number, string> = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it("err() produces a failure result", () => {
    const r: Result<number, string> = err("boom");
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) expect(r.error).toBe("boom");
  });
});
```

Create `packages/contracts/test/metric-record.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MetricRecordDraftSchema } from "../src/metric-record";

describe("MetricRecordDraftSchema", () => {
  it("accepts a valid draft", () => {
    const result = MetricRecordDraftSchema.safeParse({
      hierarchyNodeId: "00000000-0000-0000-0000-000000000001",
      metricType: "views",
      metricCategory: "streaming",
      dimensions: { country: "GB" },
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-02"),
      granularity: "day",
      value: 12345,
      unit: "count",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid metric_category", () => {
    const result = MetricRecordDraftSchema.safeParse({
      hierarchyNodeId: "00000000-0000-0000-0000-000000000001",
      metricType: "views",
      metricCategory: "bogus",
      dimensions: {},
      periodStart: new Date(),
      periodEnd: new Date(),
      granularity: "day",
      value: 1,
      unit: "count",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative value", () => {
    const result = MetricRecordDraftSchema.safeParse({
      hierarchyNodeId: "00000000-0000-0000-0000-000000000001",
      metricType: "views",
      metricCategory: "streaming",
      dimensions: {},
      periodStart: new Date(),
      periodEnd: new Date(),
      granularity: "day",
      value: -5,
      unit: "count",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm -F @lwa/contracts test
```

Expected: FAIL — "Cannot find module '../src/result'" and similar.

- [ ] **Step 4: Implement `Result`**

Create `packages/contracts/src/result.ts`:

```ts
export type Ok<T> = { readonly _tag: "ok"; readonly value: T };
export type Err<E> = { readonly _tag: "err"; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { _tag: "ok", value };
}

export function err<E>(error: E): Err<E> {
  return { _tag: "err", error };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r._tag === "ok";
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return r._tag === "err";
}
```

- [ ] **Step 5: Implement the shared enums and connector error**

Create `packages/contracts/src/metric-category.ts`:

```ts
import { z } from "zod";

export const MetricCategorySchema = z.enum([
  "tv_households",
  "web_visitors",
  "streaming",
  "social_reach",
  "engagement",
]);

export type MetricCategory = z.infer<typeof MetricCategorySchema>;
```

Create `packages/contracts/src/granularity.ts`:

```ts
import { z } from "zod";

export const GranularitySchema = z.enum(["hour", "day", "week", "month", "quarter"]);
export type Granularity = z.infer<typeof GranularitySchema>;
```

Create `packages/contracts/src/connector-error.ts`:

```ts
import { z } from "zod";

export const ConnectorErrorCodeSchema = z.enum([
  "AUTH_EXPIRED",
  "AUTH_INVALID",
  "RATE_LIMITED",
  "TRANSIENT",
  "UPSTREAM_UNAVAILABLE",
  "CONFIG_INVALID",
  "NO_DATA",
]);

export type ConnectorErrorCode = z.infer<typeof ConnectorErrorCodeSchema>;

export type ConnectorError = {
  code: ConnectorErrorCode;
  message: string;
  retryAfterSeconds?: number;
  cause?: unknown;
};
```

- [ ] **Step 6: Implement the metric record schema**

Create `packages/contracts/src/metric-record.ts`:

```ts
import { z } from "zod";
import { MetricCategorySchema } from "./metric-category";
import { GranularitySchema } from "./granularity";

export const MetricRecordDraftSchema = z.object({
  hierarchyNodeId: z.string().uuid(),
  metricType: z.string().min(1).max(64),
  metricCategory: MetricCategorySchema,
  dimensions: z.record(z.string(), z.string()),
  periodStart: z.date(),
  periodEnd: z.date(),
  granularity: GranularitySchema,
  value: z.number().nonnegative(),
  unit: z.string().min(1).max(32),
});

export type MetricRecordDraft = z.infer<typeof MetricRecordDraftSchema>;
```

- [ ] **Step 7: Implement the SourceConnector interface**

Create `packages/contracts/src/source-connector.ts`:

```ts
import { z } from "zod";
import type { MetricCategory } from "./metric-category";
import type { Granularity } from "./granularity";
import type { MetricRecordDraft } from "./metric-record";
import type { Result } from "./result";
import type { ConnectorError } from "./connector-error";

export type AuthMethod = "oauth2" | "api_key" | "service_account" | "none";

export type PlatformAccountCandidate = {
  externalId: string;
  displayName: string;
  thumbnailUrl?: string;
};

export type PullInput = {
  config: {
    id: string;
    tenantId: string;
    credentials: unknown;
    schedule: string;
  };
  account: {
    id: string;
    externalId: string;
    hierarchyNodeId: string;
  } | null;
  period: {
    start: Date;
    end: Date;
    granularity: Granularity;
  };
  context: {
    tenantId: string;
    logger: { info: (msg: string, data?: unknown) => void; warn: (msg: string, data?: unknown) => void; error: (msg: string, data?: unknown) => void };
    rateLimiter: { acquire: (cost?: number) => Promise<void> };
  };
};

export type PullResult = {
  records: MetricRecordDraft[];
  nextCursor?: string;
  warnings?: string[];
};

export type BackfillInput = PullInput & { checkpoint?: string };

export interface PullConnector {
  readonly key: string;
  readonly name: string;
  readonly category: MetricCategory;
  readonly authMethod: AuthMethod;
  readonly credentialsSchema: z.ZodTypeAny;
  readonly supportedGranularities: readonly Granularity[];
  readonly kind: "pull";

  validateCredentials(creds: unknown): Promise<Result<void, ConnectorError>>;
  pull(input: PullInput): Promise<Result<PullResult, ConnectorError>>;
  listAccounts?(creds: unknown): Promise<PlatformAccountCandidate[]>;
  backfill?(input: BackfillInput): Promise<Result<PullResult, ConnectorError>>;
}

export interface ManualConnector {
  readonly key: string;
  readonly name: string;
  readonly category: MetricCategory;
  readonly authMethod: "none";
  readonly credentialsSchema: z.ZodTypeAny;
  readonly supportedGranularities: readonly Granularity[];
  readonly kind: "manual";
  readonly entrySchema: z.ZodTypeAny;

  validateCredentials(creds: unknown): Promise<Result<void, ConnectorError>>;
}

export type SourceConnector = PullConnector | ManualConnector;
```

- [ ] **Step 8: Write the index**

Create `packages/contracts/src/index.ts`:

```ts
export * from "./result";
export * from "./metric-category";
export * from "./granularity";
export * from "./connector-error";
export * from "./metric-record";
export * from "./source-connector";
```

- [ ] **Step 9: Run tests to verify they pass**

```bash
pnpm install
pnpm -F @lwa/contracts test
```

Expected: PASS — 5 tests green.

```bash
pnpm -F @lwa/contracts typecheck
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(contracts): SourceConnector interface, Result type, shared Zod primitives

- MetricCategory, Granularity enums
- ConnectorError taxonomy (7 codes)
- MetricRecordDraft schema with value non-negativity guard
- PullConnector vs ManualConnector discriminated interface
- Result<T,E> with ok/err helpers and type-guards
- Unit tests for Result and MetricRecordDraft validation"
```

---

## Task 4: `packages/auth` — Better Auth + permission matrix + tenant middleware

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/auth.ts`
- Create: `packages/auth/src/permissions.ts`
- Create: `packages/auth/src/middleware.ts`
- Create: `packages/auth/src/index.ts`
- Create: `packages/auth/test/permissions.test.ts`
- Create: `packages/auth/vitest.config.ts`

**Why this task exists:** Centralises auth configuration and the role × capability matrix so API routes and the web app ask the same questions the same way. Implementing the permission matrix as data (not scattered `if` statements) makes it testable and auditable.

- [ ] **Step 1: Package scaffold**

Create `packages/auth/package.json`:

```json
{
  "name": "@lwa/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./auth": "./src/auth.ts",
    "./middleware": "./src/middleware.ts",
    "./permissions": "./src/permissions.ts"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "@lwa/db": "workspace:*",
    "better-auth": "^1.0.0",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@lwa/tsconfig": "workspace:*",
    "vitest": "^1.6.0"
  }
}
```

Create `packages/auth/tsconfig.json`:

```json
{
  "extends": "@lwa/tsconfig/node",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Create `packages/auth/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 2: Write the failing test**

Create `packages/auth/test/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { can, type Role, type Capability } from "../src/permissions";

describe("can(role, capability)", () => {
  const matrix: Array<[Role, Capability, boolean]> = [
    ["network_admin", "view_dashboard", true],
    ["network_admin", "manage_connectors", true],
    ["network_admin", "invite_users", true],
    ["station_manager", "view_dashboard", true],
    ["station_manager", "log_manual_entry", true],
    ["station_manager", "override_metric", true],
    ["station_manager", "manage_connectors", false],
    ["station_manager", "invite_users", false],
    ["board_viewer", "view_dashboard", true],
    ["board_viewer", "export_pdf", true],
    ["board_viewer", "view_records_table", false],
    ["board_viewer", "log_manual_entry", false],
    ["analyst", "view_dashboard", true],
    ["analyst", "view_records_table", true],
    ["analyst", "export_csv", true],
    ["analyst", "log_manual_entry", false],
    ["analyst", "override_metric", false],
  ];

  for (const [role, capability, expected] of matrix) {
    it(`${role} ${expected ? "can" : "cannot"} ${capability}`, () => {
      expect(can(role, capability)).toBe(expected);
    });
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm -F @lwa/auth test
```

Expected: FAIL — "Cannot find module '../src/permissions'".

- [ ] **Step 4: Implement the permission matrix**

Create `packages/auth/src/permissions.ts`:

```ts
export type Role = "network_admin" | "station_manager" | "board_viewer" | "analyst";

export type Capability =
  | "view_dashboard"
  | "view_drill_down"
  | "view_records_table"
  | "export_csv"
  | "export_pdf"
  | "log_manual_entry"
  | "override_metric"
  | "reverse_override"
  | "manage_connectors"
  | "trigger_backfill"
  | "invite_users"
  | "edit_hierarchy"
  | "change_tenant_settings"
  | "view_audit_log";

const MATRIX: Record<Role, ReadonlySet<Capability>> = {
  network_admin: new Set<Capability>([
    "view_dashboard",
    "view_drill_down",
    "view_records_table",
    "export_csv",
    "export_pdf",
    "log_manual_entry",
    "override_metric",
    "reverse_override",
    "manage_connectors",
    "trigger_backfill",
    "invite_users",
    "edit_hierarchy",
    "change_tenant_settings",
    "view_audit_log",
  ]),
  station_manager: new Set<Capability>([
    "view_dashboard",
    "view_drill_down",
    "view_records_table",
    "export_csv",
    "export_pdf",
    "log_manual_entry",
    "override_metric",
    "reverse_override",
    "trigger_backfill",
    "view_audit_log",
  ]),
  board_viewer: new Set<Capability>([
    "view_dashboard",
    "view_drill_down",
    "export_pdf",
  ]),
  analyst: new Set<Capability>([
    "view_dashboard",
    "view_drill_down",
    "view_records_table",
    "export_csv",
    "export_pdf",
    "view_audit_log",
  ]),
};

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].has(capability);
}

export function capabilitiesFor(role: Role): ReadonlySet<Capability> {
  return MATRIX[role];
}
```

- [ ] **Step 5: Verify tests pass**

```bash
pnpm install
pnpm -F @lwa/auth test
```

Expected: PASS — 17 matrix cases green.

- [ ] **Step 6: Implement Better Auth configuration**

Create `packages/auth/src/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { magicLink, twoFactor } from "better-auth/plugins";
import type { Database } from "@lwa/db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export type AuthConfig = {
  db: Database;
  secret: string;
  baseUrl: string;
  sendMagicLink: (to: string, url: string) => Promise<void>;
};

export function createAuth(config: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(config.db, { provider: "pg" }),
    secret: config.secret,
    baseURL: config.baseUrl,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    session: {
      cookieCache: { enabled: true, maxAge: 60 * 5 },
      expiresIn: 60 * 60,
      updateAge: 60 * 10,
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await config.sendMagicLink(email, url);
        },
      }),
      twoFactor({ issuer: "Loveworld Analytics" }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

- [ ] **Step 7: Implement tenant middleware for Hono**

Create `packages/auth/src/middleware.ts`:

```ts
import type { Context, MiddlewareHandler } from "hono";
import type { Auth } from "./auth";
import type { Database } from "@lwa/db";
import { schema } from "@lwa/db";
import { and, eq } from "drizzle-orm";
import type { Capability, Role } from "./permissions";
import { can } from "./permissions";

export type TenantContext = {
  userId: string;
  tenantId: string;
  role: Role;
  scopeNodeIds: string[];
};

declare module "hono" {
  interface ContextVariableMap {
    tenant: TenantContext;
  }
}

export function requireSession(auth: Auth): MiddlewareHandler {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "unauthenticated" }, 401);
    c.set("session", session);
    await next();
  };
}

export function requireTenant(db: Database): MiddlewareHandler {
  return async (c, next) => {
    const session = c.get("session") as { user: { id: string } } | undefined;
    if (!session) return c.json({ error: "unauthenticated" }, 401);

    const tenantSlug = c.req.param("tenant") ?? c.req.header("x-tenant-slug");
    if (!tenantSlug) return c.json({ error: "tenant not specified" }, 400);

    const tenantRow = await db.query.tenant.findFirst({
      where: eq(schema.tenant.slug, tenantSlug),
    });
    if (!tenantRow) return c.json({ error: "tenant not found" }, 404);

    const membership = await db.query.tenantMembership.findFirst({
      where: and(
        eq(schema.tenantMembership.userId, session.user.id),
        eq(schema.tenantMembership.tenantId, tenantRow.id),
      ),
    });
    if (!membership) return c.json({ error: "not a member of this tenant" }, 403);

    c.set("tenant", {
      userId: session.user.id,
      tenantId: tenantRow.id,
      role: membership.role,
      scopeNodeIds: membership.scopeNodeIds,
    });
    await next();
  };
}

export function requireCapability(capability: Capability): MiddlewareHandler {
  return async (c, next) => {
    const tenant = c.get("tenant");
    if (!tenant) return c.json({ error: "tenant context missing" }, 500);
    if (!can(tenant.role, capability)) {
      return c.json({ error: "forbidden", missing_capability: capability }, 403);
    }
    await next();
  };
}
```

- [ ] **Step 8: Write the index**

Create `packages/auth/src/index.ts`:

```ts
export * from "./permissions";
export { createAuth, type Auth, type AuthConfig } from "./auth";
export { requireSession, requireTenant, requireCapability, type TenantContext } from "./middleware";
```

- [ ] **Step 9: Typecheck and commit**

```bash
pnpm install
pnpm -F @lwa/auth typecheck
pnpm -F @lwa/auth test
```

Expected: typecheck clean, tests still pass.

```bash
git add .
git commit -m "feat(auth): Better Auth setup + permission matrix + Hono middleware

- Better Auth with email+password, magic link, TOTP plugins
- Drizzle adapter pointed at @lwa/db
- 14-capability × 4-role permission matrix with 17 unit tests
- requireSession / requireTenant / requireCapability Hono middleware
- TenantContext injected into Hono context"
```

---

## Task 5: `packages/ui` — shadcn-svelte init + theme + primitives

**TDD scenario:** Trivial change — use judgment. Visual regression is covered later by Playwright screenshots.

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/components.json`
- Create: `packages/ui/src/lib/cn.ts`
- Create: `packages/ui/src/lib/index.ts`
- Create: `packages/ui/src/styles/app.css`
- Create: `packages/ui/src/lib/components/Button.svelte`
- Create: `packages/ui/src/lib/components/Card.svelte`
- Create: `packages/ui/src/lib/components/index.ts`

**Why this task exists:** Centralises reusable presentation so the SvelteKit app stays thin. Only two primitives land in Phase 0 (Button, Card) — the rest arrive as they're needed in Phase 1's manager console. Establishing the package shape now means adding components is trivial.

- [ ] **Step 1: Package scaffold**

Create `packages/ui/package.json`:

```json
{
  "name": "@lwa/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/lib/index.ts",
    "./components": "./src/lib/components/index.ts",
    "./styles/app.css": "./src/styles/app.css"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.2"
  },
  "devDependencies": {
    "@lwa/tsconfig": "workspace:*",
    "svelte": "^5.0.0",
    "@types/node": "^22.5.0"
  }
}
```

Create `packages/ui/tsconfig.json`:

```json
{
  "extends": "@lwa/tsconfig/svelte",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "allowImportingTsExtensions": false
  },
  "include": ["src/**/*"]
}
```

Create `packages/ui/components.json` (shadcn-svelte config, for future `shadcn-svelte add` runs):

```json
{
  "$schema": "https://shadcn-svelte.com/schema.json",
  "style": "default",
  "tailwind": {
    "css": "src/styles/app.css",
    "baseColor": "slate"
  },
  "aliases": {
    "components": "$lib/components",
    "utils": "$lib/cn"
  },
  "typescript": true
}
```

- [ ] **Step 2: Implement the `cn` helper**

Create `packages/ui/src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Write the base stylesheet**

Create `packages/ui/src/styles/app.css`:

```css
@import "tailwindcss";

@theme {
  --color-brand-50: oklch(0.98 0.01 250);
  --color-brand-500: oklch(0.55 0.18 250);
  --color-brand-600: oklch(0.48 0.20 250);
  --color-brand-900: oklch(0.28 0.12 250);

  --font-sans: "Inter", "system-ui", "sans-serif";
}

:root {
  color-scheme: light;
}

:root.dark {
  color-scheme: dark;
}
```

- [ ] **Step 4: Implement Button and Card primitives**

Create `packages/ui/src/lib/components/Button.svelte`:

```svelte
<script lang="ts">
  import { cn } from "../cn";
  import type { HTMLButtonAttributes } from "svelte/elements";

  type Variant = "primary" | "secondary" | "ghost" | "destructive";
  type Size = "sm" | "md" | "lg";

  let {
    variant = "primary",
    size = "md",
    class: className = "",
    children,
    ...rest
  }: HTMLButtonAttributes & { variant?: Variant; size?: Size } = $props();

  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 " +
    "disabled:pointer-events-none disabled:opacity-50";

  const variants: Record<Variant, string> = {
    primary: "bg-brand-500 text-white hover:bg-brand-600",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
    ghost: "hover:bg-slate-100",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };

  const sizes: Record<Size, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };
</script>

<button class={cn(base, variants[variant], sizes[size], className)} {...rest}>
  {@render children?.()}
</button>
```

Create `packages/ui/src/lib/components/Card.svelte`:

```svelte
<script lang="ts">
  import { cn } from "../cn";
  import type { HTMLAttributes } from "svelte/elements";

  let { class: className = "", children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class={cn("rounded-xl border border-slate-200 bg-white p-6 shadow-sm", className)} {...rest}>
  {@render children?.()}
</div>
```

- [ ] **Step 5: Index files**

Create `packages/ui/src/lib/components/index.ts`:

```ts
export { default as Button } from "./Button.svelte";
export { default as Card } from "./Card.svelte";
```

Create `packages/ui/src/lib/index.ts`:

```ts
export { cn } from "./cn";
export * from "./components";
```

- [ ] **Step 6: Verify typecheck**

```bash
pnpm install
pnpm -F @lwa/ui typecheck
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(ui): shadcn-svelte scaffold + cn helper + Button + Card primitives

- components.json configured for future shadcn-svelte add
- Tailwind 4 @theme with brand tokens
- Svelte 5 runes-style components
- clsx + tailwind-merge for class composition"
```

---

**✅ CHECKPOINT after Task 5:** All five shared packages compile, tests pass, and the workspace is internally consistent. Before continuing, run:

```bash
pnpm install
pnpm turbo typecheck test
```

Expected: every package green. If anything fails, fix before Task 6.

---

## Task 6: `services/api` — Hono skeleton + `/health` + Better Auth + `/me`

**TDD scenario:** New feature — full TDD cycle with integration tests.

**Files:**
- Create: `services/api/package.json`
- Create: `services/api/tsconfig.json`
- Create: `services/api/Dockerfile`
- Create: `services/api/src/env.ts`
- Create: `services/api/src/server.ts`
- Create: `services/api/src/app.ts`
- Create: `services/api/src/routes/health.ts`
- Create: `services/api/src/routes/auth.ts`
- Create: `services/api/src/routes/me.ts`
- Create: `services/api/src/lib/email.ts`
- Create: `services/api/test/app.test.ts`
- Create: `services/api/vitest.config.ts`

**Why this task exists:** The API is where every write and every dashboard query will eventually live. Phase 0 stands it up empty with only the auth surface — enough to log in and prove tenant-scoped middleware works.

- [ ] **Step 1: Package scaffold**

Create `services/api/package.json`:

```json
{
  "name": "@lwa/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/server.ts",
  "scripts": {
    "build": "tsc -b",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run",
    "admin:create-tenant": "tsx src/admin/create-tenant.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@hono/zod-openapi": "^0.16.0",
    "@lwa/auth": "workspace:*",
    "@lwa/contracts": "workspace:*",
    "@lwa/db": "workspace:*",
    "hono": "^4.6.0",
    "pino": "^9.4.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@lwa/tsconfig": "workspace:*",
    "@types/node": "^22.5.0",
    "tsx": "^4.19.0",
    "vitest": "^1.6.0"
  }
}
```

Create `services/api/tsconfig.json`:

```json
{
  "extends": "@lwa/tsconfig/node",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Create `services/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", testTimeout: 30_000 } });
```

- [ ] **Step 2: Write env loader**

Create `services/api/src/env.ts`:

```ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().default(3001),
  AUTH_SECRET: z.string().min(32),
  AUTH_BASE_URL: z.string().url(),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("no-reply@example.com"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    console.error("Invalid environment:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
```

- [ ] **Step 3: Write the failing test**

Create `services/api/test/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("api app", () => {
  it("GET /health returns 200 with status ok", async () => {
    const app = buildApp({ skipAuth: true });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok" });
  });

  it("GET /me returns 401 when unauthenticated", async () => {
    const app = buildApp({ skipAuth: true });
    const res = await app.request("/me");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
pnpm -F @lwa/api test
```

Expected: FAIL — "Cannot find module '../src/app'".

- [ ] **Step 5: Implement routes**

Create `services/api/src/routes/health.ts`:

```ts
import { Hono } from "hono";

export const healthRoutes = new Hono().get("/health", (c) =>
  c.json({ status: "ok", time: new Date().toISOString() }),
);
```

Create `services/api/src/routes/me.ts`:

```ts
import { Hono } from "hono";

export const meRoutes = new Hono().get("/me", (c) => {
  const session = c.get("session") as { user: { id: string; email: string; name: string } } | undefined;
  if (!session?.user) return c.json({ error: "unauthenticated" }, 401);
  return c.json({ user: session.user });
});
```

Create `services/api/src/routes/auth.ts`:

```ts
import { Hono } from "hono";
import type { Auth } from "@lwa/auth";

export function authRoutes(auth: Auth): Hono {
  const app = new Hono();
  // Better Auth exposes a handler for all its routes under a single path.
  app.all("/auth/*", (c) => auth.handler(c.req.raw));
  return app;
}
```

- [ ] **Step 6: Implement email helper**

Create `services/api/src/lib/email.ts`:

```ts
import type { Env } from "../env";

export type EmailSender = (to: string, subject: string, text: string) => Promise<void>;

export function createEmailSender(env: Env): EmailSender {
  if (!env.SMTP_HOST) {
    // Dev fallback — log instead of send
    return async (to, subject, text) => {
      console.log(`[email:dev] to=${to} subject=${subject}\n${text}`);
    };
  }
  // Real SMTP wiring comes in Phase 1 when we actually send digest emails.
  // For Phase 0 we keep it logger-only to avoid SMTP dependency at bootstrap.
  return async (to, subject, text) => {
    console.log(`[email] to=${to} subject=${subject}\n${text}`);
  };
}
```

- [ ] **Step 7: Implement the app factory**

Create `services/api/src/app.ts`:

```ts
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import type { Auth } from "@lwa/auth";
import { requireSession } from "@lwa/auth";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { authRoutes } from "./routes/auth";

export type AppDeps = {
  auth?: Auth;
  skipAuth?: boolean; // test-only: bypass auth for deterministic unit tests
};

export function buildApp(deps: AppDeps = {}): Hono {
  const app = new Hono();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: (origin) => origin ?? "*",
      credentials: true,
    }),
  );

  app.route("/", healthRoutes);

  if (deps.auth) {
    app.route("/", authRoutes(deps.auth));
    app.use("/me", requireSession(deps.auth));
  }

  app.route("/", meRoutes);

  return app;
}
```

- [ ] **Step 8: Implement the server entrypoint**

Create `services/api/src/server.ts`:

```ts
import { serve } from "@hono/node-server";
import { createDb } from "@lwa/db";
import { createAuth } from "@lwa/auth";
import { buildApp } from "./app";
import { loadEnv } from "./env";
import { createEmailSender } from "./lib/email";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const sendEmail = createEmailSender(env);

const auth = createAuth({
  db,
  secret: env.AUTH_SECRET,
  baseUrl: env.AUTH_BASE_URL,
  sendMagicLink: async (to, url) => {
    await sendEmail(to, "Your Loveworld Analytics sign-in link", `Sign in: ${url}`);
  },
});

const app = buildApp({ auth });

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
```

- [ ] **Step 9: Run tests and verify**

```bash
pnpm install
pnpm -F @lwa/api test
```

Expected: PASS — 2 tests green.

```bash
pnpm -F @lwa/api typecheck
```

Expected: clean.

- [ ] **Step 10: Smoke-test the running server**

Ensure `.env` exists with `AUTH_SECRET` set to at least 32 chars. Generate one if needed:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" >> .env.tmp
# Then copy the value into .env as AUTH_SECRET=...
```

Start the server:

```bash
pnpm -F @lwa/api dev
```

In another terminal:

```bash
curl -s http://localhost:3001/health | jq .
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/me
```

Expected: `/health` returns `{ status: "ok", time: "..." }` (200); `/me` returns 401.

- [ ] **Step 11: Write Dockerfile**

Create `services/api/Dockerfile`:

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages packages
COPY services/api services/api
RUN pnpm install --frozen-lockfile --filter=@lwa/api...

FROM deps AS build
RUN pnpm -F @lwa/api build

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/api ./services/api
COPY --from=build /app/package.json ./package.json
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "services/api/dist/server.js"]
```

- [ ] **Step 12: Commit**

```bash
git add .
git commit -m "feat(api): Hono skeleton with /health, Better Auth routes, /me

- buildApp() factory with optional auth injection for testability
- Env loader validates config at boot (zod)
- requireSession middleware protects /me
- Logger + CORS middleware
- Dev-mode email sender logs instead of sending SMTP
- Dockerfile using pnpm filtered install for Dokploy deploy
- 2 unit tests (/health, /me unauth) green"
```

---

## Task 7: `services/ingestion` — BullMQ worker skeleton + empty connector registry

**TDD scenario:** New feature — full TDD cycle with integration test.

**Files:**
- Create: `services/ingestion/package.json`
- Create: `services/ingestion/tsconfig.json`
- Create: `services/ingestion/Dockerfile`
- Create: `services/ingestion/src/env.ts`
- Create: `services/ingestion/src/queues.ts`
- Create: `services/ingestion/src/registry.ts`
- Create: `services/ingestion/src/lib/rate-limiter.ts`
- Create: `services/ingestion/src/handlers/pull.ts`
- Create: `services/ingestion/src/handlers/backfill.ts`
- Create: `services/ingestion/src/handlers/rollup-refresh.ts`
- Create: `services/ingestion/src/handlers/health.ts`
- Create: `services/ingestion/src/worker.ts`
- Create: `services/ingestion/test/queues.test.ts`
- Create: `services/ingestion/vitest.config.ts`

**Why this task exists:** The ingestion worker is where every scheduled pull, backfill, and rollup refresh will run. Phase 0 stands it up with an empty connector registry so that Phase 1's first connector has a place to plug in without any plumbing work.

- [ ] **Step 1: Package scaffold**

Create `services/ingestion/package.json`:

```json
{
  "name": "@lwa/ingestion",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/worker.ts",
  "scripts": {
    "build": "tsc -b",
    "dev": "tsx watch src/worker.ts",
    "start": "node dist/worker.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "@lwa/contracts": "workspace:*",
    "@lwa/db": "workspace:*",
    "bullmq": "^5.13.0",
    "ioredis": "^5.4.1",
    "pino": "^9.4.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@lwa/tsconfig": "workspace:*",
    "@types/node": "^22.5.0",
    "testcontainers": "^10.13.0",
    "tsx": "^4.19.0",
    "vitest": "^1.6.0"
  }
}
```

Create `services/ingestion/tsconfig.json`:

```json
{
  "extends": "@lwa/tsconfig/node",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Create `services/ingestion/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", testTimeout: 60_000, hookTimeout: 60_000, pool: "forks" } });
```

- [ ] **Step 2: Env loader**

Create `services/ingestion/src/env.ts`:

```ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  INGESTION_CONCURRENCY: z.coerce.number().default(4),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    console.error("Invalid environment:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
```

- [ ] **Step 3: Write the failing test**

Create `services/ingestion/test/queues.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { QUEUES } from "../src/queues";

let container: StartedTestContainer;
let connection: IORedis;

beforeAll(async () => {
  container = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
  connection = new IORedis(container.getMappedPort(6379), container.getHost(), { maxRetriesPerRequest: null });
});

afterAll(async () => {
  await connection.quit();
  await container.stop();
});

describe("queues", () => {
  it("exports the four expected queue names", () => {
    expect(QUEUES).toEqual({
      PULL: "connector.pull",
      BACKFILL: "connector.backfill",
      ROLLUP_REFRESH: "rollup.refresh",
      HEALTH: "connector.health",
    });
  });

  it("a worker can consume an enqueued no-op pull job", async () => {
    const queue = new Queue(QUEUES.PULL, { connection });
    let processed: { connectorConfigId: string } | undefined;

    const worker = new Worker<{ connectorConfigId: string }>(
      QUEUES.PULL,
      async (job) => {
        processed = job.data;
      },
      { connection },
    );

    await queue.add("noop", { connectorConfigId: "test-config-1" });

    // Wait for the worker to pick it up
    await new Promise<void>((resolve) => {
      worker.on("completed", () => resolve());
    });

    expect(processed).toEqual({ connectorConfigId: "test-config-1" });
    await worker.close();
    await queue.close();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
pnpm -F @lwa/ingestion test
```

Expected: FAIL — "Cannot find module '../src/queues'".

- [ ] **Step 5: Implement queue constants and registry**

Create `services/ingestion/src/queues.ts`:

```ts
export const QUEUES = {
  PULL: "connector.pull",
  BACKFILL: "connector.backfill",
  ROLLUP_REFRESH: "rollup.refresh",
  HEALTH: "connector.health",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type PullJobData = {
  connectorConfigId: string;
  periodStart: string;   // ISO
  periodEnd: string;
  granularity: "hour" | "day" | "week" | "month" | "quarter";
};

export type BackfillJobData = PullJobData & { backfillRunId: string; chunkIndex: number };

export type RollupRefreshJobData = {
  tenantId: string;
  hierarchyNodeId: string;
  metricCategory: "tv_households" | "web_visitors" | "streaming" | "social_reach" | "engagement";
  granularity: "day" | "week" | "month" | "quarter";
  bucketStart: string;   // ISO
};

export type HealthJobData = { connectorConfigId: string };
```

Create `services/ingestion/src/registry.ts`:

```ts
import type { SourceConnector } from "@lwa/contracts";

export class ConnectorRegistry {
  private readonly map = new Map<string, SourceConnector>();

  register(connector: SourceConnector): void {
    if (this.map.has(connector.key)) {
      throw new Error(`Connector '${connector.key}' is already registered`);
    }
    this.map.set(connector.key, connector);
  }

  get(key: string): SourceConnector | undefined {
    return this.map.get(key);
  }

  all(): SourceConnector[] {
    return Array.from(this.map.values());
  }

  has(key: string): boolean {
    return this.map.has(key);
  }
}

// Empty registry for Phase 0. Phase 1+ will register connectors here.
export const registry = new ConnectorRegistry();
```

- [ ] **Step 6: Implement rate limiter**

Create `services/ingestion/src/lib/rate-limiter.ts`:

```ts
import type IORedis from "ioredis";

/**
 * Redis-backed token bucket. Used to respect per-source and per-account
 * rate limits so no single connector can starve others.
 */
export class RateLimiter {
  constructor(
    private readonly redis: IORedis,
    private readonly key: string,
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  async acquire(cost = 1): Promise<void> {
    const now = Date.now();
    const script = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refill = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local cost = tonumber(ARGV[4])
      local state = redis.call('HMGET', key, 'tokens', 'ts')
      local tokens = tonumber(state[1]) or capacity
      local ts = tonumber(state[2]) or now
      local elapsed = (now - ts) / 1000
      tokens = math.min(capacity, tokens + elapsed * refill)
      if tokens < cost then
        local needed = (cost - tokens) / refill
        return math.ceil(needed * 1000)
      end
      tokens = tokens - cost
      redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
      redis.call('EXPIRE', key, 3600)
      return 0
    `;
    const wait = (await this.redis.eval(
      script,
      1,
      this.key,
      this.capacity,
      this.refillPerSecond,
      now,
      cost,
    )) as number;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
      return this.acquire(cost);
    }
  }
}
```

- [ ] **Step 7: Implement handler stubs**

Create `services/ingestion/src/handlers/pull.ts`:

```ts
import type { Job } from "bullmq";
import type { PullJobData } from "../queues";
import type { ConnectorRegistry } from "../registry";

export function createPullHandler(registry: ConnectorRegistry) {
  return async function pullHandler(job: Job<PullJobData>): Promise<void> {
    // Phase 0: empty registry means no connectors to run; we log and succeed.
    // Phase 1+ will: load connector_config, resolve connector, call pull(), upsert metric_records.
    console.log(`[pull] job=${job.id} config=${job.data.connectorConfigId} — registry size ${registry.all().length}`);
  };
}
```

Create `services/ingestion/src/handlers/backfill.ts`:

```ts
import type { Job } from "bullmq";
import type { BackfillJobData } from "../queues";

export async function backfillHandler(job: Job<BackfillJobData>): Promise<void> {
  console.log(`[backfill] job=${job.id} run=${job.data.backfillRunId} chunk=${job.data.chunkIndex}`);
}
```

Create `services/ingestion/src/handlers/rollup-refresh.ts`:

```ts
import type { Job } from "bullmq";
import type { RollupRefreshJobData } from "../queues";

export async function rollupRefreshHandler(job: Job<RollupRefreshJobData>): Promise<void> {
  console.log(`[rollup] job=${job.id} tenant=${job.data.tenantId} bucket=${job.data.bucketStart}`);
}
```

Create `services/ingestion/src/handlers/health.ts`:

```ts
import type { Job } from "bullmq";
import type { HealthJobData } from "../queues";

export async function healthHandler(job: Job<HealthJobData>): Promise<void> {
  console.log(`[health] job=${job.id} config=${job.data.connectorConfigId}`);
}
```

- [ ] **Step 8: Implement the worker entrypoint**

Create `services/ingestion/src/worker.ts`:

```ts
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "./env";
import { QUEUES } from "./queues";
import { registry } from "./registry";
import { createPullHandler } from "./handlers/pull";
import { backfillHandler } from "./handlers/backfill";
import { rollupRefreshHandler } from "./handlers/rollup-refresh";
import { healthHandler } from "./handlers/health";

const env = loadEnv();
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const pullWorker = new Worker(QUEUES.PULL, createPullHandler(registry), {
  connection,
  concurrency: env.INGESTION_CONCURRENCY,
});
const backfillWorker = new Worker(QUEUES.BACKFILL, backfillHandler, { connection, concurrency: 1 });
const rollupWorker = new Worker(QUEUES.ROLLUP_REFRESH, rollupRefreshHandler, {
  connection,
  concurrency: env.INGESTION_CONCURRENCY,
});
const healthWorker = new Worker(QUEUES.HEALTH, healthHandler, { connection, concurrency: 1 });

const workers = [pullWorker, backfillWorker, rollupWorker, healthWorker];

console.log("Ingestion worker started — queues:", Object.values(QUEUES).join(", "));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    process.exit(0);
  });
}
```

- [ ] **Step 9: Run tests and verify**

```bash
pnpm install
pnpm -F @lwa/ingestion test
```

Expected: PASS — 2 tests green (queue constants + no-op consumption).

```bash
pnpm -F @lwa/ingestion typecheck
```

Expected: clean.

- [ ] **Step 10: Smoke test — start the worker**

```bash
pnpm -F @lwa/ingestion dev
```

Expected output:

```
Ingestion worker started — queues: connector.pull, connector.backfill, rollup.refresh, connector.health
```

Stop with `Ctrl+C` — expect a clean shutdown log.

- [ ] **Step 11: Write Dockerfile**

Create `services/ingestion/Dockerfile`:

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages packages
COPY services/ingestion services/ingestion
RUN pnpm install --frozen-lockfile --filter=@lwa/ingestion...

FROM deps AS build
RUN pnpm -F @lwa/ingestion build

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/ingestion ./services/ingestion
ENV NODE_ENV=production
CMD ["node", "services/ingestion/dist/worker.js"]
```

- [ ] **Step 12: Commit**

```bash
git add .
git commit -m "feat(ingestion): BullMQ worker skeleton + empty connector registry

- Four queues defined: pull, backfill, rollup.refresh, health
- Connector registry (empty; Phase 1+ populates)
- Handler stubs log job receipt until connectors exist
- Redis-backed token-bucket rate limiter (Lua script, per-key)
- Graceful shutdown on SIGINT/SIGTERM
- Testcontainers integration test verifies end-to-end job round-trip"
```

---

## Task 8: `apps/web` — SvelteKit scaffold + login + empty tenant dashboard

**TDD scenario:** Modifying/new code that must work end-to-end — Playwright smoke test asserts the redirect flow.

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/svelte.config.js`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/Dockerfile`
- Create: `apps/web/src/app.html`
- Create: `apps/web/src/app.css`
- Create: `apps/web/src/hooks.server.ts`
- Create: `apps/web/src/lib/auth-client.ts`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/routes/+layout.svelte`
- Create: `apps/web/src/routes/+layout.server.ts`
- Create: `apps/web/src/routes/+page.server.ts`
- Create: `apps/web/src/routes/login/+page.svelte`
- Create: `apps/web/src/routes/login/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/+layout.server.ts`
- Create: `apps/web/src/routes/[tenant]/+layout.svelte`
- Create: `apps/web/src/routes/[tenant]/+page.svelte`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/tests/login.spec.ts`

**Why this task exists:** The web app is what users actually touch. Phase 0 ships an empty shell with working auth and tenant-aware routing so Phase 1 can immediately start adding real pages (manager console, dashboard) without infrastructure work.

- [ ] **Step 1: Package scaffold**

Create `apps/web/package.json`:

```json
{
  "name": "@lwa/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite dev --port 5173",
    "preview": "vite preview",
    "typecheck": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "lint": "eslint src",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@lwa/ui": "workspace:*",
    "@sveltejs/kit": "^2.5.0",
    "better-auth": "^1.0.0",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@lwa/tsconfig": "workspace:*",
    "@playwright/test": "^1.47.0",
    "@sveltejs/adapter-node": "^5.2.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0-beta.2",
    "svelte-check": "^4.0.0",
    "tailwindcss": "^4.0.0-beta.2",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.0"
  }
}
```

Create `apps/web/svelte.config.js`:

```js
import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    alias: {
      $lib: "src/lib",
    },
  },
};
```

Create `apps/web/vite.config.ts`:

```ts
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: { port: 5173 },
});
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "@lwa/tsconfig/svelte",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "target": "ES2022",
    "types": ["@sveltejs/kit"]
  },
  "include": ["src/**/*", ".svelte-kit/**/*"]
}
```

- [ ] **Step 2: App shell**

Create `apps/web/src/app.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Loveworld Analytics" />
    <title>Loveworld Analytics</title>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div id="app">%sveltekit.body%</div>
  </body>
</html>
```

Create `apps/web/src/app.css`:

```css
@import "@lwa/ui/styles/app.css";

html, body { height: 100%; background: #fafafa; font-family: var(--font-sans); }
```

- [ ] **Step 3: Auth client + server hooks**

Create `apps/web/src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001",
});
```

Create `apps/web/src/lib/api-client.ts`:

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return res;
}
```

Create `apps/web/src/hooks.server.ts`:

```ts
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  // Phase 0: no server-side session fetch; we rely on client-side Better Auth.
  // Phase 1 will fetch session here and populate event.locals for SSR.
  return resolve(event);
};
```

- [ ] **Step 4: Root layout + login page**

Create `apps/web/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import "../app.css";
  let { children } = $props();
</script>

<div class="min-h-screen">
  {@render children()}
</div>
```

Create `apps/web/src/routes/+layout.server.ts`:

```ts
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async () => {
  return {};
};
```

Create `apps/web/src/routes/+page.server.ts`:

```ts
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  // Root redirects to login for Phase 0.
  // Phase 1 will check session + redirect to the user's first tenant dashboard.
  throw redirect(303, "/login");
};
```

Create `apps/web/src/routes/login/+page.svelte`:

```svelte
<script lang="ts">
  import { authClient } from "$lib/auth-client";
  import { Button, Card } from "@lwa/ui";

  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let submitting = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    submitting = true;
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) {
        error = res.error.message ?? "Sign-in failed";
      } else {
        // Redirect to root — Phase 1 will route to the user's first tenant.
        window.location.href = "/";
      }
    } finally {
      submitting = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center px-4">
  <Card class="w-full max-w-md">
    <h1 class="mb-6 text-2xl font-semibold">Sign in</h1>
    <form onsubmit={handleSubmit} class="space-y-4">
      <label class="block">
        <span class="text-sm font-medium">Email</span>
        <input
          type="email"
          bind:value={email}
          required
          autocomplete="email"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label class="block">
        <span class="text-sm font-medium">Password</span>
        <input
          type="password"
          bind:value={password}
          required
          autocomplete="current-password"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      {#if error}
        <p class="text-sm text-red-600">{error}</p>
      {/if}
      <Button type="submit" disabled={submitting} class="w-full">
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  </Card>
</div>
```

Create `apps/web/src/routes/login/+page.server.ts`:

```ts
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  return {};
};
```

- [ ] **Step 5: Tenant-scoped shell**

Create `apps/web/src/routes/[tenant]/+layout.server.ts`:

```ts
import { error } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ params }) => {
  if (!params.tenant) throw error(404, "Tenant not specified");
  // Phase 0: we don't validate tenant membership here; Phase 1 wires up API /me + tenant check.
  return { tenantSlug: params.tenant };
};
```

Create `apps/web/src/routes/[tenant]/+layout.svelte`:

```svelte
<script lang="ts">
  import { Card } from "@lwa/ui";
  let { children, data } = $props();
</script>

<div class="mx-auto max-w-6xl px-6 py-8">
  <header class="mb-8">
    <p class="text-sm text-slate-500">Tenant</p>
    <h1 class="text-2xl font-semibold">{data.tenantSlug}</h1>
  </header>
  {@render children()}
</div>
```

Create `apps/web/src/routes/[tenant]/+page.svelte`:

```svelte
<script lang="ts">
  import { Card } from "@lwa/ui";
  let { data } = $props();
</script>

<Card>
  <h2 class="mb-2 text-xl font-semibold">Dashboard</h2>
  <p class="text-slate-600">
    Welcome to Loveworld Analytics. Phase 0 placeholder — real dashboard arrives in Phase 1.
  </p>
  <p class="mt-4 text-sm text-slate-500">Tenant: <code>{data.tenantSlug}</code></p>
</Card>
```

- [ ] **Step 6: Playwright config and login smoke test**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

Create `apps/web/tests/login.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("root redirects unauthenticated users to /login", async ({ page }) => {
  const response = await page.goto("/");
  expect(page.url()).toContain("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("login page renders the email and password inputs", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in/ })).toBeVisible();
});
```

Install Playwright browsers:

```bash
cd apps/web && pnpm exec playwright install chromium
```

- [ ] **Step 7: Run E2E**

From the repo root:

```bash
pnpm install
pnpm -F @lwa/web test:e2e
```

Expected: 2 Playwright tests green.

- [ ] **Step 8: Typecheck**

```bash
pnpm -F @lwa/web typecheck
```

Expected: clean.

- [ ] **Step 9: Dockerfile**

Create `apps/web/Dockerfile`:

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages packages
COPY apps/web apps/web
RUN pnpm install --frozen-lockfile --filter=@lwa/web...

FROM deps AS build
RUN pnpm -F @lwa/web build

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "build"]
```

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(web): SvelteKit 2 scaffold with login + empty tenant dashboard

- Better Auth client integration
- Root redirects to /login when unauthenticated
- [tenant] layout placeholder ready for Phase 1 dashboard
- Tailwind 4 via @tailwindcss/vite; shared tokens from @lwa/ui
- Playwright login smoke tests (redirect + form visibility)
- Dockerfile for Dokploy deploy via @sveltejs/adapter-node"
```

---

## Task 9: Admin CLI + first tenant seed + end-to-end login smoke

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Create: `services/api/src/admin/create-tenant.ts`
- Create: `services/api/test/admin-create-tenant.test.ts`

**Why this task exists:** Platform owners need a way to bootstrap the first tenant before anyone can log in. The `pnpm admin:create-tenant` command creates a tenant, the initial `network_admin` user, and the membership row in one transaction. This closes the loop: after Task 9, a developer clones the repo, runs three commands, and lands logged in as a real user.

- [ ] **Step 1: Write the failing test**

Create `services/api/test/admin-create-tenant.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { schema } from "@lwa/db";
import { eq } from "drizzle-orm";
import { createTenantAndAdmin } from "../src/admin/create-tenant";

let container: StartedPostgreSqlContainer;
let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  client = postgres(container.getConnectionUri(), { max: 5 });
  db = drizzle(client, { schema });
  await migrate(db as unknown as Parameters<typeof migrate>[0], {
    migrationsFolder: "../../packages/db/drizzle",
  });
});

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe("createTenantAndAdmin", () => {
  it("creates a tenant, user, and network_admin membership atomically", async () => {
    const result = await createTenantAndAdmin(db as never, {
      tenantName: "Loveworld Europe",
      tenantSlug: "lw-europe",
      adminEmail: "admin@example.com",
      adminName: "Admin One",
    });

    expect(result.tenant.slug).toBe("lw-europe");
    expect(result.user.email).toBe("admin@example.com");
    expect(result.membership.role).toBe("network_admin");
    expect(result.membership.tenantId).toBe(result.tenant.id);
    expect(result.membership.userId).toBe(result.user.id);
  });

  it("rejects duplicate tenant slug", async () => {
    await expect(
      createTenantAndAdmin(db as never, {
        tenantName: "LW Europe Clone",
        tenantSlug: "lw-europe",
        adminEmail: "other@example.com",
        adminName: "Other",
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @lwa/api test
```

Expected: FAIL — "Cannot find module '../src/admin/create-tenant'".

- [ ] **Step 3: Implement the admin function**

Create `services/api/src/admin/create-tenant.ts`:

```ts
import { schema, type Database } from "@lwa/db";
import { eq } from "drizzle-orm";

export type CreateTenantInput = {
  tenantName: string;
  tenantSlug: string;
  adminEmail: string;
  adminName: string;
};

export type CreateTenantResult = {
  tenant: { id: string; slug: string; name: string };
  user: { id: string; email: string; name: string };
  membership: { id: string; userId: string; tenantId: string; role: "network_admin" };
};

export async function createTenantAndAdmin(
  db: Database,
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.tenant.findFirst({
      where: eq(schema.tenant.slug, input.tenantSlug),
    });
    if (existing) throw new Error(`Tenant slug '${input.tenantSlug}' already exists`);

    const [tenantRow] = await tx
      .insert(schema.tenant)
      .values({ name: input.tenantName, slug: input.tenantSlug })
      .returning();
    if (!tenantRow) throw new Error("tenant insert failed");

    let userRow = await tx.query.user.findFirst({ where: eq(schema.user.email, input.adminEmail) });
    if (!userRow) {
      const [inserted] = await tx
        .insert(schema.user)
        .values({
          email: input.adminEmail,
          name: input.adminName,
          emailVerified: true,
        })
        .returning();
      if (!inserted) throw new Error("user insert failed");
      userRow = inserted;
    }

    const [membershipRow] = await tx
      .insert(schema.tenantMembership)
      .values({
        userId: userRow.id,
        tenantId: tenantRow.id,
        role: "network_admin",
      })
      .returning();
    if (!membershipRow) throw new Error("membership insert failed");

    return {
      tenant: { id: tenantRow.id, slug: tenantRow.slug, name: tenantRow.name },
      user: { id: userRow.id, email: userRow.email, name: userRow.name },
      membership: {
        id: membershipRow.id,
        userId: membershipRow.userId,
        tenantId: membershipRow.tenantId,
        role: "network_admin",
      },
    };
  });
}

// CLI entrypoint: `pnpm admin:create-tenant --name <name> --slug <slug> --admin-email <email> --admin-name <name>`
if (import.meta.url === `file://${process.argv[1]}`) {
  const { createDb } = await import("@lwa/db");
  const parseArg = (flag: string): string | undefined => {
    const idx = process.argv.indexOf(flag);
    return idx >= 0 ? process.argv[idx + 1] : undefined;
  };

  const name = parseArg("--name");
  const slug = parseArg("--slug") ?? name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const adminEmail = parseArg("--admin-email");
  const adminName = parseArg("--admin-name") ?? "Admin";

  if (!name || !slug || !adminEmail) {
    console.error("Usage: pnpm admin:create-tenant --name <name> [--slug <slug>] --admin-email <email> [--admin-name <name>]");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL env var required");
    process.exit(1);
  }

  const db = createDb(url);
  const result = await createTenantAndAdmin(db, {
    tenantName: name,
    tenantSlug: slug,
    adminEmail,
    adminName,
  });
  console.log("✓ Created:");
  console.log(`  Tenant   : ${result.tenant.name} (${result.tenant.slug})`);
  console.log(`  Admin    : ${result.user.email}`);
  console.log("Next step: the admin user has no password yet. Run Better Auth's reset-password flow");
  console.log("or update the password directly via Better Auth API to allow login.");
  process.exit(0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm install
pnpm -F @lwa/api test
```

Expected: PASS — 4 tests green (2 original + 2 admin-create-tenant).

- [ ] **Step 5: Smoke test end-to-end**

From repo root, assuming Postgres + Redis are running and migrations applied:

```bash
pnpm -F @lwa/db migrate
pnpm -F @lwa/db seed
pnpm admin:create-tenant --name "Loveworld Europe" --admin-email dev@localhost --admin-name "Dev Admin"
```

Expected output:

```
✓ Created:
  Tenant   : Loveworld Europe (lw-europe)
  Admin    : dev@localhost
Next step: the admin user has no password yet. Run Better Auth's reset-password flow...
```

Verify in DB:

```bash
docker exec lwa-postgres psql -U lwa -d lwa_dev -c "SELECT slug FROM tenant; SELECT email FROM \"user\"; SELECT role FROM tenant_membership;"
```

Expected: `lw-europe`, `dev@localhost`, `network_admin`.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(admin): create-tenant CLI for bootstrapping the first tenant

- Single transaction: tenant + user + network_admin membership
- Idempotent on user email (reuses existing users)
- Rejects duplicate tenant slug with clear error
- 2 integration tests covering success + duplicate-slug paths
- Wired as pnpm admin:create-tenant root script"
```

---

## Task 10: CI pipeline + Dokploy staging stack + Meta app review checklist

**TDD scenario:** Trivial / configuration — verification is "CI green on GitHub."

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/staging-deploy.yml`
- Create: `infra/dokploy/staging.yml`
- Create: `infra/dokploy/production.yml`
- Create: `docs/runbooks/onboarding.md`
- Create: `docs/runbooks/meta-app-review-checklist.md`
- Create: `docs/feature-flags.md`
- Modify: `README.md` (add deployment section)

**Why this task exists:** Closes Phase 0 by ensuring every later merge is verified and deployed automatically, and by kicking off the external Meta app review timer (the critical path gate for Phase 3).

- [ ] **Step 1: Write CI pipeline**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint-typecheck-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: lwa
          POSTGRES_PASSWORD: lwa_test
          POSTGRES_DB: lwa_test
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
        ports:
          - 5432:5432
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
        ports:
          - 6379:6379
    env:
      DATABASE_URL: postgres://lwa:lwa_test@localhost:5432/lwa_test
      REDIS_URL: redis://localhost:6379
      AUTH_SECRET: ci_secret_at_least_32_characters_long
      AUTH_BASE_URL: http://localhost:5173
      CONNECTOR_KEK_BASE64: dGVzdF9rZWtfYmFzZTY0X2F0X2xlYXN0XzMyX2J5dGVzX2xvbmdfb2s=
      CONNECTOR_KEK_VERSION: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F @lwa/db generate && pnpm -F @lwa/db migrate
      - run: pnpm turbo lint typecheck test build

  e2e-smoke:
    runs-on: ubuntu-latest
    needs: lint-typecheck-test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F @lwa/web exec playwright install --with-deps chromium
      - run: pnpm -F @lwa/web test:e2e
```

Create `.github/workflows/staging-deploy.yml`:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Trigger Dokploy staging deploy
        run: |
          curl -fsS -X POST \
            -H "Authorization: Bearer ${{ secrets.DOKPLOY_STAGING_TOKEN }}" \
            -H "Content-Type: application/json" \
            "${{ secrets.DOKPLOY_STAGING_WEBHOOK }}" \
            -d '{"ref":"${{ github.sha }}"}'
```

- [ ] **Step 2: Write Dokploy stack definitions**

Create `infra/dokploy/staging.yml`:

```yaml
# Dokploy Swarm stack — staging
# Managed via Dokploy UI; this file is the source-of-truth copy.
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER_FILE: /run/secrets/pg_user
      POSTGRES_PASSWORD_FILE: /run/secrets/pg_password
      POSTGRES_DB: lwa_staging
    volumes:
      - postgres-data:/var/lib/postgresql/data
    secrets:
      - pg_user
      - pg_password

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  api:
    image: ghcr.io/<org>/loveworld-analytics-api:${DEPLOY_SHA}
    environment:
      NODE_ENV: staging
      DATABASE_URL_FILE: /run/secrets/database_url
      REDIS_URL: redis://redis:6379
      AUTH_SECRET_FILE: /run/secrets/auth_secret
      AUTH_BASE_URL: https://staging.loveworld-analytics.example
      CONNECTOR_KEK_BASE64_FILE: /run/secrets/connector_kek
      CONNECTOR_KEK_VERSION: "1"
      API_PORT: "3001"
    secrets:
      - database_url
      - auth_secret
      - connector_kek
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 2
      update_config: { order: start-first, parallelism: 1, failure_action: rollback }
      restart_policy: { condition: on-failure }

  ingestion:
    image: ghcr.io/<org>/loveworld-analytics-ingestion:${DEPLOY_SHA}
    environment:
      NODE_ENV: staging
      DATABASE_URL_FILE: /run/secrets/database_url
      REDIS_URL: redis://redis:6379
      INGESTION_CONCURRENCY: "4"
      CONNECTOR_KEK_BASE64_FILE: /run/secrets/connector_kek
      CONNECTOR_KEK_VERSION: "1"
    secrets:
      - database_url
      - connector_kek
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 1
      restart_policy: { condition: on-failure }

  web:
    image: ghcr.io/<org>/loveworld-analytics-web:${DEPLOY_SHA}
    environment:
      NODE_ENV: staging
      PORT: "3000"
      VITE_API_BASE_URL: https://api.staging.loveworld-analytics.example
    deploy:
      replicas: 2
      update_config: { order: start-first, parallelism: 1, failure_action: rollback }
      restart_policy: { condition: on-failure }

secrets:
  pg_user:       { external: true }
  pg_password:   { external: true }
  database_url:  { external: true }
  auth_secret:   { external: true }
  connector_kek: { external: true }

volumes:
  postgres-data:
  redis-data:
```

Create `infra/dokploy/production.yml` — identical structure with `loveworld-analytics-*:${DEPLOY_SHA}` images and production URLs. Copy `staging.yml` and edit the 5 environment values (`NODE_ENV`, three `*_BASE_URL`s, replica counts to `3/2/3`).

- [ ] **Step 3: Write onboarding runbook scaffold**

Create `docs/runbooks/onboarding.md`:

```markdown
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
```

- [ ] **Step 4: Write Meta app review checklist**

Create `docs/runbooks/meta-app-review-checklist.md`:

```markdown
# Meta App Review Checklist

**Purpose:** Submit the Meta (Facebook + Instagram) Graph API app for review so that the `meta_graph` connector can access Page Insights and IG Business Account metrics in Phase 3.

**Timing:** **Submit in Phase 0 Week 1.** Review typically takes 2–6 weeks of calendar time and is entirely outside our control.

**Owner:** Platform owner, in coordination with the Loveworld digital team.

## Prerequisites

- Meta for Developers account with admin access to the Loveworld business portfolio
- Existing Facebook Page(s) and Instagram Business Account(s) for the first tenant
- Hosted privacy policy URL (can be a static page under the staging domain for submission; finalise before Phase 3 go-live)
- Data Deletion Instructions URL

## Pre-submission

- [ ] Create a new Meta App in the Meta for Developers console
- [ ] App type: **Business**
- [ ] Product: **Facebook Login for Business** + **Graph API**
- [ ] Permissions requested:
  - `pages_read_engagement` — read post engagement metrics on owned Pages
  - `pages_show_list` — list Pages the admin manages
  - `read_insights` — read Page Insights (reach, views, impressions)
  - `instagram_basic` — link IG Business Account
  - `instagram_manage_insights` — read IG Insights
  - `business_management` — access business-managed assets
- [ ] OAuth redirect URIs registered:
  - `https://api.staging.loveworld-analytics.example/auth/callback/meta`
  - `https://api.loveworld-analytics.example/auth/callback/meta`
- [ ] Privacy policy URL live and linked
- [ ] Data deletion URL live and linked
- [ ] App icon (1024×1024 PNG) uploaded

## Submission materials

For each permission above, the reviewer requires:

- [ ] A **screencast** showing the exact user flow:
  1. Admin logs into Loveworld Analytics
  2. Navigates to `/<tenant>/sources/new`
  3. Selects "Meta (Facebook + Instagram)"
  4. Completes Meta OAuth consent
  5. Selects Pages / IG accounts to attach
  6. Attaches them to hierarchy nodes
  7. Dashboard updates with Meta-sourced metrics after first pull

- [ ] A **written rationale** for each permission — reference this doc's context: multi-tenant analytics rollup for TV networks; numbers shown only to authenticated tenant members with `view_dashboard`; data not shared beyond the tenant.

- [ ] **Test credentials** for a sandbox Page and IG account that reviewers can use to reproduce the flow.

## Post-submission

- [ ] Review status checked weekly in Meta for Developers console
- [ ] Questions / rejections tracked in `docs/ops/meta-app-review-log.md` (create if reviewer asks for changes)
- [ ] **Do not start building the Meta connector before Phase 2 closes** — submission-while-building avoids rework if requirements change during review

## If review is rejected

See Runbook R-10 (created in Phase 4). Common fixes:

- Screencast too fast / unclear — re-record with narration and zoomed cursor
- Privacy policy missing required disclosures — update and re-submit (no new review cycle for policy-only changes)
- Permission scope too broad — remove unused scopes and resubmit
```

- [ ] **Step 5: Write feature flags doc**

Create `docs/feature-flags.md`:

```markdown
# Feature Flags

Loveworld Analytics uses lightweight feature flags (env vars for global toggles; `tenant_features` for per-tenant). Every flag has a **removal date** tracked here. Flags older than 6 months without a removal plan are a code smell and should be cleaned up.

| Flag | Type | Purpose | Added | Target removal |
|---|---|---|---|---|
| `CONNECTOR_META_ENABLED` | env | Dark-ship the Meta connector until app review clears | 2026-04 | Phase 3 GA (~2026-06) |
| `ENABLE_PDF_EXPORT` | env | Dark-ship PDF export until Phase 2 | 2026-04 | Phase 2 GA (~2026-05) |

## Adding a flag

1. Add a row to this table with a removal plan
2. Implement: read the env var once at boot; or write to `tenant_features` with a `tenant_id`
3. Wrap the feature in a simple check
4. Set a calendar reminder for the removal date

## Removing a flag

1. Delete the flag check
2. Delete the config
3. Delete the row in this table
4. Commit with message `chore: remove <flag> feature flag`
```

- [ ] **Step 6: Update README with deployment section**

Append to `README.md`:

````markdown

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
````

- [ ] **Step 7: Verify CI passes**

Push the branch and open a PR:

```bash
git checkout -b phase-0-foundations
git push -u origin phase-0-foundations
```

Open the PR on GitHub, wait for CI.

Expected: both `lint-typecheck-test` and `e2e-smoke` jobs pass.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(infra): CI pipeline + Dokploy staging stack + Meta app review checklist

- GitHub Actions: lint/typecheck/test/build + Playwright smoke, with Postgres 16 + Redis 7 services
- Staging auto-deploy on merge to main via Dokploy webhook
- Dokploy stack definitions for staging + production (Swarm, secrets externalised)
- Tenant onboarding runbook (scaffold)
- Meta app review checklist — submit in Week 1, 2-6 week calendar gate for Phase 3
- Feature flags registry with explicit removal dates
- README deployment section"
```

- [ ] **Step 9: Merge and verify staging**

Merge the PR to `main`. Confirm:

- [ ] CI green on `main`
- [ ] Dokploy staging pipeline triggered
- [ ] `https://staging.loveworld-analytics.example/health` returns `{ status: "ok" }` (post-deploy)
- [ ] `https://staging.loveworld-analytics.example/` redirects to `/login`
- [ ] Manual admin CLI run against staging creates a tenant end-to-end

Phase 0 is complete when Step 9 is fully checked.

---

## Plan self-review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Standalone repo named `loveworld-analytics` | Task 1 |
| pnpm workspaces + Turborepo | Task 1 |
| SvelteKit + Hono + Postgres + Drizzle + Zod stack | Tasks 2–8 |
| Better Auth with email + password + magic link + TOTP | Task 4 |
| Four roles with capability matrix | Task 4 |
| Tenant middleware for API | Task 4 |
| Hierarchy, tenant, user, membership, source, connector_config, audit_log tables | Task 2 |
| SourceConnector interface with kind=pull|manual | Task 3 |
| Result<T, E> error type for connectors | Task 3 |
| BullMQ queues: pull, backfill, rollup.refresh, health | Task 7 |
| Empty connector registry ready for Phase 1 | Task 7 |
| SvelteKit 2 app with login + tenant routing | Task 8 |
| Admin CLI to create tenants | Task 9 |
| CI pipeline with cross-tenant isolation discipline prep | Task 10 |
| Dokploy staging + production stack definitions | Task 10 |
| Meta app review submission in Week 1 | Task 10 |

Everything in Phase 0's scope (design doc §3 "In scope for v1" limited to foundations per rollout §13 Phase 0) is covered.

### Placeholder scan

No TBD / TODO / fill-in-later markers in task steps. Forward references ("Phase 1 will do X") are intentional and point to the correct plan number.

### Type consistency

- `Database` type: defined in `packages/db/src/client.ts` (Task 2), used by Task 4 (auth middleware), Task 6 (api server), Task 7 (ingestion, indirectly via contracts), Task 9 (admin CLI). All imports valid.
- `SourceConnector` type: defined in `packages/contracts/src/source-connector.ts` (Task 3), consumed by Task 7's registry. Valid.
- `Auth` type: defined in `packages/auth/src/auth.ts` (Task 4), consumed by Task 6's `buildApp(deps)` and `authRoutes()`. Valid.
- `Role` and `Capability`: defined in `packages/auth/src/permissions.ts` (Task 4), used in middleware same task. Consistent.
- `QUEUES` constant: defined in `services/ingestion/src/queues.ts` (Task 7), used in same task's worker + test. Consistent.
- `@lwa/tsconfig` package: created in Task 2, referenced by Tasks 3–9. Created before used — task ordering is correct.

No forward references to undefined types.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-04-20-plan-01-foundations.md`.

Two execution options:

**1. Subagent-Driven (recommended, this session)** — Fresh subagent per task with two-stage review. Better for this plan because the 10 tasks are moderately coupled (each depends on prior packages existing) but each produces a reviewable commit on its own.

**2. Parallel Session (separate)** — Execute in a separate session using checkpoints. Better if you want to pause between tasks and inspect the running system yourself before proceeding.

**Which approach?**
