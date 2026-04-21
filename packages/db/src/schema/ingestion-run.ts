import { pgTable, uuid, text, integer, jsonb, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { connectorConfig } from "./connector-config";
import { backfillRun } from "./backfill-run";

export const ingestionRunStatusEnum = pgEnum("ingestion_run_status", [
  "pending",
  "running",
  "success",
  "failed",
  "skipped",
]);

/**
 * One row per scheduled pull attempt. Powers the source-health UI:
 * last_run_at, last_error, success_rate_7d are all computed from this table.
 *
 * `bullmq_job_id` lets us correlate with queue-level telemetry when a run
 * fails mysteriously — you can go from a UI row to the BullMQ job history.
 */
export const ingestionRun = pgTable(
  "ingestion_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectorConfigId: uuid("connector_config_id")
      .notNull()
      .references(() => connectorConfig.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: ingestionRunStatusEnum("status").default("pending").notNull(),
    recordsWritten: integer("records_written").default(0).notNull(),
    // int max = 2^31 ms = ~24.8 days. Pull runs are minutes at most; backfill
    // chunks are weekly at most and capped by connector timeouts. If we ever
    // see a realistic run approaching 24 days, switch to bigint (the migration
    // is a single ALTER COLUMN).
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    warnings: jsonb("warnings").$type<string[]>().default([]).notNull(),
    bullmqJobId: text("bullmq_job_id"),
    // Set on backfill chunk runs so completion accounting can dedupe by
    // (backfill_run_id, chunk_index) instead of a jobId string convention.
    // Null for live/scheduled pulls.
    backfillRunId: uuid("backfill_run_id").references(() => backfillRun.id),
    chunkIndex: integer("chunk_index"),
  },
  (t) => ({
    configIdx: index("ingestion_run_config_idx").on(t.connectorConfigId, t.startedAt),
    backfillIdx: index("ingestion_run_backfill_idx").on(t.backfillRunId, t.chunkIndex),
  }),
);

export type IngestionRun = typeof ingestionRun.$inferSelect;
export type NewIngestionRun = typeof ingestionRun.$inferInsert;
export type IngestionRunStatus = (typeof ingestionRunStatusEnum.enumValues)[number];
