import { sql } from "drizzle-orm";
import type { Database } from "../client";
import type { MetricCategory } from "../schema";
import type { RollupGranularity } from "../schema";

export interface MetricRollupRepo {
  /**
   * Recompute the rollup for exactly one (tenant, node, category, granularity,
   * bucket) tuple. Aggregates from `effective_metric` over the subtree rooted
   * at `hierarchyNodeId` (recursive CTE) and upserts into `metric_rollup`.
   *
   * Caller (the rollup.refresh job handler) is responsible for walking the
   * ancestor chain and invoking this once per ancestor — that's why
   * getAncestors is exposed separately.
   */
  refreshBucket(input: {
    tenantId: string;
    hierarchyNodeId: string;
    metricCategory: MetricCategory;
    granularity: RollupGranularity;
    bucketStart: Date;
    bucketEnd: Date;
  }): Promise<void>;

  /**
   * Returns every ancestor node id for a given node, inclusive of the node
   * itself. Ordered deepest-first (starting node → root). Archived nodes are
   * excluded — refreshing rollups on archived nodes would resurrect them in
   * the UI.
   */
  getAncestors(tenantId: string, nodeId: string): Promise<string[]>;
}

export function metricRollupRepo(db: Database): MetricRollupRepo {
  return {
    async refreshBucket({
      tenantId,
      hierarchyNodeId,
      metricCategory,
      granularity,
      bucketStart,
      bucketEnd,
    }) {
      const startIso = bucketStart.toISOString();
      const endIso = bucketEnd.toISOString();
      // Subtree CTE collects descendants. The aggregate joins effective_metric
      // with the `source` table to build `source_breakdown` in a single pass.
      // source_breakdown is computed per source-key with jsonb_object_agg.
      await db.execute(sql`
        WITH RECURSIVE subtree AS (
          SELECT id FROM hierarchy_node
          WHERE tenant_id = ${tenantId}::uuid
            AND id = ${hierarchyNodeId}::uuid
            AND archived_at IS NULL
          UNION ALL
          SELECT hn.id FROM hierarchy_node hn
          INNER JOIN subtree s ON hn.parent_id = s.id
          WHERE hn.archived_at IS NULL
        ),
        matched AS (
          SELECT em.*, s.key AS source_key
          FROM effective_metric em
          JOIN source s ON s.id = em.source_id
          WHERE em.tenant_id = ${tenantId}::uuid
            AND em.hierarchy_node_id IN (SELECT id FROM subtree)
            AND em.metric_category = ${metricCategory}::metric_category
            AND em.period_start >= ${startIso}::timestamptz
            AND em.period_end   <= ${endIso}::timestamptz
        ),
        by_source AS (
          SELECT source_key, SUM(effective_value) AS total
          FROM matched
          GROUP BY source_key
        ),
        agg AS (
          SELECT
            COALESCE((SELECT SUM(effective_value) FROM matched), 0)      AS effective_total,
            COALESCE((SELECT SUM(raw_value)       FROM matched), 0)      AS raw_total,
            COALESCE((SELECT COUNT(*)::int        FROM matched), 0)      AS record_count,
            COALESCE((SELECT BOOL_OR(has_adjustment) FROM matched), false) AS has_adjustments,
            COALESCE(
              (SELECT jsonb_object_agg(source_key, total) FROM by_source),
              '{}'::jsonb
            ) AS source_breakdown
        )
        INSERT INTO metric_rollup (
          tenant_id, hierarchy_node_id, metric_category, granularity, bucket_start,
          effective_total, raw_total, record_count, source_breakdown, has_adjustments, computed_at
        )
        SELECT
          ${tenantId}::uuid,
          ${hierarchyNodeId}::uuid,
          ${metricCategory}::metric_category,
          ${granularity}::rollup_granularity,
          ${startIso}::timestamptz,
          effective_total, raw_total, record_count,
          source_breakdown, has_adjustments, now()
        FROM agg
        ON CONFLICT (tenant_id, hierarchy_node_id, metric_category, granularity, bucket_start)
        DO UPDATE SET
          effective_total  = excluded.effective_total,
          raw_total        = excluded.raw_total,
          record_count     = excluded.record_count,
          source_breakdown = excluded.source_breakdown,
          has_adjustments  = excluded.has_adjustments,
          computed_at      = now();
      `);
    },

    async getAncestors(tenantId, nodeId) {
      const rows = await db.execute<{ id: string }>(sql`
        WITH RECURSIVE chain AS (
          SELECT id, parent_id, 0 AS depth
          FROM hierarchy_node
          WHERE tenant_id = ${tenantId}::uuid AND id = ${nodeId}::uuid
          UNION ALL
          SELECT hn.id, hn.parent_id, c.depth + 1
          FROM hierarchy_node hn
          INNER JOIN chain c ON hn.id = c.parent_id
        )
        SELECT id::text FROM chain ORDER BY depth
      `);
      return rows.map((r) => r.id);
    },
  };
}
