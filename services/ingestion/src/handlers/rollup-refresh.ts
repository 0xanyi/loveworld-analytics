import type { Job } from "bullmq";
import type { RollupRefreshJobData } from "../queues";
import { logger } from "../lib/logger";

export function rollupRefreshHandler(job: Job<RollupRefreshJobData>): Promise<void> {
  logger.info(
    {
      jobId: job.id,
      tenantId: job.data.tenantId,
      bucketStart: job.data.bucketStart,
    },
    "rollup",
  );
  return Promise.resolve();
}
