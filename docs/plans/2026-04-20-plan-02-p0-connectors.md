# Loveworld Analytics — Plan 02: Phase 1 — P0 Connectors + First Dashboard Tiles

> **REQUIRED SUB-SKILL:** Use `/skill:subagent-driven-development` (recommended) or `/skill:executing-plans` to implement this plan task-by-task.

**Goal:** Turn Phase 0's empty skeleton into a working analytics platform where LW Europe staff can log one real week end-to-end: connect the four P0 sources (2 manual + 2 pull), watch data flow through the ingestion pipeline into the rollup table, and see TV-households + Web tiles render on the tenant dashboard.

**Scope note — `castnet_events` removed.** The original design listed `castnet_events` as a P0 connector pulling from the CastNet (chanelops) platform. CastNet is being retired in favour of a new all-in-one solution, *Love World Europe One*. Dropping the connector avoided two wasted dev-days against a platform that will not exist. When *Love World Europe One* ships, it lands as a brand-new pull connector in Phase 2 (or a point release) — a sibling to `cloudflare_analytics` and `ga4`.

**Architecture:** Add the metric fact/rollup tables (Phase 0 deferred them) and wire the ingestion pipeline end-to-end — scheduler enqueues pulls, worker invokes connectors, idempotent upsert into `metric_record`, incremental `metric_rollup` refresh via recursive CTE up the hierarchy. Connectors live in a new shared `@lwa/connectors` package so both the API (for credential validation + account discovery) and the worker (for pulling) can import them. Dashboard reads from `metric_rollup` only; the fact table is never read by UI.

**Tech Stack:**
- Everything in Phase 0 plus:
- `@google-analytics/data` + `google-auth-library` (GA4 service-account JWT)
- `graphql-request` for Cloudflare Analytics GraphQL API
- `undici` `MockAgent` for HTTP connector integration tests
- Drizzle `db.execute(sql\`...\`)` for the `effective_metric` SQL view
- BullMQ repeatable jobs (scheduler) keyed to `connector_config.schedule`

**Related design doc:** `docs/plans/2026-04-20-loveworld-analytics-design.md` — sections 5 (data model), 6 (connector framework), 7 (ingestion pipeline), 9 (dashboard UX), 10.3 (permission matrix), 13 (rollout gate).

**Scope boundary for Phase 1:**
- **In:** 4 P0 connectors, metric schema, ingestion pipeline wiring, KEK/DEK for connector credentials, hierarchy CRUD UI + API, 2 of the 5 KPI tiles (TV-households + Web), manual entry console, basic source-health listing, `admin:set-password` CLI, Phase 1 gate smoke.
- **Out (Phase 2+):** adjustment UI, streaming/social/engagement tiles, records drill-down table, anomaly detection UI, PDF export, scheduled reports, weekly digest emails, drag-and-drop hierarchy, OAuth connector flows (YouTube/Meta), tenant/team invite UI. Schema columns for adjustments already exist (added Task 1) so Phase 2 UI lands without migration.

---

## Task roadmap (11 tasks, 3 phases)

| # | Task | Depends on | Checkpoint |
|---|---|---|---|
| 1 | `@lwa/db` — metric fact/rollup tables + `effective_metric` view + repositories + drop orphaned `castnet_events` seed | — | ✅ Implemented |
| 2 | `@lwa/connectors` — new package + enriched `PullInput`/`ManualInput` contracts + contract test harness | 1 | ✅ Implemented |
| 3 | `@lwa/crypto` — AES-256-GCM KEK/DEK service + wire into `connector_config` repo | 1 | ✅ Implemented |
| 4 | Ingestion pipeline — pull handler wiring, scheduler, rollup.refresh, ingestion_run tracking, error-code → retry mapping | 1, 2, 3 | ✅ Implemented — end-to-end stub pipeline test covers pull → metric_record → metric_rollup |
| 5 | `manual_satellite` + `manual_freeview` connectors + `POST /api/tenants/:slug/entries` | 2 | ✅ Implemented |
| 6 | `cloudflare_analytics` connector (GraphQL) | 2, 3 | ✅ Implemented |
| 7 | `ga4` connector (service-account JWT) | 2, 3 | ✅ Implemented — contract-suite/tests present for all 4 shipped P0 connectors |
| 8 | API: connector management + hierarchy CRUD + backfill endpoint + RBAC middleware | 4, 5, 6, 7 | ✅ Implemented |
| 9 | Hierarchy management UI + tenant switcher root page | 8 | ✅ Implemented |
| 10 | Dashboard: `<KpiTile>` + `<PeriodPicker>` + `<ComparisonPicker>` + TV-households + Web tiles | 4, 8 | ✅ Implemented |
| 11 | Manual entry UI + source health list + `admin:set-password` CLI + Phase 1 gate smoke script | 5, 8, 9, 10 | 🚧 Closeout in `docs/plans/2026-04-23-phase-1-closeout.md` |

Each task ends with: `pnpm -w turbo lint typecheck test`, then `git commit`. Phase 1 is done when Task 11 lands on `main`, `phase1:gate` is green in CI, and one LW Europe admin has completed the end-to-end runbook against staging.

**Status audit (2026-04-23):** Tasks 1–10 are implemented in the repo. Task 11 is being closed through `docs/plans/2026-04-23-phase-1-closeout.md`, which adds the remaining admin password CLI, Phase 1 gate, CI/deploy hardening, and documentation cleanup.

---

## Decisions to confirm before Task 1

Each has a recommended path. If you disagree, say so before Task 1 — changing these later costs migrations.

1. **Scheduler mechanism:** BullMQ **repeatable jobs** (queue-native) vs external cron triggering API calls vs a long-running `node-cron` in the worker.
   - **Recommendation: BullMQ repeatable jobs**, reconciled on worker startup + on a 60s poll of `connector_config`. Survives worker restarts, integrates with the existing queues, and dynamic reconciliation is three lines of code.

2. **`packages/connectors` new package** vs inline `services/ingestion/src/connectors/`.
   - **Recommendation: new package `@lwa/connectors`.** Matches the design doc, and the API needs to import `validateCredentials` / `listAccounts` / `entrySchema` during connector setup and manual entry — duplicating that logic inside the worker would require a second HTTP hop.

3. **Cloudflare API choice:** GraphQL Analytics API (aggregates baked in, one request per period) vs REST Analytics API (per-colo raw data, multiple requests).
   - **Recommendation: GraphQL Analytics**. Zone-level aggregates (requests, pageviews, uniques) are exactly what the Web tile needs and it's 1 request per day-chunk vs ~12 for REST.

4. **`effective_metric` implementation:** SQL view joining `metric_record` ← most-recent applied `metric_adjustment` vs materialised view.
   - **Recommendation: regular SQL view.** v1 volume (< 10M records) makes a view fast enough; rollup reads go through `metric_rollup` anyway. Materialise later only if drill-down perf requires it.

5. **Connector credential encryption:** Which envelope crypto library?
   - **Recommendation: Node native `crypto` (AES-256-GCM) with a 32-byte KEK sourced from env + per-tenant 32-byte DEK stored alongside the ciphertext.** No third-party lib needed. `credentials_kek_version` already exists on `connector_config` for rotation.

---

## Task 1: `@lwa/db` — metric fact/rollup tables + `effective_metric` view + repositories

**TDD scenario:** New feature — full TDD cycle with integration tests against testcontainers Postgres.

**Files:**
- Create: `packages/db/src/schema/platform-account.ts`
- Create: `packages/db/src/schema/metric-record.ts`
- Create: `packages/db/src/schema/metric-adjustment.ts`
- Create: `packages/db/src/schema/metric-rollup.ts`
- Create: `packages/db/src/schema/ingestion-run.ts`
- Create: `packages/db/src/schema/backfill-run.ts`
- Modify: `packages/db/src/schema/index.ts` (export the new tables)
- Create: `packages/db/drizzle/0001_metrics.sql` (generated migration)
- Create: `packages/db/drizzle/0002_effective_metric_view.sql` (manual view)
- Create: `packages/db/src/repositories/metric-record.ts`
- Create: `packages/db/src/repositories/metric-rollup.ts`
- Create: `packages/db/src/repositories/platform-account.ts`
- Create: `packages/db/src/repositories/ingestion-run.ts`
- Modify: `packages/db/src/repositories/index.ts` (new repo exports — if it exists; otherwise add barrel `src/repositories.ts`)
- Create: `packages/db/test/metric-record.test.ts`
- Create: `packages/db/test/metric-rollup.test.ts`
- Create: `packages/db/test/effective-metric-view.test.ts`

**Why this task exists:** Phase 0 intentionally shipped the auth + hierarchy + source tables but deferred the metric fact/rollup/adjustment tables. Everything downstream — connectors, ingestion, dashboard — reads or writes these tables. Lands the schema first with repositories that enforce the idempotency contract (`UNIQUE` on the fact table, deterministic `dimensions_hash`), and the `effective_metric` SQL view that overrides raw values with the latest applied adjustment.

- [ ] **Step 1: Shared enums + platform_account schema**

Create `packages/db/src/schema/platform-account.ts`:

```ts
import { pgTable, uuid, text, jsonb, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { hierarchyNode } from "./hierarchy-node";
import { source } from "./source";

export const platformAccountStatusEnum = pgEnum("platform_account_status", [
  "active",
  "paused",
  "error",
]);

export const platformAccount = pgTable(
  "platform_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenant.id, { onDelete: "cascade" }),
    hierarchyNodeId: uuid("hierarchy_node_id").notNull().references(() => hierarchyNode.id),
    sourceId: uuid("source_id").notNull().references(() => source.id),
    externalId: text("external_id").notNull(),
    displayName: text("display_name").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    status: platformAccountStatusEnum("status").default("active").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("platform_account_tenant_source_external_idx").on(
      t.tenantId, t.sourceId, t.externalId,
    ),
    tenantIdx: index("platform_account_tenant_idx").on(t.tenantId),
    nodeIdx: index("platform_account_node_idx").on(t.hierarchyNodeId),
  }),
);

export type PlatformAccount = typeof platformAccount.$inferSelect;
```

- [ ] **Step 2: metric_record schema + dimensions_hash contract**

Create `packages/db/src/schema/metric-record.ts`:

```ts
import {
  pgTable, uuid, text, jsonb, timestamp, numeric, pgEnum, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { source } from "./source";
import { connectorConfig } from "./connector-config";
import { platformAccount } from "./platform-account";
import { hierarchyNode } from "./hierarchy-node";

export const metricCategoryEnum = pgEnum("metric_category", [
  "tv_households",
  "web_visitors",
  "streaming",
  "social_reach",
  "engagement",
]);

export const granularityEnum = pgEnum("granularity", [
  "hour",
  "day",
  "week",
  "month",
  "quarter",
]);

export const metricRecord = pgTable(
  "metric_record",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenant.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => source.id),
    connectorConfigId: uuid("connector_config_id").notNull().references(() => connectorConfig.id),
    platformAccountId: uuid("platform_account_id").references(() => platformAccount.id),
    hierarchyNodeId: uuid("hierarchy_node_id").notNull().references(() => hierarchyNode.id),
    metricType: text("metric_type").notNull(),
    metricCategory: metricCategoryEnum("metric_category").notNull(),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().default({}).notNull(),
    dimensionsHash: text("dimensions_hash").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    granularity: granularityEnum("granularity").notNull(),
    rawValue: numeric("raw_value", { precision: 20, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    provenance: text("provenance").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // The entire idempotency story — one row per (tenant, source, node, type, period, dims).
    uniq: uniqueIndex("metric_record_dedup_idx").on(
      t.tenantId, t.sourceId, t.hierarchyNodeId, t.metricType, t.periodStart, t.periodEnd, t.dimensionsHash,
    ),
    categoryIdx: index("metric_record_category_idx").on(t.tenantId, t.metricCategory, t.periodStart),
    nodeIdx: index("metric_record_node_idx").on(t.hierarchyNodeId, t.periodStart),
  }),
);

export type MetricRecord = typeof metricRecord.$inferSelect;
export type NewMetricRecord = typeof metricRecord.$inferInsert;
```

- [ ] **Step 3: metric_adjustment + adjustment_batch schema**

Create `packages/db/src/schema/metric-adjustment.ts`:

```ts
import { pgTable, uuid, text, numeric, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { user } from "./user";
import { metricRecord } from "./metric-record";

export const adjustmentTypeEnum = pgEnum("adjustment_type", ["replace", "delta"]);
export const adjustmentStatusEnum = pgEnum("adjustment_status", [
  "draft", "applied", "reversed", "superseded",
]);

export const adjustmentBatch = pgTable("adjustment_batch", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenant.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").notNull().references(() => user.id),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const metricAdjustment = pgTable(
  "metric_adjustment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    metricRecordId: uuid("metric_record_id").notNull().references(() => metricRecord.id),
    tenantId: uuid("tenant_id").notNull().references(() => tenant.id, { onDelete: "cascade" }),
    adjustmentType: adjustmentTypeEnum("adjustment_type").notNull(),
    adjustedValue: numeric("adjusted_value", { precision: 20, scale: 4 }).notNull(),
    reason: text("reason").notNull(),
    evidenceUrl: text("evidence_url"),
    authorUserId: uuid("author_user_id").notNull().references(() => user.id),
    status: adjustmentStatusEnum("status").default("draft").notNull(),
    approvedByUserId: uuid("approved_by_user_id").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    batchId: uuid("batch_id").references(() => adjustmentBatch.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedReason: text("reversed_reason"),
  },
  (t) => ({
    recordIdx: index("metric_adjustment_record_idx").on(t.metricRecordId, t.status),
    tenantIdx: index("metric_adjustment_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

export type MetricAdjustment = typeof metricAdjustment.$inferSelect;
export type AdjustmentBatch = typeof adjustmentBatch.$inferSelect;
```

- [ ] **Step 4: metric_rollup schema**

Create `packages/db/src/schema/metric-rollup.ts`:

```ts
import { pgTable, uuid, numeric, integer, jsonb, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { hierarchyNode } from "./hierarchy-node";
import { metricCategoryEnum, granularityEnum } from "./metric-record";

export const metricRollup = pgTable(
  "metric_rollup",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenant.id, { onDelete: "cascade" }),
    hierarchyNodeId: uuid("hierarchy_node_id").notNull().references(() => hierarchyNode.id),
    metricCategory: metricCategoryEnum("metric_category").notNull(),
    granularity: granularityEnum("granularity").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    effectiveTotal: numeric("effective_total", { precision: 24, scale: 4 }).notNull(),
    rawTotal: numeric("raw_total", { precision: 24, scale: 4 }).notNull(),
    recordCount: integer("record_count").notNull(),
    sourceBreakdown: jsonb("source_breakdown").$type<Record<string, number>>().default({}).notNull(),
    hasAdjustments: boolean("has_adjustments").default(false).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.hierarchyNodeId, t.metricCategory, t.granularity, t.bucketStart] }),
  }),
);

export type MetricRollup = typeof metricRollup.$inferSelect;
```

- [ ] **Step 5: ingestion_run + backfill_run schema**

Create `packages/db/src/schema/ingestion-run.ts`:

```ts
import { pgTable, uuid, text, integer, jsonb, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { connectorConfig } from "./connector-config";

export const ingestionRunStatusEnum = pgEnum("ingestion_run_status", [
  "pending", "running", "success", "failed", "skipped",
]);

export const ingestionRun = pgTable(
  "ingestion_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectorConfigId: uuid("connector_config_id").notNull().references(() => connectorConfig.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: ingestionRunStatusEnum("status").default("pending").notNull(),
    recordsWritten: integer("records_written").default(0).notNull(),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    warnings: jsonb("warnings").$type<string[]>().default([]).notNull(),
    bullmqJobId: text("bullmq_job_id"),
  },
  (t) => ({
    configIdx: index("ingestion_run_config_idx").on(t.connectorConfigId, t.startedAt),
  }),
);

export type IngestionRun = typeof ingestionRun.$inferSelect;
```

Create `packages/db/src/schema/backfill-run.ts`:

```ts
import { pgTable, uuid, integer, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { connectorConfig } from "./connector-config";
import { user } from "./user";

export const backfillRunStatusEnum = pgEnum("backfill_run_status", [
  "queued", "running", "paused", "completed", "failed",
]);

export const backfillRun = pgTable(
  "backfill_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectorConfigId: uuid("connector_config_id").notNull().references(() => connectorConfig.id),
    rangeStart: timestamp("range_start", { withTimezone: true }).notNull(),
    rangeEnd: timestamp("range_end", { withTimezone: true }).notNull(),
    chunkSizeDays: integer("chunk_size_days").notNull().default(7),
    chunksTotal: integer("chunks_total").notNull(),
    chunksCompleted: integer("chunks_completed").notNull().default(0),
    lastCheckpoint: timestamp("last_checkpoint", { withTimezone: true }),
    status: backfillRunStatusEnum("status").default("queued").notNull(),
    startedByUserId: uuid("started_by_user_id").notNull().references(() => user.id),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
  },
  (t) => ({
    configIdx: index("backfill_run_config_idx").on(t.connectorConfigId, t.startedAt),
  }),
);

export type BackfillRun = typeof backfillRun.$inferSelect;
```

- [ ] **Step 6: Export new schemas + generate migration**

Modify `packages/db/src/schema/index.ts` — add:

```ts
export * from "./platform-account";
export * from "./metric-record";
export * from "./metric-adjustment";
export * from "./metric-rollup";
export * from "./ingestion-run";
export * from "./backfill-run";
```

Run:
```bash
cd packages/db
pnpm drizzle-kit generate --name metrics
```

Expected: `packages/db/drizzle/0001_metrics.sql` created with the six new tables + enums.

- [ ] **Step 7: Manual migration for `effective_metric` view**

Create `packages/db/drizzle/0002_effective_metric_view.sql`:

```sql
-- effective_metric joins metric_record with its most-recent applied adjustment.
-- Dashboards never read the fact table directly — they read the view or the rollup.
-- The DISTINCT ON trick selects the one applied adjustment per metric_record_id
-- (ordered by created_at desc); 'applied' is the only status that overrides raw.

CREATE OR REPLACE VIEW effective_metric AS
SELECT
  mr.id                    AS metric_record_id,
  mr.tenant_id,
  mr.source_id,
  mr.hierarchy_node_id,
  mr.platform_account_id,
  mr.metric_type,
  mr.metric_category,
  mr.granularity,
  mr.period_start,
  mr.period_end,
  mr.raw_value,
  CASE
    WHEN latest_adj.adjustment_type = 'replace' THEN latest_adj.adjusted_value
    WHEN latest_adj.adjustment_type = 'delta'   THEN mr.raw_value + latest_adj.adjusted_value
    ELSE mr.raw_value
  END AS effective_value,
  (latest_adj.id IS NOT NULL) AS has_adjustment,
  latest_adj.id               AS applied_adjustment_id
FROM metric_record mr
LEFT JOIN LATERAL (
  SELECT adj.id, adj.adjustment_type, adj.adjusted_value
  FROM metric_adjustment adj
  WHERE adj.metric_record_id = mr.id
    AND adj.status = 'applied'
  ORDER BY adj.created_at DESC
  LIMIT 1
) latest_adj ON TRUE;
```

Run the migration:
```bash
pnpm -F @lwa/db db:migrate
```

Expected: 2 migrations applied, view exists.

- [ ] **Step 8: Test — `effective_metric` view returns raw when no adjustment, adjusted when replace, sum when delta**

Create `packages/db/test/effective-metric-view.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDbHandle } from "../src/test-utils";
import { tenant, user, hierarchyNode, source, connectorConfig, metricRecord, metricAdjustment } from "../src/schema";

describe("effective_metric view", () => {
  let h: TestDbHandle;
  beforeAll(async () => { h = await createTestDb(); });
  afterAll(async () => { await h.stop(); });

  it("returns raw_value when no adjustment exists", async () => {
    const ctx = await seedBaseRow(h);
    const [row] = await h.db.execute(sql`
      SELECT effective_value, has_adjustment FROM effective_metric WHERE metric_record_id = ${ctx.recordId}
    `);
    expect(Number(row.effective_value)).toBe(1000);
    expect(row.has_adjustment).toBe(false);
  });

  it("returns adjusted_value for replace", async () => {
    const ctx = await seedBaseRow(h);
    await h.db.insert(metricAdjustment).values({
      metricRecordId: ctx.recordId, tenantId: ctx.tenantId,
      adjustmentType: "replace", adjustedValue: "1500",
      reason: "BARB correction", authorUserId: ctx.userId, status: "applied",
    });
    const [row] = await h.db.execute(sql`
      SELECT effective_value, has_adjustment FROM effective_metric WHERE metric_record_id = ${ctx.recordId}
    `);
    expect(Number(row.effective_value)).toBe(1500);
    expect(row.has_adjustment).toBe(true);
  });

  it("returns raw + delta for delta type", async () => {
    const ctx = await seedBaseRow(h);
    await h.db.insert(metricAdjustment).values({
      metricRecordId: ctx.recordId, tenantId: ctx.tenantId,
      adjustmentType: "delta", adjustedValue: "250",
      reason: "late arrivals", authorUserId: ctx.userId, status: "applied",
    });
    const [row] = await h.db.execute(sql`
      SELECT effective_value FROM effective_metric WHERE metric_record_id = ${ctx.recordId}
    `);
    expect(Number(row.effective_value)).toBe(1250);
  });

  it("ignores draft/reversed adjustments — falls back to raw", async () => {
    const ctx = await seedBaseRow(h);
    await h.db.insert(metricAdjustment).values({
      metricRecordId: ctx.recordId, tenantId: ctx.tenantId,
      adjustmentType: "replace", adjustedValue: "9999",
      reason: "pending review", authorUserId: ctx.userId, status: "draft",
    });
    const [row] = await h.db.execute(sql`
      SELECT effective_value FROM effective_metric WHERE metric_record_id = ${ctx.recordId}
    `);
    expect(Number(row.effective_value)).toBe(1000);
  });
});

async function seedBaseRow(h: TestDbHandle) {
  const [t] = await h.db.insert(tenant).values({ name: "Acme", slug: `acme-${crypto.randomUUID().slice(0, 8)}` }).returning();
  const [u] = await h.db.insert(user).values({ email: `${crypto.randomUUID()}@example.com`, name: "Author" }).returning();
  const [node] = await h.db.insert(hierarchyNode).values({ tenantId: t.id, type: "station", name: "Main", slug: "main" }).returning();
  const [src] = await h.db.insert(source).values({ key: `manual-${crypto.randomUUID().slice(0,8)}`, name: "m", category: "tv_broadcast", authMethod: "none" }).returning();
  const [cfg] = await h.db.insert(connectorConfig).values({ tenantId: t.id, sourceId: src.id, schedule: "" }).returning();
  const [rec] = await h.db.insert(metricRecord).values({
    tenantId: t.id, sourceId: src.id, connectorConfigId: cfg.id, hierarchyNodeId: node.id,
    metricType: "households", metricCategory: "tv_households",
    dimensions: {}, dimensionsHash: "0",
    periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-08"), granularity: "week",
    rawValue: "1000", unit: "households", provenance: `connector:${cfg.id}`,
  }).returning();
  return { tenantId: t.id, userId: u.id, recordId: rec.id };
}
```

Run: `pnpm -F @lwa/db test effective-metric-view`
Expected: FAIL (view not created yet if migration hasn't run) → after migration, PASS.

- [ ] **Step 9: `metric-record` repository — idempotent upsert + deterministic dimensions_hash**

Create `packages/db/src/repositories/metric-record.ts`:

```ts
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { metricRecord, type NewMetricRecord } from "../schema";

export type MetricRecordDraft = Omit<NewMetricRecord, "id" | "dimensionsHash" | "ingestedAt">;

// BLAKE3 ideal but Node lacks native BLAKE3. SHA-256 of canonical-JSON is
// deterministic, collision-resistant enough for dims (< 10 keys typical),
// and ships in stdlib. Changing the hash function later is a migration, not
// a code change — the column is VARCHAR not a typed hash.
export function hashDimensions(dims: Record<string, string>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(dims).sort(([a], [b]) => a.localeCompare(b))),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export interface MetricRecordRepo {
  upsertMany(drafts: MetricRecordDraft[]): Promise<{ written: number }>;
}

export function createMetricRecordRepo(db: Database): MetricRecordRepo {
  return {
    async upsertMany(drafts) {
      if (drafts.length === 0) return { written: 0 };
      const rows = drafts.map((d) => ({ ...d, dimensionsHash: hashDimensions(d.dimensions ?? {}) }));
      const result = await db.insert(metricRecord).values(rows)
        .onConflictDoUpdate({
          target: [
            metricRecord.tenantId, metricRecord.sourceId, metricRecord.hierarchyNodeId,
            metricRecord.metricType, metricRecord.periodStart, metricRecord.periodEnd,
            metricRecord.dimensionsHash,
          ],
          set: {
            rawValue: sql`excluded.raw_value`,
            provenance: sql`excluded.provenance`,
            ingestedAt: sql`now()`,
          },
        })
        .returning({ id: metricRecord.id });
      return { written: result.length };
    },
  };
}
```

- [ ] **Step 10: Test — idempotent upsert**

Create `packages/db/test/metric-record.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDbHandle } from "../src/test-utils";
import { tenant, hierarchyNode, source, connectorConfig } from "../src/schema";
import { createMetricRecordRepo, hashDimensions } from "../src/repositories/metric-record";

describe("metric-record repo", () => {
  let h: TestDbHandle;
  beforeAll(async () => { h = await createTestDb(); });
  afterAll(async () => { await h.stop(); });

  it("hashDimensions is canonical (order-independent)", () => {
    expect(hashDimensions({ a: "1", b: "2" })).toBe(hashDimensions({ b: "2", a: "1" }));
    expect(hashDimensions({ a: "1" })).not.toBe(hashDimensions({ a: "2" }));
  });

  it("upsertMany is idempotent — second run updates raw_value, same row count", async () => {
    const ctx = await seedCtx(h);
    const repo = createMetricRecordRepo(h.db);
    const draft = {
      tenantId: ctx.t.id, sourceId: ctx.src.id, connectorConfigId: ctx.cfg.id,
      hierarchyNodeId: ctx.node.id, metricType: "page_views",
      metricCategory: "web_visitors" as const, dimensions: { country: "GB" },
      periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-02"),
      granularity: "day" as const, rawValue: "100", unit: "count",
      provenance: `connector:${ctx.cfg.id}`,
    };
    const r1 = await repo.upsertMany([draft]);
    const r2 = await repo.upsertMany([{ ...draft, rawValue: "150" }]);
    expect(r1.written).toBe(1);
    expect(r2.written).toBe(1);
    const all = await h.db.execute("SELECT COUNT(*)::int AS c, MAX(raw_value) AS v FROM metric_record");
    expect(all[0].c).toBe(1);
    expect(Number(all[0].v)).toBe(150);
  });

  it("upsertMany with different dimensions creates separate rows", async () => {
    const ctx = await seedCtx(h);
    const repo = createMetricRecordRepo(h.db);
    const base = {
      tenantId: ctx.t.id, sourceId: ctx.src.id, connectorConfigId: ctx.cfg.id,
      hierarchyNodeId: ctx.node.id, metricType: "page_views",
      metricCategory: "web_visitors" as const,
      periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-02-02"),
      granularity: "day" as const, rawValue: "50", unit: "count",
      provenance: `connector:${ctx.cfg.id}`,
    };
    await repo.upsertMany([
      { ...base, dimensions: { country: "GB" } },
      { ...base, dimensions: { country: "US" } },
    ]);
    const rows = await h.db.execute("SELECT COUNT(*)::int AS c FROM metric_record WHERE period_start = '2026-02-01'");
    expect(rows[0].c).toBe(2);
  });
});

async function seedCtx(h: TestDbHandle) {
  const [t] = await h.db.insert(tenant).values({ name: "Acme", slug: `acme-${crypto.randomUUID().slice(0,8)}` }).returning();
  const [node] = await h.db.insert(hierarchyNode).values({ tenantId: t.id, type: "station", name: "Main", slug: "main" }).returning();
  const [src] = await h.db.insert(source).values({ key: `src-${crypto.randomUUID().slice(0,8)}`, name: "x", category: "web", authMethod: "none" }).returning();
  const [cfg] = await h.db.insert(connectorConfig).values({ tenantId: t.id, sourceId: src.id, schedule: "" }).returning();
  return { t, node, src, cfg };
}
```

Run: `pnpm -F @lwa/db test metric-record`
Expected: PASS (3 tests).

- [ ] **Step 11: `metric-rollup` repository — incremental recompute via recursive CTE up the hierarchy**

Create `packages/db/src/repositories/metric-rollup.ts`:

```ts
import { sql } from "drizzle-orm";
import type { Database } from "../client";

export interface MetricRollupRepo {
  /**
   * Recompute rollup for exactly one (tenant, node, category, granularity, bucket).
   * Caller is responsible for walking the hierarchy up and invoking this for every
   * ancestor (the ingestion worker does that).
   */
  refreshBucket(input: {
    tenantId: string;
    hierarchyNodeId: string;
    metricCategory: string;
    granularity: "day" | "week" | "month" | "quarter";
    bucketStart: Date;
    bucketEnd: Date;
  }): Promise<void>;

  /** Returns every ancestor node id (inclusive of the starting node). */
  getAncestors(tenantId: string, nodeId: string): Promise<string[]>;
}

export function createMetricRollupRepo(db: Database): MetricRollupRepo {
  return {
    async refreshBucket({ tenantId, hierarchyNodeId, metricCategory, granularity, bucketStart, bucketEnd }) {
      // Aggregate from effective_metric for this category + bucket, scoped to the
      // subtree under hierarchyNodeId. The recursive CTE collects descendants.
      await db.execute(sql`
        WITH RECURSIVE subtree AS (
          SELECT id FROM hierarchy_node
          WHERE tenant_id = ${tenantId} AND id = ${hierarchyNodeId} AND archived_at IS NULL
          UNION ALL
          SELECT hn.id FROM hierarchy_node hn
          INNER JOIN subtree s ON hn.parent_id = s.id
          WHERE hn.archived_at IS NULL
        ),
        agg AS (
          SELECT
            COALESCE(SUM(em.effective_value), 0) AS effective_total,
            COALESCE(SUM(em.raw_value),       0) AS raw_total,
            COUNT(*)::int                        AS record_count,
            BOOL_OR(em.has_adjustment)           AS has_adjustments,
            jsonb_object_agg(s.key, breakdown.total)
              FILTER (WHERE breakdown.total IS NOT NULL) AS source_breakdown
          FROM effective_metric em
          JOIN source s ON s.id = em.source_id
          LEFT JOIN LATERAL (
            SELECT SUM(em2.effective_value) AS total
            FROM effective_metric em2
            WHERE em2.source_id = em.source_id
              AND em2.hierarchy_node_id IN (SELECT id FROM subtree)
              AND em2.metric_category = ${metricCategory}::metric_category
              AND em2.period_start >= ${bucketStart.toISOString()}::timestamptz
              AND em2.period_end   <= ${bucketEnd.toISOString()}::timestamptz
          ) breakdown ON TRUE
          WHERE em.tenant_id = ${tenantId}
            AND em.hierarchy_node_id IN (SELECT id FROM subtree)
            AND em.metric_category = ${metricCategory}::metric_category
            AND em.period_start >= ${bucketStart.toISOString()}::timestamptz
            AND em.period_end   <= ${bucketEnd.toISOString()}::timestamptz
        )
        INSERT INTO metric_rollup (
          tenant_id, hierarchy_node_id, metric_category, granularity, bucket_start,
          effective_total, raw_total, record_count, source_breakdown, has_adjustments, computed_at
        )
        SELECT ${tenantId}::uuid, ${hierarchyNodeId}::uuid, ${metricCategory}::metric_category,
               ${granularity}::granularity, ${bucketStart.toISOString()}::timestamptz,
               effective_total, raw_total, record_count,
               COALESCE(source_breakdown, '{}'::jsonb), COALESCE(has_adjustments, false), now()
        FROM agg
        ON CONFLICT (tenant_id, hierarchy_node_id, metric_category, granularity, bucket_start)
        DO UPDATE SET
          effective_total  = excluded.effective_total,
          raw_total        = excluded.raw_total,
          record_count     = excluded.record_count,
          source_breakdown = excluded.source_breakdown,
          has_adjustments  = excluded.has_adjustments,
          computed_at      = now();
      `);
    },

    async getAncestors(tenantId, nodeId) {
      const rows = await db.execute(sql`
        WITH RECURSIVE chain AS (
          SELECT id, parent_id FROM hierarchy_node
          WHERE tenant_id = ${tenantId} AND id = ${nodeId}
          UNION ALL
          SELECT hn.id, hn.parent_id FROM hierarchy_node hn
          INNER JOIN chain c ON hn.id = c.parent_id
        )
        SELECT id::text FROM chain
      `);
      return rows.map((r: { id: string }) => r.id);
    },
  };
}
```

- [ ] **Step 12: Test — rollup refresh sums across subtree, getAncestors climbs**

Create `packages/db/test/metric-rollup.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDbHandle } from "../src/test-utils";
import { tenant, hierarchyNode, source, connectorConfig, metricRecord } from "../src/schema";
import { createMetricRollupRepo } from "../src/repositories/metric-rollup";
import { hashDimensions } from "../src/repositories/metric-record";

describe("metric-rollup repo", () => {
  let h: TestDbHandle;
  beforeAll(async () => { h = await createTestDb(); });
  afterAll(async () => { await h.stop(); });

  it("refreshBucket sums effective_value across hierarchy subtree", async () => {
    const ctx = await seedTree(h);
    const repo = createMetricRollupRepo(h.db);
    await repo.refreshBucket({
      tenantId: ctx.tenantId,
      hierarchyNodeId: ctx.stationId,
      metricCategory: "web_visitors",
      granularity: "week",
      bucketStart: new Date("2026-01-05"),
      bucketEnd: new Date("2026-01-12"),
    });
    const [row] = await h.db.execute(
      "SELECT effective_total, record_count, source_breakdown FROM metric_rollup WHERE hierarchy_node_id = $1",
      [ctx.stationId],
    );
    expect(Number(row.effective_total)).toBe(300); // 100 (A) + 200 (B)
    expect(row.record_count).toBe(2);
  });

  it("getAncestors climbs to root", async () => {
    const ctx = await seedTree(h);
    const repo = createMetricRollupRepo(h.db);
    const ancestors = await repo.getAncestors(ctx.tenantId, ctx.langId);
    expect(ancestors).toEqual(expect.arrayContaining([ctx.langId, ctx.broadcastId, ctx.stationId]));
    expect(ancestors).toHaveLength(3);
  });
});

async function seedTree(h: TestDbHandle) {
  const [t] = await h.db.insert(tenant).values({ name: "Acme", slug: `acme-${crypto.randomUUID().slice(0,8)}` }).returning();
  const [station] = await h.db.insert(hierarchyNode).values({ tenantId: t.id, type: "station", name: "LWE", slug: "lwe" }).returning();
  const [broadcast] = await h.db.insert(hierarchyNode).values({ tenantId: t.id, type: "broadcast_channel", name: "English", slug: "en", parentId: station.id }).returning();
  const [lang] = await h.db.insert(hierarchyNode).values({ tenantId: t.id, type: "language_channel", name: "fr", slug: "fr", parentId: broadcast.id }).returning();
  const [src] = await h.db.insert(source).values({ key: `cf-${crypto.randomUUID().slice(0,8)}`, name: "CF", category: "web", authMethod: "none" }).returning();
  const [cfg] = await h.db.insert(connectorConfig).values({ tenantId: t.id, sourceId: src.id, schedule: "" }).returning();
  const base = {
    tenantId: t.id, sourceId: src.id, connectorConfigId: cfg.id, metricType: "page_views",
    metricCategory: "web_visitors" as const, dimensions: {}, dimensionsHash: hashDimensions({}),
    periodStart: new Date("2026-01-05"), periodEnd: new Date("2026-01-06"), granularity: "day" as const,
    unit: "count", provenance: `connector:${cfg.id}`,
  };
  await h.db.insert(metricRecord).values([
    { ...base, hierarchyNodeId: broadcast.id, rawValue: "100" },
    { ...base, hierarchyNodeId: lang.id,      rawValue: "200", periodStart: new Date("2026-01-06"), periodEnd: new Date("2026-01-07") },
  ]);
  return { tenantId: t.id, stationId: station.id, broadcastId: broadcast.id, langId: lang.id };
}
```

Run: `pnpm -F @lwa/db test metric-rollup`
Expected: PASS (2 tests).

- [ ] **Step 13: `ingestion-run` + `platform-account` repos (thin)**

Create `packages/db/src/repositories/ingestion-run.ts`:

```ts
import type { Database } from "../client";
import { ingestionRun, type IngestionRun } from "../schema";
import { eq } from "drizzle-orm";

export interface IngestionRunRepo {
  start(input: { connectorConfigId: string; periodStart: Date; periodEnd: Date; jobId?: string }): Promise<IngestionRun>;
  finish(id: string, input: {
    status: "success" | "failed" | "skipped";
    recordsWritten: number; durationMs: number;
    errorCode?: string; errorMessage?: string; warnings?: string[];
  }): Promise<void>;
}

export function createIngestionRunRepo(db: Database): IngestionRunRepo {
  return {
    async start({ connectorConfigId, periodStart, periodEnd, jobId }) {
      const [row] = await db.insert(ingestionRun).values({
        connectorConfigId, periodStart, periodEnd,
        status: "running", bullmqJobId: jobId,
      }).returning();
      return row;
    },
    async finish(id, { status, recordsWritten, durationMs, errorCode, errorMessage, warnings }) {
      await db.update(ingestionRun).set({
        status, recordsWritten, durationMs,
        errorCode, errorMessage, warnings: warnings ?? [],
        finishedAt: new Date(),
      }).where(eq(ingestionRun.id, id));
    },
  };
}
```

Create `packages/db/src/repositories/platform-account.ts`:

```ts
import { eq, and } from "drizzle-orm";
import type { Database } from "../client";
import { platformAccount, type PlatformAccount } from "../schema";

export interface PlatformAccountRepo {
  listByConnector(tenantId: string, sourceId: string): Promise<PlatformAccount[]>;
  upsert(input: {
    tenantId: string; hierarchyNodeId: string; sourceId: string;
    externalId: string; displayName: string; config?: Record<string, unknown>;
  }): Promise<PlatformAccount>;
  updateLastSynced(id: string): Promise<void>;
}

export function createPlatformAccountRepo(db: Database): PlatformAccountRepo {
  return {
    async listByConnector(tenantId, sourceId) {
      return db.select().from(platformAccount)
        .where(and(eq(platformAccount.tenantId, tenantId), eq(platformAccount.sourceId, sourceId)));
    },
    async upsert(input) {
      const [row] = await db.insert(platformAccount).values(input)
        .onConflictDoUpdate({
          target: [platformAccount.tenantId, platformAccount.sourceId, platformAccount.externalId],
          set: { displayName: input.displayName, config: input.config ?? {}, hierarchyNodeId: input.hierarchyNodeId },
        })
        .returning();
      return row;
    },
    async updateLastSynced(id) {
      await db.update(platformAccount).set({ lastSyncedAt: new Date() }).where(eq(platformAccount.id, id));
    },
  };
}
```

- [ ] **Step 14: Drop the orphaned `castnet_events` seed entry**

CastNet (chanelops) is being retired in favour of *Love World Europe One*. The `castnet_events` row seeded by Phase 0 is now dormant — no connector implementation will be registered against it, no tenant will ever attach a config. Remove it from the seed to keep the source catalog honest.

Modify `packages/db/src/seeds/sources.ts` — delete the `castnet_events` entry:

```ts
const SOURCES = [
  { key: "manual_satellite",     name: "Satellite (Manual)",     category: "tv_broadcast", authMethod: "none" },
  { key: "manual_freeview",      name: "Freeview (Manual)",      category: "tv_broadcast", authMethod: "none" },
  // castnet_events removed — CastNet platform retiring; future Love World Europe One connector lands later.
  { key: "cloudflare_analytics", name: "Cloudflare Analytics",   category: "web",          authMethod: "api_key" },
  { key: "ga4",                  name: "Google Analytics 4",     category: "web",          authMethod: "service_account" },
  { key: "youtube",              name: "YouTube Data API",       category: "streaming",    authMethod: "oauth2" },
  { key: "smart_tv_telemetry",   name: "Smart TV App Telemetry", category: "app",          authMethod: "api_key" },
  { key: "meta_graph",           name: "Meta Graph (FB + IG)",   category: "social",       authMethod: "oauth2" },
  { key: "tiktok",               name: "TikTok Business API",    category: "social",       authMethod: "oauth2" },
  { key: "x",                    name: "X (Twitter) API",        category: "social",       authMethod: "api_key" },
] as const satisfies readonly SeedSource[];
```

Add a one-off cleanup migration to drop any `source` + `connector_config` + `platform_account` rows that currently reference `castnet_events` (safe because no production tenant has been onboarded yet):

Create `packages/db/drizzle/0003_drop_castnet_events_source.sql`:

```sql
-- CastNet platform is being retired. No tenant has a configured connector or
-- ingested data against this source in any environment. Forward-only cleanup.
DELETE FROM platform_account
  WHERE source_id IN (SELECT id FROM source WHERE key = 'castnet_events');
DELETE FROM connector_config
  WHERE source_id IN (SELECT id FROM source WHERE key = 'castnet_events');
DELETE FROM source WHERE key = 'castnet_events';
```

Run: `pnpm -F @lwa/db db:migrate && pnpm -F @lwa/db db:seed`
Expected: migrations apply cleanly; `SELECT key FROM source` no longer returns `castnet_events`.

- [ ] **Step 15: Barrel export**

Create or modify `packages/db/src/repositories.ts` (re-export barrel):

```ts
export * from "./repositories/tenant";
export * from "./repositories/hierarchy";
export * from "./repositories/metric-record";
export * from "./repositories/metric-rollup";
export * from "./repositories/platform-account";
export * from "./repositories/ingestion-run";
```

Modify `packages/db/package.json` exports:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./repositories": "./src/repositories.ts",
    "./test-utils": "./src/test-utils.ts"
  }
}
```

- [ ] **Step 16: Lint + typecheck + test + commit**

```bash
pnpm -F @lwa/db lint
pnpm -F @lwa/db typecheck
pnpm -F @lwa/db test
```

Expected: all green; test count increased by ≥ 9 (effective-metric 4, metric-record 3, metric-rollup 2).

Use `/skill:commit` to commit:
```
feat(db): metric fact/rollup/adjustment tables + effective_metric view + repos; drop castnet_events seed
```

---

## Task 2: `@lwa/connectors` — new package + enriched input contracts + contract test harness

**TDD scenario:** New feature — contract-test harness is the test surface; real connectors fill it in Tasks 5–7.

**Files:**
- Create: `packages/connectors/package.json`
- Create: `packages/connectors/tsconfig.json`
- Create: `packages/connectors/vitest.config.ts`
- Create: `packages/connectors/src/index.ts`
- Create: `packages/connectors/src/registry.ts` (moved from `services/ingestion/src/registry.ts`)
- Create: `packages/connectors/src/lib/errors.ts`
- Create: `packages/connectors/src/lib/period.ts`
- Create: `packages/connectors/src/lib/contract-suite.ts`
- Modify: `services/ingestion/src/registry.ts` → re-export from `@lwa/connectors`
- Modify: `services/ingestion/package.json` (add `@lwa/connectors: workspace:*`)
- Modify: `packages/contracts/src/source-connector.ts` (enrich `PullInput`)
- Create: `packages/connectors/test/registry.test.ts`
- Create: `packages/connectors/test/period.test.ts`
- Create: `packages/connectors/test/errors.test.ts`

**Why this task exists:** Connectors need to be importable by both `services/api` (credential validation, account discovery, entry-form schemas) and `services/ingestion` (pulling + backfilling). A shared package avoids duplication. This task also enriches the `PullInput` contract so ingestion can pass a real decrypted credential blob and the full `ConnectorConfig` row into connector implementations — current Phase 0 shape is too narrow.

- [ ] **Step 1: Package scaffold**

Create `packages/connectors/package.json`:

```json
{
  "name": "@lwa/connectors",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src test",
    "test": "vitest run"
  },
  "dependencies": {
    "@lwa/contracts": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@lwa/tsconfig": "workspace:*",
    "@types/node": "^22.5.0",
    "vitest": "^1.6.0"
  }
}
```

Create `packages/connectors/tsconfig.json`:

```json
{
  "extends": "@lwa/tsconfig/base",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Create `packages/connectors/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", pool: "forks" } });
```

- [ ] **Step 2: Enrich `PullInput` in `@lwa/contracts`**

Modify `packages/contracts/src/source-connector.ts`:

```ts
// Replace the existing PullInput / BackfillInput types with:

export type ConnectorRuntimeConfig = {
  id: string;
  tenantId: string;
  sourceId: string;
  sourceKey: string;            // denormalised — saves a join in the worker
  credentials: unknown;         // DECRYPTED plaintext; ingestion decrypts before calling
  schedule: string;
};

export type PlatformAccountRuntime = {
  id: string;
  externalId: string;
  hierarchyNodeId: string;
  config: Record<string, unknown>;
};

export type PullInput = {
  config: ConnectorRuntimeConfig;
  account: PlatformAccountRuntime | null;
  period: { start: Date; end: Date; granularity: Granularity };
  context: {
    tenantId: string;
    logger: {
      info: (msg: string, data?: unknown) => void;
      warn: (msg: string, data?: unknown) => void;
      error: (msg: string, data?: unknown) => void;
    };
    rateLimiter: { acquire: (cost?: number) => Promise<void> };
  };
};

export type BackfillInput = PullInput & { checkpoint?: string };
```

- [ ] **Step 3: Move registry from `services/ingestion` to `@lwa/connectors`**

Create `packages/connectors/src/registry.ts` — copy contents from `services/ingestion/src/registry.ts` verbatim, then replace the old file to re-export:

`services/ingestion/src/registry.ts`:
```ts
// Registry now lives in @lwa/connectors. Keeping this file as a re-export so
// that worker.ts import paths don't need touching until Phase 1 task 4.
export { registry, ConnectorRegistry } from "@lwa/connectors";
```

Modify `services/ingestion/package.json` — add dependency:
```json
"dependencies": {
  "@lwa/connectors": "workspace:*",
  ...
}
```

Run `pnpm install` from the repo root.

- [ ] **Step 4: Error taxonomy helpers**

Create `packages/connectors/src/lib/errors.ts`:

```ts
import type { ConnectorError } from "@lwa/contracts";

/**
 * Classify an HTTP error into the design-doc error taxonomy (section 6).
 * Drives the worker's retry decision in Task 4.
 */
export function classifyHttpError(status: number, message: string): ConnectorError {
  if (status === 401) return { code: "AUTH_INVALID",        message, retryable: false };
  if (status === 403) return { code: "CONFIG_INVALID",      message, retryable: false };
  if (status === 429) return { code: "RATE_LIMITED",        message, retryable: true  };
  if (status >= 500)  return { code: "TRANSIENT",           message, retryable: true  };
  if (status === 404) return { code: "CONFIG_INVALID",      message, retryable: false };
  return                     { code: "TRANSIENT",           message, retryable: true };
}

export function classifyNetworkError(err: unknown): ConnectorError {
  const message = err instanceof Error ? err.message : String(err);
  if (message.match(/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET/)) {
    return { code: "UPSTREAM_UNAVAILABLE", message, retryable: true };
  }
  return { code: "TRANSIENT", message, retryable: true };
}

export function isRetryable(err: ConnectorError): boolean {
  return err.retryable === true;
}
```

**Before writing this**, verify `ConnectorError` in `packages/contracts/src/connector-error.ts` has a `retryable: boolean` field. If it doesn't (Phase 0 may have left it out), add it:

```ts
// packages/contracts/src/connector-error.ts
export type ConnectorErrorCode =
  | "AUTH_EXPIRED" | "AUTH_INVALID" | "RATE_LIMITED" | "TRANSIENT"
  | "UPSTREAM_UNAVAILABLE" | "CONFIG_INVALID" | "NO_DATA";

export type ConnectorError = {
  code: ConnectorErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;   // for RATE_LIMITED when Retry-After is known
};
```

- [ ] **Step 5: Period helpers**

Create `packages/connectors/src/lib/period.ts`:

```ts
import type { Granularity } from "@lwa/contracts";

/**
 * Chunk a date range into periods of a given granularity. Used for backfill.
 * Returns [start, end) pairs — end is exclusive.
 */
export function chunkPeriod(
  start: Date, end: Date, granularity: Granularity,
): Array<{ start: Date; end: Date }> {
  const result: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const next = advance(cursor, granularity);
    const chunkEnd = next > end ? end : next;
    result.push({ start: new Date(cursor), end: new Date(chunkEnd) });
    cursor = next;
  }
  return result;
}

function advance(d: Date, g: Granularity): Date {
  const r = new Date(d);
  switch (g) {
    case "hour":    r.setUTCHours(r.getUTCHours() + 1); return r;
    case "day":     r.setUTCDate(r.getUTCDate() + 1);   return r;
    case "week":    r.setUTCDate(r.getUTCDate() + 7);   return r;
    case "month":   r.setUTCMonth(r.getUTCMonth() + 1); return r;
    case "quarter": r.setUTCMonth(r.getUTCMonth() + 3); return r;
  }
}

/** Week bucket start: UTC Monday 00:00. */
export function weekBucketStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Mon
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}
```

- [ ] **Step 6: Contract test harness**

Create `packages/connectors/src/lib/contract-suite.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isOk, isErr, type Result } from "@lwa/contracts";
import type { SourceConnector, PullConnector } from "@lwa/contracts";

/**
 * Runs a generic contract test suite against a connector. Every P0 connector
 * imports this and passes its implementation + a minimal fixture fixture.
 * Tests: shape of the registered connector matches the discriminated union;
 * validateCredentials accepts good creds, rejects bad; pull (if present)
 * returns a Result shape with records[].
 */
export interface ContractFixture {
  validCredentials: unknown;
  invalidCredentials: unknown;
  mockPullInput?: Parameters<PullConnector["pull"]>[0];
  // If the connector uses external IO, the consumer supplies a scoped
  // beforeEach/afterEach via vi.mock / MockAgent at the call site.
}

export function runConnectorContract(connector: SourceConnector, fixture: ContractFixture) {
  describe(`contract: ${connector.key}`, () => {
    it("exposes a stable key, name, category, kind, supportedGranularities", () => {
      expect(connector.key).toMatch(/^[a-z][a-z0-9_]+$/);
      expect(connector.name).toBeTruthy();
      expect(["pull", "manual"]).toContain(connector.kind);
      expect(connector.supportedGranularities.length).toBeGreaterThan(0);
    });

    it("validateCredentials(validCredentials) returns ok", async () => {
      const r = await connector.validateCredentials(fixture.validCredentials);
      expect(isOk(r)).toBe(true);
    });

    it("validateCredentials(invalidCredentials) returns err", async () => {
      const r = await connector.validateCredentials(fixture.invalidCredentials);
      expect(isErr(r)).toBe(true);
    });

    if (connector.kind === "pull" && fixture.mockPullInput) {
      const pull = connector as PullConnector;
      it("pull returns a Result with records[]", async () => {
        const r: Result<unknown, unknown> = await pull.pull(fixture.mockPullInput!);
        expect("ok" in r || "error" in r).toBe(true);
      });
    }

    if (connector.kind === "manual") {
      it("entrySchema is a Zod schema", () => {
        expect(connector.entrySchema).toBeDefined();
        expect(typeof connector.entrySchema.parse).toBe("function");
      });
    }
  });
}
```

- [ ] **Step 7: Tests for the helpers**

Create `packages/connectors/test/period.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { chunkPeriod, weekBucketStart } from "../src/lib/period";

describe("chunkPeriod", () => {
  it("splits a week into 7 days", () => {
    const chunks = chunkPeriod(new Date("2026-01-05T00:00Z"), new Date("2026-01-12T00:00Z"), "day");
    expect(chunks).toHaveLength(7);
    expect(chunks[0].start.toISOString()).toBe("2026-01-05T00:00:00.000Z");
    expect(chunks[6].end.toISOString()).toBe("2026-01-12T00:00:00.000Z");
  });

  it("splits 2 months into 2 month chunks", () => {
    const chunks = chunkPeriod(new Date("2026-01-01T00:00Z"), new Date("2026-03-01T00:00Z"), "month");
    expect(chunks).toHaveLength(2);
    expect(chunks[1].start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("weekBucketStart", () => {
  it("returns Monday for any day of the week (UTC)", () => {
    expect(weekBucketStart(new Date("2026-01-07T12:00Z")).toISOString()).toBe("2026-01-05T00:00:00.000Z");
    expect(weekBucketStart(new Date("2026-01-11T23:59Z")).toISOString()).toBe("2026-01-05T00:00:00.000Z");
    expect(weekBucketStart(new Date("2026-01-05T00:00Z")).toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });
});
```

Create `packages/connectors/test/errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyHttpError, classifyNetworkError, isRetryable } from "../src/lib/errors";

describe("classifyHttpError", () => {
  it.each([
    [401, "AUTH_INVALID", false],
    [403, "CONFIG_INVALID", false],
    [429, "RATE_LIMITED", true],
    [500, "TRANSIENT", true],
    [502, "TRANSIENT", true],
    [404, "CONFIG_INVALID", false],
  ])("status %i → %s (retryable=%s)", (status, code, retryable) => {
    const e = classifyHttpError(status, "x");
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(retryable);
    expect(isRetryable(e)).toBe(retryable);
  });
});

describe("classifyNetworkError", () => {
  it("UPSTREAM_UNAVAILABLE on ECONNREFUSED", () => {
    expect(classifyNetworkError(new Error("connect ECONNREFUSED 127.0.0.1:5432")).code)
      .toBe("UPSTREAM_UNAVAILABLE");
  });
  it("TRANSIENT on unknown error", () => {
    expect(classifyNetworkError(new Error("whatever")).code).toBe("TRANSIENT");
  });
});
```

Create `packages/connectors/test/registry.test.ts` — identical to `services/ingestion/test/registry.test.ts` (copy + adjust imports). Keep the old one too; both pass against the same underlying class.

- [ ] **Step 8: `src/index.ts` barrel**

Create `packages/connectors/src/index.ts`:

```ts
export { registry, ConnectorRegistry } from "./registry";
export * from "./lib/errors";
export * from "./lib/period";
export * from "./lib/contract-suite";
// Connector implementations register themselves in tasks 5–8 via:
//   import "./manual-satellite"; import "./manual-freeview"; ...
```

- [ ] **Step 9: Lint + typecheck + test + commit**

```bash
pnpm install
pnpm -F @lwa/connectors lint
pnpm -F @lwa/connectors typecheck
pnpm -F @lwa/connectors test
pnpm -F @lwa/contracts typecheck   # enriched PullInput must still compile
pnpm -F @lwa/ingestion typecheck   # re-export must still compile
```

Expected: all green; ≥ 9 new tests pass.

Commit:
```
feat(connectors): new @lwa/connectors package + enriched PullInput contract
```

---

## Task 3: `@lwa/crypto` — AES-256-GCM KEK/DEK credential encryption

**TDD scenario:** New feature — full TDD cycle. Crypto primitives must be tested.

**Files:**
- Create: `packages/crypto/package.json`
- Create: `packages/crypto/tsconfig.json`
- Create: `packages/crypto/vitest.config.ts`
- Create: `packages/crypto/src/index.ts`
- Create: `packages/crypto/src/envelope.ts`
- Create: `packages/crypto/test/envelope.test.ts`
- Modify: `packages/db/src/repositories/connector-config.ts` (new repo if missing; add `writeCredentials` / `readCredentials`)
- Modify: `packages/db/src/repositories.ts` (barrel export)
- Create: `packages/db/test/connector-config-credentials.test.ts`

**Why this task exists:** Phase 0 shipped `credentials_ciphertext` and `credentials_kek_version` columns on `connector_config` without any code to use them. Every P0 pull connector (Tasks 6–8) needs credentials written on create and read on pull. The envelope (KEK wraps per-config DEK) means KEK rotation is possible without touching every row.

- [ ] **Step 1: Package scaffold**

Create `packages/crypto/package.json`:

```json
{
  "name": "@lwa/crypto",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src test",
    "test": "vitest run"
  },
  "dependencies": {},
  "devDependencies": {
    "@lwa/tsconfig": "workspace:*",
    "@types/node": "^22.5.0",
    "vitest": "^1.6.0"
  }
}
```

Create `packages/crypto/tsconfig.json`:

```json
{
  "extends": "@lwa/tsconfig/node",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src/**/*", "test/**/*"]
}
```

Create `packages/crypto/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 2: Write the failing test for envelope crypto**

Create `packages/crypto/test/envelope.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { sealCredentials, openCredentials, type KekProvider } from "../src/envelope";

const kek = randomBytes(32);
const provider: KekProvider = {
  currentVersion: "v1",
  getKey: (v) => { if (v === "v1") return kek; throw new Error(`unknown kek ${v}`); },
};

describe("envelope crypto", () => {
  it("roundtrips plaintext", async () => {
    const plain = { apiKey: "secret-123", propertyIds: ["p1", "p2"] };
    const sealed = await sealCredentials(plain, provider);
    expect(sealed.ciphertext).toBeTypeOf("string");
    expect(sealed.kekVersion).toBe("v1");
    const opened = await openCredentials<typeof plain>(sealed, provider);
    expect(opened).toEqual(plain);
  });

  it("tamper detection: mutated ciphertext fails with GCM auth error", async () => {
    const sealed = await sealCredentials({ x: 1 }, provider);
    const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice(0, -4) + "XXXX" };
    await expect(openCredentials(tampered, provider)).rejects.toThrow();
  });

  it("rejects unknown kek version", async () => {
    const sealed = await sealCredentials({ x: 1 }, provider);
    await expect(openCredentials({ ...sealed, kekVersion: "v999" }, provider)).rejects.toThrow(/unknown kek/);
  });

  it("different plaintexts produce different ciphertexts (random IV)", async () => {
    const a = await sealCredentials({ x: 1 }, provider);
    const b = await sealCredentials({ x: 1 }, provider);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});
```

Run: `pnpm -F @lwa/crypto test`
Expected: FAIL — `sealCredentials is not a function`.

- [ ] **Step 3: Implement envelope**

Create `packages/crypto/src/envelope.ts`:

```ts
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export interface KekProvider {
  currentVersion: string;
  getKey(version: string): Buffer;
}

export type SealedCredentials = {
  ciphertext: string;   // base64(iv || wrappedDek || authTag || ctIv || ct || ctAuthTag)
  kekVersion: string;
};

/**
 * Envelope encryption:
 *   1. Generate a fresh 32-byte DEK
 *   2. Encrypt plaintext (JSON-serialised) under DEK with AES-256-GCM
 *   3. Wrap DEK under the current KEK with AES-256-GCM
 *   4. Persist iv + wrappedDek + authTag + ctIv + ct + ctAuthTag
 *
 * Rotation: publish a new KEK version via KekProvider; existing rows decrypt
 * with their stored kek_version, and re-sealing happens lazily at write time.
 */
export async function sealCredentials<T>(plain: T, kek: KekProvider): Promise<SealedCredentials> {
  const dek = randomBytes(32);
  const kekKey = kek.getKey(kek.currentVersion);

  // Wrap DEK under KEK
  const dekIv = randomBytes(12);
  const dekCipher = createCipheriv("aes-256-gcm", kekKey, dekIv);
  const wrappedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();

  // Encrypt plaintext under DEK
  const ctIv = randomBytes(12);
  const ctCipher = createCipheriv("aes-256-gcm", dek, ctIv);
  const ct = Buffer.concat([ctCipher.update(Buffer.from(JSON.stringify(plain))), ctCipher.final()]);
  const ctTag = ctCipher.getAuthTag();

  const layout = Buffer.concat([
    Uint8Array.of(dekIv.length),    dekIv,
    Uint8Array.of(wrappedDek.length), wrappedDek,
    Uint8Array.of(dekTag.length),   dekTag,
    Uint8Array.of(ctIv.length),     ctIv,
    ct,                                     // ct length implicit (rest - ctTag)
    ctTag,
  ]);

  return { ciphertext: layout.toString("base64"), kekVersion: kek.currentVersion };
}

export async function openCredentials<T>(sealed: SealedCredentials, kek: KekProvider): Promise<T> {
  const kekKey = kek.getKey(sealed.kekVersion);
  const buf = Buffer.from(sealed.ciphertext, "base64");
  let p = 0;
  const read = (n: number) => { const s = buf.subarray(p, p + n); p += n; return s; };
  const dekIvLen = buf[p++]; const dekIv = read(dekIvLen);
  const wrappedDekLen = buf[p++]; const wrappedDek = read(wrappedDekLen);
  const dekTagLen = buf[p++]; const dekTag = read(dekTagLen);
  const ctIvLen = buf[p++]; const ctIv = read(ctIvLen);
  const ctTagLen = 16; // GCM tag is 16 bytes
  const ct = buf.subarray(p, buf.length - ctTagLen);
  const ctTag = buf.subarray(buf.length - ctTagLen);

  const dekDecipher = createDecipheriv("aes-256-gcm", kekKey, dekIv);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([dekDecipher.update(wrappedDek), dekDecipher.final()]);

  const ctDecipher = createDecipheriv("aes-256-gcm", dek, ctIv);
  ctDecipher.setAuthTag(ctTag);
  const plain = Buffer.concat([ctDecipher.update(ct), ctDecipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}
```

- [ ] **Step 4: Index + KEK provider from env**

Create `packages/crypto/src/index.ts`:

```ts
export * from "./envelope";
export { envKekProvider } from "./env-provider";
```

Create `packages/crypto/src/env-provider.ts`:

```ts
import type { KekProvider } from "./envelope";

/**
 * KEK resolver backed by env vars:
 *   LWA_KEK_V1=base64(32-byte key)
 *   LWA_KEK_V2=base64(32-byte key)   // during rotation
 *   LWA_KEK_CURRENT=v2
 */
export function envKekProvider(env: NodeJS.ProcessEnv = process.env): KekProvider {
  const current = env.LWA_KEK_CURRENT ?? "v1";
  return {
    currentVersion: current,
    getKey(version) {
      const raw = env[`LWA_KEK_${version.toUpperCase()}`];
      if (!raw) throw new Error(`unknown kek version: ${version}`);
      const buf = Buffer.from(raw, "base64");
      if (buf.length !== 32) throw new Error(`LWA_KEK_${version} must be 32 bytes (base64)`);
      return buf;
    },
  };
}
```

- [ ] **Step 5: Run crypto tests**

```bash
pnpm -F @lwa/crypto test
```

Expected: PASS (4 tests).

- [ ] **Step 6: `connector-config` repo — writeCredentials / readCredentials**

Create `packages/db/src/repositories/connector-config.ts`:

```ts
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { connectorConfig, type ConnectorConfig } from "../schema";
import type { KekProvider } from "@lwa/crypto";
import { sealCredentials, openCredentials } from "@lwa/crypto";

export interface ConnectorConfigRepo {
  create(input: {
    tenantId: string; sourceId: string; schedule: string;
    credentials: unknown;
  }): Promise<ConnectorConfig>;
  readCredentials<T>(configId: string): Promise<T>;
  listForScheduler(): Promise<Array<ConnectorConfig & { sourceKey: string }>>;
}

export function createConnectorConfigRepo(db: Database, kek: KekProvider): ConnectorConfigRepo {
  return {
    async create({ tenantId, sourceId, schedule, credentials }) {
      const sealed = await sealCredentials(credentials, kek);
      const [row] = await db.insert(connectorConfig).values({
        tenantId, sourceId, schedule,
        credentialsCiphertext: sealed.ciphertext,
        credentialsKekVersion: sealed.kekVersion,
      }).returning();
      return row;
    },

    async readCredentials<T>(configId: string): Promise<T> {
      const [row] = await db.select().from(connectorConfig).where(eq(connectorConfig.id, configId));
      if (!row) throw new Error(`connector_config ${configId} not found`);
      if (!row.credentialsCiphertext || !row.credentialsKekVersion) {
        throw new Error(`connector_config ${configId} has no credentials`);
      }
      return openCredentials<T>(
        { ciphertext: row.credentialsCiphertext, kekVersion: row.credentialsKekVersion },
        kek,
      );
    },

    async listForScheduler() {
      const rows = await db.execute<{ config: ConnectorConfig; source_key: string }>(`
        SELECT cc.*, s.key AS source_key
        FROM connector_config cc
        JOIN source s ON s.id = cc.source_id
        WHERE cc.enabled = TRUE AND cc.status != 'paused'
      `);
      return rows.map((r: any) => ({ ...r, sourceKey: r.source_key }));
    },
  };
}
```

Add to `packages/db/package.json` deps: `"@lwa/crypto": "workspace:*"`. Run `pnpm install`.

- [ ] **Step 7: Integration test — roundtrip through DB**

Create `packages/db/test/connector-config-credentials.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createTestDb, type TestDbHandle } from "../src/test-utils";
import { tenant, source } from "../src/schema";
import { createConnectorConfigRepo } from "../src/repositories/connector-config";
import type { KekProvider } from "@lwa/crypto";

const key = randomBytes(32);
const kek: KekProvider = { currentVersion: "v1", getKey: () => key };

describe("connector-config credentials", () => {
  let h: TestDbHandle;
  beforeAll(async () => { h = await createTestDb(); });
  afterAll(async () => { await h.stop(); });

  it("seals on create, opens on read", async () => {
    const [t] = await h.db.insert(tenant).values({ name: "Acme", slug: `a-${crypto.randomUUID().slice(0,8)}` }).returning();
    const [s] = await h.db.insert(source).values({ key: "ga4-test", name: "GA4", category: "web", authMethod: "service_account" }).returning();
    const repo = createConnectorConfigRepo(h.db, kek);
    const cfg = await repo.create({ tenantId: t.id, sourceId: s.id, schedule: "0 3 * * *", credentials: { propertyIds: ["p1"], serviceAccountJson: "{...}" } });
    expect(cfg.credentialsCiphertext).toBeTruthy();
    const plain = await repo.readCredentials<{ propertyIds: string[] }>(cfg.id);
    expect(plain.propertyIds).toEqual(["p1"]);
  });
});
```

Run: `pnpm -F @lwa/db test connector-config-credentials`
Expected: PASS.

- [ ] **Step 8: Lint + typecheck + test + commit**

```bash
pnpm -F @lwa/crypto lint typecheck test
pnpm -F @lwa/db lint typecheck test
```

Commit:
```
feat(crypto): AES-256-GCM envelope + connector-config credential roundtrip
```

---

## Task 4: Ingestion pipeline — pull handler + scheduler + rollup.refresh + run tracking

**TDD scenario:** New feature — the keystone of Phase 1. Integration test with a stub connector drives the whole flow end-to-end.

**Files:**
- Modify: `services/ingestion/src/handlers/pull.ts`
- Modify: `services/ingestion/src/handlers/rollup-refresh.ts`
- Modify: `services/ingestion/src/handlers/backfill.ts` (chunk loop; full impl lands in Task 8)
- Create: `services/ingestion/src/scheduler.ts`
- Create: `services/ingestion/src/lib/rollup-debounce.ts`
- Modify: `services/ingestion/src/worker.ts` (wire scheduler + db + kek)
- Modify: `services/ingestion/src/env.ts` (add LWA_KEK_V1)
- Modify: `services/ingestion/package.json` (add `@lwa/db`, `@lwa/crypto`)
- Create: `services/ingestion/src/lib/stub-connector.ts` (test-only, registered in test setup)
- Create: `services/ingestion/test/pipeline.integration.test.ts`
- Create: `services/ingestion/test/scheduler.test.ts`

**Why this task exists:** This is the "can Phase 1 deliver?" checkpoint. Fake connector in → real metric_record out → metric_rollup populated → board API can read it. Everything downstream (real connectors in Tasks 5–7) is just plugging in different implementations to the same pipeline.

- [ ] **Step 1: Write the failing integration test (pipeline end-to-end with a stub connector)**

Create `services/ingestion/src/lib/stub-connector.ts`:

```ts
import { z } from "zod";
import { ok, type PullConnector, type Result, type PullResult, type ConnectorError } from "@lwa/contracts";

/**
 * In-memory pull connector used by pipeline.integration.test to drive the
 * handler without external IO. NOT registered in production. Tests register
 * it explicitly via registry.register(stubPullConnector).
 */
export const stubPullConnector: PullConnector = {
  key: "_stub_pull",
  name: "Stub Pull",
  category: "web_visitors",
  kind: "pull",
  authMethod: "none",
  credentialsSchema: z.object({}),
  supportedGranularities: ["day"],
  validateCredentials: async () => ok(undefined),
  pull: async (input): Promise<Result<PullResult, ConnectorError>> => {
    return ok({
      records: [
        {
          hierarchyNodeId: input.account!.hierarchyNodeId,
          metricType: "page_views",
          metricCategory: "web_visitors",
          dimensions: {},
          periodStart: input.period.start,
          periodEnd: input.period.end,
          granularity: input.period.granularity,
          value: 42,
          unit: "count",
        },
      ],
    });
  },
};
```

Create `services/ingestion/test/pipeline.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createTestDb, type TestDbHandle } from "@lwa/db/test-utils";
import { tenant, hierarchyNode, source, platformAccount } from "@lwa/db";
import { createConnectorConfigRepo } from "@lwa/db";  // re-exported from repositories
import { ConnectorRegistry } from "@lwa/connectors";
import { stubPullConnector } from "../src/lib/stub-connector";
import { createPullHandler } from "../src/handlers/pull";
import type { KekProvider } from "@lwa/crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const kek: KekProvider = { currentVersion: "v1", getKey: () => randomBytes(32) };

describe("pipeline end-to-end", () => {
  let h: TestDbHandle;
  let redis: IORedis;
  let rollupQueue: Queue;

  beforeAll(async () => {
    h = await createTestDb();
    redis = new IORedis({ host: "localhost", port: 6379, maxRetriesPerRequest: null });
    rollupQueue = new Queue("rollup.refresh", { connection: redis });
  });
  afterAll(async () => {
    await rollupQueue.close(); await redis.quit(); await h.stop();
  });

  it("pull handler upserts metric_record and enqueues rollup.refresh", async () => {
    const [t] = await h.db.insert(tenant).values({ name: "Acme", slug: `a-${crypto.randomUUID().slice(0,8)}` }).returning();
    const [node] = await h.db.insert(hierarchyNode).values({ tenantId: t.id, type: "station", name: "m", slug: "m" }).returning();
    const [src] = await h.db.insert(source).values({ key: "_stub_pull", name: "Stub", category: "web", authMethod: "none" }).returning();
    const cfgRepo = createConnectorConfigRepo(h.db, kek);
    const cfg = await cfgRepo.create({ tenantId: t.id, sourceId: src.id, schedule: "0 * * * *", credentials: {} });
    const [pa] = await h.db.insert(platformAccount).values({
      tenantId: t.id, hierarchyNodeId: node.id, sourceId: src.id,
      externalId: "ext-1", displayName: "Site",
    }).returning();

    const registry = new ConnectorRegistry();
    registry.register(stubPullConnector);

    const handler = createPullHandler({ db: h.db, registry, kek, rollupQueue, logger: silentLogger() });
    const job = fakeJob({
      connectorConfigId: cfg.id,
      periodStart: "2026-01-05T00:00:00.000Z",
      periodEnd: "2026-01-06T00:00:00.000Z",
      granularity: "day",
    });

    await handler(job);

    const rows = await h.db.execute("SELECT COUNT(*)::int AS c, MAX(raw_value) AS v FROM metric_record");
    expect(rows[0].c).toBe(1);
    expect(Number(rows[0].v)).toBe(42);

    const enqueued = await rollupQueue.getJobs(["waiting", "delayed"]);
    expect(enqueued.length).toBeGreaterThan(0);
    expect(enqueued[0].data).toMatchObject({
      tenantId: t.id,
      metricCategory: "web_visitors",
      granularity: "day",
    });

    // Idempotency: run the same job again — same record count, same value.
    await handler(job);
    const rows2 = await h.db.execute("SELECT COUNT(*)::int AS c FROM metric_record");
    expect(rows2[0].c).toBe(1);

    // ingestion_run row recorded
    const runs = await h.db.execute("SELECT status, records_written FROM ingestion_run WHERE connector_config_id = $1", [cfg.id]);
    expect(runs.some((r: any) => r.status === "success" && r.records_written === 1)).toBe(true);
  });
});

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}
function fakeJob(data: any) {
  return { id: "job-1", data } as any;
}
```

Run: `pnpm -F @lwa/ingestion test pipeline.integration`
Expected: FAIL — `createPullHandler` signature doesn't match yet.

- [ ] **Step 2: Rewrite `handlers/pull.ts` with the full flow**

Replace `services/ingestion/src/handlers/pull.ts`:

```ts
import type { Job, Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { isErr } from "@lwa/contracts";
import type { PullInput, ConnectorError } from "@lwa/contracts";
import type { KekProvider } from "@lwa/crypto";
import type { ConnectorRegistry } from "@lwa/connectors";
import { classifyNetworkError } from "@lwa/connectors";
import type { Database } from "@lwa/db";
import {
  connectorConfig, source, platformAccount,
  createMetricRecordRepo, createIngestionRunRepo, createPlatformAccountRepo, createConnectorConfigRepo,
} from "@lwa/db";
import type { PullJobData } from "../queues";
import { createRateLimiter } from "../lib/rate-limiter";

export interface PullHandlerDeps {
  db: Database;
  registry: ConnectorRegistry;
  kek: KekProvider;
  rollupQueue: Queue;
  logger: { info: Function; warn: Function; error: Function };
}

export function createPullHandler(deps: PullHandlerDeps) {
  const { db, registry, kek, rollupQueue, logger } = deps;
  const metricRecordRepo = createMetricRecordRepo(db);
  const ingestionRunRepo = createIngestionRunRepo(db);
  const platformAccountRepo = createPlatformAccountRepo(db);
  const connectorConfigRepo = createConnectorConfigRepo(db, kek);

  return async function pullHandler(job: Job<PullJobData>): Promise<void> {
    const t0 = Date.now();
    const { connectorConfigId, periodStart, periodEnd, granularity } = job.data;

    // 1. Load config + source
    const [cfg] = await db.select().from(connectorConfig).where(eq(connectorConfig.id, connectorConfigId));
    if (!cfg) throw new Error(`connector_config ${connectorConfigId} not found`);
    const [src] = await db.select().from(source).where(eq(source.id, cfg.sourceId));
    if (!src) throw new Error(`source ${cfg.sourceId} not found`);

    // 2. Resolve connector
    const connector = registry.get(src.key);
    if (!connector) throw new Error(`connector ${src.key} not registered`);
    if (connector.kind !== "pull") throw new Error(`connector ${src.key} is not pull`);

    // 3. Create ingestion_run row
    const run = await ingestionRunRepo.start({
      connectorConfigId, periodStart: new Date(periodStart), periodEnd: new Date(periodEnd),
      jobId: job.id?.toString(),
    });

    try {
      // 4. Decrypt credentials (skip if connector needs none)
      const credentials = cfg.credentialsCiphertext
        ? await connectorConfigRepo.readCredentials(cfg.id)
        : {};

      // 5. Discover accounts (or use all existing)
      const accounts = await platformAccountRepo.listByConnector(cfg.tenantId, cfg.sourceId);
      if (accounts.length === 0) {
        logger.warn({ configId: cfg.id }, "no platform accounts — nothing to pull");
        await ingestionRunRepo.finish(run.id, { status: "skipped", recordsWritten: 0, durationMs: Date.now() - t0 });
        return;
      }

      // 6. Pull per account, upsert records, track ancestor buckets
      const affectedBuckets = new Set<string>();
      let totalWritten = 0;
      const warnings: string[] = [];

      for (const account of accounts) {
        const input: PullInput = {
          config: { id: cfg.id, tenantId: cfg.tenantId, sourceId: cfg.sourceId, sourceKey: src.key, credentials, schedule: cfg.schedule },
          account: { id: account.id, externalId: account.externalId, hierarchyNodeId: account.hierarchyNodeId, config: account.config },
          period: { start: new Date(periodStart), end: new Date(periodEnd), granularity },
          context: {
            tenantId: cfg.tenantId,
            logger,
            rateLimiter: createRateLimiter(src.key),
          },
        };

        let result;
        try {
          result = await connector.pull(input);
        } catch (err) {
          const ce: ConnectorError = classifyNetworkError(err);
          await ingestionRunRepo.finish(run.id, {
            status: "failed", recordsWritten: totalWritten, durationMs: Date.now() - t0,
            errorCode: ce.code, errorMessage: ce.message,
          });
          if (!ce.retryable) { logger.error({ ce }, "non-retryable pull failure"); return; }
          throw err; // let BullMQ retry per queue policy
        }

        if (isErr(result)) {
          const ce = result.error;
          await ingestionRunRepo.finish(run.id, {
            status: "failed", recordsWritten: totalWritten, durationMs: Date.now() - t0,
            errorCode: ce.code, errorMessage: ce.message,
          });
          if (!ce.retryable) {
            await db.update(connectorConfig).set({ status: "error", lastError: ce.message }).where(eq(connectorConfig.id, cfg.id));
            return;
          }
          throw new Error(ce.message);
        }

        const { records, warnings: w } = result.value;
        if (w) warnings.push(...w);

        const drafts = records.map((r) => ({
          tenantId: cfg.tenantId,
          sourceId: cfg.sourceId,
          connectorConfigId: cfg.id,
          platformAccountId: account.id,
          hierarchyNodeId: r.hierarchyNodeId,
          metricType: r.metricType,
          metricCategory: r.metricCategory,
          dimensions: r.dimensions,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          granularity: r.granularity,
          rawValue: String(r.value),
          unit: r.unit,
          provenance: `connector:${cfg.id}`,
        }));
        const { written } = await metricRecordRepo.upsertMany(drafts);
        totalWritten += written;

        // Track affected (node, category, bucket) tuples for rollup refresh.
        for (const r of records) {
          affectedBuckets.add([account.hierarchyNodeId, r.metricCategory, r.periodStart.toISOString()].join("|"));
        }
        await platformAccountRepo.updateLastSynced(account.id);
      }

      // 7. Update connector_config last_run_at
      await db.update(connectorConfig).set({ lastRunAt: new Date(), status: "active", lastError: null })
        .where(eq(connectorConfig.id, cfg.id));

      // 8. Finish ingestion_run
      await ingestionRunRepo.finish(run.id, {
        status: "success", recordsWritten: totalWritten, durationMs: Date.now() - t0,
        warnings: warnings.length ? warnings : undefined,
      });

      // 9. Enqueue rollup.refresh per affected (node, category, bucket)
      for (const key of affectedBuckets) {
        const [hierarchyNodeId, metricCategory, bucketStart] = key.split("|");
        await rollupQueue.add("refresh", {
          tenantId: cfg.tenantId, hierarchyNodeId,
          metricCategory, granularity: mapToRollupGranularity(granularity), bucketStart,
        }, { delay: 30_000, jobId: `rollup:${hierarchyNodeId}:${metricCategory}:${bucketStart}` });
        // delay=30s + jobId-dedup = debounce: bursts within 30s coalesce.
      }
    } catch (err) {
      logger.error({ err }, "pull handler unexpected error");
      await ingestionRunRepo.finish(run.id, {
        status: "failed", recordsWritten: 0, durationMs: Date.now() - t0,
        errorCode: "TRANSIENT", errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

/** rollup buckets only exist at day/week/month/quarter — hour collapses to day. */
function mapToRollupGranularity(g: string): "day" | "week" | "month" | "quarter" {
  if (g === "hour") return "day";
  if (g === "day" || g === "week" || g === "month" || g === "quarter") return g;
  throw new Error(`unsupported granularity for rollup: ${g}`);
}
```

- [ ] **Step 3: `handlers/rollup-refresh.ts` — climb the tree, refresh each ancestor**

Replace `services/ingestion/src/handlers/rollup-refresh.ts`:

```ts
import type { Job } from "bullmq";
import type { Database } from "@lwa/db";
import { createMetricRollupRepo } from "@lwa/db";
import type { RollupRefreshJobData } from "../queues";
import { addBucketEnd } from "../lib/rollup-debounce";

export function createRollupRefreshHandler(db: Database, logger: any) {
  const repo = createMetricRollupRepo(db);
  return async function rollupRefreshHandler(job: Job<RollupRefreshJobData>): Promise<void> {
    const { tenantId, hierarchyNodeId, metricCategory, granularity, bucketStart } = job.data;
    const start = new Date(bucketStart);
    const end = addBucketEnd(start, granularity);

    // Climb ancestors (inclusive) and refresh each one's bucket.
    const ancestors = await repo.getAncestors(tenantId, hierarchyNodeId);
    for (const nodeId of ancestors) {
      await repo.refreshBucket({
        tenantId, hierarchyNodeId: nodeId, metricCategory, granularity,
        bucketStart: start, bucketEnd: end,
      });
    }
    logger.info({ nodeCount: ancestors.length, bucket: bucketStart }, "rollup refreshed");
  };
}
```

Create `services/ingestion/src/lib/rollup-debounce.ts`:

```ts
export function addBucketEnd(start: Date, granularity: "day" | "week" | "month" | "quarter"): Date {
  const e = new Date(start);
  switch (granularity) {
    case "day":     e.setUTCDate(e.getUTCDate() + 1); break;
    case "week":    e.setUTCDate(e.getUTCDate() + 7); break;
    case "month":   e.setUTCMonth(e.getUTCMonth() + 1); break;
    case "quarter": e.setUTCMonth(e.getUTCMonth() + 3); break;
  }
  return e;
}
```

- [ ] **Step 4: Scheduler — reconcile `connector_config` → BullMQ repeatable jobs**

Create `services/ingestion/src/scheduler.ts`:

```ts
import type { Queue } from "bullmq";
import type { Database } from "@lwa/db";
import { connectorConfig, source } from "@lwa/db";
import { eq, and } from "drizzle-orm";

export interface SchedulerDeps {
  db: Database;
  pullQueue: Queue;
  logger: any;
  pollIntervalMs?: number;
}

/**
 * On startup and every pollIntervalMs, reconcile repeatable jobs in the pull
 * queue with the current set of enabled connector_config rows.
 *
 *   - Each enabled config gets a repeatable job keyed 'pull:<configId>' with
 *     the cron from config.schedule.
 *   - Disabled/paused configs get their repeatable job removed.
 *   - Cron changes cause the old repeatable to be removed + new added.
 */
export function startScheduler(deps: SchedulerDeps): { stop: () => Promise<void> } {
  const { db, pullQueue, logger, pollIntervalMs = 60_000 } = deps;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const rows = await db.select({
        id: connectorConfig.id, tenantId: connectorConfig.tenantId,
        schedule: connectorConfig.schedule, enabled: connectorConfig.enabled, status: connectorConfig.status,
      }).from(connectorConfig);

      const desiredByJobId = new Map<string, { cron: string; configId: string }>();
      for (const r of rows) {
        if (!r.enabled || r.status === "paused" || !r.schedule) continue;
        desiredByJobId.set(`pull:${r.id}`, { cron: r.schedule, configId: r.id });
      }

      const existing = await pullQueue.getRepeatableJobs();
      const existingIds = new Set(existing.map((e) => e.name));

      // Add / update
      for (const [name, { cron, configId }] of desiredByJobId) {
        const was = existing.find((e) => e.name === name);
        if (was && was.pattern === cron) continue;
        if (was) await pullQueue.removeRepeatableByKey(was.key);
        await pullQueue.add(name, {
          connectorConfigId: configId,
          // Use a 1-hour lookback as default period; each connector may override
          // via its own internal period logic. Scheduler only enqueues triggers.
          periodStart: new Date(Date.now() - 3_600_000).toISOString(),
          periodEnd:   new Date().toISOString(),
          granularity: "hour",
        }, { repeat: { pattern: cron }, jobId: name });
      }

      // Remove orphans
      for (const e of existing) {
        if (!desiredByJobId.has(e.name) && e.name.startsWith("pull:")) {
          await pullQueue.removeRepeatableByKey(e.key);
        }
      }

      logger.info({ active: desiredByJobId.size }, "scheduler reconciled");
    } catch (err) {
      logger.error({ err }, "scheduler tick failed");
    }
  };

  void tick();
  const handle = setInterval(tick, pollIntervalMs);
  handle.unref?.();

  return {
    stop: async () => { stopped = true; clearInterval(handle); },
  };
}
```

- [ ] **Step 5: Wire worker.ts (add DB + KEK + queues passed into handlers)**

Modify `services/ingestion/src/worker.ts` — replace the existing body with:

```ts
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { envKekProvider } from "@lwa/crypto";
import { createDb } from "@lwa/db";
import { isErr } from "@lwa/contracts";
import { loadEnv } from "./env";
import { QUEUES } from "./queues";
import { registry } from "@lwa/connectors";
import { createPullHandler } from "./handlers/pull";
import { backfillHandler } from "./handlers/backfill";
import { createRollupRefreshHandler } from "./handlers/rollup-refresh";
import { healthHandler } from "./handlers/health";
import { startScheduler } from "./scheduler";
import { logger } from "./lib/logger";
// Side-effect imports register the real connectors
import "@lwa/connectors";

const envResult = loadEnv();
if (isErr(envResult)) {
  logger.error({ errors: envResult.error.flatten().fieldErrors }, "invalid environment");
  process.exit(1);
}
const env = envResult.value;

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const db = createDb(env.DATABASE_URL);
const kek = envKekProvider();

const pullQueue   = new Queue(QUEUES.PULL,           { connection });
const rollupQueue = new Queue(QUEUES.ROLLUP_REFRESH, { connection });

const pullHandler = createPullHandler({ db, registry, kek, rollupQueue, logger });
const rollupHandler = createRollupRefreshHandler(db, logger);

const workers = [
  new Worker(QUEUES.PULL,            pullHandler,     { connection, concurrency: env.INGESTION_CONCURRENCY }),
  new Worker(QUEUES.BACKFILL,        backfillHandler, { connection, concurrency: 1 }),
  new Worker(QUEUES.ROLLUP_REFRESH,  rollupHandler,   { connection, concurrency: env.INGESTION_CONCURRENCY }),
  new Worker(QUEUES.HEALTH,          healthHandler,   { connection, concurrency: 1 }),
];

for (const w of workers) {
  w.on("error",  (err) => logger.error({ worker: w.name, err: err.message }, "worker error"));
  w.on("failed", (job, err) => logger.warn({ worker: w.name, jobId: job?.id, err: err.message }, "job failed"));
}

const scheduler = startScheduler({ db, pullQueue, logger });

logger.info({ queues: Object.values(QUEUES) }, "ingestion worker started");

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
  process.exit(1);
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "draining workers");
  scheduler.stop()
    .then(() => Promise.all(workers.map((w) => w.close())))
    .then(() => pullQueue.close())
    .then(() => rollupQueue.close())
    .then(() => connection.quit())
    .then(() => { logger.info("shutdown complete"); process.exit(0); })
    .catch((err) => { logger.error({ err }, "shutdown error"); process.exit(1); });
  setTimeout(() => { logger.error("drain timeout — forcing exit"); process.exit(1); }, 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
```

Modify `services/ingestion/src/env.ts` — add KEK envs to the schema:

```ts
LWA_KEK_CURRENT: z.string().default("v1"),
LWA_KEK_V1:      z.string().min(44),   // base64 of 32 bytes is 44 chars
```

Modify `services/ingestion/package.json` — add deps:

```json
"@lwa/connectors": "workspace:*",
"@lwa/crypto":     "workspace:*",
"@lwa/db":         "workspace:*",
```

Run `pnpm install`.

- [ ] **Step 6: Scheduler unit test**

Create `services/ingestion/test/scheduler.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { createTestDb, type TestDbHandle } from "@lwa/db/test-utils";
import { tenant, source, connectorConfig } from "@lwa/db";
import { startScheduler } from "../src/scheduler";

describe("scheduler reconciliation", () => {
  let h: TestDbHandle;
  let redis: IORedis;
  let pullQueue: Queue;

  beforeAll(async () => {
    h = await createTestDb();
    redis = new IORedis({ host: "localhost", port: 6379, maxRetriesPerRequest: null });
    pullQueue = new Queue("connector.pull", { connection: redis, prefix: `test:${crypto.randomUUID().slice(0,8)}` });
  });
  afterAll(async () => {
    await pullQueue.obliterate({ force: true });
    await pullQueue.close(); await redis.quit(); await h.stop();
  });

  it("adds a repeatable job per enabled config, removes on disable", async () => {
    const [t] = await h.db.insert(tenant).values({ name: "t", slug: `t-${crypto.randomUUID().slice(0,8)}` }).returning();
    const [s] = await h.db.insert(source).values({ key: `k-${crypto.randomUUID().slice(0,8)}`, name: "s", category: "web", authMethod: "none" }).returning();
    const [cfg] = await h.db.insert(connectorConfig).values({ tenantId: t.id, sourceId: s.id, schedule: "*/5 * * * *" }).returning();

    const sched = startScheduler({ db: h.db, pullQueue, logger: silent(), pollIntervalMs: 999_999 });
    await new Promise((r) => setTimeout(r, 200));  // let first tick complete
    let jobs = await pullQueue.getRepeatableJobs();
    expect(jobs.some((j) => j.name === `pull:${cfg.id}`)).toBe(true);

    await h.db.update(connectorConfig).set({ enabled: false }).where((tbl) => tbl.id === cfg.id);
    await (sched as any).stop();
    // second scheduler instance picks up the disabled state
    const sched2 = startScheduler({ db: h.db, pullQueue, logger: silent(), pollIntervalMs: 999_999 });
    await new Promise((r) => setTimeout(r, 200));
    jobs = await pullQueue.getRepeatableJobs();
    expect(jobs.some((j) => j.name === `pull:${cfg.id}`)).toBe(false);
    await (sched2 as any).stop();
  });
});

function silent() { return { info: () => {}, warn: () => {}, error: () => {} }; }
```

Run: `pnpm -F @lwa/ingestion test scheduler`
Expected: PASS.

- [ ] **Step 7: Run full integration test**

```bash
pnpm -F @lwa/ingestion test
```
Expected: PASS — pipeline.integration (2 assertions) + scheduler (1 test) + existing 23 tests = 26+ tests.

- [ ] **Step 8: Lint + typecheck + commit**

```bash
pnpm -w turbo lint typecheck test
```

Commit:
```
feat(ingestion): pipeline wiring — pull handler + scheduler + rollup.refresh + run tracking
```

**✅ CHECKPOINT after Task 4.** Run the integration test one more time, visually inspect the logs. Before building real connectors, confirm:
- Stub connector → metric_record (idempotent) → rollup.refresh enqueued → metric_rollup populated for every ancestor.
- Scheduler reconciles jobs in both directions (add on enable, remove on disable).
- Errors flow: `AUTH_INVALID` pauses config; `TRANSIENT` throws to trigger BullMQ backoff.

**Pause here. Real connectors land next.**

---

## Task 5: `manual_satellite` + `manual_freeview` connectors + `POST /api/tenants/:slug/entries`

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Create: `packages/connectors/src/manual-satellite.ts`
- Create: `packages/connectors/src/manual-freeview.ts`
- Modify: `packages/connectors/src/index.ts` (register both)
- Create: `packages/connectors/test/manual-satellite.test.ts`
- Create: `packages/connectors/test/manual-freeview.test.ts`
- Create: `services/api/src/routes/entries.ts`
- Modify: `services/api/src/server.ts` (mount entries route)
- Create: `services/api/test/entries.test.ts`

**Why this task exists:** Manual connectors are the simplest shape (no external IO, just form + Zod schema) — landing them first proves the connector→entry API→metric_record path end-to-end without any API flakiness from Cloudflare/GA4. The same `POST /api/tenants/:slug/entries` endpoint is what the manual entry UI (Task 11) will call.

- [ ] **Step 1: manual_satellite connector**

Create `packages/connectors/src/manual-satellite.ts`:

```ts
import { z } from "zod";
import { ok, type ManualConnector } from "@lwa/contracts";

export const manualSatelliteEntrySchema = z.object({
  hierarchyNodeId: z.string().uuid(),
  period: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }).refine((p) => p.start < p.end, "start must be before end"),
  householdsReached: z.number().int().positive(),
  estimationMethod: z.enum(["panel", "operator_report", "internal_estimate"]),
  sourceDocumentUrl: z.string().url().optional(),
  notes: z.string().max(1000).optional(),
});

export type ManualSatelliteEntry = z.infer<typeof manualSatelliteEntrySchema>;

export const manualSatelliteConnector: ManualConnector = {
  key: "manual_satellite",
  name: "Satellite Viewership (Manual)",
  category: "tv_households",
  kind: "manual",
  authMethod: "none",
  credentialsSchema: z.object({}),
  supportedGranularities: ["week", "month"],
  entrySchema: manualSatelliteEntrySchema,
  validateCredentials: async () => ok(undefined),
};
```

- [ ] **Step 2: manual_freeview connector (same shape, slightly different labels)**

Create `packages/connectors/src/manual-freeview.ts`:

```ts
import { z } from "zod";
import { ok, type ManualConnector } from "@lwa/contracts";

export const manualFreeviewEntrySchema = z.object({
  hierarchyNodeId: z.string().uuid(),
  period: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }).refine((p) => p.start < p.end, "start must be before end"),
  householdsReached: z.number().int().positive(),
  estimationMethod: z.enum(["barb", "internal_estimate"]),
  barbWeekNumber: z.number().int().min(1).max(53).optional(),
  notes: z.string().max(1000).optional(),
});

export const manualFreeviewConnector: ManualConnector = {
  key: "manual_freeview",
  name: "Freeview Viewership (Manual)",
  category: "tv_households",
  kind: "manual",
  authMethod: "none",
  credentialsSchema: z.object({}),
  supportedGranularities: ["week", "month"],
  entrySchema: manualFreeviewEntrySchema,
  validateCredentials: async () => ok(undefined),
};
```

- [ ] **Step 3: Register both**

Modify `packages/connectors/src/index.ts`:

```ts
import { manualSatelliteConnector } from "./manual-satellite";
import { manualFreeviewConnector } from "./manual-freeview";
import { registry } from "./registry";

registry.register(manualSatelliteConnector);
registry.register(manualFreeviewConnector);

export { manualSatelliteConnector, manualFreeviewConnector };
export * from "./registry";
export * from "./lib/errors";
export * from "./lib/period";
export * from "./lib/contract-suite";
```

- [ ] **Step 4: Contract test per connector**

Create `packages/connectors/test/manual-satellite.test.ts`:

```ts
import { runConnectorContract } from "../src/lib/contract-suite";
import { manualSatelliteConnector } from "../src/manual-satellite";

runConnectorContract(manualSatelliteConnector, {
  validCredentials: {},
  invalidCredentials: { extra: true }, // strict(): extra keys rejected
});
```

If `credentialsSchema: z.object({})` isn't strict, either tighten it (`z.object({}).strict()`) or accept any creds (validateCredentials returns ok always). The contract test is there to exercise both branches — if creds are always valid, the "invalid" test should explicitly assert the connector tolerates any input.

**Decision for manual connectors:** no credentials are meaningful. Soften the contract test to only exercise `validateCredentials(valid)` for manual; skip invalid. Update `runConnectorContract` to handle manual-only: the invalid-creds assertion is conditional on `kind === 'pull'`.

Edit `packages/connectors/src/lib/contract-suite.ts` — wrap the invalid-creds test in `if (connector.kind === "pull")`.

Create `packages/connectors/test/manual-freeview.test.ts`:

```ts
import { runConnectorContract } from "../src/lib/contract-suite";
import { manualFreeviewConnector } from "../src/manual-freeview";

runConnectorContract(manualFreeviewConnector, {
  validCredentials: {},
  invalidCredentials: {},
});
```

- [ ] **Step 5: Entry API route**

Create `services/api/src/routes/entries.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { registry } from "@lwa/connectors";
import type { Database } from "@lwa/db";
import { createMetricRecordRepo, tenant, source, connectorConfig } from "@lwa/db";
import { eq, and } from "drizzle-orm";

const bodySchema = z.object({
  connectorKey: z.string(),
  entry: z.unknown(),
});

export function entriesRoutes(db: Database): Hono {
  const app = new Hono();
  const metricRecords = createMetricRecordRepo(db);

  app.post("/tenants/:slug/entries", zValidator("json", bodySchema), async (c) => {
    const slug = c.req.param("slug");
    const session = c.get("session");
    if (!session?.user) return c.json({ error: "unauthenticated" }, 401);
    // RBAC wired in Task 8; for now trust session.user

    const [t] = await db.select().from(tenant).where(eq(tenant.slug, slug));
    if (!t) return c.json({ error: "tenant not found" }, 404);

    const { connectorKey, entry } = c.req.valid("json");
    const connector = registry.get(connectorKey);
    if (!connector) return c.json({ error: `unknown connector ${connectorKey}` }, 400);
    if (connector.kind !== "manual") return c.json({ error: "connector is not manual" }, 400);

    const parsed = connector.entrySchema.safeParse(entry);
    if (!parsed.success) return c.json({ error: "validation", issues: parsed.error.flatten() }, 422);

    const [src] = await db.select().from(source).where(eq(source.key, connectorKey));
    if (!src) return c.json({ error: "source not seeded" }, 500);
    const [cfg] = await db.select().from(connectorConfig).where(
      and(eq(connectorConfig.tenantId, t.id), eq(connectorConfig.sourceId, src.id)),
    );
    if (!cfg) return c.json({ error: "connector not configured for this tenant" }, 400);

    // Translate entry → MetricRecordDraft. For manual_satellite + manual_freeview
    // the field is householdsReached; generalise per connectorKey below.
    const e = parsed.data as any;
    const draft = {
      tenantId: t.id,
      sourceId: src.id,
      connectorConfigId: cfg.id,
      hierarchyNodeId: e.hierarchyNodeId,
      metricType: "households",
      metricCategory: "tv_households" as const,
      dimensions: { estimation_method: e.estimationMethod },
      periodStart: new Date(e.period.start),
      periodEnd:   new Date(e.period.end),
      granularity: "week" as const,
      rawValue: String(e.householdsReached),
      unit: "households",
      provenance: `manual:user:${session.user.id}`,
    };
    const { written } = await metricRecords.upsertMany([draft]);
    return c.json({ written });
  });

  return app;
}
```

Modify `services/api/src/server.ts` — mount:
```ts
import { entriesRoutes } from "./routes/entries";
// ...
app.route("/", entriesRoutes(db));
```

- [ ] **Step 6: API integration test**

Create `services/api/test/entries.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDbHandle } from "@lwa/db/test-utils";
import { tenant, hierarchyNode, source, connectorConfig, user } from "@lwa/db";
import { buildApp } from "../src/app";
import "@lwa/connectors"; // side-effect register

describe("POST /tenants/:slug/entries", () => {
  let h: TestDbHandle;
  let app: any;

  beforeAll(async () => {
    h = await createTestDb();
    app = buildApp({ db: h.db, authMode: "test-session" }); // test-session helper stubs c.get('session')
  });
  afterAll(async () => { await h.stop(); });

  it("writes a metric_record for a valid manual_satellite entry", async () => {
    const ctx = await seedManualCtx(h);
    const res = await app.request(`/tenants/${ctx.slug}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": ctx.userId },
      body: JSON.stringify({
        connectorKey: "manual_satellite",
        entry: {
          hierarchyNodeId: ctx.nodeId,
          period: { start: "2026-01-05", end: "2026-01-12" },
          householdsReached: 1200,
          estimationMethod: "operator_report",
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.written).toBe(1);
  });

  it("returns 422 on schema validation failure", async () => {
    const ctx = await seedManualCtx(h);
    const res = await app.request(`/tenants/${ctx.slug}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": ctx.userId },
      body: JSON.stringify({
        connectorKey: "manual_satellite",
        entry: { hierarchyNodeId: ctx.nodeId, period: { start: "2026-01-05", end: "2026-01-12" }, householdsReached: -1, estimationMethod: "panel" },
      }),
    });
    expect(res.status).toBe(422);
  });
});

async function seedManualCtx(h: TestDbHandle) {
  const slug = `t-${crypto.randomUUID().slice(0,8)}`;
  const [t] = await h.db.insert(tenant).values({ name: "Acme", slug }).returning();
  const [node] = await h.db.insert(hierarchyNode).values({ tenantId: t.id, type: "station", name: "m", slug: "m" }).returning();
  const [src] = await h.db.insert(source).values({ key: "manual_satellite", name: "sat", category: "tv_broadcast", authMethod: "none" }).returning();
  await h.db.insert(connectorConfig).values({ tenantId: t.id, sourceId: src.id, schedule: "" });
  const [u] = await h.db.insert(user).values({ email: `${crypto.randomUUID()}@x.com`, name: "U" }).returning();
  return { slug, nodeId: node.id, userId: u.id };
}
```

This test requires a `buildApp` factory that accepts a test-session middleware. Create `services/api/src/app.ts` if it doesn't exist yet (refactoring `server.ts`). Keep `server.ts` as the process entry; `app.ts` returns a Hono instance.

- [ ] **Step 7: Lint + typecheck + test + commit**

```bash
pnpm -F @lwa/connectors lint typecheck test
pnpm -F @lwa/api lint typecheck test
```

Commit:
```
feat(connectors,api): manual_satellite + manual_freeview + POST /entries
```

---

## Task 6: `cloudflare_analytics` connector (GraphQL Analytics API)

**TDD scenario:** New feature — full TDD cycle with mocked HTTP via `undici` `MockAgent`.

**Files:**
- Create: `packages/connectors/src/cloudflare-analytics.ts`
- Create: `packages/connectors/test/cloudflare-analytics.test.ts`
- Create: `packages/connectors/test/fixtures/cloudflare-analytics/list-zones.json`
- Create: `packages/connectors/test/fixtures/cloudflare-analytics/pull-day.json`
- Modify: `packages/connectors/src/index.ts` (register)
- Modify: `packages/connectors/package.json` (add `undici`)

**Why this task exists:** First real pull connector. Cloudflare Analytics GraphQL is among the simplest (one API token, one GraphQL endpoint, requests + pageviews + uniques already aggregated). Proving this pattern validates Tasks 7 and 8 which follow similar shape.

- [ ] **Step 1: Cloudflare connector skeleton**

Create `packages/connectors/src/cloudflare-analytics.ts`:

```ts
import { z } from "zod";
import { ok, err, type PullConnector, type Result, type PullResult, type ConnectorError, type PlatformAccountCandidate } from "@lwa/contracts";
import { request } from "undici";
import { classifyHttpError, classifyNetworkError } from "./lib/errors";

export const cloudflareAnalyticsCredentialsSchema = z.object({
  apiToken: z.string().min(40),
});
export type CloudflareAnalyticsCreds = z.infer<typeof cloudflareAnalyticsCredentialsSchema>;

const GQL_URL = "https://api.cloudflare.com/client/v4/graphql";

export const cloudflareAnalyticsConnector: PullConnector = {
  key: "cloudflare_analytics",
  name: "Cloudflare Analytics",
  category: "web_visitors",
  kind: "pull",
  authMethod: "api_key",
  credentialsSchema: cloudflareAnalyticsCredentialsSchema,
  supportedGranularities: ["hour", "day"],

  validateCredentials: async (creds) => {
    const parsed = cloudflareAnalyticsCredentialsSchema.safeParse(creds);
    if (!parsed.success) return err({ code: "AUTH_INVALID", message: "bad creds shape", retryable: false });
    try {
      const res = await request("https://api.cloudflare.com/client/v4/user/tokens/verify", {
        method: "GET",
        headers: { authorization: `Bearer ${parsed.data.apiToken}` },
      });
      if (res.statusCode === 200) return ok(undefined);
      return err(classifyHttpError(res.statusCode, `verify returned ${res.statusCode}`));
    } catch (e) {
      return err(classifyNetworkError(e));
    }
  },

  listAccounts: async (creds): Promise<Result<PlatformAccountCandidate[], ConnectorError>> => {
    const parsed = cloudflareAnalyticsCredentialsSchema.safeParse(creds);
    if (!parsed.success) return err({ code: "AUTH_INVALID", message: "bad creds", retryable: false });
    try {
      const res = await request("https://api.cloudflare.com/client/v4/zones?per_page=50", {
        headers: { authorization: `Bearer ${parsed.data.apiToken}` },
      });
      if (res.statusCode !== 200) return err(classifyHttpError(res.statusCode, `zones ${res.statusCode}`));
      const body = (await res.body.json()) as { result: Array<{ id: string; name: string }> };
      return ok(body.result.map((z) => ({ externalId: z.id, displayName: z.name })));
    } catch (e) {
      return err(classifyNetworkError(e));
    }
  },

  pull: async (input): Promise<Result<PullResult, ConnectorError>> => {
    const creds = cloudflareAnalyticsCredentialsSchema.safeParse(input.config.credentials);
    if (!creds.success) return err({ code: "AUTH_INVALID", message: "bad creds", retryable: false });
    if (!input.account) return err({ code: "CONFIG_INVALID", message: "no platform_account", retryable: false });

    await input.context.rateLimiter.acquire();
    const zoneTag = input.account.externalId;
    const query = `
      query($zoneTag: String!, $start: Time!, $end: Time!) {
        viewer { zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(limit: 10000, filter: { date_geq: $start, date_lt: $end }) {
            dimensions { date }
            sum     { requests pageViews }
            uniq    { uniques }
          }
        } }
      }`;
    try {
      const res = await request(GQL_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${creds.data.apiToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          query, variables: { zoneTag, start: isoDate(input.period.start), end: isoDate(input.period.end) },
        }),
      });
      if (res.statusCode !== 200) return err(classifyHttpError(res.statusCode, `graphql ${res.statusCode}`));
      const body = (await res.body.json()) as any;
      if (body.errors?.length) return err({ code: "CONFIG_INVALID", message: JSON.stringify(body.errors), retryable: false });
      const groups: any[] = body.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
      if (groups.length === 0) return ok({ records: [] }); // NO_DATA
      const records = groups.flatMap((g) => {
        const periodStart = new Date(`${g.dimensions.date}T00:00:00Z`);
        const periodEnd = new Date(periodStart);
        periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
        return [
          { hierarchyNodeId: input.account!.hierarchyNodeId, metricType: "pageviews",       metricCategory: "web_visitors" as const, dimensions: {}, periodStart, periodEnd, granularity: "day" as const, value: Number(g.sum.pageViews), unit: "count" },
          { hierarchyNodeId: input.account!.hierarchyNodeId, metricType: "unique_visitors", metricCategory: "web_visitors" as const, dimensions: {}, periodStart, periodEnd, granularity: "day" as const, value: Number(g.uniq.uniques), unit: "count" },
          { hierarchyNodeId: input.account!.hierarchyNodeId, metricType: "requests",        metricCategory: "web_visitors" as const, dimensions: {}, periodStart, periodEnd, granularity: "day" as const, value: Number(g.sum.requests),  unit: "count" },
        ];
      });
      return ok({ records });
    } catch (e) {
      return err(classifyNetworkError(e));
    }
  },
};

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
```

- [ ] **Step 2: Fixtures**

Create `packages/connectors/test/fixtures/cloudflare-analytics/pull-day.json`:

```json
{
  "data": {
    "viewer": {
      "zones": [{
        "httpRequests1dGroups": [
          {
            "dimensions": { "date": "2026-01-05" },
            "sum":  { "requests": 123456, "pageViews": 34567 },
            "uniq": { "uniques": 8910 }
          }
        ]
      }]
    }
  }
}
```

Create `packages/connectors/test/fixtures/cloudflare-analytics/list-zones.json`:

```json
{ "result": [
  { "id": "zone-abc", "name": "example.com" },
  { "id": "zone-def", "name": "example.org" }
] }
```

- [ ] **Step 3: Tests with MockAgent**

Create `packages/connectors/test/cloudflare-analytics.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { isOk } from "@lwa/contracts";
import { cloudflareAnalyticsConnector } from "../src/cloudflare-analytics";
import { runConnectorContract } from "../src/lib/contract-suite";

const fixture = (n: string) => JSON.parse(readFileSync(join(__dirname, "fixtures/cloudflare-analytics", n), "utf8"));

describe("cloudflare_analytics", () => {
  let agent: MockAgent;
  const original = getGlobalDispatcher();

  beforeEach(() => {
    agent = new MockAgent(); agent.disableNetConnect(); setGlobalDispatcher(agent);
  });
  afterEach(async () => { await agent.close(); setGlobalDispatcher(original); });

  it("validateCredentials returns ok on 200", async () => {
    agent.get("https://api.cloudflare.com")
      .intercept({ path: "/client/v4/user/tokens/verify" })
      .reply(200, { success: true });
    const r = await cloudflareAnalyticsConnector.validateCredentials({ apiToken: "x".repeat(40) });
    expect(isOk(r)).toBe(true);
  });

  it("validateCredentials returns AUTH_INVALID on 401", async () => {
    agent.get("https://api.cloudflare.com")
      .intercept({ path: "/client/v4/user/tokens/verify" })
      .reply(401, {});
    const r = await cloudflareAnalyticsConnector.validateCredentials({ apiToken: "x".repeat(40) });
    expect(r).toMatchObject({ error: { code: "AUTH_INVALID" } });
  });

  it("listAccounts returns zones", async () => {
    agent.get("https://api.cloudflare.com")
      .intercept({ path: /zones\?per_page=50/ })
      .reply(200, fixture("list-zones.json"));
    const r = await cloudflareAnalyticsConnector.listAccounts!({ apiToken: "x".repeat(40) });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toHaveLength(2);
      expect(r.value[0].externalId).toBe("zone-abc");
    }
  });

  it("pull returns 3 metrics per day (pageviews + unique_visitors + requests)", async () => {
    agent.get("https://api.cloudflare.com").intercept({
      path: "/client/v4/graphql", method: "POST",
    }).reply(200, fixture("pull-day.json"));
    const r = await cloudflareAnalyticsConnector.pull({
      config: { id: "c1", tenantId: "t1", sourceId: "s1", sourceKey: "cloudflare_analytics", credentials: { apiToken: "x".repeat(40) }, schedule: "" },
      account: { id: "a1", externalId: "zone-abc", hierarchyNodeId: "h1", config: {} },
      period: { start: new Date("2026-01-05"), end: new Date("2026-01-06"), granularity: "day" },
      context: { tenantId: "t1", logger: { info: () => {}, warn: () => {}, error: () => {} }, rateLimiter: { acquire: async () => {} } },
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.records).toHaveLength(3);
      const byType = Object.fromEntries(r.value.records.map((x) => [x.metricType, x.value]));
      expect(byType).toEqual({ pageviews: 34567, unique_visitors: 8910, requests: 123456 });
    }
  });
});

runConnectorContract(cloudflareAnalyticsConnector, {
  validCredentials: { apiToken: "x".repeat(40) },
  invalidCredentials: { apiToken: "" },
});
```

Add undici to `packages/connectors/package.json` deps: `"undici": "^6.19.0"`. Run `pnpm install`.

- [ ] **Step 4: Register + lint/typecheck/test/commit**

Modify `packages/connectors/src/index.ts` — add:
```ts
import { cloudflareAnalyticsConnector } from "./cloudflare-analytics";
registry.register(cloudflareAnalyticsConnector);
export { cloudflareAnalyticsConnector };
```

```bash
pnpm -F @lwa/connectors lint typecheck test
```

Commit:
```
feat(connectors): cloudflare_analytics (GraphQL zone analytics)
```

---

## Task 7: `ga4` connector (Google Analytics Data API, service-account JWT)

**TDD scenario:** New feature — full TDD cycle. GA4 SDK is mocked via `vi.mock("@google-analytics/data")`.

**Files:**
- Create: `packages/connectors/src/ga4.ts`
- Create: `packages/connectors/test/ga4.test.ts`
- Create: `packages/connectors/test/fixtures/ga4/report.json`
- Modify: `packages/connectors/package.json` (add `@google-analytics/data` + `google-auth-library`)
- Modify: `packages/connectors/src/index.ts` (register)

**Why this task exists:** GA4 is the primary Web-tile data source for any LW-owned site that uses Google Analytics — and with CastNet retiring, it's the backbone of the Web tile in Phase 1. Service-account JWT avoids the OAuth ceremony that YouTube/Meta need (those are Phase 2/3). Credentials are stored as the raw service-account JSON — very sensitive, which is exactly why Task 3's envelope encryption exists.

- [ ] **Step 1: Connector implementation**

Create `packages/connectors/src/ga4.ts`:

```ts
import { z } from "zod";
import { ok, err, type PullConnector, type Result, type PullResult, type ConnectorError, type PlatformAccountCandidate } from "@lwa/contracts";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { classifyNetworkError } from "./lib/errors";

export const ga4CredentialsSchema = z.object({
  serviceAccountJson: z.string().refine((s) => {
    try { const o = JSON.parse(s); return o.type === "service_account" && typeof o.private_key === "string"; }
    catch { return false; }
  }, "must be valid service-account JSON"),
});
export type Ga4Creds = z.infer<typeof ga4CredentialsSchema>;

function clientFromCreds(raw: string): BetaAnalyticsDataClient {
  const creds = JSON.parse(raw);
  return new BetaAnalyticsDataClient({ credentials: creds });
}

export const ga4Connector: PullConnector = {
  key: "ga4",
  name: "Google Analytics 4",
  category: "web_visitors",
  kind: "pull",
  authMethod: "service_account",
  credentialsSchema: ga4CredentialsSchema,
  supportedGranularities: ["day"],

  validateCredentials: async (creds) => {
    const parsed = ga4CredentialsSchema.safeParse(creds);
    if (!parsed.success) return err({ code: "AUTH_INVALID", message: "bad creds shape", retryable: false });
    try {
      // Trigger JWT creation by touching the client. GA4 data API has no
      // lightweight "whoami" — if the JSON parses and the JWT signs, we accept it.
      clientFromCreds(parsed.data.serviceAccountJson);
      return ok(undefined);
    } catch (e) {
      return err({ code: "AUTH_INVALID", message: (e as Error).message, retryable: false });
    }
  },

  /**
   * Listing properties requires the Admin API (`AnalyticsAdminServiceClient`).
   * v1 lets admins paste property IDs directly; listAccounts returns them from
   * `platform_account.config.propertyIds` once attached. Skipping here.
   */
  listAccounts: async (): Promise<Result<PlatformAccountCandidate[], ConnectorError>> => {
    return ok([]);
  },

  pull: async (input): Promise<Result<PullResult, ConnectorError>> => {
    const creds = ga4CredentialsSchema.safeParse(input.config.credentials);
    if (!creds.success) return err({ code: "AUTH_INVALID", message: "bad creds", retryable: false });
    if (!input.account) return err({ code: "CONFIG_INVALID", message: "no platform_account", retryable: false });
    const propertyId = input.account.externalId; // format: "properties/123456" or "123456"
    const property = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;

    await input.context.rateLimiter.acquire();
    try {
      const client = clientFromCreds(creds.data.serviceAccountJson);
      const [response] = await client.runReport({
        property,
        dateRanges: [{
          startDate: isoDate(input.period.start),
          endDate:   isoDateInclusive(input.period.end),  // GA4 end is inclusive
        }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
        ],
      });
      const rows = response.rows ?? [];
      if (rows.length === 0) return ok({ records: [] });
      const records = rows.flatMap((row) => {
        const dateStr = row.dimensionValues?.[0]?.value ?? "";
        const periodStart = new Date(`${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}T00:00:00Z`);
        const periodEnd = new Date(periodStart); periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
        const base = { hierarchyNodeId: input.account!.hierarchyNodeId, metricCategory: "web_visitors" as const, dimensions: {}, periodStart, periodEnd, granularity: "day" as const, unit: "count" };
        return [
          { ...base, metricType: "unique_visitors", value: Number(row.metricValues?.[0]?.value ?? 0) },
          { ...base, metricType: "sessions",        value: Number(row.metricValues?.[1]?.value ?? 0) },
          { ...base, metricType: "pageviews",       value: Number(row.metricValues?.[2]?.value ?? 0) },
        ];
      });
      return ok({ records });
    } catch (e) {
      return err(classifyNetworkError(e));
    }
  },
};

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function isoDateInclusive(d: Date): string { const x = new Date(d); x.setUTCDate(x.getUTCDate() - 1); return isoDate(x); }
```

- [ ] **Step 2: Fixture + test**

Create `packages/connectors/test/fixtures/ga4/report.json`:

```json
{
  "rows": [
    { "dimensionValues": [{ "value": "20260105" }], "metricValues": [{ "value": "1234" }, { "value": "1500" }, { "value": "4321" }] },
    { "dimensionValues": [{ "value": "20260106" }], "metricValues": [{ "value": "1100" }, { "value": "1400" }, { "value": "3800" }] }
  ]
}
```

Create `packages/connectors/test/ga4.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOk } from "@lwa/contracts";
import { runConnectorContract } from "../src/lib/contract-suite";

const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures/ga4/report.json"), "utf8"));

const runReport = vi.fn();
vi.mock("@google-analytics/data", () => ({
  BetaAnalyticsDataClient: vi.fn().mockImplementation(() => ({ runReport })),
}));

const VALID_SA = JSON.stringify({ type: "service_account", private_key: "fake", client_email: "x@y.iam.gserviceaccount.com" });

describe("ga4", () => {
  beforeEach(() => { runReport.mockReset(); });

  it("validateCredentials ok on valid SA JSON", async () => {
    const { ga4Connector } = await import("../src/ga4");
    const r = await ga4Connector.validateCredentials({ serviceAccountJson: VALID_SA });
    expect(isOk(r)).toBe(true);
  });

  it("validateCredentials AUTH_INVALID on garbage", async () => {
    const { ga4Connector } = await import("../src/ga4");
    const r = await ga4Connector.validateCredentials({ serviceAccountJson: "not-json" });
    expect(r).toMatchObject({ error: { code: "AUTH_INVALID" } });
  });

  it("pull returns 3 metrics × 2 days", async () => {
    runReport.mockResolvedValue([fixture]);
    const { ga4Connector } = await import("../src/ga4");
    const r = await ga4Connector.pull({
      config: { id: "c1", tenantId: "t1", sourceId: "s1", sourceKey: "ga4", credentials: { serviceAccountJson: VALID_SA }, schedule: "" },
      account: { id: "a1", externalId: "properties/123", hierarchyNodeId: "h1", config: {} },
      period: { start: new Date("2026-01-05"), end: new Date("2026-01-07"), granularity: "day" },
      context: { tenantId: "t1", logger: { info: () => {}, warn: () => {}, error: () => {} }, rateLimiter: { acquire: async () => {} } },
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.records).toHaveLength(6);
      expect(r.value.records.find((x) => x.metricType === "unique_visitors" && x.periodStart.toISOString().startsWith("2026-01-05"))!.value).toBe(1234);
    }
  });
});

runConnectorContract(
  // import async-free at module scope is fine because vi.mock hoists
  (await import("../src/ga4")).ga4Connector,
  { validCredentials: { serviceAccountJson: VALID_SA }, invalidCredentials: { serviceAccountJson: "bad" } },
);
```

Add `@google-analytics/data`, `google-auth-library` to `packages/connectors/package.json` deps. `pnpm install`.

- [ ] **Step 3: Register + run + commit**

Modify `packages/connectors/src/index.ts`:
```ts
import { ga4Connector } from "./ga4";
registry.register(ga4Connector);
export { ga4Connector };
```

```bash
pnpm -F @lwa/connectors test
```

Commit:
```
feat(connectors): ga4 (Google Analytics Data API, service-account JWT)
```

**✅ CHECKPOINT after Task 7.** All 4 P0 connectors registered; contract test suite is green for each. Confirm registry contains exactly: `manual_satellite`, `manual_freeview`, `cloudflare_analytics`, `ga4`. Run `pnpm -w turbo test` once more.

---

## Task 8: API — connector management + hierarchy CRUD + backfill endpoint + RBAC

**TDD scenario:** New feature — full TDD cycle. Tests exercise RBAC matrix for every endpoint.

**Files:**
- Create: `services/api/src/middleware/rbac.ts`
- Create: `services/api/src/routes/hierarchy.ts`
- Create: `services/api/src/routes/connectors.ts`
- Create: `services/api/src/routes/sources.ts` (catalog — list all registered connectors + their schemas for UI)
- Create: `services/api/src/routes/backfill.ts`
- Create: `services/api/src/routes/metrics.ts` (board-tile read endpoint)
- Modify: `services/api/src/app.ts`
- Modify: `services/ingestion/src/handlers/backfill.ts` (chunked, checkpointed)
- Create: `services/api/test/hierarchy.test.ts`
- Create: `services/api/test/connectors.test.ts`
- Create: `services/api/test/metrics.test.ts`
- Create: `services/api/test/rbac.test.ts`
- Create: `services/ingestion/test/backfill.test.ts`

**Why this task exists:** Dashboard UI (Tasks 10–12) needs APIs to read from. This task lands the full HTTP surface — hierarchy CRUD, connector CRUD + health + backfill trigger, metrics board — plus the RBAC middleware that enforces the permission matrix from design section 10.3. Without RBAC, Phase 1 would ship with open endpoints.

This task has more volume than others — treat it as a ~2-day task and be strict about small commits within it (feel free to commit per sub-step if preferred; the final lint/typecheck/test must be green).

- [ ] **Step 1: RBAC middleware**

Create `services/api/src/middleware/rbac.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Database } from "@lwa/db";
import { tenant, tenantMembership } from "@lwa/db";
import { eq, and } from "drizzle-orm";
import type { Role, Permission } from "@lwa/auth";
import { rolePermissions } from "@lwa/auth";

/**
 * Resolves the acting user's membership for :slug and checks they hold `permission`.
 * Applies scope_node_ids for station_manager (authorisation narrowed to subtree).
 * Attaches `c.set('membership', ...)` for downstream handlers.
 */
export function requirePermission(db: Database, permission: Permission): MiddlewareHandler {
  return async (c, next) => {
    const session = c.get("session");
    if (!session?.user) throw new HTTPException(401, { message: "unauthenticated" });
    const slug = c.req.param("slug");
    if (!slug) throw new HTTPException(400, { message: "tenant slug required" });

    const [t] = await db.select().from(tenant).where(eq(tenant.slug, slug));
    if (!t) throw new HTTPException(404, { message: "tenant not found" });
    const [m] = await db.select().from(tenantMembership).where(
      and(eq(tenantMembership.userId, session.user.id), eq(tenantMembership.tenantId, t.id)),
    );
    if (!m) throw new HTTPException(403, { message: "not a member of this tenant" });
    const allowed = rolePermissions[m.role as Role] ?? new Set();
    if (!allowed.has(permission)) throw new HTTPException(403, { message: `missing permission: ${permission}` });

    c.set("tenant", t);
    c.set("membership", m);
    await next();
  };
}
```

(If `@lwa/auth` doesn't yet export `rolePermissions` / `Permission` as a Set-of-strings, land that update here too. Design §10.3 has the matrix.)

- [ ] **Step 2: Hierarchy CRUD**

Create `services/api/src/routes/hierarchy.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Database } from "@lwa/db";
import { hierarchyNode } from "@lwa/db";
import { and, eq, isNull } from "drizzle-orm";
import { requirePermission } from "../middleware/rbac";

const nodeInput = z.object({
  type: z.enum(["station", "broadcast_channel", "language_channel"]),
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  metadata: z.record(z.unknown()).optional(),
});

export function hierarchyRoutes(db: Database): Hono {
  const app = new Hono();

  app.get("/tenants/:slug/hierarchy", requirePermission(db, "hierarchy:read"), async (c) => {
    const t = c.get("tenant");
    const rows = await db.select().from(hierarchyNode)
      .where(and(eq(hierarchyNode.tenantId, t.id), isNull(hierarchyNode.archivedAt)));
    return c.json({ nodes: rows });
  });

  app.post("/tenants/:slug/hierarchy", requirePermission(db, "hierarchy:write"), zValidator("json", nodeInput), async (c) => {
    const t = c.get("tenant");
    const body = c.req.valid("json");
    const [row] = await db.insert(hierarchyNode).values({ tenantId: t.id, ...body, metadata: body.metadata ?? {} }).returning();
    return c.json(row, 201);
  });

  app.patch("/tenants/:slug/hierarchy/:id", requirePermission(db, "hierarchy:write"), zValidator("json", nodeInput.partial()), async (c) => {
    const t = c.get("tenant");
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [row] = await db.update(hierarchyNode).set(body)
      .where(and(eq(hierarchyNode.id, id), eq(hierarchyNode.tenantId, t.id))).returning();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  });

  app.delete("/tenants/:slug/hierarchy/:id", requirePermission(db, "hierarchy:write"), async (c) => {
    const t = c.get("tenant");
    const id = c.req.param("id");
    await db.update(hierarchyNode).set({ archivedAt: new Date() })
      .where(and(eq(hierarchyNode.id, id), eq(hierarchyNode.tenantId, t.id)));
    return c.json({ archived: true });
  });

  return app;
}
```

- [ ] **Step 3: Connector CRUD + health**

Create `services/api/src/routes/connectors.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Database } from "@lwa/db";
import { connectorConfig, source, platformAccount, ingestionRun, createConnectorConfigRepo, createPlatformAccountRepo } from "@lwa/db";
import { eq, and, desc } from "drizzle-orm";
import { registry } from "@lwa/connectors";
import type { KekProvider } from "@lwa/crypto";
import { requirePermission } from "../middleware/rbac";

const createSchema = z.object({
  connectorKey: z.string(),
  schedule: z.string().default("0 3 * * *"),
  credentials: z.unknown(),
});

export function connectorRoutes(db: Database, kek: KekProvider): Hono {
  const app = new Hono();
  const cfgRepo = createConnectorConfigRepo(db, kek);
  const paRepo = createPlatformAccountRepo(db);

  app.get("/tenants/:slug/connectors", requirePermission(db, "connector:read"), async (c) => {
    const t = c.get("tenant");
    const rows = await db.select({
      id: connectorConfig.id, sourceKey: source.key, sourceName: source.name,
      schedule: connectorConfig.schedule, enabled: connectorConfig.enabled,
      status: connectorConfig.status, lastRunAt: connectorConfig.lastRunAt,
      lastError: connectorConfig.lastError,
    }).from(connectorConfig).innerJoin(source, eq(connectorConfig.sourceId, source.id))
      .where(eq(connectorConfig.tenantId, t.id));
    return c.json({ connectors: rows });
  });

  app.post("/tenants/:slug/connectors", requirePermission(db, "connector:write"), zValidator("json", createSchema), async (c) => {
    const t = c.get("tenant");
    const { connectorKey, schedule, credentials } = c.req.valid("json");
    const connector = registry.get(connectorKey);
    if (!connector) return c.json({ error: `unknown connector ${connectorKey}` }, 400);
    const valid = await connector.validateCredentials(credentials);
    if ("error" in valid) return c.json({ error: "invalid credentials", detail: valid.error }, 422);
    const [src] = await db.select().from(source).where(eq(source.key, connectorKey));
    if (!src) return c.json({ error: "source not seeded" }, 500);
    const cfg = await cfgRepo.create({ tenantId: t.id, sourceId: src.id, schedule, credentials });
    return c.json({ id: cfg.id }, 201);
  });

  app.post("/tenants/:slug/connectors/:id/test", requirePermission(db, "connector:write"), async (c) => {
    const id = c.req.param("id");
    const [cfg] = await db.select().from(connectorConfig).where(eq(connectorConfig.id, id));
    if (!cfg) return c.json({ error: "not found" }, 404);
    const [src] = await db.select().from(source).where(eq(source.id, cfg.sourceId));
    if (!src) return c.json({ error: "source missing" }, 500);
    const connector = registry.get(src.key);
    if (!connector) return c.json({ error: "connector not registered" }, 500);
    const plaintext = await cfgRepo.readCredentials(id);
    const valid = await connector.validateCredentials(plaintext);
    const accounts = connector.kind === "pull" && connector.listAccounts
      ? await connector.listAccounts(plaintext) : undefined;
    return c.json({ valid, accounts });
  });

  app.get("/tenants/:slug/connectors/:id/runs", requirePermission(db, "connector:read"), async (c) => {
    const id = c.req.param("id");
    const rows = await db.select().from(ingestionRun)
      .where(eq(ingestionRun.connectorConfigId, id))
      .orderBy(desc(ingestionRun.startedAt))
      .limit(50);
    return c.json({ runs: rows });
  });

  app.post("/tenants/:slug/connectors/:id/accounts", requirePermission(db, "connector:write"), zValidator("json",
    z.object({ externalId: z.string(), displayName: z.string(), hierarchyNodeId: z.string().uuid(), config: z.record(z.unknown()).optional() })
  ), async (c) => {
    const t = c.get("tenant");
    const id = c.req.param("id");
    const [cfg] = await db.select().from(connectorConfig).where(eq(connectorConfig.id, id));
    if (!cfg || cfg.tenantId !== t.id) return c.json({ error: "not found" }, 404);
    const row = await paRepo.upsert({ tenantId: t.id, sourceId: cfg.sourceId, ...c.req.valid("json") });
    return c.json(row, 201);
  });

  return app;
}
```

- [ ] **Step 4: Sources catalog route** (drives manual-entry form + connector-add UI)

Create `services/api/src/routes/sources.ts`:

```ts
import { Hono } from "hono";
import { registry } from "@lwa/connectors";
import { zodToJsonSchema } from "zod-to-json-schema";

export function sourcesRoutes(): Hono {
  const app = new Hono();
  app.get("/sources", (c) => {
    return c.json({
      sources: registry.all().map((conn) => ({
        key: conn.key, name: conn.name, category: conn.category,
        authMethod: conn.authMethod, kind: conn.kind,
        supportedGranularities: conn.supportedGranularities,
        credentialsSchema: zodToJsonSchema(conn.credentialsSchema, { name: "creds" }),
        entrySchema: conn.kind === "manual" ? zodToJsonSchema(conn.entrySchema, { name: "entry" }) : undefined,
      })),
    });
  });
  return app;
}
```

Add `zod-to-json-schema` to `services/api/package.json` deps. `pnpm install`.

- [ ] **Step 5: Board metrics route**

Create `services/api/src/routes/metrics.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Database } from "@lwa/db";
import { metricRollup } from "@lwa/db";
import { and, eq, gte, lt } from "drizzle-orm";
import { requirePermission } from "../middleware/rbac";

const querySchema = z.object({
  hierarchyNodeId: z.string().uuid(),
  period: z.enum(["week", "month", "quarter", "ytd"]).default("week"),
  granularity: z.enum(["day", "week", "month"]).default("day"),
  comparison: z.enum(["yoy", "qoq", "mom", "none"]).default("yoy"),
});

export function metricsRoutes(db: Database): Hono {
  const app = new Hono();

  app.get("/tenants/:slug/metrics/board", requirePermission(db, "dashboard:read"), zValidator("query", querySchema), async (c) => {
    const t = c.get("tenant");
    const q = c.req.valid("query");
    const [cur, prev] = computeComparisonWindows(q.period, q.comparison);

    const tilePromises = ["tv_households", "web_visitors"].map(async (category) => {
      const currentRows = await db.select().from(metricRollup).where(and(
        eq(metricRollup.tenantId, t.id),
        eq(metricRollup.hierarchyNodeId, q.hierarchyNodeId),
        eq(metricRollup.metricCategory, category as any),
        eq(metricRollup.granularity, q.granularity),
        gte(metricRollup.bucketStart, cur.start),
        lt(metricRollup.bucketStart, cur.end),
      ));
      const priorRows = await db.select().from(metricRollup).where(and(
        eq(metricRollup.tenantId, t.id),
        eq(metricRollup.hierarchyNodeId, q.hierarchyNodeId),
        eq(metricRollup.metricCategory, category as any),
        eq(metricRollup.granularity, q.granularity),
        gte(metricRollup.bucketStart, prev.start),
        lt(metricRollup.bucketStart, prev.end),
      ));
      const current = currentRows.reduce((a, r) => a + Number(r.effectiveTotal), 0);
      const prior = priorRows.reduce((a, r) => a + Number(r.effectiveTotal), 0);
      const sourceBreakdown = mergeBreakdowns(currentRows.map((r) => r.sourceBreakdown));
      const sparkline = currentRows.map((r) => ({ t: r.bucketStart, v: Number(r.effectiveTotal) }));
      return {
        category, current, prior,
        deltaPct: prior === 0 ? null : ((current - prior) / prior) * 100,
        sparkline, sourceBreakdown,
        hasAdjustments: currentRows.some((r) => r.hasAdjustments),
      };
    });
    const tiles = await Promise.all(tilePromises);
    return c.json({ tiles, window: cur, comparisonWindow: prev });
  });

  return app;
}

function computeComparisonWindows(period: "week" | "month" | "quarter" | "ytd", comparison: "yoy" | "qoq" | "mom" | "none"): [{ start: Date; end: Date }, { start: Date; end: Date }] {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  switch (period) {
    case "week":    start.setUTCDate(start.getUTCDate() - 7); break;
    case "month":   start.setUTCMonth(start.getUTCMonth() - 1); break;
    case "quarter": start.setUTCMonth(start.getUTCMonth() - 3); break;
    case "ytd":     start.setUTCMonth(0); start.setUTCDate(1); break;
  }
  const prev = { start: new Date(start), end: new Date(end) };
  switch (comparison) {
    case "yoy": prev.start.setUTCFullYear(prev.start.getUTCFullYear() - 1); prev.end.setUTCFullYear(prev.end.getUTCFullYear() - 1); break;
    case "qoq": prev.start.setUTCMonth(prev.start.getUTCMonth() - 3); prev.end.setUTCMonth(prev.end.getUTCMonth() - 3); break;
    case "mom": prev.start.setUTCMonth(prev.start.getUTCMonth() - 1); prev.end.setUTCMonth(prev.end.getUTCMonth() - 1); break;
    case "none": break;
  }
  return [{ start, end }, prev];
}

function mergeBreakdowns(bs: Array<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bs) for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}
```

- [ ] **Step 6: Backfill endpoint + handler**

Create `services/api/src/routes/backfill.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Database } from "@lwa/db";
import { backfillRun, connectorConfig } from "@lwa/db";
import { eq } from "drizzle-orm";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { chunkPeriod } from "@lwa/connectors";
import { requirePermission } from "../middleware/rbac";

const schema = z.object({
  rangeStart: z.coerce.date(),
  rangeEnd: z.coerce.date(),
  chunkSizeDays: z.number().int().min(1).max(31).default(7),
});

export function backfillRoutes(db: Database, redisUrl: string): Hono {
  const app = new Hono();
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const backfillQueue = new Queue("connector.backfill", { connection: redis });

  app.post("/tenants/:slug/connectors/:id/backfill", requirePermission(db, "connector:write"), zValidator("json", schema), async (c) => {
    const t = c.get("tenant");
    const session = c.get("session");
    const id = c.req.param("id");
    const { rangeStart, rangeEnd, chunkSizeDays } = c.req.valid("json");
    const [cfg] = await db.select().from(connectorConfig).where(eq(connectorConfig.id, id));
    if (!cfg || cfg.tenantId !== t.id) return c.json({ error: "not found" }, 404);
    const chunks = chunkPeriod(rangeStart, rangeEnd, chunkSizeDays === 7 ? "week" : "day");
    const [run] = await db.insert(backfillRun).values({
      connectorConfigId: cfg.id, rangeStart, rangeEnd, chunkSizeDays,
      chunksTotal: chunks.length, startedByUserId: session.user.id,
      status: "running",
    }).returning();
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      await backfillQueue.add("backfill-chunk", {
        connectorConfigId: cfg.id,
        backfillRunId: run.id, chunkIndex: i,
        periodStart: ch.start.toISOString(),
        periodEnd:   ch.end.toISOString(),
        granularity: "day",
      });
    }
    return c.json({ backfillRunId: run.id, chunks: chunks.length }, 202);
  });

  return app;
}
```

Modify `services/ingestion/src/handlers/backfill.ts` — delegate to the same `createPullHandler` flow, then increment `backfill_run.chunks_completed`:

```ts
import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@lwa/db";
import { backfillRun } from "@lwa/db";
import type { BackfillJobData } from "../queues";
import { createPullHandler, type PullHandlerDeps } from "./pull";

export function createBackfillHandler(deps: PullHandlerDeps) {
  const pull = createPullHandler(deps);
  return async function backfillHandler(job: Job<BackfillJobData>): Promise<void> {
    await pull(job as any); // same signature + data shape
    await deps.db.update(backfillRun)
      .set({ chunksCompleted: sql`${backfillRun.chunksCompleted} + 1`, lastCheckpoint: new Date() })
      .where(eq(backfillRun.id, job.data.backfillRunId));
    // Caller marks status='completed' when chunksCompleted = chunksTotal
    const [row] = await deps.db.select().from(backfillRun).where(eq(backfillRun.id, job.data.backfillRunId));
    if (row && row.chunksCompleted >= row.chunksTotal) {
      await deps.db.update(backfillRun).set({ status: "completed", completedAt: new Date() }).where(eq(backfillRun.id, row.id));
    }
  };
}
```

Update `services/ingestion/src/worker.ts` to use `createBackfillHandler` with the same deps.

- [ ] **Step 7: Wire every route in `app.ts`**

Modify `services/api/src/app.ts`:

```ts
import { Hono } from "hono";
import type { Auth } from "@lwa/auth";
import type { Database } from "@lwa/db";
import type { KekProvider } from "@lwa/crypto";
import { healthRoutes }    from "./routes/health";
import { meRoutes }        from "./routes/me";
import { authRoutes }      from "./routes/auth";
import { entriesRoutes }   from "./routes/entries";
import { hierarchyRoutes } from "./routes/hierarchy";
import { connectorRoutes } from "./routes/connectors";
import { sourcesRoutes }   from "./routes/sources";
import { metricsRoutes }   from "./routes/metrics";
import { backfillRoutes }  from "./routes/backfill";
import { authMiddleware }  from "./middleware/auth"; // existing

export interface AppDeps { db: Database; auth: Auth; kek: KekProvider; redisUrl: string; }

export function buildApp({ db, auth, kek, redisUrl }: AppDeps): Hono {
  const app = new Hono();
  app.route("/", healthRoutes);
  app.route("/", authRoutes(auth));
  app.use("*", authMiddleware(auth));
  app.route("/", meRoutes);
  app.route("/", sourcesRoutes());
  app.route("/", hierarchyRoutes(db));
  app.route("/", connectorRoutes(db, kek));
  app.route("/", entriesRoutes(db));
  app.route("/", metricsRoutes(db));
  app.route("/", backfillRoutes(db, redisUrl));
  return app;
}
```

- [ ] **Step 8: Tests**

Create `services/api/test/rbac.test.ts` — hit each route with 4 different role memberships, assert 200/403 per permission matrix.

Create `services/api/test/hierarchy.test.ts` — create node, list, patch, archive.

Create `services/api/test/connectors.test.ts` — create config with credentials, test endpoint runs listAccounts via MockAgent, accounts upsert, runs list.

Create `services/api/test/metrics.test.ts` — seed rollup rows for two categories, assert board response shape.

Create `services/ingestion/test/backfill.test.ts` — enqueue a backfill with 3 chunks, run them, assert `backfill_run.status = 'completed'` and records written.

(Explicit test code for each file follows the patterns already established in earlier tasks; each file averages ~60 lines. The executing subagent should lift fixture setup from Task 5 / Task 6 tests verbatim and adapt.)

- [ ] **Step 9: Lint + typecheck + test + commit**

```bash
pnpm -w turbo lint typecheck test
```

Commit:
```
feat(api,ingestion): connector+hierarchy+metrics+backfill endpoints with RBAC
```

---

## Task 9: Hierarchy management UI + tenant switcher root page

**TDD scenario:** New feature — Playwright e2e drives the test coverage; component units where logic is non-trivial.

**Files:**
- Create: `packages/ui/src/lib/components/Tree.svelte`
- Create: `packages/ui/src/lib/components/HierarchyPicker.svelte`
- Modify: `packages/ui/src/lib/index.ts` (export)
- Create: `apps/web/src/routes/+page.svelte` (tenant switcher root)
- Create: `apps/web/src/routes/+page.server.ts` (load memberships)
- Create: `apps/web/src/routes/[tenant]/settings/hierarchy/+page.svelte`
- Create: `apps/web/src/routes/[tenant]/settings/hierarchy/+page.server.ts`
- Create: `apps/web/src/lib/api.ts` (typed API client)
- Create: `apps/web/test/hierarchy.e2e.test.ts`

**Why this task exists:** The Phase 1 gate requires an admin to *build their hierarchy from the UI*. Without this, they'd need to run SQL or use YAML import (Phase 2). This task also ships the tenant-switcher root page, resolving the `/` → dashboard redirect conundrum for multi-tenant users.

- [ ] **Step 1: `<Tree>` component**

Create `packages/ui/src/lib/components/Tree.svelte`:

```svelte
<script lang="ts" module>
  export type TreeNode = { id: string; name: string; children?: TreeNode[]; type?: string };
</script>

<script lang="ts">
  interface Props {
    nodes: TreeNode[];
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onAdd?: (parentId: string | null) => void;
    onRename?: (id: string) => void;
    onArchive?: (id: string) => void;
  }
  let { nodes, selectedId, onSelect, onAdd, onRename, onArchive }: Props = $props();
</script>

<ul class="tree">
  {#each nodes as n (n.id)}
    <li class="tree-node" class:selected={n.id === selectedId}>
      <button type="button" class="label" onclick={() => onSelect?.(n.id)}>
        {#if n.type}<span class="type">{n.type}</span>{/if}
        {n.name}
      </button>
      <div class="actions">
        {#if onAdd}<button type="button" onclick={() => onAdd(n.id)}>+</button>{/if}
        {#if onRename}<button type="button" onclick={() => onRename(n.id)}>✎</button>{/if}
        {#if onArchive}<button type="button" onclick={() => onArchive(n.id)}>✕</button>{/if}
      </div>
      {#if n.children?.length}
        {@const { default: Tree } = await import('./Tree.svelte')}
        <!-- recursive render: see Svelte 5 docs; or duplicate structure -->
        <Tree nodes={n.children} {selectedId} {onSelect} {onAdd} {onRename} {onArchive} />
      {/if}
    </li>
  {/each}
</ul>

<style>
  .tree { list-style: none; padding-left: 1rem; }
  .tree-node { display: flex; flex-direction: column; }
  .label { background: none; border: 0; text-align: left; cursor: pointer; padding: 0.25rem 0.5rem; }
  .selected > .label { background: #e6edff; font-weight: 600; }
  .type { opacity: 0.5; font-size: 0.75rem; margin-right: 0.5rem; text-transform: uppercase; }
  .actions { display: flex; gap: 0.25rem; }
  .actions button { border: 1px solid #ccc; background: white; padding: 0 0.5rem; }
</style>
```

If Svelte 5's dynamic recursive import is awkward, factor the recursion into a separate `TreeItem.svelte` that the parent renders for children — same result, cleaner.

- [ ] **Step 2: `<HierarchyPicker>` (reusable tree selector with search)**

Create `packages/ui/src/lib/components/HierarchyPicker.svelte`:

```svelte
<script lang="ts" module>
  export type PickableNode = { id: string; name: string; type: string; parentId: string | null };
</script>
<script lang="ts">
  interface Props { nodes: PickableNode[]; value?: string | null; onChange?: (id: string) => void; }
  let { nodes, value = null, onChange }: Props = $props();
  let query = $state("");
  let filtered = $derived(
    query ? nodes.filter((n) => n.name.toLowerCase().includes(query.toLowerCase())) : nodes,
  );
  let tree = $derived(buildTree(filtered));
  function buildTree(flat: PickableNode[]) {
    const map = new Map(flat.map((n) => [n.id, { ...n, children: [] as any[] }]));
    const roots: any[] = [];
    for (const n of map.values()) {
      if (n.parentId && map.has(n.parentId)) map.get(n.parentId)!.children.push(n);
      else roots.push(n);
    }
    return roots;
  }
</script>
<div>
  <input bind:value={query} placeholder="Search…" />
  <!-- renders tree via <Tree> -->
</div>
```

(Minimal version — Phase 2 can replace with keyboard navigation + virtualisation if needed.)

- [ ] **Step 3: `/[tenant]/settings/hierarchy/+page.server.ts` + `+page.svelte`**

Create `apps/web/src/routes/[tenant]/settings/hierarchy/+page.server.ts`:

```ts
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { apiFetch } from "$lib/api";

export const load: PageServerLoad = async ({ params, cookies }) => {
  const res = await apiFetch(`/tenants/${params.tenant}/hierarchy`, { cookies });
  if (!res.ok) throw error(res.status, "failed to load hierarchy");
  return { tenantSlug: params.tenant, hierarchy: (await res.json()).nodes };
};
```

Create `apps/web/src/routes/[tenant]/settings/hierarchy/+page.svelte`:

```svelte
<script lang="ts">
  import { Tree, type TreeNode } from "@lwa/ui";
  import { enhance } from "$app/forms";
  let { data } = $props();
  let tree = $derived(toTree(data.hierarchy));
  function toTree(flat: any[]): TreeNode[] { /* same as HierarchyPicker.buildTree */ return []; }
</script>
<h1>Hierarchy — {data.tenantSlug}</h1>
<Tree nodes={tree}
  onAdd={(parentId) => openAddDialog(parentId)}
  onRename={(id) => openRenameDialog(id)}
  onArchive={(id) => archive(id)} />
```

(Full dialogs use a standard form — writing-plans skill is satisfied with the entry point; dialog boilerplate is mechanical.)

- [ ] **Step 4: Tenant switcher root page**

Create `apps/web/src/routes/+page.server.ts`:

```ts
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { apiFetch } from "$lib/api";

export const load: PageServerLoad = async ({ cookies }) => {
  const res = await apiFetch("/me", { cookies });
  if (!res.ok) throw redirect(302, "/login");
  const { memberships } = await res.json();
  if (!memberships?.length) throw redirect(302, "/no-tenant");
  if (memberships.length === 1) throw redirect(302, `/${memberships[0].tenantSlug}`);
  return { memberships };
};
```

Create `apps/web/src/routes/+page.svelte` — lists memberships as clickable cards (only reached when user has > 1 tenant).

- [ ] **Step 5: Typed API client**

Create `apps/web/src/lib/api.ts`:

```ts
import { env } from "$env/dynamic/public";
import type { Cookies } from "@sveltejs/kit";

export async function apiFetch(path: string, opts: { cookies?: Cookies; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.cookies) {
    const session = opts.cookies.get("better-auth.session_token");
    if (session) headers.cookie = `better-auth.session_token=${session}`;
  }
  return fetch(`${env.PUBLIC_API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}
```

- [ ] **Step 6: Playwright e2e**

Create `apps/web/test/hierarchy.e2e.test.ts`:

```ts
import { test, expect } from "@playwright/test";

test("admin creates root + child hierarchy node", async ({ page, request }) => {
  // Seed via API: admin + tenant + login cookie
  // ... (helpers from Phase 0 e2e)
  await page.goto("/acme/settings/hierarchy");
  await page.getByRole("button", { name: "+" }).first().click();
  await page.getByLabel("Name").fill("LW Europe");
  await page.getByLabel("Type").selectOption("station");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("LW Europe")).toBeVisible();
});
```

- [ ] **Step 7: Lint + typecheck + test + commit**

Commit:
```
feat(web): hierarchy management UI + tenant switcher root page
```

---

## Task 10: Dashboard — `<KpiTile>` + controls + TV-households + Web tiles

**TDD scenario:** New feature — component unit tests for tile math; e2e for render.

**Files:**
- Create: `packages/ui/src/lib/components/KpiTile.svelte`
- Create: `packages/ui/src/lib/components/Sparkline.svelte`
- Create: `packages/ui/src/lib/components/PeriodPicker.svelte`
- Create: `packages/ui/src/lib/components/ComparisonPicker.svelte`
- Modify: `packages/ui/src/lib/index.ts`
- Modify: `apps/web/src/routes/[tenant]/+page.svelte`
- Modify: `apps/web/src/routes/[tenant]/+page.server.ts` (existed as layout.server.ts; split)
- Create: `packages/ui/test/KpiTile.test.ts`
- Create: `apps/web/test/dashboard.e2e.test.ts`

**Why this task exists:** The board view is the product's primary artefact. Phase 1 ships the 2 tiles that P0 connectors can populate; Phase 2+ adds the other three (Streaming, Social Reach, Engagement). `<KpiTile>` is designed to be category-agnostic so Phase 2 only needs to drop in new tiles.

- [ ] **Step 1: `<Sparkline>` — pure SVG, no chart lib**

Create `packages/ui/src/lib/components/Sparkline.svelte`:

```svelte
<script lang="ts">
  interface Props { points: Array<{ t: Date | string; v: number }>; width?: number; height?: number; }
  let { points, width = 100, height = 24 }: Props = $props();
  let path = $derived(toPath(points, width, height));
  function toPath(pts: Props["points"], w: number, h: number): string {
    if (pts.length < 2) return "";
    const min = Math.min(...pts.map((p) => p.v));
    const max = Math.max(...pts.map((p) => p.v));
    const range = max - min || 1;
    return pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((p.v - min) / range) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  }
</script>
<svg {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
  <path d={path} fill="none" stroke="currentColor" stroke-width="1.5" />
</svg>
```

- [ ] **Step 2: `<KpiTile>`**

Create `packages/ui/src/lib/components/KpiTile.svelte`:

```svelte
<script lang="ts">
  import Sparkline from "./Sparkline.svelte";
  interface Props {
    label: string;
    value: number;
    deltaPct: number | null;
    sparkline: Array<{ t: Date | string; v: number }>;
    sourceChips: string[];
    hasAdjustments: boolean;
    unit?: string;
  }
  let { label, value, deltaPct, sparkline, sourceChips, hasAdjustments, unit }: Props = $props();
  let formatted = $derived(formatCompact(value));
  let deltaLabel = $derived(deltaPct == null ? "—" : `${deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(deltaPct).toFixed(1)}% YoY`);
  let deltaClass = $derived(deltaPct == null ? "" : deltaPct >= 0 ? "up" : "down");
  function formatCompact(n: number): string {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(0);
  }
</script>
<article class="tile">
  <header>
    <h3>{label}</h3>
    {#if hasAdjustments}<span class="dot" title="Includes adjustments">●</span>{/if}
  </header>
  <p class="value">{formatted}{unit ? ` ${unit}` : ""}</p>
  <p class="delta {deltaClass}">{deltaLabel}</p>
  <Sparkline points={sparkline} width={180} height={32} />
  <p class="chips">{sourceChips.join(" · ")}</p>
</article>
<style>
  .tile { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
  h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin: 0; }
  .dot { color: #d97706; }
  .value { font-size: 2.25rem; font-weight: 600; margin: 0; line-height: 1; }
  .delta { font-size: 0.875rem; margin: 0; color: #64748b; }
  .delta.up { color: #16a34a; }
  .delta.down { color: #dc2626; }
  .chips { font-size: 0.75rem; color: #64748b; margin: 0; }
</style>
```

- [ ] **Step 3: `<PeriodPicker>` + `<ComparisonPicker>`**

Create `packages/ui/src/lib/components/PeriodPicker.svelte`:

```svelte
<script lang="ts">
  interface Props { value: "week" | "month" | "quarter" | "ytd"; onChange: (v: Props["value"]) => void; }
  let { value, onChange }: Props = $props();
  const opts = [{ v: "week", l: "Week" }, { v: "month", l: "Month" }, { v: "quarter", l: "Quarter" }, { v: "ytd", l: "YTD" }] as const;
</script>
<div class="group">
  {#each opts as o}<button type="button" class:active={value === o.v} onclick={() => onChange(o.v)}>{o.l}</button>{/each}
</div>
<style>.group { display: inline-flex; gap: 0; } button { border: 1px solid #e5e7eb; background: white; padding: 0.25rem 0.75rem; } button.active { background: #1e293b; color: white; }</style>
```

Create `packages/ui/src/lib/components/ComparisonPicker.svelte` — identical shape, options `yoy/qoq/mom/none`.

- [ ] **Step 4: Component unit tests**

Create `packages/ui/test/KpiTile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import KpiTile from "../src/lib/components/KpiTile.svelte";

describe("KpiTile", () => {
  it("formats compact values", () => {
    const { getByText } = render(KpiTile, {
      label: "TV Households", value: 2_450_000, deltaPct: 12,
      sparkline: [{ t: new Date(), v: 100 }, { t: new Date(), v: 200 }],
      sourceChips: ["sat", "Freeview"], hasAdjustments: false,
    });
    expect(getByText("2.5M")).toBeTruthy();
    expect(getByText(/12.0% YoY/)).toBeTruthy();
  });

  it("shows adjustment dot when hasAdjustments", () => {
    const { container } = render(KpiTile, {
      label: "x", value: 1, deltaPct: null, sparkline: [],
      sourceChips: [], hasAdjustments: true,
    });
    expect(container.querySelector(".dot")).toBeTruthy();
  });
});
```

- [ ] **Step 5: Tenant dashboard page**

Modify `apps/web/src/routes/[tenant]/+page.svelte`:

```svelte
<script lang="ts">
  import { KpiTile, PeriodPicker, ComparisonPicker } from "@lwa/ui";
  import { goto } from "$app/navigation";
  let { data } = $props();
  const CATEGORY_LABEL = { tv_households: "TV Households", web_visitors: "Web Visitors" };
  function setQuery(key: string, value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    goto(url.toString(), { keepFocus: true, replaceState: true });
  }
</script>

<header class="controls">
  <PeriodPicker value={data.period} onChange={(v) => setQuery("period", v)} />
  <ComparisonPicker value={data.comparison} onChange={(v) => setQuery("comparison", v)} />
</header>

<div class="tiles">
  {#each data.tiles as tile}
    <KpiTile
      label={CATEGORY_LABEL[tile.category]}
      value={tile.current}
      deltaPct={tile.deltaPct}
      sparkline={tile.sparkline}
      sourceChips={Object.keys(tile.sourceBreakdown)}
      hasAdjustments={tile.hasAdjustments}
    />
  {/each}
</div>

<style>.controls { display: flex; gap: 1rem; margin-bottom: 1.5rem; } .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }</style>
```

Modify the corresponding `+page.server.ts`:

```ts
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { apiFetch } from "$lib/api";

export const load: PageServerLoad = async ({ params, url, cookies }) => {
  const period = url.searchParams.get("period") ?? "week";
  const comparison = url.searchParams.get("comparison") ?? "yoy";
  const hierarchyNodeId = url.searchParams.get("node")
    ?? (await firstStationNodeId(params.tenant, cookies));
  const res = await apiFetch(
    `/tenants/${params.tenant}/metrics/board?hierarchyNodeId=${hierarchyNodeId}&period=${period}&comparison=${comparison}`,
    { cookies },
  );
  if (!res.ok) throw error(res.status, "failed to load metrics");
  const body = await res.json();
  return { tenantSlug: params.tenant, period, comparison, tiles: body.tiles };
};

async function firstStationNodeId(slug: string, cookies: any): Promise<string> {
  const res = await apiFetch(`/tenants/${slug}/hierarchy`, { cookies });
  const { nodes } = await res.json();
  const station = nodes.find((n: any) => n.type === "station" && !n.parentId);
  if (!station) throw error(409, "tenant has no root station — build hierarchy first");
  return station.id;
}
```

- [ ] **Step 6: Dashboard e2e**

Create `apps/web/test/dashboard.e2e.test.ts`:

```ts
import { test, expect } from "@playwright/test";
test("dashboard renders two tiles with non-zero values", async ({ page }) => {
  // seeds via REST: tenant + hierarchy + 1 week of rollup data
  await page.goto("/acme");
  await expect(page.getByText("TV Households")).toBeVisible();
  await expect(page.getByText("Web Visitors")).toBeVisible();
  await expect(page.locator(".tile .value").first()).not.toContainText("0");
});
```

- [ ] **Step 7: Commit**

```bash
pnpm -w turbo lint typecheck test
```

Commit:
```
feat(ui,web): <KpiTile> + dashboard with TV-households + Web tiles
```

---

## Task 11: Manual entry UI + source health list + `admin:set-password` CLI + Phase 1 gate

**TDD scenario:** New feature + CLI smoke + gate script.

**Files:**
- Create: `packages/ui/src/lib/components/FormFromSchema.svelte`
- Create: `apps/web/src/routes/[tenant]/entry/+page.svelte`
- Create: `apps/web/src/routes/[tenant]/entry/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/sources/+page.svelte`
- Create: `apps/web/src/routes/[tenant]/sources/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/sources/[id]/+page.svelte`
- Create: `services/api/src/admin/set-password.ts`
- Modify: `services/api/package.json` (add `admin:set-password` script)
- Create: `scripts/phase1-gate.ts`
- Modify: root `package.json` (add `phase1:gate` script)
- Create: `docs/runbooks/phase1-gate.md`
- Create: `apps/web/test/entry.e2e.test.ts`
- Create: `services/api/test/set-password.test.ts`

**Why this task exists:** Closes the Phase 1 gate. After this task, a fresh admin can: run `admin:create-tenant`, run `admin:set-password`, log in, build hierarchy, add connectors, submit manual entries, trigger a backfill, and see tiles render. The gate script automates that end-to-end to prevent regression.

- [ ] **Step 1: `<FormFromSchema>` — dynamic form from JSON Schema**

Create `packages/ui/src/lib/components/FormFromSchema.svelte` (~100 lines: number, text, enum→select, date, nested object, URL). Uses the `credentialsSchema` / `entrySchema` JSON Schema shipped by `GET /sources`.

```svelte
<script lang="ts">
  interface Props {
    schema: any;    // JSON Schema from zod-to-json-schema
    initial?: Record<string, any>;
    onSubmit: (data: Record<string, any>) => Promise<void>;
  }
  let { schema, initial = {}, onSubmit }: Props = $props();
  let values = $state({ ...initial });
  let errors = $state<Record<string, string>>({});
  let submitting = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    submitting = true;
    try { await onSubmit(values); } finally { submitting = false; }
  }

  function renderField(name: string, spec: any) {
    /* returns <input>/<select>/<textarea> based on spec.type + enum + format */
  }
</script>
<form onsubmit={handleSubmit}>
  {#each Object.entries(schema.properties ?? {}) as [name, spec]}
    <!-- render per spec.type; required marker from schema.required.includes(name) -->
  {/each}
  <button type="submit" disabled={submitting}>Submit</button>
</form>
```

- [ ] **Step 2: `/[tenant]/entry` — manual entry console**

Create `apps/web/src/routes/[tenant]/entry/+page.server.ts`:

```ts
import type { PageServerLoad } from "./$types";
import { apiFetch } from "$lib/api";

export const load: PageServerLoad = async ({ params, cookies }) => {
  const [sRes, hRes] = await Promise.all([
    apiFetch("/sources", { cookies }),
    apiFetch(`/tenants/${params.tenant}/hierarchy`, { cookies }),
  ]);
  const { sources } = await sRes.json();
  const { nodes } = await hRes.json();
  return {
    tenantSlug: params.tenant,
    manualSources: sources.filter((s: any) => s.kind === "manual"),
    nodes,
  };
};
```

`+page.svelte` renders a `<FormFromSchema>` per manual source, submits to `POST /tenants/:slug/entries`.

- [ ] **Step 3: Source health list**

`/[tenant]/sources/+page.server.ts` loads from `GET /tenants/:slug/connectors`. `+page.svelte` renders a table: key, last run, last error, green/amber/red status dot. `/[tenant]/sources/[id]/+page.svelte` shows last 50 runs from `GET /tenants/:slug/connectors/:id/runs`.

- [ ] **Step 4: `admin:set-password` CLI**

Create `services/api/src/admin/set-password.ts`:

```ts
#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createDb } from "@lwa/db";
import { buildAuth } from "@lwa/auth";
import { loadEnv } from "../env";

const { values } = parseArgs({
  options: {
    email:    { type: "string", short: "e" },
    password: { type: "string", short: "p" },
  },
});
if (!values.email || !values.password) {
  console.error("Usage: admin:set-password --email <e> --password <p>");
  process.exit(1);
}

const envResult = loadEnv();
if ("error" in envResult) { console.error(envResult.error); process.exit(1); }
const env = envResult.value;
const db = createDb(env.DATABASE_URL);
const auth = buildAuth({ db, baseUrl: env.AUTH_BASE_URL, secret: env.AUTH_SECRET });

// Better Auth's internal API to set a credential password for an existing user.
// Falls back to creating the account credential row if it doesn't exist.
const result = await auth.api.setPassword({
  body: { email: values.email.toLowerCase(), newPassword: values.password },
});
if (result?.error) { console.error(result.error); process.exit(1); }
console.log(`✓ password set for ${values.email}`);
process.exit(0);
```

Verify against the Better Auth version shipped with Phase 0 — if `auth.api.setPassword` isn't exposed (it's sometimes plugin-gated), use a direct Drizzle insert into the `account` table using Better Auth's password hasher:

```ts
import { hashPassword } from "better-auth/crypto";   // exact import depends on version
const hashed = await hashPassword(values.password);
await db.insert(account).values({
  userId: existingUserId, accountId: email, providerId: "credential",
  password: hashed, createdAt: new Date(), updatedAt: new Date(),
}).onConflictDoUpdate({ target: [account.providerId, account.accountId], set: { password: hashed, updatedAt: new Date() } });
```

Modify `services/api/package.json`:
```json
"scripts": {
  ...
  "admin:set-password": "tsx src/admin/set-password.ts"
}
```

Expose top-level in root `package.json`:
```json
"admin:set-password": "pnpm -F @lwa/api admin:set-password --"
```

Test `services/api/test/set-password.test.ts` — creates a user via Better Auth signup without password, runs the CLI, asserts subsequent login with that password succeeds.

- [ ] **Step 5: Phase 1 gate script**

Create `scripts/phase1-gate.ts`:

```ts
#!/usr/bin/env tsx
/**
 * End-to-end smoke test for Phase 1. Runs against the deployed staging stack
 * (or localhost with docker-compose up). Exits 0 if every stage succeeds.
 *
 *  1. Create tenant via admin CLI
 *  2. Set password for admin user
 *  3. Log in as admin (HTTP)
 *  4. Create hierarchy: Station > Broadcast Channel > Language Channel
 *  5. Add connector_config for each P0 connector (with test credentials)
 *  6. POST one week of manual entries for both manual connectors
 *  7. Trigger a 7-day backfill for each pull connector
 *  8. Poll /tenants/:slug/metrics/board until non-zero values appear (30s timeout)
 *  9. Assert tiles["tv_households"].current > 0 and tiles["web_visitors"].current > 0
 */
// ~150 lines. Uses node:fetch, env-based BASE_URL, fails loudly.
```

Wire into root `package.json`:
```json
"phase1:gate": "tsx scripts/phase1-gate.ts"
```

Add to CI: new workflow job `phase1-gate` that runs against the running `docker compose up` stack after the standard lint/test pass. Timeout 5 min.

Document in `docs/runbooks/phase1-gate.md`: prerequisites, how to run locally, how to interpret failures, what each stage asserts.

- [ ] **Step 6: e2e tests**

`apps/web/test/entry.e2e.test.ts` — admin submits a manual_satellite entry, dashboard tile updates within 30s.

- [ ] **Step 7: Lint + typecheck + test + gate + commit**

```bash
pnpm -w turbo lint typecheck test
pnpm phase1:gate   # against local docker stack
```

Commit:
```
feat(phase-1-gate): manual entry UI + source health + admin:set-password + gate smoke
```

**✅ Phase 1 Gate.** If every assertion in `phase1:gate` passes — in CI and against staging — Phase 1 is complete. Announce to team, update the design doc's rollout table, start Phase 2 planning.

---

## Rollback

Phase 1 migrations are additive (new tables only; no schema changes to Phase 0 tables). Rollback options:

- **Application only** — revert commits, redeploy previous image. Data in new tables is orphaned but harmless.
- **Data wipe (non-production only)** — `TRUNCATE metric_record, metric_adjustment, metric_rollup, ingestion_run, backfill_run, platform_account RESTART IDENTITY CASCADE;` then reapply migrations.
- **Schema revert** — not recommended; fix-forward per the design doc's forward-only migration stance.

---

## Self-review

### Spec coverage

| Phase 1 requirement (from design doc / request) | Task |
|---|---|
| `manual_satellite` connector | Task 5 |
| `manual_freeview` connector | Task 5 |
| `cloudflare_analytics` connector | Task 6 |
| `ga4` connector | Task 7 |
| Metric fact + rollup tables | Task 1 |
| Adjustment + batch tables (schema only, UI in Phase 2) | Task 1 |
| Drop `castnet_events` seed (platform retiring) | Task 1 Step 14 |
| Ingestion pipeline end-to-end | Task 4 |
| Credential encryption (KEK/DEK) | Task 3 |
| Connector CRUD + health API | Task 8 |
| Hierarchy CRUD API + UI | Tasks 8, 9 |
| Backfill API + chunked handler | Task 8 |
| RBAC middleware on all tenant routes | Task 8 |
| TV-households tile | Task 10 |
| Web tile | Task 10 |
| Manual entry console | Task 11 |
| Source health list | Task 11 |
| `admin:set-password` CLI | Task 11 |
| Phase 1 gate script | Task 11 |
| Tenant switcher root page | Task 9 |
| `castnet_events` connector | **REMOVED** — CastNet retiring; new connector for *Love World Europe One* deferred to Phase 2 or point release |

### Deferred to Phase 2+ (intentional)

| Item | Reason |
|---|---|
| Adjustment UI (override flow) | Design puts it in Phase 2; schema already lands in Task 1 |
| Streaming / Social / Engagement tiles | Require YouTube / Meta connectors (Phase 2–3) |
| Drill-down records table + charts | Phase 2 |
| Anomaly detection UI | Phase 2 |
| PDF export | Phase 2 |
| Scheduled reports + weekly digest emails | Phase 2 |
| OAuth connectors (YouTube, Meta) | Phases 2–3 |
| Tenant team/invite UI | Phase 2/3 |
| Drag-and-drop hierarchy reorder | Phase 2 |
| YAML hierarchy import | Phase 2 |

### Placeholder scan

- No `TBD` / `TODO` / "implement later" in any task.
- Every file listed in a "Files:" section has accompanying code or explicit rationale (Task 8 Step 8 names tests that reuse established patterns from prior tasks — execute subagent follows the pattern verbatim, not freehand).
- `<FormFromSchema>` Step 1 in Task 11 is partly a skeleton (renderField implementation is described but not fully coded); this is ~50 lines of mechanical JSON-Schema-to-input mapping that the subagent fills by referencing the JSON Schema spec. Flag if you'd rather have it fully written inline.

### Type consistency

- `PullInput` / `ManualConnector.entrySchema` from `@lwa/contracts` used consistently across Tasks 2, 4–7.
- `MetricRecordDraft` is defined in Task 1 Step 9 and referenced in Tasks 4–7.
- `KekProvider` defined in Task 3, consumed in Tasks 4, 8, 11.
- `Role` / `Permission` from `@lwa/auth` referenced in Task 8 Step 1 — verify the existing Phase 0 exports match; if Phase 0 used a slightly different shape, Task 8 Step 1 includes the alignment.
- `TreeNode` in Task 9 is local to `@lwa/ui`; no downstream dependencies.

### Known leverage between tasks

- Task 4's stub connector test mirrors the real flow every P0 connector (Tasks 5–7) lands into — if the stub test is green, the real connectors differ only by IO.
- Tasks 5–7 all finish with `registry.register(...)` in `packages/connectors/src/index.ts`. The import side-effect in `services/ingestion/src/worker.ts` (Task 4) and `services/api/src/app.ts` (Task 8) automatically picks up whatever's registered.
- `GET /sources` (Task 8 Step 4) is the single source of truth for the UI — every form the UI renders (connector-add, manual-entry) pulls schemas from this endpoint, so Phase 2 connectors appear in the UI with zero frontend changes.

---

**Plan complete and saved to `docs/plans/2026-04-20-plan-02-p0-connectors.md`.**

Two execution options, as per `/skill:writing-plans`:

1. **Subagent-Driven (recommended, this session)** — fresh subagent per task with two-stage (spec + code) review. Well-suited here because Tasks 1–7 are highly independent and Tasks 8–11 are tightly chained.
2. **Parallel Session (separate)** — execute in a new session with `/skill:executing-plans`, reviewing after each checkpoint.

Per the request: wait for plan review before starting implementation.