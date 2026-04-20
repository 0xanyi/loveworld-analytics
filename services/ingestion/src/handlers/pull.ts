import type { Job } from "bullmq";
import type { PullJobData } from "../queues";
import type { ConnectorRegistry } from "../registry";

/**
 * Phase 0: empty registry means no connectors to run; we log and succeed.
 * Phase 1+ will:
 *   1. Load connector_config by id
 *   2. Resolve the corresponding SourceConnector from the registry
 *   3. Acquire the per-source rate-limit bucket
 *   4. Call connector.pull({ since, until, granularity })
 *   5. Upsert resulting MetricRecords into the DB
 */
export function createPullHandler(registry: ConnectorRegistry) {
  return function pullHandler(job: Job<PullJobData>): Promise<void> {
    console.log(
      `[pull] job=${job.id} config=${job.data.connectorConfigId} — registry size ${registry.size()}`,
    );
    return Promise.resolve();
  };
}
