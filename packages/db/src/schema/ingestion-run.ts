import { pgTable, uuid, text, integer, jsonb, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { connectorConfig } from "./connector-config";

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
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    warnings: jsonb("warnings").$type<string[]>().default([]).notNull(),
    bullmqJobId: text("bullmq_job_id"),
  },
  (t) => ({
    configIdx: index("ingestion_run_config_idx").on(t.connectorConfigId, t.startedAt),
  }),
);

export type IngestionRun = typeof ingestionRun.$inferSelect;
export type NewIngestionRun = typeof ingestionRun.$inferInsert;
export type IngestionRunStatus = (typeof ingestionRunStatusEnum.enumValues)[number];
