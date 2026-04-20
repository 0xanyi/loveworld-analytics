import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import type { Database } from "../src/client";
import * as schema from "../src/schema";
import { tenant, hierarchyNode, source, connectorConfig, metricRecord } from "../src/schema";
import { metricRollupRepo } from "../src/repositories/metric-rollup";
import { hashDimensions } from "../src/repositories/metric-record";

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

describe("metricRollupRepo", () => {
  it("refreshBucket sums effective_value across hierarchy subtree", async () => {
    const ctx = await seedTree();
    const repo = metricRollupRepo(db);
    await repo.refreshBucket({
      tenantId: ctx.tenantId,
      hierarchyNodeId: ctx.stationId,
      metricCategory: "web_visitors",
      granularity: "week",
      bucketStart: new Date("2026-01-05T00:00:00Z"),
      bucketEnd: new Date("2026-01-12T00:00:00Z"),
    });
    const rows = await db.execute<{
      effective_total: string;
      record_count: number;
      source_breakdown: Record<string, number>;
    }>(sql`
      SELECT effective_total, record_count, source_breakdown
      FROM metric_rollup
      WHERE hierarchy_node_id = ${ctx.stationId}::uuid
    `);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.effective_total)).toBe(300); // 100 (broadcast) + 200 (language)
    expect(rows[0]!.record_count).toBe(2);
    // source_breakdown is jsonb — postgres-js decodes as a JS object
    expect(Number(rows[0]!.source_breakdown[ctx.sourceKey])).toBe(300);
  });

  it("refreshBucket on a leaf includes only its own rows", async () => {
    const ctx = await seedTree();
    const repo = metricRollupRepo(db);
    await repo.refreshBucket({
      tenantId: ctx.tenantId,
      hierarchyNodeId: ctx.langId,
      metricCategory: "web_visitors",
      granularity: "week",
      bucketStart: new Date("2026-01-05T00:00:00Z"),
      bucketEnd: new Date("2026-01-12T00:00:00Z"),
    });
    const rows = await db.execute<{ effective_total: string; record_count: number }>(sql`
      SELECT effective_total, record_count FROM metric_rollup
      WHERE hierarchy_node_id = ${ctx.langId}::uuid
    `);
    expect(Number(rows[0]!.effective_total)).toBe(200);
    expect(rows[0]!.record_count).toBe(1);
  });

  it("refreshBucket is idempotent — second refresh overwrites without duplicating", async () => {
    const ctx = await seedTree();
    const repo = metricRollupRepo(db);
    const input = {
      tenantId: ctx.tenantId,
      hierarchyNodeId: ctx.stationId,
      metricCategory: "web_visitors" as const,
      granularity: "week" as const,
      bucketStart: new Date("2026-01-05T00:00:00Z"),
      bucketEnd: new Date("2026-01-12T00:00:00Z"),
    };
    await repo.refreshBucket(input);
    await repo.refreshBucket(input);
    const rows = await db.execute<{ c: number }>(sql`
      SELECT COUNT(*)::int AS c FROM metric_rollup
      WHERE hierarchy_node_id = ${ctx.stationId}::uuid
    `);
    expect(rows[0]!.c).toBe(1);
  });

  it("refreshBucket writes zero totals when subtree has no records in the window", async () => {
    const ctx = await seedTree();
    const repo = metricRollupRepo(db);
    // Window that intentionally misses all seeded rows (which are in January).
    await repo.refreshBucket({
      tenantId: ctx.tenantId,
      hierarchyNodeId: ctx.stationId,
      metricCategory: "web_visitors",
      granularity: "week",
      bucketStart: new Date("2027-06-01T00:00:00Z"),
      bucketEnd: new Date("2027-06-08T00:00:00Z"),
    });
    const rows = await db.execute<{ effective_total: string; record_count: number }>(sql`
      SELECT effective_total, record_count FROM metric_rollup
      WHERE hierarchy_node_id = ${ctx.stationId}::uuid
        AND bucket_start = '2027-06-01T00:00:00Z'
    `);
    expect(Number(rows[0]!.effective_total)).toBe(0);
    expect(rows[0]!.record_count).toBe(0);
  });

  it("getAncestors returns the chain from leaf to root, inclusive", async () => {
    const ctx = await seedTree();
    const repo = metricRollupRepo(db);
    const ancestors = await repo.getAncestors(ctx.tenantId, ctx.langId);
    expect(ancestors).toHaveLength(3);
    expect(ancestors[0]).toBe(ctx.langId);
    expect(ancestors[1]).toBe(ctx.broadcastId);
    expect(ancestors[2]).toBe(ctx.stationId);
  });

  it("getAncestors returns only the node itself when it has no parent", async () => {
    const ctx = await seedTree();
    const repo = metricRollupRepo(db);
    const ancestors = await repo.getAncestors(ctx.tenantId, ctx.stationId);
    expect(ancestors).toEqual([ctx.stationId]);
  });
});

async function seedTree() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const [t] = await db
    .insert(tenant)
    .values({ name: `Acme-${suffix}`, slug: `acme-${suffix}` })
    .returning();
  const [station] = await db
    .insert(hierarchyNode)
    .values({ tenantId: t!.id, type: "station", name: "LWE", slug: `lwe-${suffix}` })
    .returning();
  const [broadcast] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: t!.id,
      type: "broadcast_channel",
      name: "English",
      slug: `en-${suffix}`,
      parentId: station!.id,
    })
    .returning();
  const [lang] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: t!.id,
      type: "language_channel",
      name: "French",
      slug: `fr-${suffix}`,
      parentId: broadcast!.id,
    })
    .returning();
  const sourceKey = `cf-${suffix}`;
  const [src] = await db
    .insert(source)
    .values({ key: sourceKey, name: "CF", category: "web", authMethod: "none" })
    .returning();
  const [cfg] = await db
    .insert(connectorConfig)
    .values({ tenantId: t!.id, sourceId: src!.id, schedule: "0 3 * * *" })
    .returning();
  const base = {
    tenantId: t!.id,
    sourceId: src!.id,
    connectorConfigId: cfg!.id,
    metricType: "page_views",
    metricCategory: "web_visitors" as const,
    dimensions: {} as Record<string, string>,
    dimensionsHash: hashDimensions({}),
    granularity: "day" as const,
    unit: "count",
    provenance: `connector:${cfg!.id}`,
  };
  await db.insert(metricRecord).values([
    {
      ...base,
      hierarchyNodeId: broadcast!.id,
      rawValue: "100",
      periodStart: new Date("2026-01-05T00:00:00Z"),
      periodEnd: new Date("2026-01-06T00:00:00Z"),
    },
    {
      ...base,
      hierarchyNodeId: lang!.id,
      rawValue: "200",
      periodStart: new Date("2026-01-06T00:00:00Z"),
      periodEnd: new Date("2026-01-07T00:00:00Z"),
    },
  ]);
  return {
    tenantId: t!.id,
    stationId: station!.id,
    broadcastId: broadcast!.id,
    langId: lang!.id,
    sourceKey,
  };
}
