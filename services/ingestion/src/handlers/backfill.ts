import type { Job } from "bullmq";
import type { BackfillJobData } from "../queues";

export function backfillHandler(job: Job<BackfillJobData>): Promise<void> {
  console.log(
    `[backfill] job=${job.id} run=${job.data.backfillRunId} chunk=${job.data.chunkIndex}`,
  );
  return Promise.resolve();
}
