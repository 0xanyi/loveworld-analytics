# Phase 1 Closeout Implementation Plan

> **REQUIRED SUB-SKILL:** Use `/skill:subagent-driven-development` (recommended) or `/skill:executing-plans` to implement this plan task-by-task.

**Goal:** Close Phase 1 so the product can be safely promoted to a production pilot: green verification, reproducible tenant-to-dashboard gate, clean admin onboarding, runnable deploy artifacts, and documentation that matches the shipped state.

**Architecture:** Keep Phase 1 narrow. Fix the current E2E regressions, make manual entries refresh board rollups synchronously, add the missing admin password CLI, then implement a `phase1:gate` script that exercises the real API from tenant setup through non-zero dashboard tiles. Deploy hardening is limited to making the existing Dokploy/GHCR path bootable and correctly configured; full v1 GA items such as PDF export, YouTube, Meta, Smart TV, observability dashboards, and all v1 runbooks remain outside this closeout.

**Tech Stack:** pnpm 9, Turborepo, TypeScript, SvelteKit 2/Svelte 5, Hono, Better Auth 1.6.5, Drizzle/Postgres, Redis/BullMQ, Playwright, Vitest, Docker, Dokploy, GitHub Actions/GHCR.

---

## Prerequisites and scope

### Current verified baseline

Before this plan was written:

```bash
pnpm -w turbo lint typecheck test
pnpm build
```

both succeeded.

The full Playwright suite currently fails because `source-health.spec.ts` uses an ambiguous text locator. The account menu test also showed one full-suite flaky failure that passed on targeted rerun.

### In scope

- Stabilize current E2E tests.
- Ensure manual entry writes are visible on the board metrics API through rollup refresh.
- Add `admin:set-password` CLI and tests.
- Add `phase1:gate` script, runbook, and CI execution.
- Make staging/production runtime config internally consistent.
- Make Docker images build, boot, and publish through GHCR.
- Update README/runbooks/plans to reflect the implemented Phase 1 state.

### Out of scope

- YouTube, Meta, Smart TV, TikTok, X connectors.
- Streaming/social/engagement KPI tiles.
- PDF export, CSV export, records drill-down, adjustment UI, invites/team UI.
- Full observability stack and all v1 GA runbooks.
- Production domain finalization if the real domains are not known during implementation. In that case the implementation must leave the stack files parameterized and document required Dokploy values.

## File structure map

### E2E stabilization

- Modify: `apps/web/tests/source-health.spec.ts`
- Modify: `apps/web/tests/account-menu.spec.ts`

### Manual-entry rollup visibility

- Modify: `services/api/src/routes/entries.ts`
- Create: `services/api/test/manual-entry-rollup.test.ts`

### Admin password CLI

- Create: `services/api/src/admin/set-password.ts`
- Modify: `services/api/src/admin/create-tenant.ts`
- Modify: `services/api/package.json`
- Modify: `package.json`
- Create: `services/api/test/set-password.test.ts`

### Phase 1 gate

- Create: `scripts/phase1-gate.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/runbooks/phase1-gate.md`

### Runtime/deploy hardening

- Modify: `services/api/src/env.ts`
- Modify: `services/api/src/lib/email.ts`
- Create: `services/api/test/email.test.ts`
- Modify: `services/api/test/env.test.ts`
- Modify: `services/ingestion/src/env.ts`
- Modify: `services/ingestion/test/env.test.ts`
- Modify: `services/api/package.json`
- Modify: `services/api/Dockerfile`
- Modify: `services/ingestion/Dockerfile`
- Modify: `apps/web/Dockerfile`
- Modify: `infra/dokploy/staging.yml`
- Modify: `infra/dokploy/production.yml`
- Create: `.github/workflows/images.yml`

### Documentation cleanup

- Modify: `README.md`
- Modify: `docs/runbooks/onboarding.md`
- Modify: `docs/plans/2026-04-20-loveworld-analytics-design.md`
- Modify: `docs/plans/2026-04-20-plan-02-p0-connectors.md`
- Modify: `docs/feature-flags.md`

---

## Task 1: Stabilize Playwright E2E

**TDD scenario:** Modifying tested code — reproduce the failing tests first, then make the smallest test/UI changes needed for deterministic green runs.

**Files:**
- Modify: `apps/web/tests/source-health.spec.ts`
- Modify: `apps/web/tests/account-menu.spec.ts`

**Why this task exists:** Phase 1 cannot close while the current E2E suite is red or flaky. The known source-health failure is an ambiguous locator, and the account-menu helper should wait for the trigger to be interactable before clicking.

- [ ] **Step 1: Reproduce the current failure**

Run with the API and web stack as in CI:

```bash
pnpm db:migrate
pnpm -F @lwa/db seed
pnpm -F @lwa/api dev > /tmp/lwa-api.log 2>&1 & echo $! > /tmp/lwa-api.pid
for i in $(seq 1 60); do curl -fsS http://localhost:3001/health >/dev/null && break; sleep 1; done
pnpm -F @lwa/web test:e2e -- source-health.spec.ts account-menu.spec.ts
kill $(cat /tmp/lwa-api.pid)
```

Expected before the fix:

- `source health detail shows recent runs with records and timestamps` fails because `getByText("Satellite (Manual)")` resolves to a heading and an `sr-only` caption.
- Account-menu tests may pass or reveal the existing flake.

- [ ] **Step 2: Make source health locators strict**

In `apps/web/tests/source-health.spec.ts`, replace detail-page assertions that target the connector name via generic text with role-based heading assertions.

Change every detail-page assertion shaped like this:

```ts
await expect(page.getByText("Satellite (Manual)")).toBeVisible();
```

when the page is on `/${tenantSlug}/sources/${connectorId}` to:

```ts
await expect(page.getByRole("heading", { name: "Satellite (Manual)" })).toBeVisible();
```

Keep list-page assertions as generic text only where they intentionally assert row/card content and do not conflict with hidden captions.

- [ ] **Step 3: Harden the account panel test helper**

In `apps/web/tests/account-menu.spec.ts`, replace `openAccountPanel` with this implementation:

```ts
async function openAccountPanel(page: Page) {
  const trigger = page.getByRole("button", { name: "Account menu" });
  const panel = page.locator("#account-panel");

  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await trigger.click();
    try {
      await expect(panel).toBeVisible({ timeout: 2_000 });
      return panel;
    } catch {
      if (attempt === 1) throw new Error("account panel did not open");
    }
  }

  throw new Error("account panel did not open");
}
```

This keeps the helper small and deterministic without hiding real failures indefinitely.

- [ ] **Step 4: Verify targeted E2E**

Run:

```bash
pnpm -F @lwa/web test:e2e -- source-health.spec.ts account-menu.spec.ts
```

Expected:

- all targeted tests pass.

- [ ] **Step 5: Verify full E2E once**

Run:

```bash
pnpm -F @lwa/web test:e2e
```

Expected:

- all Playwright tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/source-health.spec.ts apps/web/tests/account-menu.spec.ts
git commit -m "test(web): stabilize Phase 1 e2e suite"
```

---

## Task 2: Refresh rollups after manual entry writes

**TDD scenario:** New integration behavior — write a failing API test proving manual entry appears in board metrics, then implement synchronous rollup refresh in the manual entry route.

**Files:**
- Create: `services/api/test/manual-entry-rollup.test.ts`
- Modify: `services/api/src/routes/entries.ts`

**Why this task exists:** `POST /tenants/:slug/entries` currently writes `metric_record`, but board metrics read `metric_rollup`. The Phase 1 gate requires a manual entry to produce non-zero board tiles without an operator manually refreshing rollups.

- [ ] **Step 1: Add the failing integration test**

Create `services/api/test/manual-entry-rollup.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Auth } from "@lwa/auth";
import {
  type Database,
  connectorConfig,
  hierarchyNode,
  source,
  tenant,
  tenantMembership,
  user,
} from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import "@lwa/connectors";
import { buildApp } from "../src/app";

let container: StartedPostgreSqlContainer;
let db: Database;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const res = await createTestDb(container.getConnectionUri());
  db = res.db;
  cleanup = res.cleanup;
});

afterAll(async () => {
  await cleanup();
  await container.stop();
});

describe("manual entries refresh dashboard rollups", () => {
  it("returns a non-zero tv_households board tile after manual entry", async () => {
    const ctx = await seedManualCtx(db);
    const app = buildApp({ db, auth: testAuth(ctx.userId) });

    const entryRes = await app.request(`/tenants/${ctx.slug}/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": ctx.userId,
      },
      body: JSON.stringify({
        connectorKey: "manual_satellite",
        entry: {
          hierarchyNodeId: ctx.nodeId,
          period: { start: ctx.periodStart, end: ctx.periodEnd },
          householdsReached: 1200,
          estimationMethod: "operator_report",
        },
      }),
    });

    expect(entryRes.status).toBe(200);

    const boardRes = await app.request(
      `/tenants/${ctx.slug}/metrics/board?hierarchyNodeId=${ctx.nodeId}&period=week&granularity=week&comparison=none`,
      { headers: { "x-test-user-id": ctx.userId } },
    );

    expect(boardRes.status).toBe(200);
    const board = (await boardRes.json()) as {
      tiles: Array<{ category: string; current: number }>;
    };
    expect(board.tiles.find((tile) => tile.category === "tv_households")?.current).toBe(1200);
  });
});

function testAuth(userId: string): Auth {
  return {
    handler: () => Promise.resolve(new Response("not found", { status: 404 })),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user-id");
        if (!id || id !== userId) return null;
        return {
          user: {
            id,
            email: "manual-rollup@example.com",
            emailVerified: true,
            name: "Manual Rollup User",
            image: null,
            twoFactorEnabled: false,
          },
        };
      },
    },
  } as unknown as Auth;
}

async function seedManualCtx(db: Database) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const slug = `manual-rollup-${suffix}`;

  const [tenantRow] = await db
    .insert(tenant)
    .values({ name: `Manual Rollup ${suffix}`, slug })
    .returning();

  const [nodeRow] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: tenantRow!.id,
      type: "station",
      name: "Manual Rollup Station",
      slug: `manual-rollup-station-${suffix}`,
    })
    .returning();

  let sourceRow = await db.query.source.findFirst({
    where: (s, { eq }) => eq(s.key, "manual_satellite"),
  });
  if (!sourceRow) {
    const [inserted] = await db
      .insert(source)
      .values({
        key: "manual_satellite",
        name: "Satellite (Manual)",
        category: "tv_broadcast",
        authMethod: "none",
      })
      .returning();
    sourceRow = inserted;
  }

  await db.insert(connectorConfig).values({
    tenantId: tenantRow!.id,
    sourceId: sourceRow!.id,
    schedule: "0 3 * * *",
  });

  const [userRow] = await db
    .insert(user)
    .values({
      email: `manual-rollup-${suffix}@example.com`,
      name: "Manual Rollup User",
      emailVerified: true,
    })
    .returning();

  await db.insert(tenantMembership).values({
    tenantId: tenantRow!.id,
    userId: userRow!.id,
    role: "network_admin",
  });

  return {
    slug,
    tenantId: tenantRow!.id,
    nodeId: nodeRow!.id,
    userId: userRow!.id,
    periodStart: "2026-04-20",
    periodEnd: "2026-04-27",
  };
}
```

- [ ] **Step 2: Run the new test to verify failure**

Run:

```bash
pnpm -F @lwa/api test -- test/manual-entry-rollup.test.ts
```

Expected:

- FAIL because board current value remains `0` after a manual entry.

- [ ] **Step 3: Implement synchronous rollup refresh in `entries.ts`**

Modify imports in `services/api/src/routes/entries.ts` to include rollup support:

```ts
import {
  connectorConfig,
  hierarchyNode,
  metricRecordRepo,
  metricRollupRepo,
  source,
  tenant,
  tenantMembership,
  type Granularity,
  type MetricCategory,
  type RollupGranularity,
} from "@lwa/db";
```

Inside `entriesRoutes`, create the rollup repo beside the existing metric repo:

```ts
const metricRecords = metricRecordRepo(db);
const metricRollups = metricRollupRepo(db);
```

After the `metricRecords.upsertMany([...])` call, refresh ancestors for the written bucket:

```ts
const rollupGranularity = mapManualRollupGranularity(granularity);
const bucketStart = bucketStartFor(entry.period.start, rollupGranularity);
const bucketEnd = bucketEndFor(bucketStart, rollupGranularity);
const ancestors = await metricRollups.getAncestors(tenantAccess.tenantId, entry.hierarchyNodeId);

for (const hierarchyNodeId of ancestors) {
  await metricRollups.refreshBucket({
    tenantId: tenantAccess.tenantId,
    hierarchyNodeId,
    metricCategory: connector.category as MetricCategory,
    granularity: rollupGranularity,
    recordGranularity: granularity,
    bucketStart,
    bucketEnd,
  });
}

return c.json({ written });
```

Add these helper functions at the bottom of `entries.ts`:

```ts
function mapManualRollupGranularity(granularity: Granularity): RollupGranularity {
  switch (granularity) {
    case "day":
    case "week":
    case "month":
    case "quarter":
      return granularity;
    case "hour":
      return "day";
  }
}

function bucketStartFor(start: Date, granularity: RollupGranularity): Date {
  const d = new Date(start);
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  d.setUTCMinutes(0);
  d.setUTCHours(0);

  switch (granularity) {
    case "day":
      return d;
    case "week": {
      const dow = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - dow);
      return d;
    }
    case "month":
      d.setUTCDate(1);
      return d;
    case "quarter": {
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - (d.getUTCMonth() % 3));
      return d;
    }
  }
}

function bucketEndFor(start: Date, granularity: RollupGranularity): Date {
  const end = new Date(start);
  switch (granularity) {
    case "day":
      end.setUTCDate(end.getUTCDate() + 1);
      return end;
    case "week":
      end.setUTCDate(end.getUTCDate() + 7);
      return end;
    case "month":
      end.setUTCMonth(end.getUTCMonth() + 1);
      return end;
    case "quarter":
      end.setUTCMonth(end.getUTCMonth() + 3);
      return end;
  }
}
```

- [ ] **Step 4: Verify targeted API tests**

Run:

```bash
pnpm -F @lwa/api test -- test/manual-entry-rollup.test.ts test/entries.test.ts test/metrics.test.ts
pnpm -F @lwa/api typecheck
```

Expected:

- all tests pass.
- typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/routes/entries.ts services/api/test/manual-entry-rollup.test.ts
git commit -m "fix(api): refresh board rollups after manual entries"
```

---

## Task 3: Add `admin:set-password` CLI

**TDD scenario:** New feature — integration test first, then minimal CLI/helper implementation.

**Files:**
- Create: `services/api/src/admin/set-password.ts`
- Modify: `services/api/src/admin/create-tenant.ts`
- Modify: `services/api/package.json`
- Modify: `package.json`
- Create: `services/api/test/set-password.test.ts`

**Why this task exists:** Tenant onboarding currently requires manually calling Better Auth sign-up before `admin:create-tenant`. Phase 1 closeout needs a clean operator flow: create tenant/user/membership, then set or rotate the admin password from the CLI.

- [ ] **Step 1: Add the failing integration test**

Create `services/api/test/set-password.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Database } from "@lwa/db";
import { account } from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import { eq } from "drizzle-orm";
import { createAuth } from "@lwa/auth";
import { createTenantAndAdmin } from "../src/admin/create-tenant";
import { setAdminPassword } from "../src/admin/set-password";
import { buildApp } from "../src/app";

let container: StartedPostgreSqlContainer;
let db: Database;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const res = await createTestDb(container.getConnectionUri());
  db = res.db;
  cleanup = res.cleanup;
});

afterAll(async () => {
  await cleanup();
  await container.stop();
});

describe("setAdminPassword", () => {
  it("creates a Better Auth credential for an existing user and permits sign-in", async () => {
    const email = `password-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const created = await createTenantAndAdmin(db, {
      tenantName: "Password Tenant",
      tenantSlug: `password-${crypto.randomUUID().slice(0, 8)}`,
      adminEmail: email,
      adminName: "Password Admin",
    });

    const before = await db.query.account.findMany({
      where: (a, { eq }) => eq(a.userId, created.user.id),
    });
    expect(before).toHaveLength(0);

    const result = await setAdminPassword(db, { email, password: "CorrectHorseBatteryStaple1" });
    expect(result.userId).toBe(created.user.id);
    expect(result.email).toBe(email);

    const after = await db.query.account.findMany({
      where: (a, { eq }) => eq(a.userId, created.user.id),
    });
    expect(after).toHaveLength(1);
    expect(after[0]?.providerId).toBe("credential");
    expect(after[0]?.accountId).toBe(created.user.id);
    expect(after[0]?.password).not.toBe("CorrectHorseBatteryStaple1");

    const auth = createAuth({
      db,
      secret: "test_secret_at_least_32_characters_long",
      baseUrl: "http://localhost:3001",
      trustedOrigins: ["http://localhost:5173"],
      sendMagicLink: async () => {},
    });
    const app = buildApp({ db, auth, allowedOrigins: ["http://localhost:5173"] });

    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "CorrectHorseBatteryStaple1" }),
    });

    expect(signIn.status).toBe(200);
  });

  it("updates an existing credential password", async () => {
    const email = `rotate-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await createTenantAndAdmin(db, {
      tenantName: "Rotate Tenant",
      tenantSlug: `rotate-${crypto.randomUUID().slice(0, 8)}`,
      adminEmail: email,
      adminName: "Rotate Admin",
    });

    await setAdminPassword(db, { email, password: "FirstPassword123" });
    const first = await db.query.account.findFirst({
      where: (a, { eq }) => eq(a.providerId, "credential"),
    });

    await setAdminPassword(db, { email, password: "SecondPassword123" });
    const rows = await db.select().from(account).where(eq(account.userId, first!.userId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.password).not.toBe(first?.password);
  });

  it("rejects unknown users and short passwords", async () => {
    await expect(
      setAdminPassword(db, { email: "missing@example.com", password: "LongEnough123" }),
    ).rejects.toThrow(/No user found/);

    await expect(
      setAdminPassword(db, { email: "missing@example.com", password: "short" }),
    ).rejects.toThrow(/at least 8 characters/);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run:

```bash
pnpm -F @lwa/api test -- test/set-password.test.ts
```

Expected:

- FAIL because `services/api/src/admin/set-password.ts` does not exist.

- [ ] **Step 3: Implement the CLI/helper**

Create `services/api/src/admin/set-password.ts`:

```ts
import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { account, schema, type Database } from "@lwa/db";

export type SetAdminPasswordInput = {
  email: string;
  password: string;
};

export type SetAdminPasswordResult = {
  userId: string;
  email: string;
  credentialAccountId: string;
};

export async function setAdminPassword(
  db: Database,
  input: SetAdminPasswordInput,
): Promise<SetAdminPasswordResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("--email is required");
  if (input.password.length < 8) throw new Error("--password must be at least 8 characters");

  const userRow = await db.query.user.findFirst({
    where: sql`lower(${schema.user.email}) = ${email}`,
  });
  if (!userRow) throw new Error(`No user found for email '${email}'`);

  const passwordHash = await hashPassword(input.password);

  const existing = await db.query.account.findFirst({
    where: and(eq(account.userId, userRow.id), eq(account.providerId, "credential")),
  });

  if (existing) {
    const [updated] = await db
      .update(account)
      .set({
        accountId: userRow.id,
        password: passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(account.id, existing.id))
      .returning();
    if (!updated) throw new Error("credential update failed");
    return { userId: userRow.id, email: userRow.email, credentialAccountId: updated.id };
  }

  const [created] = await db
    .insert(account)
    .values({
      userId: userRow.id,
      providerId: "credential",
      accountId: userRow.id,
      password: passwordHash,
    })
    .returning();
  if (!created) throw new Error("credential insert failed");

  return { userId: userRow.id, email: userRow.email, credentialAccountId: created.id };
}

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { createDb } = await import("@lwa/db");
    const email = parseArg("--email");
    const password = parseArg("--password");

    if (!email || !password) {
      console.error("Usage: pnpm admin:set-password --email <email> --password <password>");
      process.exit(1);
    }

    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error("DATABASE_URL env var required");
      process.exit(1);
    }

    const db = createDb(url);
    const result = await setAdminPassword(db, { email, password });
    console.log(`✓ Password credential set for ${result.email}`);
    process.exit(0);
  } catch (e) {
    console.error(`✗ Failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Update admin create-tenant CLI next-step text**

In `services/api/src/admin/create-tenant.ts`, replace the Phase 0 manual-step text with:

```ts
console.log("Next: set the admin login password");
console.log(`  pnpm admin:set-password --email ${result.user.email} --password <temporary-password>`);
console.log("  Share the temporary password through a secure channel and rotate it after first login.");
```

- [ ] **Step 5: Add package scripts**

Modify `services/api/package.json` scripts:

```json
"admin:set-password": "tsx --env-file-if-exists=../../.env src/admin/set-password.ts"
```

Modify root `package.json` scripts:

```json
"admin:set-password": "pnpm --filter @lwa/api admin:set-password --"
```

- [ ] **Step 6: Verify**

Run:

```bash
pnpm -F @lwa/api test -- test/set-password.test.ts test/admin-create-tenant.test.ts
pnpm -F @lwa/api typecheck
```

Expected:

- all tests pass.
- typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add services/api/src/admin/set-password.ts services/api/src/admin/create-tenant.ts services/api/package.json package.json services/api/test/set-password.test.ts
git commit -m "feat(api): add admin password CLI"
```

---

## Task 4: Add reproducible `phase1:gate`

**TDD scenario:** New executable flow — implement as a deterministic script and verify against the local stack.

**Files:**
- Create: `scripts/phase1-gate.ts`
- Modify: `package.json`
- Create: `docs/runbooks/phase1-gate.md`

**Why this task exists:** Phase 1 closeout needs one executable proof that a clean tenant can go from setup to a non-zero board tile. This becomes the local and CI smoke gate for the pilot release.

- [ ] **Step 1: Create the gate script**

Create `scripts/phase1-gate.ts`:

```ts
import { spawnSync } from "node:child_process";

const API_BASE = process.env.API_BASE_URL ?? process.env.AUTH_BASE_URL ?? "http://localhost:3001";
const RUN_ID = process.env.PHASE1_GATE_ID ?? crypto.randomUUID().slice(0, 8);
const TENANT_NAME = `Phase 1 Gate ${RUN_ID}`;
const TENANT_SLUG = `phase1-gate-${RUN_ID}`;
const ADMIN_EMAIL = `phase1-gate-${RUN_ID}@example.com`;
const ADMIN_PASSWORD = `Phase1Gate-${RUN_ID}-Password1`;

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }
  return res;
}

function cookieHeaderFrom(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headers.getSetCookie?.() ?? [];
  const fallback = res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : [];
  const cookies = (setCookies.length > 0 ? setCookies : fallback)
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean);
  if (cookies.length === 0) throw new Error("sign-in response did not set cookies");
  return cookies.join("; ");
}

async function apiJson<T>(path: string, cookie: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const res = await request(path, {
    method,
    headers: {
      cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as T;
}

async function main() {
  console.log(`[phase1:gate] API_BASE=${API_BASE}`);
  await request("/health");

  console.log("[phase1:gate] creating tenant and admin user");
  run("pnpm", [
    "admin:create-tenant",
    "--name",
    TENANT_NAME,
    "--slug",
    TENANT_SLUG,
    "--admin-email",
    ADMIN_EMAIL,
    "--admin-name",
    "Phase 1 Gate Admin",
  ]);

  console.log("[phase1:gate] setting admin password");
  run("pnpm", ["admin:set-password", "--email", ADMIN_EMAIL, "--password", ADMIN_PASSWORD]);

  console.log("[phase1:gate] signing in");
  const signIn = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const cookie = cookieHeaderFrom(signIn);

  console.log("[phase1:gate] creating hierarchy node");
  const node = await apiJson<{ id: string }>(`/tenants/${TENANT_SLUG}/hierarchy`, cookie, {
    type: "station",
    name: "Phase 1 Gate Station",
    slug: `phase1-gate-station-${RUN_ID}`,
  });

  console.log("[phase1:gate] configuring manual satellite connector");
  await apiJson<{ id: string }>(`/tenants/${TENANT_SLUG}/connectors`, cookie, {
    connectorKey: "manual_satellite",
    schedule: "0 3 * * *",
    credentials: {},
  });

  const monday = currentUtcWeekMonday();
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

  console.log("[phase1:gate] submitting manual entry");
  await apiJson<{ written: number }>(`/tenants/${TENANT_SLUG}/entries`, cookie, {
    connectorKey: "manual_satellite",
    entry: {
      hierarchyNodeId: node.id,
      period: {
        start: monday.toISOString().slice(0, 10),
        end: nextMonday.toISOString().slice(0, 10),
      },
      householdsReached: 12345,
      estimationMethod: "operator_report",
    },
  });

  console.log("[phase1:gate] polling board metrics");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const board = await apiJson<{
      tiles: Array<{ category: string; current: number }>;
    }>(
      `/tenants/${TENANT_SLUG}/metrics/board?hierarchyNodeId=${node.id}&period=week&granularity=week&comparison=none`,
      cookie,
    );
    const tv = board.tiles.find((tile) => tile.category === "tv_households");
    if (tv && tv.current > 0) {
      console.log(`[phase1:gate] success: tv_households=${tv.current}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("board metrics did not become non-zero within 30s");
}

function currentUtcWeekMonday(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

main().catch((err) => {
  console.error(`[phase1:gate] failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
```

- [ ] **Step 2: Add the root script**

Modify root `package.json` scripts:

```json
"phase1:gate": "tsx --env-file-if-exists=.env scripts/phase1-gate.ts"
```

- [ ] **Step 3: Write the runbook**

Create `docs/runbooks/phase1-gate.md`:

```markdown
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
```

- [ ] **Step 4: Verify locally**

Run:

```bash
pnpm db:migrate
pnpm -F @lwa/db seed
pnpm -F @lwa/api dev > /tmp/lwa-api.log 2>&1 & echo $! > /tmp/lwa-api.pid
for i in $(seq 1 60); do curl -fsS http://localhost:3001/health >/dev/null && break; sleep 1; done
pnpm phase1:gate
kill $(cat /tmp/lwa-api.pid)
```

Expected:

- script exits 0.
- output includes `success: tv_households=12345`.

- [ ] **Step 5: Commit**

```bash
git add scripts/phase1-gate.ts package.json docs/runbooks/phase1-gate.md
git commit -m "feat(phase1): add reproducible closeout gate"
```

---

## Task 5: Wire `phase1:gate` into CI

**TDD scenario:** CI/config change — verify by running the same commands locally, then add the workflow step.

**Files:**
- Modify: `.github/workflows/ci.yml`

**Why this task exists:** A release gate that only runs on one laptop will rot. CI must run the same tenant-to-dashboard proof on pull requests and pushes to `main`.

- [ ] **Step 1: Add gate env to `e2e-smoke` job**

In `.github/workflows/ci.yml`, ensure `e2e-smoke.env` includes:

```yaml
API_BASE_URL: http://localhost:3001
```

- [ ] **Step 2: Add the gate step after API startup and before Playwright**

In `.github/workflows/ci.yml`, after `Start API for Playwright`, add:

```yaml
      - name: Run Phase 1 gate
        run: pnpm phase1:gate
```

Keep the existing Playwright run after the gate.

- [ ] **Step 3: Verify workflow-relevant commands locally**

Run:

```bash
pnpm typecheck
pnpm phase1:gate
```

Expected:

- typecheck exits 0.
- gate exits 0 when API is running.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run Phase 1 closeout gate"
```

---

## Task 6: Make production/staging env and email runtime-safe

**TDD scenario:** Modifying tested code — add env/email tests first, then implement SMTP sender and staging env support.

**Files:**
- Modify: `services/api/src/env.ts`
- Modify: `services/api/src/lib/email.ts`
- Create: `services/api/test/email.test.ts`
- Modify: `services/api/test/env.test.ts`
- Modify: `services/api/package.json`
- Modify: `services/ingestion/src/env.ts`
- Modify: `services/ingestion/test/env.test.ts`

**Why this task exists:** The current Dokploy staging stack uses `NODE_ENV=staging`, but API/ingestion reject that value. The API also throws in production because SMTP is not implemented. Both must be fixed before production pilot deployment.

- [ ] **Step 1: Add dependencies**

Run:

```bash
pnpm -F @lwa/api add nodemailer
pnpm -F @lwa/api add -D @types/nodemailer
```

Expected:

- `services/api/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Add email tests**

Create `services/api/test/email.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { createEmailSender } from "../src/lib/email";

const BASE_ENV: Env = {
  NODE_ENV: "development",
  LOG_LEVEL: "info",
  DATABASE_URL: "postgres://user:pw@localhost:5432/db",
  API_PORT: 3001,
  AUTH_SECRET: "a".repeat(32),
  AUTH_BASE_URL: "http://localhost:3001",
  REDIS_URL: "redis://localhost:6379",
  SMTP_HOST: "",
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: "",
  SMTP_PASS: "",
  SMTP_FROM: "no-reply@example.com",
  ALLOWED_ORIGINS: [],
};

describe("createEmailSender", () => {
  it("uses a redacted dev sender outside staging/production when SMTP_HOST is blank", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const sender = createEmailSender(BASE_ENV);
    await sender("admin@example.com", "Subject", "Secret token body");
    expect(log.mock.calls[0]?.[0]).toContain("body redacted");
    expect(log.mock.calls[0]?.[0]).not.toContain("Secret token body");
    log.mockRestore();
  });

  it("requires SMTP_HOST in staging and production", () => {
    expect(() => createEmailSender({ ...BASE_ENV, NODE_ENV: "staging" })).toThrow(/SMTP_HOST/);
    expect(() => createEmailSender({ ...BASE_ENV, NODE_ENV: "production" })).toThrow(/SMTP_HOST/);
  });

  it("sends through injected transport when SMTP is configured", async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const sender = createEmailSender(
      {
        ...BASE_ENV,
        NODE_ENV: "production",
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "user",
        SMTP_PASS: "pass",
        SMTP_FROM: "no-reply@loveworld.example",
      },
      () => ({ sendMail }),
    );

    await sender("admin@example.com", "Subject", "Body");

    expect(sendMail).toHaveBeenCalledWith({
      from: "no-reply@loveworld.example",
      to: "admin@example.com",
      subject: "Subject",
      text: "Body",
    });
  });
});
```

- [ ] **Step 3: Extend env tests**

In `services/api/test/env.test.ts`, add:

```ts
it("accepts staging NODE_ENV and SMTP_SECURE", () => {
  const r = loadEnv({ ...VALID, NODE_ENV: "staging", SMTP_SECURE: "true" });
  expect(isOk(r)).toBe(true);
  if (isOk(r)) {
    expect(r.value.NODE_ENV).toBe("staging");
    expect(r.value.SMTP_SECURE).toBe(true);
  }
});
```

In `services/ingestion/test/env.test.ts`, add an equivalent staging assertion for `NODE_ENV: "staging"`.

- [ ] **Step 4: Run tests to verify failure**

Run:

```bash
pnpm -F @lwa/api test -- test/email.test.ts test/env.test.ts
pnpm -F @lwa/ingestion test -- test/env.test.ts
```

Expected:

- FAIL because `staging` and SMTP sender are not implemented.

- [ ] **Step 5: Update API env schema**

In `services/api/src/env.ts`, change the schema pieces to:

```ts
NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
SMTP_SECURE: z
  .string()
  .default("false")
  .transform((value) => value === "true"),
```

Keep existing SMTP fields.

- [ ] **Step 6: Update ingestion env schema**

In `services/ingestion/src/env.ts`, change:

```ts
NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
```

- [ ] **Step 7: Implement SMTP sender**

Replace `services/api/src/lib/email.ts` with:

```ts
import nodemailer from "nodemailer";
import type { Env } from "../env";

export type EmailSender = (to: string, subject: string, text: string) => Promise<void>;
export type MailTransport = {
  sendMail(input: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
};
export type MailTransportFactory = (env: Env) => MailTransport;

const createNodemailerTransport: MailTransportFactory = (env) =>
  nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER || env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

export function createEmailSender(
  env: Env,
  transportFactory: MailTransportFactory = createNodemailerTransport,
): EmailSender {
  const requiresSmtp = env.NODE_ENV === "staging" || env.NODE_ENV === "production";

  if (!env.SMTP_HOST) {
    if (requiresSmtp) {
      throw new Error("SMTP_HOST is required when NODE_ENV is staging or production");
    }
    return (to, subject) => {
      console.log(`[email:dev] to=${to} subject=${subject} (body redacted; may contain tokens)`);
      return Promise.resolve();
    };
  }

  const transport = transportFactory(env);
  return async (to, subject, text) => {
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
  };
}
```

- [ ] **Step 8: Verify**

Run:

```bash
pnpm -F @lwa/api test -- test/email.test.ts test/env.test.ts
pnpm -F @lwa/ingestion test -- test/env.test.ts
pnpm -F @lwa/api typecheck
pnpm -F @lwa/ingestion typecheck
```

Expected:

- all tests pass.
- typechecks exit 0.

- [ ] **Step 9: Commit**

```bash
git add services/api/src/env.ts services/api/src/lib/email.ts services/api/test/email.test.ts services/api/test/env.test.ts services/api/package.json services/ingestion/src/env.ts services/ingestion/test/env.test.ts pnpm-lock.yaml
git commit -m "fix(runtime): support staging env and SMTP email sender"
```

---

## Task 7: Make Docker images runnable and publishable

**TDD scenario:** Build/deploy infrastructure — verify by building images locally and running container health checks.

**Files:**
- Modify: `services/api/Dockerfile`
- Modify: `services/ingestion/Dockerfile`
- Modify: `apps/web/Dockerfile`
- Modify: `infra/dokploy/staging.yml`
- Modify: `infra/dokploy/production.yml`
- Create: `.github/workflows/images.yml`

**Why this task exists:** The current stack references GHCR images, but no workflow publishes them. The API Dockerfile also says it is not runnable as written. Phase 1 closeout needs images that boot and a workflow that publishes the tags Dokploy expects.

- [ ] **Step 1: Make API Dockerfile run TS workspace imports through `tsx`**

Replace `services/api/Dockerfile` with:

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
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
ENV NODE_ENV=production
EXPOSE 3001
CMD ["./node_modules/.bin/tsx", "services/api/src/server.ts"]
```

- [ ] **Step 2: Make ingestion Dockerfile run TS workspace imports through `tsx`**

Replace `services/ingestion/Dockerfile` with the same pattern and final command:

```dockerfile
CMD ["./node_modules/.bin/tsx", "services/ingestion/src/worker.ts"]
```

Keep the same copy/install/build structure as the API Dockerfile, adjusted for `services/ingestion` and `@lwa/ingestion`.

- [ ] **Step 3: Make web Dockerfile accept build-time public API URL**

Modify `apps/web/Dockerfile` build stage:

```dockerfile
FROM deps AS build
ARG VITE_API_BASE_URL=http://localhost:3001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm -F @lwa/web build
```

Keep the runtime command:

```dockerfile
CMD ["node", "build"]
```

- [ ] **Step 4: Fix Dokploy web runtime env and staging NODE_ENV**

In `infra/dokploy/staging.yml`, set API/ingestion `NODE_ENV` to `staging` and add SMTP secrets/envs to API:

```yaml
      NODE_ENV: staging
      SMTP_HOST: smtp.example.com
      SMTP_PORT: "587"
      SMTP_SECURE: "false"
      SMTP_USER_FILE: /run/secrets/smtp_user
      SMTP_PASS_FILE: /run/secrets/smtp_pass
      SMTP_FROM: no-reply@loveworld.example
```

Add web SSR API env:

```yaml
      API_BASE_URL: http://api:3001
      VITE_API_BASE_URL: https://api.staging.loveworld-analytics.example
```

Add API secrets:

```yaml
      - smtp_user
      - smtp_pass
```

Add secret declarations:

```yaml
  smtp_user:     { external: true }
  smtp_pass:     { external: true }
```

Make equivalent changes in `infra/dokploy/production.yml`, with production URLs and `NODE_ENV: production`.

- [ ] **Step 5: Add image build/push workflow**

Create `.github/workflows/images.yml`:

```yaml
name: Build Images

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  images:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - name: api
            context: .
            file: services/api/Dockerfile
            image: ghcr.io/0xanyi/loveworld-analytics-api
          - name: ingestion
            context: .
            file: services/ingestion/Dockerfile
            image: ghcr.io/0xanyi/loveworld-analytics-ingestion
          - name: web
            context: .
            file: apps/web/Dockerfile
            image: ghcr.io/0xanyi/loveworld-analytics-web
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: ${{ matrix.context }}
          file: ${{ matrix.file }}
          push: true
          tags: |
            ${{ matrix.image }}:${{ github.sha }}
            ${{ matrix.image }}:latest
          build-args: |
            VITE_API_BASE_URL=${{ vars.VITE_API_BASE_URL || 'http://localhost:3001' }}
```

- [ ] **Step 6: Verify local image builds**

Run:

```bash
docker build -f services/api/Dockerfile -t lwa-api:phase1 .
docker build -f services/ingestion/Dockerfile -t lwa-ingestion:phase1 .
docker build -f apps/web/Dockerfile --build-arg VITE_API_BASE_URL=http://localhost:3001 -t lwa-web:phase1 .
```

Expected:

- all images build successfully.

- [ ] **Step 7: Verify API container health locally**

Run:

```bash
docker run --rm --network host \
  -e NODE_ENV=development \
  -e DATABASE_URL="$DATABASE_URL" \
  -e REDIS_URL="$REDIS_URL" \
  -e AUTH_SECRET="$AUTH_SECRET" \
  -e AUTH_BASE_URL=http://localhost:3001 \
  -e ALLOWED_ORIGINS=http://localhost:5173 \
  -e LWA_KEK_CURRENT="$LWA_KEK_CURRENT" \
  -e LWA_KEK_V1="$LWA_KEK_V1" \
  lwa-api:phase1
```

In a second terminal:

```bash
curl -fsS http://localhost:3001/health
```

Expected:

```json
{"status":"ok"}
```

Stop the container after the health check.

- [ ] **Step 8: Commit**

```bash
git add services/api/Dockerfile services/ingestion/Dockerfile apps/web/Dockerfile infra/dokploy/staging.yml infra/dokploy/production.yml .github/workflows/images.yml
git commit -m "ci(deploy): build runnable Phase 1 images"
```

---

## Task 8: Update docs to match Phase 1 closeout reality

**TDD scenario:** Documentation change — verify by scanning for stale Phase 0/Phase 1 statements after edits.

**Files:**
- Modify: `README.md`
- Modify: `docs/runbooks/onboarding.md`
- Modify: `docs/plans/2026-04-20-loveworld-analytics-design.md`
- Modify: `docs/plans/2026-04-20-plan-02-p0-connectors.md`
- Modify: `docs/feature-flags.md`

**Why this task exists:** The code has moved beyond several plan documents. Stale docs create operational mistakes, especially around onboarding, CastNet, and deploy readiness.

- [ ] **Step 1: Update README status**

In `README.md`, change status to say:

```markdown
**Phase 1 production pilot ready after closeout gate passes.** Phase 0 foundations and Phase 1 P0 connector/operator UI scope are implemented. Phase 1 is considered closed only when `pnpm phase1:gate`, workspace verification, build, and Playwright all pass in CI.
```

Update command table to include:

```markdown
| `pnpm admin:set-password` | Set or rotate a Better Auth email/password credential for an existing user |
| `pnpm phase1:gate` | Reproducible Phase 1 smoke: tenant setup → sign-in → hierarchy → manual connector → non-zero dashboard tile |
```

Update deployment section to mention that images are published by `.github/workflows/images.yml` and staging deploy requires Dokploy secrets for SMTP, DB, auth, Redis, and connector KEK.

- [ ] **Step 2: Update onboarding runbook**

In `docs/runbooks/onboarding.md`, replace the manual Better Auth sign-up step with:

```markdown
1. **Create the tenant and admin user**:

   ```bash
   DATABASE_URL=<production_url> pnpm admin:create-tenant \
     --name "Tenant Name" \
     --admin-email tenant.admin@example.org \
     --admin-name "Admin Name"
   ```

2. **Set the temporary admin password**:

   ```bash
   DATABASE_URL=<production_url> pnpm admin:set-password \
     --email tenant.admin@example.org \
     --password '<temporary-password>'
   ```

   Share the temporary password through a secure channel. The admin should rotate it after first login.
```

Renumber the remaining steps.

- [ ] **Step 3: Update design doc P0 connector list**

In `docs/plans/2026-04-20-loveworld-analytics-design.md`, remove `castnet_events` from the P0 launch connector table and add a note:

```markdown
`castnet_events` was removed from Phase 1 because CastNet is being retired in favour of the Love World Europe One platform. The replacement integration should land as a new connector when that platform exposes stable analytics data.
```

- [ ] **Step 4: Update Phase 1 plan status table**

In `docs/plans/2026-04-20-plan-02-p0-connectors.md`, update tasks 9-11 to reflect current state:

```markdown
| 9 | Hierarchy management UI + tenant switcher root page | 8 | ✅ Implemented |
| 10 | Dashboard: `<KpiTile>` + `<PeriodPicker>` + `<ComparisonPicker>` + TV-households + Web tiles | 4, 8 | ✅ Implemented |
| 11 | Manual entry UI + source health list + `admin:set-password` CLI + Phase 1 gate smoke script | 5, 8, 9, 10 | 🚧 Closeout in `docs/plans/2026-04-23-phase-1-closeout.md` |
```

- [ ] **Step 5: Update feature flag doc**

In `docs/feature-flags.md`, add a note under the table:

```markdown
Current Phase 1 code does not yet read these flags. They are reserved for later phase work and must be wired in the same pull request that introduces the guarded feature.
```

- [ ] **Step 6: Verify stale text scan**

Run:

```bash
rg -n "Phase 0 manual workaround|admin:set-password.*ships|castnet_events.*P0|Not done|Phase 0 tenant shell" README.md docs infra services apps packages -g '*.md' -g '*.ts' -g '*.svelte' -g '*.yml'
```

Expected:

- No stale Phase 0 onboarding workaround remains outside historical plan context.
- `castnet_events` appears only in historical rationale or removal notes.
- No active docs claim implemented Phase 1 UI is not done.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/runbooks/onboarding.md docs/plans/2026-04-20-loveworld-analytics-design.md docs/plans/2026-04-20-plan-02-p0-connectors.md docs/feature-flags.md
git commit -m "docs: update Phase 1 closeout status and onboarding"
```

---

## Task 9: Full closeout verification

**TDD scenario:** Verification-only task.

**Files:**
- No product files expected unless verification exposes a concrete bug.

**Why this task exists:** This is the release-candidate proof. Do not claim Phase 1 is closed until every command here passes.

- [ ] **Step 1: Start local infra and API**

Run:

```bash
docker compose up -d
bash scripts/db-init.sh
pnpm db:migrate
pnpm -F @lwa/db seed
pnpm -F @lwa/api dev > /tmp/lwa-api.log 2>&1 & echo $! > /tmp/lwa-api.pid
for i in $(seq 1 60); do curl -fsS http://localhost:3001/health >/dev/null && break; sleep 1; done
```

Expected:

- API health responds before the loop completes.

- [ ] **Step 2: Run targeted closeout tests**

Run:

```bash
pnpm -F @lwa/api test -- test/set-password.test.ts test/manual-entry-rollup.test.ts test/entries.test.ts test/metrics.test.ts test/env.test.ts test/email.test.ts
pnpm -F @lwa/ingestion test -- test/env.test.ts
pnpm -F @lwa/web test:e2e -- source-health.spec.ts account-menu.spec.ts
```

Expected:

- all targeted tests pass.

- [ ] **Step 3: Run workspace verification**

Run:

```bash
pnpm -w turbo lint typecheck test
pnpm build
```

Expected:

- all Turbo tasks pass.
- production build completes.

- [ ] **Step 4: Run the closeout gate**

Run:

```bash
pnpm phase1:gate
```

Expected:

- script exits 0.
- output includes a non-zero `tv_households` value.

- [ ] **Step 5: Run full Playwright**

Run:

```bash
pnpm -F @lwa/web test:e2e
```

Expected:

- all Playwright tests pass.

- [ ] **Step 6: Build images locally**

Run:

```bash
docker build -f services/api/Dockerfile -t lwa-api:phase1 .
docker build -f services/ingestion/Dockerfile -t lwa-ingestion:phase1 .
docker build -f apps/web/Dockerfile --build-arg VITE_API_BASE_URL=http://localhost:3001 -t lwa-web:phase1 .
```

Expected:

- all image builds pass.

- [ ] **Step 7: Stop local API**

Run:

```bash
kill $(cat /tmp/lwa-api.pid)
```

Expected:

- API process exits.

- [ ] **Step 8: Commit verification-only fixes if any were required**

If verification required code changes, commit them with a specific message. If no code changes were required, do not create an empty commit.

---

## Task 10: Release branch handoff

**TDD scenario:** Release coordination — inspect git state and produce a short operator checklist.

**Files:**
- Create: `docs/runbooks/phase1-production-pilot.md`

**Why this task exists:** Phase 1 closeout ends with a clear pilot handoff, not just passing tests. Operators need to know what secrets, domains, and Dokploy settings must exist before pressing deploy.

- [ ] **Step 1: Create pilot runbook**

Create `docs/runbooks/phase1-production-pilot.md`:

```markdown
# Runbook: Phase 1 Production Pilot

**Purpose:** deploy Phase 1 to staging/production pilot after the closeout gate is green.

## Required GitHub configuration

- `DOKPLOY_STAGING_WEBHOOK`
- `DOKPLOY_STAGING_TOKEN`
- Package write permission for GHCR through `GITHUB_TOKEN`
- Repository variable `VITE_API_BASE_URL` set to the public API origin used by browser clients

## Required Dokploy secrets

- `pg_user`
- `pg_password`
- `database_url`
- `auth_secret`
- `connector_kek`
- `smtp_user`
- `smtp_pass`

## Required Dokploy environment values

- API `AUTH_BASE_URL` points to the public API origin.
- API `ALLOWED_ORIGINS` includes the public web origin.
- Web `API_BASE_URL` points to the internal API service URL, usually `http://api:3001`.
- Web client bundle was built with the correct public `VITE_API_BASE_URL`.

## Pre-deploy checks

```bash
pnpm -w turbo lint typecheck test
pnpm build
pnpm phase1:gate
pnpm -F @lwa/web test:e2e
```

## Staging smoke after deploy

1. Open `/login` on the staging web URL.
2. Create a pilot tenant with `admin:create-tenant` against staging `DATABASE_URL`.
3. Set password with `admin:set-password`.
4. Run `API_BASE_URL=<staging-api-url> pnpm phase1:gate` if staging database access is available from the runner.
5. Confirm Source Health, Manual Entry, Hierarchy, and Dashboard pages load.

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
- complete v1 GA runbooks
```

- [ ] **Step 2: Check git state**

Run:

```bash
git status --short --branch
```

Expected:

- branch shows only intentional changes before the final commit.

- [ ] **Step 3: Commit pilot runbook**

```bash
git add docs/runbooks/phase1-production-pilot.md
git commit -m "docs: add Phase 1 production pilot runbook"
```

---

## Self-review

### Spec coverage

- E2E failures are covered in Task 1.
- Manual-entry-to-dashboard gap is covered in Task 2.
- Missing `admin:set-password` is covered in Task 3.
- Missing `phase1:gate` and runbook are covered in Task 4.
- CI gate wiring is covered in Task 5.
- `NODE_ENV=staging` and SMTP production crash are covered in Task 6.
- Docker image boot/push path and Dokploy env gaps are covered in Task 7.
- Stale docs are covered in Task 8.
- Final evidence-before-completion verification is covered in Task 9.
- Pilot operator handoff is covered in Task 10.

### Placeholder scan

This plan contains no deferred implementation markers in active task steps. Later-phase work is listed only as explicit out-of-scope context.

### Type consistency

- `setAdminPassword` is defined before it is referenced by tests and gate usage.
- `SMTP_SECURE` and `NODE_ENV="staging"` are added to env types before email tests rely on them.
- Manual rollup helpers are defined in the same route file that uses them.
- The gate uses existing API routes and scripts created in earlier tasks.

---

## Execution handoff

Use `/skill:subagent-driven-development` for this plan in the current session, or `/skill:executing-plans` in a separate isolated branch/worktree. Recommended execution order is exactly Task 1 through Task 10 because later tasks depend on earlier scripts and runtime fixes.
