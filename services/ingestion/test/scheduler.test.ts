import { afterAll, beforeAll, describe, it } from "vitest";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import IORedis from "ioredis";
import { connectorConfig, source, tenant, type Database } from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import { QUEUES } from "../src/queues";
import { startScheduler } from "../src/scheduler";

let pgContainer: StartedTestContainer;
let redisContainer: StartedTestContainer;
let db: Database;
let dbCleanup: (() => Promise<void>) | undefined;
let redis: IORedis;
let pullQueue: Queue;

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

  pullQueue = new Queue(QUEUES.PULL, {
    connection: redis,
    prefix: `sched:${crypto.randomUUID().slice(0, 8)}`,
  });
}, 90_000);

afterAll(async () => {
  await pullQueue.obliterate({ force: true });
  await pullQueue.close();
  await redis.quit();
  await redisContainer.stop();
  await dbCleanup?.();
  await pgContainer.stop();
});

describe("scheduler reconciliation", () => {
  it("adds repeatable jobs for enabled configs and removes them when disabled", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const [t] = await db
      .insert(tenant)
      .values({ name: `Tenant-${suffix}`, slug: `tenant-${suffix}` })
      .returning();

    const [s] = await db
      .insert(source)
      .values({
        key: `k-${suffix}`,
        name: "Source",
        category: "web",
        authMethod: "none",
      })
      .returning();

    const [cfg] = await db
      .insert(connectorConfig)
      .values({ tenantId: t!.id, sourceId: s!.id, schedule: "*/5 * * * *" })
      .returning();

    const sched = startScheduler({ db, pullQueue, logger: silentLogger(), pollIntervalMs: 50 });
    await waitFor(async () => {
      const jobs = await pullQueue.getRepeatableJobs();
      return jobs.some((j) => j.name === `pull:${cfg!.id}`);
    });
    await sched.stop();

    await db.update(connectorConfig).set({ enabled: false }).where(eq(connectorConfig.id, cfg!.id));

    const sched2 = startScheduler({ db, pullQueue, logger: silentLogger(), pollIntervalMs: 50 });
    await waitFor(async () => {
      const jobs = await pullQueue.getRepeatableJobs();
      return !jobs.some((j) => j.name === `pull:${cfg!.id}`);
    });
    await sched2.stop();
  });
});

function silentLogger() {
  return {
    info: () => undefined,
    error: () => undefined,
  };
}

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timeout waiting for condition");
}
