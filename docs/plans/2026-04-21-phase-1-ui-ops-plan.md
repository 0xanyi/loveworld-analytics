# Phase 1 UI Ops Slice Implementation Plan

> **REQUIRED SUB-SKILL:** Use `/skill:subagent-driven-development` (recommended) or `/skill:executing-plans` to implement this plan task-by-task.

**Goal:** Add the Phase 1 operations UI slice: a small schema-driven form component, a manual entry page for configured manual connectors, and read-only source health pages for `network_admin` and `station_manager`.

**Architecture:** Keep the web app SSR-first. The manual entry page loads tenant hierarchy plus configured manual connectors and submits to the existing `/tenants/:slug/entries` API. Source health gets dedicated read-only API endpoints instead of reusing management endpoints, preserving a clean boundary between viewing connector health and mutating connector configuration.

**Tech Stack:** SvelteKit 2, Svelte 5, Playwright, Vitest, Hono, Drizzle, Better Auth role/membership checks, existing `serverApiFetch` helper.

---

## Prerequisites

- Approved spec: `docs/plans/2026-04-21-phase-1-ui-ops-design.md`
- Working branch: `feat/phase-1-finish-gate`
- Existing tenant shell, dashboard, hierarchy UI, and Playwright e2e support already on `main`

## Scope check

This plan covers one coherent subsystem slice:

- reusable schema-backed form rendering
- manual entry UI using that renderer
- read-only source health visibility

It intentionally excludes:

- `admin:set-password`
- `phase1:gate`
- CI gate automation

## File structure map

### UI package
- Create: `packages/ui/src/lib/components/FormFromSchema.svelte`
- Modify: `packages/ui/src/lib/components/index.ts`
- Create: `packages/ui/test/FormFromSchema.test.ts`

### Web app routes and support
- Modify: `apps/web/src/routes/[tenant]/+layout.svelte`
- Create: `apps/web/src/routes/[tenant]/entry/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/entry/+page.svelte`
- Create: `apps/web/src/routes/[tenant]/sources/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/sources/+page.svelte`
- Create: `apps/web/src/routes/[tenant]/sources/[id]/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/sources/[id]/+page.svelte`
- Modify: `apps/web/tests/support/e2e.ts`
- Modify: `services/api/test/e2e-seed.ts`
- Create: `apps/web/tests/manual-entry.spec.ts`
- Create: `apps/web/tests/source-health.spec.ts`

### API
- Create: `services/api/src/routes/source-health.ts`
- Modify: `services/api/src/app.ts`
- Create: `services/api/test/source-health.test.ts`

---

## Task 1: Add `FormFromSchema` in `@lwa/ui`

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Create: `packages/ui/src/lib/components/FormFromSchema.svelte`
- Modify: `packages/ui/src/lib/components/index.ts`
- Create: `packages/ui/test/FormFromSchema.test.ts`

**Why this task exists:** Both the manual entry page and future schema-backed ops UIs need a small shared renderer for the exact JSON Schema subset already emitted by `/sources`. This keeps the page logic simple without introducing a generic form engine.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/test/FormFromSchema.test.ts` with component-level coverage for the supported schema subset:

```ts
import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import FormFromSchema from "../src/lib/components/FormFromSchema.svelte";

describe("FormFromSchema", () => {
  it("renders supported field types and submits nested payloads", async () => {
    const onSubmit = vi.fn();

    render(FormFromSchema, {
      schema: {
        type: "object",
        required: ["name", "visits", "status", "settings"],
        properties: {
          name: { type: "string", title: "Name" },
          visits: { type: "integer", title: "Visits" },
          status: { type: "string", enum: ["active", "paused"], title: "Status" },
          published: { type: "boolean", title: "Published" },
          settings: {
            type: "object",
            title: "Settings",
            required: ["start"],
            properties: {
              start: { type: "string", title: "Start" },
            },
          },
        },
      },
      initialValue: {
        published: true,
        settings: { start: "2026-01-01" },
      },
      onSubmit,
    });

    await fireEvent.input(screen.getByLabelText("Name *"), {
      target: { value: "Manual Source" },
    });
    await fireEvent.input(screen.getByLabelText("Visits *"), {
      target: { value: "42" },
    });
    await fireEvent.change(screen.getByLabelText("Status *"), {
      target: { value: "paused" },
    });
    await fireEvent.click(screen.getByLabelText("Published"));
    await fireEvent.input(screen.getByLabelText("Start *"), {
      target: { value: "2026-02-01" },
    });

    await fireEvent.submit(screen.getByRole("button", { name: "Submit" }).closest("form")!);

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Manual Source",
      visits: 42,
      status: "paused",
      published: false,
      settings: {
        start: "2026-02-01",
      },
    });
  });

  it("supports select overrides for schema fields", async () => {
    const onSubmit = vi.fn();

    render(FormFromSchema, {
      schema: {
        type: "object",
        required: ["hierarchyNodeId"],
        properties: {
          hierarchyNodeId: { type: "string", title: "Hierarchy node" },
        },
      },
      overrides: {
        hierarchyNodeId: {
          options: [
            { value: "node-1", label: "Station A" },
            { value: "node-2", label: "Station B" },
          ],
        },
      },
      onSubmit,
    });

    await fireEvent.change(screen.getByLabelText("Hierarchy node *"), {
      target: { value: "node-2" },
    });

    await fireEvent.submit(screen.getByRole("button", { name: "Submit" }).closest("form")!);

    expect(onSubmit).toHaveBeenCalledWith({ hierarchyNodeId: "node-2" });
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run:
```bash
pnpm -F @lwa/ui test -- test/FormFromSchema.test.ts
```

Expected:
- FAIL because the component file does not exist yet

- [ ] **Step 3: Implement `FormFromSchema.svelte`**

Create `packages/ui/src/lib/components/FormFromSchema.svelte` with a deliberately narrow implementation.

Required behavior:
- render object properties recursively
- reconstruct nested payloads from dotted paths
- coerce integers/numbers from string input on submit
- use checkbox binding for booleans
- render `enum` as `<select>`
- allow field override options for schema string fields such as `hierarchyNodeId`
- default submit button text: `Submit`

Implementation target:

```svelte
<script lang="ts">
  type JsonSchema = {
    type?: string;
    title?: string;
    enum?: string[];
    required?: string[];
    properties?: Record<string, JsonSchema>;
  };

  export type FieldOverride = {
    label?: string;
    options?: Array<{ value: string; label: string }>;
    hidden?: boolean;
    readOnly?: boolean;
  };

  let {
    schema,
    initialValue = {},
    overrides = {},
    submitLabel = "Submit",
    onSubmit,
  }: {
    schema: JsonSchema;
    initialValue?: Record<string, unknown>;
    overrides?: Record<string, FieldOverride>;
    submitLabel?: string;
    onSubmit: (value: Record<string, unknown>) => void;
  } = $props();

  function flatten(value: Record<string, unknown>, prefix = "", out: Record<string, unknown> = {}) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === "object" && !Array.isArray(child) && !(child instanceof Date)) {
        flatten(child as Record<string, unknown>, path, out);
      } else {
        out[path] = child;
      }
    }
    return out;
  }

  let values = $state<Record<string, unknown>>(flatten(initialValue));

  function titleFor(path: string, field: JsonSchema) {
    return overrides[path]?.label ?? field.title ?? path.split(".").at(-1) ?? path;
  }

  function isRequired(parent: JsonSchema, key: string) {
    return parent.required?.includes(key) ?? false;
  }

  function setAtPath(target: Record<string, unknown>, path: string, value: unknown) {
    const parts = path.split(".");
    let cursor: Record<string, unknown> = target;
    for (const part of parts.slice(0, -1)) {
      const next = cursor[part];
      if (!next || typeof next !== "object" || Array.isArray(next)) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]!] = value;
  }

  function coerceValue(field: JsonSchema, raw: unknown): unknown {
    if (field.type === "integer") return Number.parseInt(String(raw), 10);
    if (field.type === "number") return Number(raw);
    if (field.type === "boolean") return Boolean(raw);
    return raw;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const out: Record<string, unknown> = {};
    collect(schema, "", out);
    onSubmit(out);
  }

  function collect(node: JsonSchema, prefix: string, out: Record<string, unknown>) {
    if (node.type !== "object" || !node.properties) return;
    for (const [key, child] of Object.entries(node.properties)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (child.type === "object") {
        collect(child, path, out);
        continue;
      }
      setAtPath(out, path, coerceValue(child, values[path]));
    }
  }
</script>

<form class="space-y-4" onsubmit={submit}>
  {#snippet renderFields(node: JsonSchema, prefix: string = "")}
    {#if node.type === "object" && node.properties}
      {#each Object.entries(node.properties) as [key, field]}
        {@const path = prefix ? `${prefix}.${key}` : key}
        {@const override = overrides[path]}
        {#if !override?.hidden}
          {#if field.type === "object"}
            <fieldset class="space-y-4 rounded-lg border border-slate-200 p-4">
              <legend class="px-1 text-sm font-medium text-slate-700">{titleFor(path, field)}</legend>
              {@render renderFields(field, path)}
            </fieldset>
          {:else}
            <label class="block">
              <span class="text-sm font-medium text-slate-700">
                {titleFor(path, field)}{isRequired(node, key) ? " *" : ""}
              </span>

              {#if override?.options || field.enum}
                <select
                  class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  bind:value={values[path]}
                  required={isRequired(node, key)}
                  disabled={override?.readOnly}
                >
                  <option value="">Select…</option>
                  {#each (override?.options ?? field.enum?.map((value) => ({ value, label: value })) ?? []) as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              {:else if field.type === "boolean"}
                <input
                  class="mt-2 h-4 w-4"
                  type="checkbox"
                  checked={Boolean(values[path])}
                  onchange={(event) => (values[path] = (event.currentTarget as HTMLInputElement).checked)}
                  disabled={override?.readOnly}
                />
              {:else}
                <input
                  class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  type={field.type === "integer" || field.type === "number" ? "number" : "text"}
                  bind:value={values[path]}
                  required={isRequired(node, key)}
                  readonly={override?.readOnly}
                />
              {/if}
            </label>
          {/if}
        {/if}
      {/each}
    {/if}
  {/snippet}

  {@render renderFields(schema)}

  <button type="submit" class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white">
    {submitLabel}
  </button>
</form>
```

- [ ] **Step 4: Export the component**

Modify `packages/ui/src/lib/components/index.ts`:

```ts
export { default as Button } from "./Button.svelte";
export { default as Card } from "./Card.svelte";
export { default as ComparisonPicker } from "./ComparisonPicker.svelte";
export { default as FormFromSchema } from "./FormFromSchema.svelte";
export { default as KpiTile } from "./KpiTile.svelte";
export { default as PeriodPicker } from "./PeriodPicker.svelte";
export { default as Sparkline } from "./Sparkline.svelte";
export { default as Tree } from "./Tree.svelte";
export { default as TreeItem } from "./TreeItem.svelte";
```

- [ ] **Step 5: Verify**

Run:
```bash
pnpm -F @lwa/ui test -- test/FormFromSchema.test.ts
pnpm -F @lwa/ui typecheck
```

Expected:
- PASS
- exit 0

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/lib/components/FormFromSchema.svelte packages/ui/src/lib/components/index.ts packages/ui/test/FormFromSchema.test.ts
git commit -m "feat(ui): add schema-driven form component"
```

---

## Task 2: Add read-only source-health API endpoints

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Create: `services/api/src/routes/source-health.ts`
- Modify: `services/api/src/app.ts`
- Create: `services/api/test/source-health.test.ts`

**Why this task exists:** The web app needs connector health and run visibility for `network_admin` and `station_manager`, but the existing `/connectors` routes are management-oriented and gated by `manage_connectors`. This task creates the explicit read-only boundary the spec requires.

- [ ] **Step 1: Write the failing API test**

Create `services/api/test/source-health.test.ts` modeled after `metrics.test.ts` and `connectors.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Auth } from "@lwa/auth";
import {
  type Database,
  connectorConfig,
  hierarchyNode,
  ingestionRun,
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

describe("source health routes", () => {
  it("network_admin and station_manager can read source health", async () => {
    const admin = await seedCtx(db, "network_admin");
    const manager = await seedCtx(db, "station_manager");
    const app = buildApp({ db, auth: testAuth() });

    for (const ctx of [admin, manager]) {
      const listRes = await app.request(`/tenants/${ctx.slug}/source-health`, {
        headers: { "x-test-user-id": ctx.userId },
      });
      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as { connectors: Array<{ id: string; sourceKey: string }> };
      expect(listBody.connectors).toHaveLength(1);
      expect(listBody.connectors[0]?.sourceKey).toBe("manual_satellite");

      const detailRes = await app.request(`/tenants/${ctx.slug}/source-health/${ctx.connectorId}`, {
        headers: { "x-test-user-id": ctx.userId },
      });
      expect(detailRes.status).toBe(200);
      const detailBody = (await detailRes.json()) as { connector: { id: string }; runs: Array<{ status: string }> };
      expect(detailBody.connector.id).toBe(ctx.connectorId);
      expect(detailBody.runs[0]?.status).toBe("success");
    }
  });

  it("board_viewer is forbidden from source health", async () => {
    const ctx = await seedCtx(db, "board_viewer");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health`, {
      headers: { "x-test-user-id": ctx.userId },
    });

    expect(res.status).toBe(403);
  });
});

function testAuth(): Auth {
  return {
    handler: () => Promise.resolve(new Response("not found", { status: 404 })),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user-id");
        if (!id) return null;
        return {
          user: {
            id,
            email: "test@example.com",
            emailVerified: true,
            name: "Test User",
            image: null,
            twoFactorEnabled: false,
          },
        };
      },
    },
  } as unknown as Auth;
}

async function seedCtx(db: Database, role: "network_admin" | "station_manager" | "board_viewer" | "analyst") {
  const suffix = crypto.randomUUID().slice(0, 8);
  const slug = `sh-${suffix}`;

  const [t] = await db.insert(tenant).values({ name: `Source Health ${suffix}`, slug }).returning();
  const [u] = await db
    .insert(user)
    .values({ email: `${suffix}@example.com`, name: "Source User", emailVerified: true })
    .returning();

  const [node] = await db
    .insert(hierarchyNode)
    .values({ tenantId: t!.id, type: "station", name: "Root Node", slug: `root-${suffix}` })
    .returning();

  let src = await db.query.source.findFirst({ where: (s, { eq }) => eq(s.key, "manual_satellite") });
  if (!src) {
    const [inserted] = await db
      .insert(source)
      .values({ key: "manual_satellite", name: "Satellite Viewership (Manual)", category: "tv_broadcast", authMethod: "none" })
      .returning();
    src = inserted;
  }

  const [cfg] = await db
    .insert(connectorConfig)
    .values({
      tenantId: t!.id,
      sourceId: src!.id,
      schedule: "0 3 * * *",
      enabled: true,
      status: "active",
      lastError: null,
      lastRunAt: new Date(),
    })
    .returning();

  await db.insert(tenantMembership).values({
    tenantId: t!.id,
    userId: u!.id,
    role,
    scopeNodeIds: role === "station_manager" ? [node!.id] : [],
  });

  await db.insert(ingestionRun).values({
    connectorConfigId: cfg!.id,
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-01-08T00:00:00.000Z"),
    status: "success",
    recordsWritten: 3,
    warnings: [],
    startedAt: new Date("2026-01-08T10:00:00.000Z"),
    finishedAt: new Date("2026-01-08T10:02:00.000Z"),
  });

  return { slug, userId: u!.id, connectorId: cfg!.id };
}
```

- [ ] **Step 2: Run the test to verify failure**

Run:
```bash
pnpm -F @lwa/api test -- test/source-health.test.ts
```

Expected:
- FAIL because the routes do not exist yet

- [ ] **Step 3: Implement the route**

Create `services/api/src/routes/source-health.ts`:

```ts
import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@lwa/db";
import { connectorConfig, ingestionRun, source, tenant, tenantMembership } from "@lwa/db";

export function sourceHealthRoutes(db: Database): Hono {
  const app = new Hono();

  app.get("/tenants/:slug/source-health", async (c) => {
    const ctx = await resolveSourceHealthAccess(db, c.req.param("slug"), c.get("session")?.user?.id);
    if (ctx instanceof Response) return ctx;

    const rows = await db
      .select({
        id: connectorConfig.id,
        sourceKey: source.key,
        sourceName: source.name,
        enabled: connectorConfig.enabled,
        status: connectorConfig.status,
        lastRunAt: connectorConfig.lastRunAt,
        lastError: connectorConfig.lastError,
      })
      .from(connectorConfig)
      .innerJoin(source, eq(connectorConfig.sourceId, source.id))
      .where(eq(connectorConfig.tenantId, ctx.tenantId));

    return c.json({ connectors: rows });
  });

  app.get("/tenants/:slug/source-health/:id", async (c) => {
    const ctx = await resolveSourceHealthAccess(db, c.req.param("slug"), c.get("session")?.user?.id);
    if (ctx instanceof Response) return ctx;

    const id = c.req.param("id");

    const [row] = await db
      .select({
        id: connectorConfig.id,
        sourceKey: source.key,
        sourceName: source.name,
        enabled: connectorConfig.enabled,
        status: connectorConfig.status,
        lastRunAt: connectorConfig.lastRunAt,
        lastError: connectorConfig.lastError,
      })
      .from(connectorConfig)
      .innerJoin(source, eq(connectorConfig.sourceId, source.id))
      .where(and(eq(connectorConfig.id, id), eq(connectorConfig.tenantId, ctx.tenantId)))
      .limit(1);

    if (!row) return c.json({ error: "not found" }, 404);

    const runs = await db
      .select()
      .from(ingestionRun)
      .where(eq(ingestionRun.connectorConfigId, id))
      .orderBy(desc(ingestionRun.startedAt))
      .limit(50);

    return c.json({ connector: row, runs });
  });

  return app;
}

async function resolveSourceHealthAccess(db: Database, slug: string, userId?: string) {
  if (!userId) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 });

  const [row] = await db
    .select({ tenantId: tenant.id, role: tenantMembership.role })
    .from(tenant)
    .innerJoin(tenantMembership, eq(tenantMembership.tenantId, tenant.id))
    .where(
      and(eq(tenant.slug, slug), eq(tenantMembership.userId, userId), isNull(tenant.archivedAt)),
    )
    .limit(1);

  if (!row) return new Response(JSON.stringify({ error: "tenant not found" }), { status: 404 });
  if (row.role !== "network_admin" && row.role !== "station_manager") {
    return new Response(JSON.stringify({ error: "forbidden", missing_capability: "view_source_health" }), {
      status: 403,
    });
  }

  return row;
}
```

- [ ] **Step 4: Mount the route**

Modify `services/api/src/app.ts`:

```ts
import { sourceHealthRoutes } from "./routes/source-health";
```

and inside the `if (deps.db)` block mount it before connector routes:

```ts
    app.route("/", sourceHealthRoutes(deps.db));
```

Resulting relevant block:

```ts
  if (deps.db) {
    app.route("/", entriesRoutes(deps.db));
    app.route("/", hierarchyRoutes(deps.db));
    app.route("/", metricsRoutes(deps.db));
    app.route("/", sourceHealthRoutes(deps.db));

    if (deps.kek) {
      app.route("/", connectorRoutes(deps.db, deps.kek));
```

- [ ] **Step 5: Verify**

Run:
```bash
pnpm -F @lwa/api test -- test/source-health.test.ts
pnpm -F @lwa/api typecheck
```

Expected:
- PASS
- exit 0

- [ ] **Step 6: Commit**

```bash
git add services/api/src/routes/source-health.ts services/api/src/app.ts services/api/test/source-health.test.ts
git commit -m "feat(api): add read-only source health routes"
```

---

## Task 3: Build the manual entry page

**TDD scenario:** New feature — full TDD cycle driven by Playwright.

**Files:**
- Create: `apps/web/src/routes/[tenant]/entry/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/entry/+page.svelte`
- Modify: `services/api/test/e2e-seed.ts`
- Modify: `apps/web/tests/support/e2e.ts`
- Create: `apps/web/tests/manual-entry.spec.ts`

**Why this task exists:** Manual entry already works at the API level. This task makes it usable from the product UI using only configured manual connectors, which is the agreed Phase 1 behavior.

- [ ] **Step 1: Extend e2e seed support for configured connectors**

Modify `apps/web/tests/support/e2e.ts` to allow provisioning connectors with each tenant:

```ts
export type TenantScenario = {
  name: string;
  slug: string;
  role: "network_admin" | "station_manager" | "board_viewer" | "analyst";
  scopeNodeKeys?: string[];
  hierarchy?: Array<{
    key: string;
    type: "station" | "broadcast_channel" | "language_channel";
    name: string;
    slug: string;
    parentKey?: string;
  }>;
  connectors?: Array<{
    key: string;
    status?: "active" | "error" | "paused";
    enabled?: boolean;
    lastError?: string | null;
    lastRunAt?: string | null;
    runs?: Array<{
      status: "pending" | "running" | "success" | "failed" | "skipped";
      startedAt: string;
      finishedAt?: string | null;
      periodStart: string;
      periodEnd: string;
      recordsWritten?: number;
      errorCode?: string | null;
      errorMessage?: string | null;
      warnings?: string[];
    }>;
  }>;
  metrics?: Array<{
    hierarchyKey: string;
    category: "tv_households" | "web_visitors";
    effectiveTotal: number;
    rawTotal?: number;
    sourceBreakdown: Record<string, number>;
    hasAdjustments?: boolean;
  }>;
};

type SeedResult = {
  tenants: Array<{ slug: string; nodeIds: Record<string, string>; connectorIds: Record<string, string> }>;
};
```

Modify `services/api/test/e2e-seed.ts` accordingly so each tenant can seed:
- connector config rows for known connector keys
- optional ingestion runs for those connectors
- returned `connectorIds`

Implementation requirements:
- look up `source` by connector key
- insert `connectorConfig` with seeded status/enablement/lastRunAt/lastError
- insert `ingestionRun` rows linked to the connector config
- preserve existing hierarchy/metric seeding behavior

- [ ] **Step 2: Write the failing Playwright spec**

Create `apps/web/tests/manual-entry.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { loginViaUi, provisionUser } from "./support/e2e";

test("manual entry page shows configured manual connectors only and submits successfully", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Manual Entry Tenant",
      slug: `manual-entry-${suffix}`,
      role: "network_admin",
      hierarchy: [
        { key: "station", type: "station", name: "Manual Station", slug: `manual-station-${suffix}` },
      ],
      connectors: [
        { key: "manual_satellite", status: "active", enabled: true },
      ],
    },
  ]);

  const tenant = user.seed.tenants[0]!;

  await loginViaUi(page, user);
  await page.goto(`/${tenant.slug}/entry`);

  await expect(page.getByRole("heading", { name: "Manual entry" })).toBeVisible();
  await expect(page.getByLabel("Source")).toContainText("Satellite Viewership (Manual)");
  await expect(page.getByLabel("Source")).not.toContainText("Freeview Viewership (Manual)");

  await page.getByLabel("Hierarchy node *").selectOption(tenant.nodeIds.station);
  await page.getByLabel("Start *").fill("2026-01-05");
  await page.getByLabel("End *").fill("2026-01-12");
  await page.getByLabel("Households Reached *").fill("1200");
  await page.getByLabel("Estimation Method *").selectOption("operator_report");
  await page.getByRole("button", { name: "Save entry" }).click();

  await expect(page.getByText("Entry saved")).toBeVisible();
});
```

- [ ] **Step 3: Run the spec to verify failure**

Run:
```bash
pnpm -F @lwa/web test:e2e -- manual-entry.spec.ts
```

Expected:
- FAIL because the route does not exist yet

- [ ] **Step 4: Implement the server load and action**

Create `apps/web/src/routes/[tenant]/entry/+page.server.ts`:

```ts
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { serverApiFetch } from "$lib/server/api";

type HierarchyNodeRecord = { id: string; name: string; type: string; parentId: string | null };
type SourceRecord = { key: string; name: string; kind: string; entrySchema?: Record<string, unknown> };
type ConnectorRecord = { id: string; sourceKey: string; sourceName: string; enabled: boolean; status: string };

export const load: PageServerLoad = async ({ params, cookies }) => {
  const [hierarchyRes, sourcesRes, connectorRes] = await Promise.all([
    serverApiFetch(`/tenants/${params.tenant}/hierarchy`, { cookies }),
    serverApiFetch(`/sources`, { cookies }),
    serverApiFetch(`/tenants/${params.tenant}/source-health`, { cookies }),
  ]);

  if ([hierarchyRes, sourcesRes, connectorRes].some((res) => res.status === 401)) {
    throw redirect(303, "/login");
  }
  if (!hierarchyRes.ok) throw error(hierarchyRes.status, "Failed to load hierarchy");
  if (!sourcesRes.ok) throw error(sourcesRes.status, "Failed to load sources");
  if (!connectorRes.ok) throw error(connectorRes.status, "Failed to load configured connectors");

  const hierarchyBody = (await hierarchyRes.json()) as { nodes: HierarchyNodeRecord[] };
  const sourcesBody = (await sourcesRes.json()) as { sources: SourceRecord[] };
  const connectorsBody = (await connectorRes.json()) as { connectors: ConnectorRecord[] };

  const manualConnectors = connectorsBody.connectors
    .map((connector) => {
      const source = sourcesBody.sources.find((entry) => entry.key === connector.sourceKey && entry.kind === "manual");
      if (!source || !source.entrySchema) return null;
      return {
        key: connector.sourceKey,
        name: source.name,
        status: connector.status,
        enabled: connector.enabled,
        entrySchema: source.entrySchema,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  return {
    tenantSlug: params.tenant,
    hierarchyNodes: hierarchyBody.nodes,
    manualConnectors,
  };
};

export const actions: Actions = {
  save: async ({ request, params, cookies }) => {
    const form = await request.formData();
    const connectorKey = String(form.get("connectorKey") ?? "");
    const payloadText = String(form.get("payload") ?? "{}");

    let payload: unknown;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      return fail(400, { error: "Invalid form payload" });
    }

    const res = await serverApiFetch(`/tenants/${params.tenant}/entries`, {
      cookies,
      method: "POST",
      body: {
        connectorKey,
        entry: payload,
      },
    });

    if (res.status === 401) {
      throw redirect(303, "/login");
    }

    if (!res.ok) {
      return fail(res.status, { error: "Failed to save entry" });
    }

    return { success: true };
  },
};
```

- [ ] **Step 5: Implement the page UI**

Create `apps/web/src/routes/[tenant]/entry/+page.svelte`:

```svelte
<script lang="ts">
  import { FormFromSchema } from "@lwa/ui";

  let { data, form } = $props();

  let selectedKey = $state(data.manualConnectors[0]?.key ?? "");
  const selectedConnector = $derived(data.manualConnectors.find((connector) => connector.key === selectedKey) ?? null);

  const hierarchyOptions = $derived(
    data.hierarchyNodes.map((node: { id: string; name: string; type: string }) => ({
      value: node.id,
      label: `${node.name} (${node.type.replaceAll("_", " ")})`,
    })),
  );

  let payload = $state("{}");

  function handleSubmit(value: Record<string, unknown>) {
    payload = JSON.stringify(value);
    const formEl = document.getElementById("manual-entry-form") as HTMLFormElement | null;
    formEl?.requestSubmit();
  }
</script>

<div class="space-y-6">
  <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 class="text-2xl font-semibold text-slate-950">Manual entry</h2>
    <p class="mt-2 text-slate-600">Log manual source data for configured tenant connectors.</p>
  </section>

  {#if data.manualConnectors.length === 0}
    <section class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">
      No manual connectors are configured for this tenant yet.
    </section>
  {:else}
    <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <label class="block max-w-md">
        <span class="text-sm font-medium text-slate-700">Source</span>
        <select class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" bind:value={selectedKey}>
          {#each data.manualConnectors as connector}
            <option value={connector.key}>{connector.name}</option>
          {/each}
        </select>
      </label>

      {#if selectedConnector}
        <form id="manual-entry-form" method="POST" action="?/save" class="hidden">
          <input type="hidden" name="connectorKey" value={selectedConnector.key} />
          <input type="hidden" name="payload" value={payload} />
        </form>

        <FormFromSchema
          schema={selectedConnector.entrySchema}
          submitLabel="Save entry"
          overrides={{
            hierarchyNodeId: {
              options: hierarchyOptions,
            },
            "period.start": {
              label: "Start",
            },
            "period.end": {
              label: "End",
            },
            householdsReached: {
              label: "Households Reached",
            },
            estimationMethod: {
              label: "Estimation Method",
            },
          }}
          onSubmit={handleSubmit}
        />
      {/if}

      {#if form?.success}
        <p class="text-sm text-emerald-700">Entry saved</p>
      {/if}
      {#if form?.error}
        <p class="text-sm text-red-600" role="alert">{form.error}</p>
      {/if}
    </section>
  {/if}
</div>
```

- [ ] **Step 6: Verify**

Run:
```bash
pnpm -F @lwa/web test:e2e -- manual-entry.spec.ts
pnpm -F @lwa/web typecheck
```

Expected:
- PASS
- exit 0

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/[tenant]/entry/+page.server.ts apps/web/src/routes/[tenant]/entry/+page.svelte apps/web/tests/manual-entry.spec.ts apps/web/tests/support/e2e.ts services/api/test/e2e-seed.ts
git commit -m "feat(web): add manual entry page"
```

---

## Task 4: Build the source health pages

**TDD scenario:** New feature — full TDD cycle driven by Playwright.

**Files:**
- Create: `apps/web/src/routes/[tenant]/sources/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/sources/+page.svelte`
- Create: `apps/web/src/routes/[tenant]/sources/[id]/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/sources/[id]/+page.svelte`
- Create: `apps/web/tests/source-health.spec.ts`
- Modify: `services/api/test/e2e-seed.ts`
- Modify: `apps/web/tests/support/e2e.ts`

**Why this task exists:** This exposes connector status and recent runs in the tenant UI for the agreed read-only audience without mixing it into the management surface.

- [ ] **Step 1: Ensure e2e seed supports connector runs**

If not already completed in Task 3, extend `services/api/test/e2e-seed.ts` and `apps/web/tests/support/e2e.ts` so seeded connectors may include `runs` and returned `connectorIds`.

Expected result structure:

```ts
type SeedResult = {
  tenants: Array<{
    slug: string;
    nodeIds: Record<string, string>;
    connectorIds: Record<string, string>;
  }>;
};
```

- [ ] **Step 2: Write the failing Playwright spec**

Create `apps/web/tests/source-health.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { loginViaUi, provisionUser } from "./support/e2e";

test("network admin can view source health list and detail", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Source Health Tenant",
      slug: `source-health-${suffix}`,
      role: "network_admin",
      hierarchy: [
        { key: "station", type: "station", name: "Station", slug: `station-${suffix}` },
      ],
      connectors: [
        {
          key: "manual_satellite",
          status: "active",
          enabled: true,
          lastError: null,
          lastRunAt: "2026-01-08T10:02:00.000Z",
          runs: [
            {
              status: "success",
              startedAt: "2026-01-08T10:00:00.000Z",
              finishedAt: "2026-01-08T10:02:00.000Z",
              periodStart: "2026-01-01T00:00:00.000Z",
              periodEnd: "2026-01-08T00:00:00.000Z",
              recordsWritten: 3,
              warnings: [],
            },
          ],
        },
      ],
    },
  ]);

  const tenant = user.seed.tenants[0]!;

  await loginViaUi(page, user);
  await page.goto(`/${tenant.slug}/sources`);

  await expect(page.getByRole("heading", { name: "Source health" })).toBeVisible();
  await expect(page.getByText("Satellite Viewership (Manual)")).toBeVisible();
  await expect(page.getByText("active")).toBeVisible();

  await page.getByRole("link", { name: "View runs" }).click();
  await expect(page).toHaveURL(new RegExp(`/${tenant.slug}/sources/`));
  await expect(page.getByRole("heading", { name: "Satellite Viewership (Manual)" })).toBeVisible();
  await expect(page.getByText("success")).toBeVisible();
  await expect(page.getByText("3")).toBeVisible();
});

test("station manager can view source health", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Manager Tenant",
      slug: `manager-source-${suffix}`,
      role: "station_manager",
      hierarchy: [
        { key: "station", type: "station", name: "Station", slug: `mgr-station-${suffix}` },
      ],
      scopeNodeKeys: ["station"],
      connectors: [
        {
          key: "manual_satellite",
          status: "active",
          enabled: true,
          runs: [
            {
              status: "success",
              startedAt: "2026-01-08T10:00:00.000Z",
              finishedAt: "2026-01-08T10:02:00.000Z",
              periodStart: "2026-01-01T00:00:00.000Z",
              periodEnd: "2026-01-08T00:00:00.000Z",
              recordsWritten: 1,
              warnings: [],
            },
          ],
        },
      ],
    },
  ]);

  const tenant = user.seed.tenants[0]!;

  await loginViaUi(page, user);
  await page.goto(`/${tenant.slug}/sources`);

  await expect(page.getByText("Satellite Viewership (Manual)")).toBeVisible();
});
```

- [ ] **Step 3: Run the spec to verify failure**

Run:
```bash
pnpm -F @lwa/web test:e2e -- source-health.spec.ts
```

Expected:
- FAIL because the pages do not exist yet

- [ ] **Step 4: Implement source list page load**

Create `apps/web/src/routes/[tenant]/sources/+page.server.ts`:

```ts
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { serverApiFetch } from "$lib/server/api";

export const load: PageServerLoad = async ({ params, cookies }) => {
  const res = await serverApiFetch(`/tenants/${params.tenant}/source-health`, { cookies });

  if (res.status === 401) {
    throw redirect(303, "/login");
  }
  if (!res.ok) {
    throw error(res.status, "Failed to load source health");
  }

  return {
    tenantSlug: params.tenant,
    connectors: (await res.json()).connectors,
  };
};
```

- [ ] **Step 5: Implement source list page UI**

Create `apps/web/src/routes/[tenant]/sources/+page.svelte`:

```svelte
<script lang="ts">
  let { data } = $props();
</script>

<div class="space-y-6">
  <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 class="text-2xl font-semibold text-slate-950">Source health</h2>
    <p class="mt-2 text-slate-600">Inspect connector status and recent ingestion activity.</p>
  </section>

  {#if data.connectors.length === 0}
    <section class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">
      No connectors are configured for this tenant yet.
    </section>
  {:else}
    <section class="space-y-4">
      {#each data.connectors as connector}
        <article class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 class="text-lg font-semibold text-slate-950">{connector.sourceName}</h3>
              <p class="mt-1 text-sm text-slate-500">{connector.sourceKey}</p>
            </div>
            <a
              href={`/${data.tenantSlug}/sources/${connector.id}`}
              class="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white"
            >
              View runs
            </a>
          </div>

          <dl class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-500">Status</dt>
              <dd class="mt-1 text-sm text-slate-900">{connector.status}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-500">Enabled</dt>
              <dd class="mt-1 text-sm text-slate-900">{connector.enabled ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-500">Last run</dt>
              <dd class="mt-1 text-sm text-slate-900">{connector.lastRunAt ? new Date(connector.lastRunAt).toLocaleString() : "Never"}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-500">Last error</dt>
              <dd class="mt-1 text-sm text-slate-900">{connector.lastError ?? "None"}</dd>
            </div>
          </dl>
        </article>
      {/each}
    </section>
  {/if}
</div>
```

- [ ] **Step 6: Implement source detail page load and UI**

Create `apps/web/src/routes/[tenant]/sources/[id]/+page.server.ts`:

```ts
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { serverApiFetch } from "$lib/server/api";

export const load: PageServerLoad = async ({ params, cookies }) => {
  const res = await serverApiFetch(`/tenants/${params.tenant}/source-health/${params.id}`, { cookies });

  if (res.status === 401) {
    throw redirect(303, "/login");
  }
  if (!res.ok) {
    throw error(res.status, "Failed to load source health detail");
  }

  return {
    tenantSlug: params.tenant,
    ...(await res.json()),
  };
};
```

Create `apps/web/src/routes/[tenant]/sources/[id]/+page.svelte`:

```svelte
<script lang="ts">
  let { data } = $props();
</script>

<div class="space-y-6">
  <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <a href={`/${data.tenantSlug}/sources`} class="text-sm text-brand-600 hover:underline">← Back to source health</a>
    <h2 class="mt-3 text-2xl font-semibold text-slate-950">{data.connector.sourceName}</h2>
    <p class="mt-1 text-sm text-slate-500">{data.connector.sourceKey}</p>
  </section>

  <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">Status</dt>
        <dd class="mt-1 text-sm text-slate-900">{data.connector.status}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">Enabled</dt>
        <dd class="mt-1 text-sm text-slate-900">{data.connector.enabled ? "Yes" : "No"}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">Last run</dt>
        <dd class="mt-1 text-sm text-slate-900">{data.connector.lastRunAt ? new Date(data.connector.lastRunAt).toLocaleString() : "Never"}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-wide text-slate-500">Last error</dt>
        <dd class="mt-1 text-sm text-slate-900">{data.connector.lastError ?? "None"}</dd>
      </div>
    </dl>
  </section>

  <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <h3 class="text-lg font-semibold text-slate-950">Recent runs</h3>

    {#if data.runs.length === 0}
      <p class="mt-3 text-sm text-slate-500">This connector has not run yet.</p>
    {:else}
      <div class="mt-4 space-y-3">
        {#each data.runs as run}
          <article class="rounded-lg border border-slate-200 p-4">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p class="text-sm font-medium text-slate-950">{run.status}</p>
              <p class="text-xs text-slate-500">{new Date(run.startedAt).toLocaleString()}</p>
            </div>
            <dl class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-500">Period</dt>
                <dd class="mt-1 text-sm text-slate-900">{new Date(run.periodStart).toLocaleDateString()} – {new Date(run.periodEnd).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-500">Records written</dt>
                <dd class="mt-1 text-sm text-slate-900">{run.recordsWritten}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-500">Finished</dt>
                <dd class="mt-1 text-sm text-slate-900">{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "In progress"}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-500">Warnings</dt>
                <dd class="mt-1 text-sm text-slate-900">{run.warnings?.length ?? 0}</dd>
              </div>
            </dl>
            {#if run.errorMessage}
              <p class="mt-3 text-sm text-red-600">{run.errorMessage}</p>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>
```

- [ ] **Step 7: Verify**

Run:
```bash
pnpm -F @lwa/web test:e2e -- source-health.spec.ts
pnpm -F @lwa/web typecheck
```

Expected:
- PASS
- exit 0

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/routes/[tenant]/sources/+page.server.ts apps/web/src/routes/[tenant]/sources/+page.svelte apps/web/src/routes/[tenant]/sources/[id]/+page.server.ts apps/web/src/routes/[tenant]/sources/[id]/+page.svelte apps/web/tests/source-health.spec.ts apps/web/tests/support/e2e.ts services/api/test/e2e-seed.ts
git commit -m "feat(web): add source health pages"
```

---

## Task 5: Add tenant navigation links for the new pages

**TDD scenario:** Modifying tested code — run the relevant existing e2e tests first, then add a focused assertion if needed.

**Files:**
- Modify: `apps/web/src/routes/[tenant]/+layout.svelte`
- Optionally modify: `apps/web/tests/manual-entry.spec.ts`
- Optionally modify: `apps/web/tests/source-health.spec.ts`

**Why this task exists:** The manual entry and source health pages should be discoverable from the tenant shell without a larger navigation redesign.

- [ ] **Step 1: Run existing relevant specs before modifying the layout**

Run:
```bash
pnpm -F @lwa/web test:e2e -- manual-entry.spec.ts source-health.spec.ts
```

Expected:
- PASS

- [ ] **Step 2: Add simple tenant navigation**

Modify `apps/web/src/routes/[tenant]/+layout.svelte`:

```svelte
<script lang="ts">
  let { children, data } = $props();

  const nav = [
    { href: `/${data.tenantSlug}`, label: "Dashboard" },
    { href: `/${data.tenantSlug}/entry`, label: "Manual entry" },
    { href: `/${data.tenantSlug}/sources`, label: "Source health" },
    { href: `/${data.tenantSlug}/settings/hierarchy`, label: "Hierarchy" },
  ];
</script>

<div class="mx-auto max-w-6xl px-6 py-8">
  <header class="mb-8 space-y-4">
    <div>
      <p class="text-sm text-slate-500">Tenant</p>
      <h1 class="text-2xl font-semibold">{data.tenantSlug}</h1>
    </div>

    <nav class="flex flex-wrap gap-2">
      {#each nav as item}
        <a
          href={item.href}
          class="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          {item.label}
        </a>
      {/each}
    </nav>
  </header>
  {@render children()}
</div>
```

- [ ] **Step 3: Verify the layout change**

Run:
```bash
pnpm -F @lwa/web test:e2e -- manual-entry.spec.ts source-health.spec.ts root-routing.spec.ts dashboard.spec.ts hierarchy.spec.ts
pnpm -F @lwa/web typecheck
```

Expected:
- PASS
- exit 0

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/[tenant]/+layout.svelte apps/web/tests/manual-entry.spec.ts apps/web/tests/source-health.spec.ts
git commit -m "feat(web): add tenant ops navigation"
```

---

## Task 6: Final verification for the UI ops slice

**TDD scenario:** Verification-only.

**Files:**
- No new product files

**Why this task exists:** This proves the slice works end-to-end before moving on to the remaining Phase 1 CLI/gate work.

- [ ] **Step 1: Run targeted tests**

Run:
```bash
pnpm -F @lwa/ui test -- test/FormFromSchema.test.ts
pnpm -F @lwa/api test -- test/source-health.test.ts
pnpm -F @lwa/web test:e2e -- manual-entry.spec.ts source-health.spec.ts
```

Expected:
- all pass

- [ ] **Step 2: Run typechecks**

Run:
```bash
pnpm -F @lwa/ui typecheck
pnpm -F @lwa/api typecheck
pnpm -F @lwa/web typecheck
```

Expected:
- all exit 0

- [ ] **Step 3: Run broader verification**

Run:
```bash
pnpm -w turbo lint typecheck test
```

Expected:
- green workspace run

- [ ] **Step 4: Commit the completed slice**

```bash
git add packages/ui/src/lib/components/FormFromSchema.svelte packages/ui/src/lib/components/index.ts packages/ui/test/FormFromSchema.test.ts services/api/src/routes/source-health.ts services/api/src/app.ts services/api/test/source-health.test.ts apps/web/src/routes/[tenant]/+layout.svelte apps/web/src/routes/[tenant]/entry/+page.server.ts apps/web/src/routes/[tenant]/entry/+page.svelte apps/web/src/routes/[tenant]/sources/+page.server.ts apps/web/src/routes/[tenant]/sources/+page.svelte apps/web/src/routes/[tenant]/sources/[id]/+page.server.ts apps/web/src/routes/[tenant]/sources/[id]/+page.svelte apps/web/tests/manual-entry.spec.ts apps/web/tests/source-health.spec.ts apps/web/tests/support/e2e.ts services/api/test/e2e-seed.ts
git commit -m "feat(web): add Phase 1 operations UI"
```

---

## Self-review

### Spec coverage
- schema-driven form component: covered in Task 1
- manual entry page for configured manual connectors: covered in Task 3
- read-only source health for `network_admin` + `station_manager`: covered in Task 2 and Task 4
- lightweight tenant navigation: covered in Task 5
- verification strategy: covered in Task 6

### Placeholder scan
- no TBD/TODO placeholders remain
- all new files have explicit paths
- verification commands are concrete

### Type consistency
- `FormFromSchema` override concept is defined before route usage
- source health route payload shape is defined before page loaders consume it
- seed result includes `connectorIds` before tests depend on connector seeding

## Handoff

Plan complete and saved to `docs/plans/2026-04-21-phase-1-ui-ops-plan.md`. Two execution options:

**1. Subagent-Driven (recommended, this session)** — Fresh subagent per task with two-stage review. Better for plans with many independent or moderately-coupled tasks.

**2. Parallel Session (separate)** — Execute in a separate session using checkpoints. Better when tasks are tightly coupled or you want stronger human review between batches.

**Which approach?**
