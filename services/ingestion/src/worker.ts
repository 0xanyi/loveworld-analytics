import { Worker } from "bullmq";
import IORedis from "ioredis";
import { isErr } from "@lwa/contracts";
import { loadEnv } from "./env";
import { QUEUES } from "./queues";
import { registry } from "./registry";
import { createPullHandler } from "./handlers/pull";
import { backfillHandler } from "./handlers/backfill";
import { rollupRefreshHandler } from "./handlers/rollup-refresh";
import { healthHandler } from "./handlers/health";
import { logger } from "./lib/logger";

const envResult = loadEnv();
if (isErr(envResult)) {
  logger.error({ errors: envResult.error.flatten().fieldErrors }, "invalid environment");
  process.exit(1);
}
const env = envResult.value;

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

// Per-queue concurrency:
//   PULL / ROLLUP : scaled by INGESTION_CONCURRENCY; these are the hot path
//                   and safe to parallelise (per-connector rate limits
//                   guard outbound API pressure).
//   BACKFILL : serialised per-process. Chunks are bulk work — running many
//              in parallel starves live pulls and bloats memory.
//   HEALTH   : serialised. Low-frequency probes; no reason to parallelise.
const pullWorker = new Worker(QUEUES.PULL, createPullHandler(registry), {
  connection,
  concurrency: env.INGESTION_CONCURRENCY,
});
const backfillWorker = new Worker(QUEUES.BACKFILL, backfillHandler, {
  connection,
  concurrency: 1,
});
const rollupWorker = new Worker(QUEUES.ROLLUP_REFRESH, rollupRefreshHandler, {
  connection,
  concurrency: env.INGESTION_CONCURRENCY,
});
const healthWorker = new Worker(QUEUES.HEALTH, healthHandler, {
  connection,
  concurrency: 1,
});

const workers = [pullWorker, backfillWorker, rollupWorker, healthWorker];

// Connection- and job-level error observability. Without these, a broken
// Redis connection, auth failure, or thrown handler surfaces only as a
// silently-stalled queue.
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

logger.info({ queues: Object.values(QUEUES) }, "ingestion worker started");

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
  process.exit(1);
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "draining workers");
  Promise.all(workers.map((w) => w.close()))
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
