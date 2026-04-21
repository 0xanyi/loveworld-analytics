import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Queue, Worker, type Job } from "bullmq";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import IORedis from "ioredis";
import { ok, type PullConnector } from "@lwa/contracts";
import type { KekProvider } from "@lwa/crypto";
import {
  connectorConfigRepo,
  hierarchyNode,
  platformAccount,
  source,
  tenant,
  type Database,
} from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import { ConnectorRegistry } from "@lwa/connectors";
import { createPullHandler } from "../src/handlers/pull";
import { createRollupRefreshHandler } from "../src/handlers/rollup-refresh";
import { QUEUES, type PullJobData, type RollupRefreshJobData } from "../src/queues";
import { stubPullConnector } from "./fixtures/stub-connector";

let pgContainer: StartedTestContainer;
let redisContainer: StartedTestContainer;
let db: Database;
let dbCleanup: (() => Promise<void>) | undefined;
let redis: IORedis;
let rollupQueue: Queue<RollupRefreshJobData>;
let rollupWorker: Worker<RollupRefreshJobData>;
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

  queuePrefix = `it:${crypto.randomUUID().slice(0, 8)}`;
  rollupQueue = new Queue(QUEUES.ROLLUP_REFRESH, {
    connection: redis,
    prefix: queuePrefix,
  });

  rollupWorker = new Worker(QUEUES.ROLLUP_REFRESH, createRollupRefreshHandler(db, silentLogger()), {
    connection: redis,
    prefix: queuePrefix,
  });
}, 90_000);

afterAll(async () => {
  await rollupWorker?.close();
  await rollupQueue?.close();
  await redis?.quit();
  await redisContainer?.stop();
  await dbCleanup?.();
  await pgContainer?.stop();
});

describe("pipeline end-to-end", () => {
  it("pull handler upserts metric_record, enqueues rollup.refresh, and updates rollups idempotently", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);

    const [t] = await db.insert(tenant).values({ name: `Acme-${suffix}`, slug: `acme-${suffix}` }).returning();
    const [station] = await db
      .insert(hierarchyNode)
      .values({ tenantId: t!.id, type: "station", name: "Station", slug: `st-${suffix}` })
      .returning();
    const [channel] = await db
      .insert(hierarchyNode)
      .values({
        tenantId: t!.id,
        type: "broadcast_channel",
        parentId: station!.id,
        name: "Channel",
        slug: `ch-${suffix}`,
      })
      .returning();

    const [src] = await db
      .insert(source)
      .values({
        key: "_stub_pull",
        name: "Stub",
        category: "web",
        authMethod: "none",
      })
      .returning();

    const cfgRepo = connectorConfigRepo(db, kek);
    const cfg = await cfgRepo.create({
      tenantId: t!.id,
      sourceId: src!.id,
      schedule: "0 * * * *",
      credentials: {},
    });

    const [pa] = await db
      .insert(platformAccount)
      .values({
        tenantId: t!.id,
        hierarchyNodeId: channel!.id,
        sourceId: src!.id,
        externalId: `ext-${suffix}`,
        displayName: "Site",
      })
      .returning();

    const registry = new ConnectorRegistry();
    registry.register(stubPullConnector);

    const handler = createPullHandler({
      db,
      registry,
      kek,
      rollupQueue,
      redis,
      logger: silentLogger(),
      rollupDelayMs: 0,
    });

    const jobData: PullJobData = {
      connectorConfigId: cfg.id,
      periodStart: "2026-01-05T00:00:00.000Z",
      periodEnd: "2026-01-06T00:00:00.000Z",
      granularity: "day",
    };

    await handler(fakeJob(jobData));

    const metricRows = await db.query.metricRecord.findMany({
      where: (mr, { eq }) => eq(mr.connectorConfigId, cfg.id),
    });
    expect(metricRows).toHaveLength(1);
    expect(Number(metricRows[0]!.rawValue)).toBe(42);

    await waitFor(async () => {
      const rows = await db.query.metricRollup.findMany({
        where: (r, { eq }) => eq(r.tenantId, t!.id),
      });
      return rows.length >= 2;
    });

    const rollups = await db.query.metricRollup.findMany({
      where: (r, { eq }) => eq(r.tenantId, t!.id),
    });
    expect(rollups.length).toBe(2);
    expect(rollups.every((r) => Number(r.effectiveTotal) === 42)).toBe(true);

    await handler(fakeJob(jobData));

    const metricRows2 = await db.query.metricRecord.findMany({
      where: (mr, { eq }) => eq(mr.connectorConfigId, cfg.id),
    });
    expect(metricRows2).toHaveLength(1);

    const runs = await db.query.ingestionRun.findMany({
      where: (r, { eq }) => eq(r.connectorConfigId, cfg.id),
      columns: { status: true, recordsWritten: true },
    });
    expect(runs.some((r) => r.status === "success" && r.recordsWritten === 1)).toBe(true);

    const account = await db.query.platformAccount.findFirst({
      where: (a, { eq }) => eq(a.id, pa!.id),
      columns: { lastSyncedAt: true },
    });
    expect(account!.lastSyncedAt).toBeTruthy();

    const updatedCfg = await db.query.connectorConfig.findFirst({
      where: (c, { eq }) => eq(c.id, cfg.id),
      columns: { status: true, lastRunAt: true },
    });
    expect(updatedCfg!.status).toBe("active");
    expect(updatedCfg!.lastRunAt).toBeTruthy();
  }, 45_000);

  it("computes period window at execution time when scheduler payload omits period bounds", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);

    const [t] = await db.insert(tenant).values({ name: `Runtime-${suffix}`, slug: `runtime-${suffix}` }).returning();
    const [node] = await db
      .insert(hierarchyNode)
      .values({ tenantId: t!.id, type: "station", name: "Node", slug: `node-${suffix}` })
      .returning();

    const sourceKey = `_runtime_pull_${suffix}`;
    const [src] = await db
      .insert(source)
      .values({
        key: sourceKey,
        name: "Runtime Pull",
        category: "web",
        authMethod: "none",
      })
      .returning();

    const cfg = await connectorConfigRepo(db, kek).create({
      tenantId: t!.id,
      sourceId: src!.id,
      schedule: "* * * * *",
      credentials: {},
    });

    await db.insert(platformAccount).values({
      tenantId: t!.id,
      hierarchyNodeId: node!.id,
      sourceId: src!.id,
      externalId: `runtime-${suffix}`,
      displayName: "Runtime",
    });

    let seenStart: Date | undefined;
    let seenEnd: Date | undefined;
    const runtimeConnector: PullConnector = {
      key: sourceKey,
      name: "Runtime Pull",
      category: "web_visitors",
      kind: "pull",
      authMethod: "none",
      credentialsSchema: stubPullConnector.credentialsSchema,
      supportedGranularities: ["hour"],
      validateCredentials: async () => ok(undefined),
      pull: async (input) => {
        seenStart = input.period.start;
        seenEnd = input.period.end;
        return ok({ records: [] });
      },
    };

    const registry = new ConnectorRegistry();
    registry.register(runtimeConnector);

    const handler = createPullHandler({
      db,
      registry,
      kek,
      rollupQueue,
      redis,
      logger: silentLogger(),
      rollupDelayMs: 0,
    });

    await handler(fakeJob({ connectorConfigId: cfg.id, granularity: "hour" }));

    expect(seenStart).toBeTruthy();
    expect(seenEnd).toBeTruthy();
    const spanMs = seenEnd!.getTime() - seenStart!.getTime();
    expect(spanMs).toBeGreaterThanOrEqual(3_590_000);
    expect(spanMs).toBeLessThanOrEqual(3_610_000);
  }, 45_000);

  it("fails run when connector returns hierarchy node outside tenant boundary", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);

    const [tenantA] = await db
      .insert(tenant)
      .values({ name: `BoundaryA-${suffix}`, slug: `boundary-a-${suffix}` })
      .returning();
    const [tenantB] = await db
      .insert(tenant)
      .values({ name: `BoundaryB-${suffix}`, slug: `boundary-b-${suffix}` })
      .returning();

    const [nodeA] = await db
      .insert(hierarchyNode)
      .values({ tenantId: tenantA!.id, type: "station", name: "NodeA", slug: `node-a-${suffix}` })
      .returning();
    const [nodeB] = await db
      .insert(hierarchyNode)
      .values({ tenantId: tenantB!.id, type: "station", name: "NodeB", slug: `node-b-${suffix}` })
      .returning();

    const sourceKey = `_boundary_pull_${suffix}`;
    const [src] = await db
      .insert(source)
      .values({
        key: sourceKey,
        name: "Boundary Pull",
        category: "web",
        authMethod: "none",
      })
      .returning();

    const cfg = await connectorConfigRepo(db, kek).create({
      tenantId: tenantA!.id,
      sourceId: src!.id,
      schedule: "0 * * * *",
      credentials: {},
    });

    await db.insert(platformAccount).values({
      tenantId: tenantA!.id,
      hierarchyNodeId: nodeA!.id,
      sourceId: src!.id,
      externalId: `boundary-${suffix}`,
      displayName: "Boundary",
    });

    const boundaryConnector: PullConnector = {
      key: sourceKey,
      name: "Boundary Pull",
      category: "web_visitors",
      kind: "pull",
      authMethod: "none",
      credentialsSchema: stubPullConnector.credentialsSchema,
      supportedGranularities: ["day"],
      validateCredentials: async () => ok(undefined),
      pull: async (input) =>
        ok({
          records: [
            {
              hierarchyNodeId: nodeB!.id,
              metricType: "page_views",
              metricCategory: "web_visitors",
              dimensions: {},
              periodStart: input.period.start,
              periodEnd: input.period.end,
              granularity: "day",
              value: 1,
              unit: "count",
            },
          ],
        }),
    };

    const registry = new ConnectorRegistry();
    registry.register(boundaryConnector);

    const handler = createPullHandler({
      db,
      registry,
      kek,
      rollupQueue,
      redis,
      logger: silentLogger(),
      rollupDelayMs: 0,
    });

    await handler(
      fakeJob({
        connectorConfigId: cfg.id,
        periodStart: "2026-01-05T00:00:00.000Z",
        periodEnd: "2026-01-06T00:00:00.000Z",
        granularity: "day",
      }),
    );

    const metricRows = await db.query.metricRecord.findMany({
      where: (mr, { eq }) => eq(mr.connectorConfigId, cfg.id),
    });
    expect(metricRows).toHaveLength(0);

    const run = await db.query.ingestionRun.findFirst({
      where: (r, { eq }) => eq(r.connectorConfigId, cfg.id),
      columns: { status: true, errorCode: true, errorMessage: true },
      orderBy: (r, { desc }) => [desc(r.startedAt)],
    });
    expect(run!.status).toBe("failed");
    expect(run!.errorCode).toBe("TENANT_BOUNDARY_VIOLATION");
    expect(run!.errorMessage).toContain("outside tenant boundary");

    const updatedCfg = await db.query.connectorConfig.findFirst({
      where: (c, { eq }) => eq(c.id, cfg.id),
      columns: { status: true, lastError: true },
    });
    expect(updatedCfg!.status).toBe("error");
    expect(updatedCfg!.lastError).toContain("outside tenant boundary");
  }, 45_000);
});

function silentLogger() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

function fakeJob(data: PullJobData): Job<PullJobData> {
  return { id: "job-1", data } as Job<PullJobData>;
}

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timeout waiting for condition");
}
