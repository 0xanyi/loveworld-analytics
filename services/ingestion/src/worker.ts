import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { isErr } from "@lwa/contracts";
import { envKekProvider } from "@lwa/crypto";
import { createDb } from "@lwa/db";
import { registry } from "@lwa/connectors";
import { loadEnv } from "./env";
import { QUEUES } from "./queues";
import { createPullHandler } from "./handlers/pull";
import { createBackfillHandler } from "./handlers/backfill";
import { createRollupRefreshHandler } from "./handlers/rollup-refresh";
import { healthHandler } from "./handlers/health";
import { startScheduler } from "./scheduler";
import { logger } from "./lib/logger";

const envResult = loadEnv();
if (isErr(envResult)) {
  logger.error({ errors: envResult.error.flatten().fieldErrors }, "invalid environment");
  process.exit(1);
}
const env = envResult.value;

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const db = createDb(env.DATABASE_URL);
const kek = envKekProvider({
  LWA_KEK_CURRENT: env.LWA_KEK_CURRENT,
  LWA_KEK_V1: env.LWA_KEK_V1,
});

const pullQueue = new Queue(QUEUES.PULL, { connection });
const rollupQueue = new Queue(QUEUES.ROLLUP_REFRESH, { connection });

const handlerDeps = { db, registry, kek, rollupQueue, redis: connection, logger };

const workers = [
  new Worker(QUEUES.PULL, createPullHandler(handlerDeps), {
    connection,
    concurrency: env.INGESTION_CONCURRENCY,
  }),
  new Worker(QUEUES.BACKFILL, createBackfillHandler(handlerDeps), {
    connection,
    concurrency: 1,
  }),
  new Worker(QUEUES.ROLLUP_REFRESH, createRollupRefreshHandler(db, logger), {
    connection,
    concurrency: env.INGESTION_CONCURRENCY,
  }),
  new Worker(QUEUES.HEALTH, healthHandler, {
    connection,
    concurrency: 1,
  }),
];

for (const w of workers) {
  w.on("error", (err) => {
    logger.error({ worker: w.name, err: err.message, stack: err.stack }, "worker error");
  });
  w.on("failed", (job, err) => {
    logger.warn(
      { worker: w.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message },
      "job failed",
    );
  });
}

const scheduler = startScheduler({ db, pullQueue, logger });

logger.info({ queues: Object.values(QUEUES) }, "ingestion worker started");

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
  process.exit(1);
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "draining workers");
  scheduler
    .stop()
    .then(() => Promise.all(workers.map((w) => w.close())))
    .then(() => pullQueue.close())
    .then(() => rollupQueue.close())
    .then(() => connection.quit())
    .then(() => {
      logger.info("shutdown complete");
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, "shutdown error");
      process.exit(1);
    });

  setTimeout(() => {
    logger.error("drain timeout — forcing exit");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
