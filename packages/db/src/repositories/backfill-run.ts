import { and, eq, gte, sql } from "drizzle-orm";
import type { Database } from "../client";
import { backfillRun } from "../schema";

/**
 * Transactional operations on `backfill_run`.
 *
 * Completion accounting is keyed by `(backfill_run_id, chunk_index)` on
 * `ingestion_run`, which makes it idempotent under at-least-once queue
 * delivery (duplicate chunk deliveries re-use the same `chunk_index`).
 *
 * All terminal transitions are guarded by `status = 'running'` in the
 * WHERE clause so concurrent handlers cannot clobber one another's
 * decisions (e.g. a late `completed` write overwriting an earlier
 * `failed`).
 */
export interface BackfillRunRepo {
  /** Marks the run failed iff it is still `running`. Idempotent. */
  markFailed(
    id: string,
    input: {
      errorMessage: string | null;
      checkpointAt?: Date;
    },
  ): Promise<boolean>;

  /**
   * Recomputes `chunks_completed` from `ingestion_run` rows that share this
   * backfill id and landed in a terminal successful state. Touches
   * `last_checkpoint`. Safe to call from multiple concurrent handlers.
   */
  recomputeProgress(id: string): Promise<{ chunksCompleted: number; chunksTotal: number }>;

  /**
   * Atomically marks the run `completed` iff status is still `running` AND
   * `chunks_completed >= chunks_total`. Returns whether a row was updated.
   */
  completeIfDone(id: string): Promise<boolean>;
}

export function backfillRunRepo(db: Database): BackfillRunRepo {
  return {
    async markFailed(id, { errorMessage, checkpointAt = new Date() }) {
      const result = await db
        .update(backfillRun)
        .set({
          status: "failed",
          errorMessage,
          lastCheckpoint: checkpointAt,
        })
        .where(and(eq(backfillRun.id, id), eq(backfillRun.status, "running")))
        .returning({ id: backfillRun.id });
      return result.length > 0;
    },

    async recomputeProgress(id) {
      await db.execute(sql`
        UPDATE backfill_run br
        SET
          chunks_completed = (
            SELECT COUNT(DISTINCT ir.chunk_index)::int
            FROM ingestion_run ir
            WHERE ir.backfill_run_id = br.id
              AND ir.chunk_index IS NOT NULL
              AND ir.status IN ('success', 'skipped')
          ),
          last_checkpoint = now()
        WHERE br.id = ${id}::uuid
      `);

      const [row] = await db
        .select({
          chunksCompleted: backfillRun.chunksCompleted,
          chunksTotal: backfillRun.chunksTotal,
        })
        .from(backfillRun)
        .where(eq(backfillRun.id, id))
        .limit(1);

      return {
        chunksCompleted: row?.chunksCompleted ?? 0,
        chunksTotal: row?.chunksTotal ?? 0,
      };
    },

    async completeIfDone(id) {
      const result = await db
        .update(backfillRun)
        .set({ status: "completed", completedAt: new Date() })
        .where(
          and(
            eq(backfillRun.id, id),
            eq(backfillRun.status, "running"),
            gte(backfillRun.chunksCompleted, backfillRun.chunksTotal),
          ),
        )
        .returning({ id: backfillRun.id });
      return result.length > 0;
    },
  };
}
