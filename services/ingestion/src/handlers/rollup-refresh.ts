import type { Job } from "bullmq";
import type { RollupRefreshJobData } from "../queues";

export function rollupRefreshHandler(job: Job<RollupRefreshJobData>): Promise<void> {
  console.log(
    `[rollup] job=${job.id} tenant=${job.data.tenantId} bucket=${job.data.bucketStart}`,
  );
  return Promise.resolve();
}
