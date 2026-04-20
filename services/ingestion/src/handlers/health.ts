import type { Job } from "bullmq";
import type { HealthJobData } from "../queues";
import { logger } from "../lib/logger";

export function healthHandler(job: Job<HealthJobData>): Promise<void> {
  logger.info(
    { jobId: job.id, connectorConfigId: job.data.connectorConfigId },
    "health",
  );
  return Promise.resolve();
}
