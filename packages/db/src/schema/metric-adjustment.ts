import { pgTable, uuid, text, numeric, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { user } from "./user";
import { metricRecord } from "./metric-record";

export const adjustmentTypeEnum = pgEnum("adjustment_type", ["replace", "delta"]);
export const adjustmentStatusEnum = pgEnum("adjustment_status", [
  "draft",
  "applied",
  "reversed",
  "superseded",
]);

/**
 * Groups a set of related adjustments for bulk review or reversal. A
 * station manager bulk-correcting a quarter's households creates one
 * batch; reversing it touches every adjustment in the batch at once.
 * Standalone adjustments have `batch_id = NULL`.
 */
export const adjustmentBatch = pgTable("adjustment_batch", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenant.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id")
    .notNull()
    .references(() => user.id),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * The override primitive. Each row targets exactly one `metric_record`.
 * Status `applied` is the only state the `effective_metric` view honours;
 * `draft` / `reversed` / `superseded` fall through to `raw_value`.
 *
 *   `replace` — effective_value = adjusted_value
 *   `delta`   — effective_value = raw_value + adjusted_value
 *
 * Phase 1 ships the table and the effective_metric view; the adjustment
 * UI lands in Phase 2 per the design doc.
 */
export const metricAdjustment = pgTable(
  "metric_adjustment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    metricRecordId: uuid("metric_record_id")
      .notNull()
      .references(() => metricRecord.id),
    // Denormalised for fast tenant-scoped filtering without a join back to
    // metric_record. Always equal to metric_record.tenantId.
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    adjustmentType: adjustmentTypeEnum("adjustment_type").notNull(),
    adjustedValue: numeric("adjusted_value", { precision: 20, scale: 4 }).notNull(),
    reason: text("reason").notNull(),
    evidenceUrl: text("evidence_url"),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => user.id),
    status: adjustmentStatusEnum("status").default("draft").notNull(),
    approvedByUserId: uuid("approved_by_user_id").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    batchId: uuid("batch_id").references(() => adjustmentBatch.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedReason: text("reversed_reason"),
  },
  (t) => ({
    recordIdx: index("metric_adjustment_record_idx").on(t.metricRecordId, t.status),
    tenantIdx: index("metric_adjustment_tenant_idx").on(t.tenantId, t.createdAt),
  }),
);

export type MetricAdjustment = typeof metricAdjustment.$inferSelect;
export type NewMetricAdjustment = typeof metricAdjustment.$inferInsert;
export type AdjustmentBatch = typeof adjustmentBatch.$inferSelect;
export type AdjustmentType = (typeof adjustmentTypeEnum.enumValues)[number];
export type AdjustmentStatus = (typeof adjustmentStatusEnum.enumValues)[number];
