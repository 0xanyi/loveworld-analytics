import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { QUEUES } from "../src/queues";

let container: StartedTestContainer;
let connection: IORedis;

beforeAll(async () => {
  container = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
  connection = new IORedis(container.getMappedPort(6379), container.getHost(), {
    maxRetriesPerRequest: null,
  });
});

afterAll(async () => {
  await connection.quit();
  await container.stop();
});

describe("queues", () => {
  it("exports the four expected queue names", () => {
    expect(QUEUES).toEqual({
      PULL: "connector.pull",
      BACKFILL: "connector.backfill",
      ROLLUP_REFRESH: "rollup.refresh",
      HEALTH: "connector.health",
    });
  });

  it("a worker can consume an enqueued no-op pull job", async () => {
    const queue = new Queue(QUEUES.PULL, { connection });
    let processed: { connectorConfigId: string } | undefined;

    const worker = new Worker<{ connectorConfigId: string }>(
      QUEUES.PULL,
      (job) => {
        processed = job.data;
        return Promise.resolve();
      },
      { connection },
    );

    await queue.add("noop", { connectorConfigId: "test-config-1" });

    await new Promise<void>((resolve) => {
      worker.on("completed", () => resolve());
    });

    expect(processed).toEqual({ connectorConfigId: "test-config-1" });
    await worker.close();
    await queue.close();
  });
});
