import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { ingestionRun, type IngestionRun } from "../schema";

export interface IngestionRunRepo {
  /** Creates a `running` run; returns it so the caller owns the id. */
  start(input: {
    connectorConfigId: string;
    periodStart: Date;
    periodEnd: Date;
    jobId?: string;
  }): Promise<IngestionRun>;

  /** Writes terminal state. Call exactly once per `start()`. */
  finish(
    id: string,
    input: {
      status: "success" | "failed" | "skipped";
      recordsWritten: number;
      durationMs: number;
      errorCode?: string;
      errorMessage?: string;
      warnings?: string[];
    },
  ): Promise<void>;
}

export function ingestionRunRepo(db: Database): IngestionRunRepo {
  return {
    async start({ connectorConfigId, periodStart, periodEnd, jobId }) {
      const [row] = await db
        .insert(ingestionRun)
        .values({
          connectorConfigId,
          periodStart,
          periodEnd,
          status: "running",
          bullmqJobId: jobId,
        })
        .returning();
      if (!row) {
        throw new Error(
          `ingestionRunRepo.start: insert returned no row for connectorConfigId=${connectorConfigId}`,
        );
      }
      return row;
    },

    async finish(id, { status, recordsWritten, durationMs, errorCode, errorMessage, warnings }) {
      await db
        .update(ingestionRun)
        .set({
          status,
          recordsWritten,
          durationMs,
          errorCode,
          errorMessage,
          warnings: warnings ?? [],
          finishedAt: new Date(),
        })
        .where(eq(ingestionRun.id, id));
    },
  };
}
