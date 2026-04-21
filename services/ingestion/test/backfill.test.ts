import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Queue, Worker } from "bullmq";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import IORedis from "ioredis";
import type { KekProvider } from "@lwa/crypto";
import {
  connectorConfigRepo,
  backfillRun,
  hierarchyNode,
  ingestionRun,
  platformAccount,
  source,
  tenant,
  user,
  type Database,
} from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import { ConnectorRegistry } from "@lwa/connectors";
import { err } from "@lwa/contracts";
import { createBackfillHandler } from "../src/handlers/backfill";
import { createRollupRefreshHandler } from "../src/handlers/rollup-refresh";
import { QUEUES, type BackfillJobData, type RollupRefreshJobData } from "../src/queues";
import { stubPullConnector } from "./fixtures/stub-connector";

let pgContainer: StartedTestContainer;
let redisContainer: StartedTestContainer;
let db: Database;
let dbCleanup: (() => Promise<void>) | undefined;
let redis: IORedis;
let backfillQueue: Queue<BackfillJobData>;
let rollupQueue: Queue<RollupRefreshJobData>;
let queuePrefix: string;

const kekKey = randomBytes(32);
const kek: KekProvider = {
  currentVersion: "v1",
  getKey: (version) => {
    if (version !== "v1") throw new Error(`unknown kek version: ${version}`);
    return kekKey;
  },
};

beforeAll(async () => {
  pgContainer = await new GenericContainer("postgres:16-alpine")
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "postgres",
      POSTGRES_DB: "postgres",
    })
    .start();

  const pgUrl = `postgres://postgres:postgres@${pgContainer.getHost()}:${pgContainer.getMappedPort(5432)}/postgres`;
  const h = await createTestDb(pgUrl);
  db = h.db;
  dbCleanup = h.cleanup;

  redisContainer = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
  redis = new IORedis(redisContainer.getMappedPort(6379), redisContainer.getHost(), {
    maxRetriesPerRequest: null,
  });

  queuePrefix = `bf:${crypto.randomUUID().slice(0, 8)}`;
  backfillQueue = new Queue(QUEUES.BACKFILL, { connection: redis, prefix: queuePrefix });
  rollupQueue = new Queue(QUEUES.ROLLUP_REFRESH, { connection: redis, prefix: queuePrefix });
}, 90_000);

afterAll(async () => {
  await backfillQueue?.close();
  await rollupQueue?.close();
  await redis?.quit();
  await redisContainer?.stop();
  await dbCleanup?.();
  await pgContainer?.stop();
});

describe("backfill handler", () => {
  it("processes 3 chunks and marks backfill_run completed", async () => {
    const ctx = await seedCtx(db);

    const registry = new ConnectorRegistry();
    registry.register(stubPullConnector);

    const rollupWorker = new Worker(QUEUES.ROLLUP_REFRESH, createRollupRefreshHandler(db, silentLogger()), {
      connection: redis,
      prefix: queuePrefix,
    });

    const backfillWorker = new Worker(
      QUEUES.BACKFILL,
      createBackfillHandler({ db, registry, kek, rollupQueue, redis, logger: silentLogger(), rollupDelayMs: 0 }),
      {
        connection: redis,
        prefix: queuePrefix,
      },
    );

    const [run] = await db
      .insert(backfillRun)
      .values({
        connectorConfigId: ctx.cfgId,
        rangeStart: new Date("2026-01-01T00:00:00.000Z"),
        rangeEnd: new Date("2026-01-22T00:00:00.000Z"),
        chunkSizeDays: 7,
        chunksTotal: 3,
        chunksCompleted: 0,
        startedByUserId: ctx.userId,
        status: "running",
      })
      .returning();

    const chunks = [
      ["2026-01-01T00:00:00.000Z", "2026-01-08T00:00:00.000Z"],
      ["2026-01-08T00:00:00.000Z", "2026-01-15T00:00:00.000Z"],
      ["2026-01-15T00:00:00.000Z", "2026-01-22T00:00:00.000Z"],
    ] as const;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;

      await backfillQueue.add(
        "backfill-chunk",
        {
          connectorConfigId: ctx.cfgId,
          backfillRunId: run!.id,
          chunkIndex: i,
          periodStart: chunk[0],
          periodEnd: chunk[1],
          granularity: "day",
        },
        {
          jobId: `bf:${run!.id}:${i}`,
          removeOnComplete: true,
        },
      );
    }

    await waitFor(async () => {
      const r = await db.query.backfillRun.findFirst({ where: (b, { eq }) => eq(b.id, run!.id) });
      return r?.status === "completed";
    }, 20_000);

    const refreshed = await db.query.backfillRun.findFirst({ where: (b, { eq }) => eq(b.id, run!.id) });
    expect(refreshed?.chunksCompleted).toBe(3);
    expect(refreshed?.status).toBe("completed");

    const records = await db.query.metricRecord.findMany({
      where: (r, { eq }) => eq(r.connectorConfigId, ctx.cfgId),
    });
    expect(records.length).toBeGreaterThan(0);

    await backfillWorker.close();
    await rollupWorker.close();
  }, 45_000);

  it("marks backfill_run failed after terminal chunk failure", async () => {
    const ctx = await seedCtx(db, "_stub_pull_fail");

    const registry = new ConnectorRegistry();
    registry.register(failingStubPullConnector);

    const rollupWorker = new Worker(QUEUES.ROLLUP_REFRESH, createRollupRefreshHandler(db, silentLogger()), {
      connection: redis,
      prefix: queuePrefix,
    });

    const backfillWorker = new Worker(
      QUEUES.BACKFILL,
      createBackfillHandler({ db, registry, kek, rollupQueue, redis, logger: silentLogger(), rollupDelayMs: 0 }),
      {
        connection: redis,
        prefix: queuePrefix,
      },
    );

    const [run] = await db
      .insert(backfillRun)
      .values({
        connectorConfigId: ctx.cfgId,
        rangeStart: new Date("2026-02-01T00:00:00.000Z"),
        rangeEnd: new Date("2026-02-08T00:00:00.000Z"),
        chunkSizeDays: 7,
        chunksTotal: 1,
        chunksCompleted: 0,
        startedByUserId: ctx.userId,
        status: "running",
      })
      .returning();

    await backfillQueue.add(
      "backfill-chunk",
      {
        connectorConfigId: ctx.cfgId,
        backfillRunId: run!.id,
        chunkIndex: 0,
        periodStart: "2026-02-01T00:00:00.000Z",
        periodEnd: "2026-02-08T00:00:00.000Z",
        granularity: "day",
      },
      {
        jobId: `bf:${run!.id}:0`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    await waitFor(async () => {
      const r = await db.query.backfillRun.findFirst({ where: (b, { eq }) => eq(b.id, run!.id) });
      return r?.status === "failed";
    }, 20_000);

    const refreshed = await db.query.backfillRun.findFirst({ where: (b, { eq }) => eq(b.id, run!.id) });
    expect(refreshed?.status).toBe("failed");
    expect(refreshed?.errorMessage).toContain("upstream exploded");

    await backfillWorker.close();
    await rollupWorker.close();
  }, 45_000);

  it("does not overcount chunks under at-least-once redelivery of the same chunk", async () => {
    // At-least-once delivery in BullMQ keeps the same jobId across attempts,
    // so we simulate the state the DB ends up in after redelivery by
    // directly seeding multiple ingestion_run rows for the SAME
    // (backfill_run_id, chunk_index). The handler's recomputeProgress must
    // count that as a single completed chunk.
    const ctx = await seedCtx(db);

    const registry = new ConnectorRegistry();
    registry.register(stubPullConnector);

    const rollupWorker = new Worker(QUEUES.ROLLUP_REFRESH, createRollupRefreshHandler(db, silentLogger()), {
      connection: redis,
      prefix: queuePrefix,
    });

    const backfillWorker = new Worker(
      QUEUES.BACKFILL,
      createBackfillHandler({ db, registry, kek, rollupQueue, redis, logger: silentLogger(), rollupDelayMs: 0 }),
      {
        connection: redis,
        prefix: queuePrefix,
      },
    );

    const [run] = await db
      .insert(backfillRun)
      .values({
        connectorConfigId: ctx.cfgId,
        rangeStart: new Date("2026-03-01T00:00:00.000Z"),
        rangeEnd: new Date("2026-03-15T00:00:00.000Z"),
        chunkSizeDays: 7,
        chunksTotal: 2,
        chunksCompleted: 0,
        startedByUserId: ctx.userId,
        status: "running",
      })
      .returning();

    // Seed: chunk 0 was delivered twice (same jobId), succeeded both times
    // (e.g. worker crashed after writing ingestion_run, was retried). Both
    // rows share (backfill_run_id, chunk_index) = (run.id, 0).
    await db.insert(ingestionRun).values([
      {
        connectorConfigId: ctx.cfgId,
        periodStart: new Date("2026-03-01T00:00:00.000Z"),
        periodEnd: new Date("2026-03-08T00:00:00.000Z"),
        status: "success",
        bullmqJobId: `bf:${run!.id}:0`,
        backfillRunId: run!.id,
        chunkIndex: 0,
        recordsWritten: 1,
      },
      {
        connectorConfigId: ctx.cfgId,
        periodStart: new Date("2026-03-01T00:00:00.000Z"),
        periodEnd: new Date("2026-03-08T00:00:00.000Z"),
        status: "success",
        bullmqJobId: `bf:${run!.id}:0`,
        backfillRunId: run!.id,
        chunkIndex: 0,
        recordsWritten: 1,
      },
    ]);

    // Now run chunk 1 through the real handler. The handler recomputes
    // progress from ingestion_run; it must see chunk 0 as exactly one
    // completed chunk (DISTINCT on chunk_index) + chunk 1 we're processing.
    await backfillQueue.add(
      "backfill-chunk",
      {
        connectorConfigId: ctx.cfgId,
        backfillRunId: run!.id,
        chunkIndex: 1,
        periodStart: "2026-03-08T00:00:00.000Z",
        periodEnd: "2026-03-15T00:00:00.000Z",
        granularity: "day",
      },
      {
        jobId: `bf:${run!.id}:1`,
        removeOnComplete: true,
      },
    );

    await waitFor(async () => {
      const r = await db.query.backfillRun.findFirst({ where: (b, { eq }) => eq(b.id, run!.id) });
      return r?.status === "completed";
    }, 20_000);

    const refreshed = await db.query.backfillRun.findFirst({ where: (b, { eq }) => eq(b.id, run!.id) });
    expect(refreshed?.chunksCompleted).toBe(2);
    expect(refreshed?.status).toBe("completed");

    await backfillWorker.close();
    await rollupWorker.close();
  }, 45_000);
});

async function seedCtx(db: Database, sourceKey = "_stub_pull") {
  const suffix = crypto.randomUUID().slice(0, 8);

  const [t] = await db.insert(tenant).values({ name: `Backfill-${suffix}`, slug: `bf-${suffix}` }).returning();
  const [node] = await db
    .insert(hierarchyNode)
    .values({ tenantId: t!.id, type: "station", name: "Node", slug: `node-${suffix}` })
    .returning();

  const [u] = await db
    .insert(user)
    .values({ email: `bf-${suffix}@example.com`, name: "Backfill User", emailVerified: true })
    .returning();

  const [src] = await db
    .insert(source)
    .values({ key: sourceKey, name: "Stub", category: "web", authMethod: "none" })
    .onConflictDoNothing({ target: source.key })
    .returning();

  const sourceRow = src ?? (await db.query.source.findFirst({ where: (s, { eq }) => eq(s.key, sourceKey) }));

  const cfg = await connectorConfigRepo(db, kek).create({
    tenantId: t!.id,
    sourceId: sourceRow!.id,
    schedule: "0 * * * *",
    credentials: {},
  });

  await db.insert(platformAccount).values({
    tenantId: t!.id,
    hierarchyNodeId: node!.id,
    sourceId: sourceRow!.id,
    externalId: `ext-${suffix}`,
    displayName: "Account",
  });

  return { tenantId: t!.id, cfgId: cfg.id, userId: u!.id };
}

const failingStubPullConnector = {
  ...stubPullConnector,
  key: "_stub_pull_fail",
  pull: async () =>
    err({
      code: "CONFIG_INVALID" as const,
      message: "upstream exploded",
      retryable: false,
    }),
};

function silentLogger() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timeout waiting for condition");
}
