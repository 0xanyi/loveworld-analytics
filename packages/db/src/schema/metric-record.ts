import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  numeric,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { source } from "./source";
import { connectorConfig } from "./connector-config";
import { platformAccount } from "./platform-account";
import { hierarchyNode } from "./hierarchy-node";

export const metricCategoryEnum = pgEnum("metric_category", [
  "tv_households",
  "web_visitors",
  "streaming",
  "social_reach",
  "engagement",
]);

export const granularityEnum = pgEnum("granularity", [
  "hour",
  "day",
  "week",
  "month",
  "quarter",
]);

/**
 * The fact table. Append-only by contract — direct edits go through the
 * adjustment flow (see metric_adjustment). The UNIQUE constraint is the
 * entire idempotency story: re-pulling yesterday's data upserts onto the
 * same row via `dimensions_hash` (see repositories/metric-record.ts).
 *
 * `numeric(20, 4)` holds any value the v1 connectors emit (households,
 * requests, dwell-time in seconds) with four decimals of headroom.
 */
export const metricRecord = pgTable(
  "metric_record",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => source.id),
    connectorConfigId: uuid("connector_config_id")
      .notNull()
      .references(() => connectorConfig.id),
    platformAccountId: uuid("platform_account_id").references(() => platformAccount.id),
    hierarchyNodeId: uuid("hierarchy_node_id")
      .notNull()
      .references(() => hierarchyNode.id),
    metricType: text("metric_type").notNull(),
    metricCategory: metricCategoryEnum("metric_category").notNull(),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().default({}).notNull(),
    dimensionsHash: text("dimensions_hash").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    granularity: granularityEnum("granularity").notNull(),
    rawValue: numeric("raw_value", { precision: 20, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    provenance: text("provenance").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // One row per (tenant, source, node, type, period, dimensions).
    // Re-ingestion overwrites raw_value; adjustments are separate rows
    // that reference this row's stable id.
    uniq: uniqueIndex("metric_record_dedup_idx").on(
      t.tenantId,
      t.sourceId,
      t.hierarchyNodeId,
      t.metricType,
      t.periodStart,
      t.periodEnd,
      t.dimensionsHash,
    ),
    categoryIdx: index("metric_record_category_idx").on(
      t.tenantId,
      t.metricCategory,
      t.periodStart,
    ),
    nodeIdx: index("metric_record_node_idx").on(t.hierarchyNodeId, t.periodStart),
  }),
);

export type MetricRecord = typeof metricRecord.$inferSelect;
export type NewMetricRecord = typeof metricRecord.$inferInsert;
export type MetricCategory = (typeof metricCategoryEnum.enumValues)[number];
export type Granularity = (typeof granularityEnum.enumValues)[number];
