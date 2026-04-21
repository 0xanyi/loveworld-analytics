import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import type { Database } from "../src/client";
import * as schema from "../src/schema";
import {
  tenant,
  user,
  hierarchyNode,
  source,
  connectorConfig,
  metricRecord,
  metricAdjustment,
} from "../src/schema";

let container: StartedPostgreSqlContainer;
let db: Database;
let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  client = postgres(container.getConnectionUri(), { max: 5 });
  db = drizzle(client, { schema }) as unknown as Database;
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
}, 60_000);

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe("effective_metric view", () => {
  it("returns raw_value when no adjustment exists", async () => {
    const ctx = await seedBaseRow();
    const rows = await db.execute<{ effective_value: string; has_adjustment: boolean }>(sql`
      SELECT effective_value, has_adjustment
      FROM effective_metric
      WHERE metric_record_id = ${ctx.recordId}
    `);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.effective_value)).toBe(1000);
    expect(rows[0]!.has_adjustment).toBe(false);
  });

  it("returns adjusted_value for replace adjustment", async () => {
    const ctx = await seedBaseRow();
    await db.insert(metricAdjustment).values({
      metricRecordId: ctx.recordId,
      tenantId: ctx.tenantId,
      adjustmentType: "replace",
      adjustedValue: "1500",
      reason: "BARB correction",
      authorUserId: ctx.userId,
      status: "applied",
    });
    const rows = await db.execute<{ effective_value: string; has_adjustment: boolean }>(sql`
      SELECT effective_value, has_adjustment
      FROM effective_metric
      WHERE metric_record_id = ${ctx.recordId}
    `);
    expect(Number(rows[0]!.effective_value)).toBe(1500);
    expect(rows[0]!.has_adjustment).toBe(true);
  });

  it("returns raw + delta for delta adjustment", async () => {
    const ctx = await seedBaseRow();
    await db.insert(metricAdjustment).values({
      metricRecordId: ctx.recordId,
      tenantId: ctx.tenantId,
      adjustmentType: "delta",
      adjustedValue: "250",
      reason: "late arrivals",
      authorUserId: ctx.userId,
      status: "applied",
    });
    const rows = await db.execute<{ effective_value: string }>(sql`
      SELECT effective_value FROM effective_metric WHERE metric_record_id = ${ctx.recordId}
    `);
    expect(Number(rows[0]!.effective_value)).toBe(1250);
  });

  it("ignores draft + reversed adjustments — falls back to raw_value", async () => {
    const ctx = await seedBaseRow();
    await db.insert(metricAdjustment).values([
      {
        metricRecordId: ctx.recordId,
        tenantId: ctx.tenantId,
        adjustmentType: "replace",
        adjustedValue: "9999",
        reason: "pending review",
        authorUserId: ctx.userId,
        status: "draft",
      },
      {
        metricRecordId: ctx.recordId,
        tenantId: ctx.tenantId,
        adjustmentType: "replace",
        adjustedValue: "8888",
        reason: "rolled back",
        authorUserId: ctx.userId,
        status: "reversed",
      },
    ]);
    const rows = await db.execute<{ effective_value: string; has_adjustment: boolean }>(sql`
      SELECT effective_value, has_adjustment
      FROM effective_metric WHERE metric_record_id = ${ctx.recordId}
    `);
    expect(Number(rows[0]!.effective_value)).toBe(1000);
    expect(rows[0]!.has_adjustment).toBe(false);
  });

  it("picks the most recent applied adjustment when multiple exist", async () => {
    const ctx = await seedBaseRow();
    // Older applied adjustment.
    await db.insert(metricAdjustment).values({
      metricRecordId: ctx.recordId,
      tenantId: ctx.tenantId,
      adjustmentType: "replace",
      adjustedValue: "1200",
      reason: "first correction",
      authorUserId: ctx.userId,
      status: "superseded",
      createdAt: new Date("2026-01-01T10:00:00Z"),
    });
    // Newer applied adjustment — should win.
    await db.insert(metricAdjustment).values({
      metricRecordId: ctx.recordId,
      tenantId: ctx.tenantId,
      adjustmentType: "replace",
      adjustedValue: "1800",
      reason: "revised correction",
      authorUserId: ctx.userId,
      status: "applied",
      createdAt: new Date("2026-01-02T10:00:00Z"),
    });
    const rows = await db.execute<{ effective_value: string }>(sql`
      SELECT effective_value FROM effective_metric WHERE metric_record_id = ${ctx.recordId}
    `);
    expect(Number(rows[0]!.effective_value)).toBe(1800);
  });

  it("deterministic tie-break on id when created_at ties (review P1 fix)", async () => {
    const ctx = await seedBaseRow();
    // Two adjustments with identical created_at — id DESC decides which wins.
    const sameInstant = new Date("2026-01-03T12:00:00Z");
    await db.insert(metricAdjustment).values([
      {
        metricRecordId: ctx.recordId,
        tenantId: ctx.tenantId,
        adjustmentType: "replace",
        adjustedValue: "100",
        reason: "tie A",
        authorUserId: ctx.userId,
        status: "applied",
        createdAt: sameInstant,
      },
      {
        metricRecordId: ctx.recordId,
        tenantId: ctx.tenantId,
        adjustmentType: "replace",
        adjustedValue: "200",
        reason: "tie B",
        authorUserId: ctx.userId,
        status: "applied",
        createdAt: sameInstant,
      },
    ]);
    const picked = await db.execute<{ applied_adjustment_id: string; effective_value: string }>(sql`
      SELECT applied_adjustment_id, effective_value FROM effective_metric
      WHERE metric_record_id = ${ctx.recordId}
    `);
    // Query the adjustments sorted by id DESC to discover which one the view should pick.
    const sortedByIdDesc = await db.execute<{ id: string; adjusted_value: string }>(sql`
      SELECT id::text, adjusted_value FROM metric_adjustment
      WHERE metric_record_id = ${ctx.recordId} AND created_at = ${sameInstant.toISOString()}::timestamptz
      ORDER BY id DESC LIMIT 1
    `);
    expect(picked[0]!.applied_adjustment_id).toBe(sortedByIdDesc[0]!.id);
    expect(Number(picked[0]!.effective_value)).toBe(Number(sortedByIdDesc[0]!.adjusted_value));

    // Repeat the read — must return the same adjustment_id. Guards against
    // non-determinism that would cause dashboards to flip between refreshes.
    const again = await db.execute<{ applied_adjustment_id: string }>(sql`
      SELECT applied_adjustment_id FROM effective_metric
      WHERE metric_record_id = ${ctx.recordId}
    `);
    expect(again[0]!.applied_adjustment_id).toBe(picked[0]!.applied_adjustment_id);
  });
});

async function seedBaseRow() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const [t] = await db
    .insert(tenant)
    .values({ name: `Acme-${suffix}`, slug: `acme-${suffix}` })
    .returning();
  const [u] = await db
    .insert(user)
    .values({ email: `${suffix}@example.com`, name: "Author" })
    .returning();
  const [node] = await db
    .insert(hierarchyNode)
    .values({ tenantId: t!.id, type: "station", name: "Main", slug: `main-${suffix}` })
    .returning();
  const [src] = await db
    .insert(source)
    .values({
      key: `src-${suffix}`,
      name: "src",
      category: "tv_broadcast",
      authMethod: "none",
    })
    .returning();
  const [cfg] = await db
    .insert(connectorConfig)
    .values({ tenantId: t!.id, sourceId: src!.id, schedule: "0 3 * * *" })
    .returning();
  const [rec] = await db
    .insert(metricRecord)
    .values({
      tenantId: t!.id,
      sourceId: src!.id,
      connectorConfigId: cfg!.id,
      hierarchyNodeId: node!.id,
      metricType: "households",
      metricCategory: "tv_households",
      dimensions: {},
      dimensionsHash: "0",
      periodStart: new Date("2026-01-05T00:00:00Z"),
      periodEnd: new Date("2026-01-12T00:00:00Z"),
      granularity: "week",
      rawValue: "1000",
      unit: "households",
      provenance: `connector:${cfg!.id}`,
    })
    .returning();
  return { tenantId: t!.id, userId: u!.id, recordId: rec!.id };
}
