import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import type { Database } from "../src/client";
import * as schema from "../src/schema";

/**
 * Applies every migration in drizzle/ against a fresh Postgres and confirms
 * the expected set of tables and views exists. Guards against:
 *   - a manual migration (e.g. the effective_metric view) being missing from
 *     `_journal.json`
 *   - snapshot drift between `drizzle-kit generate` runs
 *   - a DDL error that only surfaces at migration time (FK ordering, etc.)
 */

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

describe("migrations", () => {
  it("creates every Phase 0 + Phase 1 table", async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tables = new Set(rows.map((r) => r.table_name));
    // Phase 0
    for (const t of [
      "tenant",
      "user",
      "session",
      "account",
      "verification",
      "two_factor",
      "tenant_membership",
      "hierarchy_node",
      "source",
      "connector_config",
      "audit_log",
    ]) {
      expect(tables.has(t), `missing Phase 0 table: ${t}`).toBe(true);
    }
    // Phase 1
    for (const t of [
      "platform_account",
      "metric_record",
      "metric_adjustment",
      "adjustment_batch",
      "metric_rollup",
      "ingestion_run",
      "backfill_run",
    ]) {
      expect(tables.has(t), `missing Phase 1 table: ${t}`).toBe(true);
    }
  });

  it("creates the effective_metric view", async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'effective_metric'
    `);
    expect(rows).toHaveLength(1);
  });

  it("enforces the metric_record dedup unique index", async () => {
    const rows = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'metric_record'
    `);
    const names = rows.map((r) => r.indexname);
    expect(names).toContain("metric_record_dedup_idx");
  });
});
