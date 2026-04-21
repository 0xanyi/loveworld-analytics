import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { backfillRun } from "@lwa/db";
import type { BackfillJobData, PullJobData } from "../queues";
import { createPullHandler, type PullHandlerDeps } from "./pull";

export function createBackfillHandler(deps: PullHandlerDeps) {
  const pull = createPullHandler(deps);

  return async function backfillHandler(job: Job<BackfillJobData>): Promise<void> {
    await pull(job as unknown as Job<PullJobData>);

    await deps.db
      .update(backfillRun)
      .set({
        chunksCompleted: sql`${backfillRun.chunksCompleted} + 1`,
        lastCheckpoint: new Date(),
      })
      .where(eq(backfillRun.id, job.data.backfillRunId));

    const [row] = await deps.db
      .select({
        id: backfillRun.id,
        chunksCompleted: backfillRun.chunksCompleted,
        chunksTotal: backfillRun.chunksTotal,
      })
      .from(backfillRun)
      .where(eq(backfillRun.id, job.data.backfillRunId))
      .limit(1);

    if (row && row.chunksCompleted >= row.chunksTotal) {
      await deps.db
        .update(backfillRun)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(backfillRun.id, row.id));
    }
  };
}
