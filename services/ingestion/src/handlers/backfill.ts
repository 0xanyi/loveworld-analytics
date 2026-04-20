import type { Job } from "bullmq";
import type { BackfillJobData } from "../queues";
import { logger } from "../lib/logger";

export function backfillHandler(job: Job<BackfillJobData>): Promise<void> {
  logger.info(
    {
      jobId: job.id,
      backfillRunId: job.data.backfillRunId,
      chunkIndex: job.data.chunkIndex,
    },
    "backfill",
  );
  return Promise.resolve();
}
