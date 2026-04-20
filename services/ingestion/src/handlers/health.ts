import type { Job } from "bullmq";
import type { HealthJobData } from "../queues";

export function healthHandler(job: Job<HealthJobData>): Promise<void> {
  console.log(`[health] job=${job.id} config=${job.data.connectorConfigId}`);
  return Promise.resolve();
}
