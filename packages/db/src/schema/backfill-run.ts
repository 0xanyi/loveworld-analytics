import { pgTable, uuid, integer, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { connectorConfig } from "./connector-config";
import { user } from "./user";

export const backfillRunStatusEnum = pgEnum("backfill_run_status", [
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
]);

/**
 * Tracks an admin-initiated historical backfill. Chunked + checkpointed so
 * a worker restart mid-backfill resumes from `last_checkpoint`, not from the
 * start. `chunks_total` / `chunks_completed` drives the progress UI.
 *
 * The backfill queue is serialised per-process (see services/ingestion
 * worker.ts concurrency config) — long-running chunk jobs must not starve
 * live pulls.
 */
export const backfillRun = pgTable(
  "backfill_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectorConfigId: uuid("connector_config_id")
      .notNull()
      .references(() => connectorConfig.id),
    rangeStart: timestamp("range_start", { withTimezone: true }).notNull(),
    rangeEnd: timestamp("range_end", { withTimezone: true }).notNull(),
    chunkSizeDays: integer("chunk_size_days").notNull().default(7),
    chunksTotal: integer("chunks_total").notNull(),
    chunksCompleted: integer("chunks_completed").notNull().default(0),
    lastCheckpoint: timestamp("last_checkpoint", { withTimezone: true }),
    status: backfillRunStatusEnum("status").default("queued").notNull(),
    startedByUserId: uuid("started_by_user_id")
      .notNull()
      .references(() => user.id),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
  },
  (t) => ({
    configIdx: index("backfill_run_config_idx").on(t.connectorConfigId, t.startedAt),
  }),
);

export type BackfillRun = typeof backfillRun.$inferSelect;
export type NewBackfillRun = typeof backfillRun.$inferInsert;
export type BackfillRunStatus = (typeof backfillRunStatusEnum.enumValues)[number];
