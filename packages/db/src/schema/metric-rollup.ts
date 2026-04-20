import {
  pgTable,
  uuid,
  numeric,
  integer,
  jsonb,
  timestamp,
  boolean,
  primaryKey,
  pgEnum,
} from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { hierarchyNode } from "./hierarchy-node";
import { metricCategoryEnum } from "./metric-record";

// metric_rollup intentionally does NOT store hour-granularity rows — the fact
// table has hourly data, but the dashboard never queries buckets smaller than
// day. A dedicated enum keeps the primary key narrow and makes it obvious at
// query time that rollups are a day+ concern.
export const rollupGranularityEnum = pgEnum("rollup_granularity", [
  "day",
  "week",
  "month",
  "quarter",
]);

/**
 * Pre-aggregated totals. Dashboard reads come from this table, never from
 * metric_record — keeps p95 board-tile queries well under 200ms.
 *
 * Incrementally refreshed by `rollup.refresh` jobs enqueued from the pull
 * handler. Refresh walks ancestors up the hierarchy so a single leaf write
 * updates (leaf, broadcast, station) buckets in one queue pass.
 *
 * `source_breakdown` powers the drill-down view's stacked-area chart without
 * requiring a second query into the fact table.
 */
export const metricRollup = pgTable(
  "metric_rollup",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    hierarchyNodeId: uuid("hierarchy_node_id")
      .notNull()
      .references(() => hierarchyNode.id),
    metricCategory: metricCategoryEnum("metric_category").notNull(),
    granularity: rollupGranularityEnum("granularity").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    effectiveTotal: numeric("effective_total", { precision: 24, scale: 4 }).notNull(),
    rawTotal: numeric("raw_total", { precision: 24, scale: 4 }).notNull(),
    recordCount: integer("record_count").notNull(),
    sourceBreakdown: jsonb("source_breakdown")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    hasAdjustments: boolean("has_adjustments").default(false).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.tenantId, t.hierarchyNodeId, t.metricCategory, t.granularity, t.bucketStart],
    }),
  }),
);

export type MetricRollup = typeof metricRollup.$inferSelect;
export type NewMetricRollup = typeof metricRollup.$inferInsert;
export type RollupGranularity = (typeof rollupGranularityEnum.enumValues)[number];
