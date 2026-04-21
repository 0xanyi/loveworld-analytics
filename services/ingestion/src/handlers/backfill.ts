import type { Job } from "bullmq";
import { and, desc, eq } from "drizzle-orm";
import { backfillRunRepo, ingestionRun } from "@lwa/db";
import type { BackfillJobData, PullJobData } from "../queues";
import { createPullHandler, type PullHandlerDeps } from "./pull";

export function createBackfillHandler(deps: PullHandlerDeps) {
  const pull = createPullHandler(deps);
  const backfills = backfillRunRepo(deps.db);

  return async function backfillHandler(job: Job<BackfillJobData>): Promise<void> {
    const { backfillRunId, chunkIndex, connectorConfigId } = job.data;

    try {
      await pull(job as unknown as Job<PullJobData>);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const maxAttempts = Math.max(1, job.opts.attempts ?? 1);
      const isTerminal = job.attemptsMade + 1 >= maxAttempts;

      if (isTerminal) {
        const marked = await backfills.markFailed(backfillRunId, { errorMessage: message });
        if (marked) {
          deps.logger.error(
            { backfillRunId, chunkIndex, connectorConfigId, errorMessage: message },
            "backfill_run terminally failed",
          );
        }
      }

      throw err;
    }

    // Source of truth is the ingestion_run row written by pull.ts, not the
    // catch path above. pull.ts writes status=success|failed|skipped even
    // for soft-failure cases (e.g. non-retryable CONFIG_INVALID) where no
    // exception is thrown — we must escalate those to backfill_run too.
    const [chunkRun] = await deps.db
      .select({
        status: ingestionRun.status,
        errorMessage: ingestionRun.errorMessage,
      })
      .from(ingestionRun)
      .where(
        and(
          eq(ingestionRun.backfillRunId, backfillRunId),
          eq(ingestionRun.chunkIndex, chunkIndex),
        ),
      )
      .orderBy(desc(ingestionRun.startedAt))
      .limit(1);

    if (!chunkRun) return;

    if (chunkRun.status === "failed") {
      const marked = await backfills.markFailed(backfillRunId, {
        errorMessage: chunkRun.errorMessage,
      });
      if (marked) {
        deps.logger.error(
          {
            backfillRunId,
            chunkIndex,
            connectorConfigId,
            errorMessage: chunkRun.errorMessage,
          },
          "backfill_run failed from chunk soft-failure",
        );
      }
      return;
    }

    const progress = await backfills.recomputeProgress(backfillRunId);
    if (progress.chunksCompleted >= progress.chunksTotal) {
      await backfills.completeIfDone(backfillRunId);
    }
  };
}
