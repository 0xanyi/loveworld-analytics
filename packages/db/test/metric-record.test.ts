import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import type { Database } from "../src/client";
import * as schema from "../src/schema";
import { tenant, hierarchyNode, source, connectorConfig } from "../src/schema";
import { metricRecordRepo, hashDimensions } from "../src/repositories/metric-record";

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

describe("hashDimensions", () => {
  it("is order-independent", () => {
    expect(hashDimensions({ a: "1", b: "2" })).toBe(hashDimensions({ b: "2", a: "1" }));
  });

  it("differs on value changes", () => {
    expect(hashDimensions({ a: "1" })).not.toBe(hashDimensions({ a: "2" }));
  });

  it("differs on key changes", () => {
    expect(hashDimensions({ a: "1" })).not.toBe(hashDimensions({ b: "1" }));
  });

  it("handles the empty object deterministically", () => {
    expect(hashDimensions({})).toBe(hashDimensions({}));
  });
});

describe("metricRecordRepo.upsertMany", () => {
  it("is idempotent — second run updates raw_value, same row count", async () => {
    const ctx = await seedCtx();
    const repo = metricRecordRepo(db);
    const draft = {
      tenantId: ctx.t.id,
      sourceId: ctx.src.id,
      connectorConfigId: ctx.cfg.id,
      hierarchyNodeId: ctx.node.id,
      metricType: "page_views",
      metricCategory: "web_visitors" as const,
      dimensions: { country: "GB" },
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-01-02T00:00:00Z"),
      granularity: "day" as const,
      rawValue: "100",
      unit: "count",
      provenance: `connector:${ctx.cfg.id}`,
    };
    const r1 = await repo.upsertMany([draft]);
    const r2 = await repo.upsertMany([{ ...draft, rawValue: "150" }]);
    expect(r1.written).toBe(1);
    expect(r2.written).toBe(1);
    const rows = await db.execute<{ c: number; v: string }>(sql`
      SELECT COUNT(*)::int AS c, MAX(raw_value) AS v
      FROM metric_record
      WHERE tenant_id = ${ctx.t.id}
    `);
    expect(rows[0]!.c).toBe(1);
    expect(Number(rows[0]!.v)).toBe(150);
  });

  it("different dimensions produce separate rows", async () => {
    const ctx = await seedCtx();
    const repo = metricRecordRepo(db);
    const base = {
      tenantId: ctx.t.id,
      sourceId: ctx.src.id,
      connectorConfigId: ctx.cfg.id,
      hierarchyNodeId: ctx.node.id,
      metricType: "page_views",
      metricCategory: "web_visitors" as const,
      periodStart: new Date("2026-02-01T00:00:00Z"),
      periodEnd: new Date("2026-02-02T00:00:00Z"),
      granularity: "day" as const,
      rawValue: "50",
      unit: "count",
      provenance: `connector:${ctx.cfg.id}`,
    };
    await repo.upsertMany([
      { ...base, dimensions: { country: "GB" } },
      { ...base, dimensions: { country: "US" } },
    ]);
    const rows = await db.execute<{ c: number }>(sql`
      SELECT COUNT(*)::int AS c
      FROM metric_record
      WHERE tenant_id = ${ctx.t.id} AND period_start = '2026-02-01T00:00:00Z'
    `);
    expect(rows[0]!.c).toBe(2);
  });

  it("returns { written: 0 } on an empty batch without touching the DB", async () => {
    const ctx = await seedCtx();
    const repo = metricRecordRepo(db);
    const before = await db.execute<{ c: number }>(sql`
      SELECT COUNT(*)::int AS c FROM metric_record WHERE tenant_id = ${ctx.t.id}
    `);
    const r = await repo.upsertMany([]);
    const after = await db.execute<{ c: number }>(sql`
      SELECT COUNT(*)::int AS c FROM metric_record WHERE tenant_id = ${ctx.t.id}
    `);
    expect(r.written).toBe(0);
    expect(after[0]!.c).toBe(before[0]!.c);
  });
});

async function seedCtx() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const [t] = await db
    .insert(tenant)
    .values({ name: `Acme-${suffix}`, slug: `acme-${suffix}` })
    .returning();
  const [node] = await db
    .insert(hierarchyNode)
    .values({ tenantId: t!.id, type: "station", name: "Main", slug: `main-${suffix}` })
    .returning();
  const [src] = await db
    .insert(source)
    .values({ key: `src-${suffix}`, name: "src", category: "web", authMethod: "none" })
    .returning();
  const [cfg] = await db
    .insert(connectorConfig)
    .values({ tenantId: t!.id, sourceId: src!.id, schedule: "0 3 * * *" })
    .returning();
  return { t: t!, node: node!, src: src!, cfg: cfg! };
}
