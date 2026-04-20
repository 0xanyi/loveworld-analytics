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

const envResult = loadEnv();
if (isErr(envResult)) {
  console.error("Invalid environment:", envResult.error.flatten().fieldErrors);
  process.exit(1);
}
const env = envResult.value;

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

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

console.log("Ingestion worker started — queues:", Object.values(QUEUES).join(", "));

process.on("unhandledRejection", (reason) => {
  console.error("[ingestion] unhandledRejection:", reason);
  process.exit(1);
});

const shutdown = (signal: string) => {
  console.log(`[ingestion] ${signal} received — draining workers`);
  Promise.all(workers.map((w) => w.close()))
    .then(() => connection.quit())
    .then(() => {
      console.log("[ingestion] shutdown complete");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[ingestion] shutdown error:", err);
      process.exit(1);
    });
  setTimeout(() => {
    console.error("[ingestion] drain timeout — forcing exit");
    process.exit(1);
  }, 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
