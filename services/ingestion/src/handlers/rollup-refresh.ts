import type { Job } from "bullmq";
import { metricRollupRepo, type Database } from "@lwa/db";
import type { RollupRefreshJobData } from "../queues";
import { addBucketEnd } from "../lib/rollup-debounce";

export function createRollupRefreshHandler(
  db: Database,
  logger: { info: (data: unknown, msg?: string) => void },
) {
  const repo = metricRollupRepo(db);

  return async function rollupRefreshHandler(job: Job<RollupRefreshJobData>): Promise<void> {
    const { tenantId, hierarchyNodeId, metricCategory, granularity, recordGranularity, bucketStart } =
      job.data;

    const start = new Date(bucketStart);
    const end = addBucketEnd(start, granularity);

    const ancestors = await repo.getAncestors(tenantId, hierarchyNodeId);
    for (const nodeId of ancestors) {
      await repo.refreshBucket({
        tenantId,
        hierarchyNodeId: nodeId,
        metricCategory,
        granularity,
        recordGranularity,
        bucketStart: start,
        bucketEnd: end,
      });
    }

    logger.info(
      { tenantId, hierarchyNodeId, nodeCount: ancestors.length, bucketStart, granularity },
      "rollup refreshed",
    );
  };
}
