import { sql } from "drizzle-orm";
import type { Database, DatabaseTransaction } from "../client";
import type { MetricCategory, Granularity, RollupGranularity } from "../schema";

export interface MetricRollupRepo {
  /**
   * Recompute the rollup for exactly one (tenant, node, category, granularity,
   * bucket) tuple. Aggregates from `effective_metric` over the subtree rooted
   * at `hierarchyNodeId` (recursive CTE) and upserts into `metric_rollup`.
   *
   * Only records whose own granularity equals `recordGranularity` are summed —
   * this prevents double-counting when a connector emits both hour and day
   * records for the same metric. Callers (the pull handler in Task 4) must
   * know the connector's emission granularity and pass it in.
   *
   * A Postgres transaction-scoped advisory lock keyed on the bucket tuple
   * serialises concurrent refreshes of the same bucket — without it, two
   * pull handlers writing to overlapping windows could race on the
   * read-modify-write and end up with stale totals.
   *
   * If `hierarchyNodeId` is archived, its subtree returns empty and this
   * writes zero totals. That's intentional: archived nodes don't appear in
   * the UI, so a zeroed rollup is invisible. Callers shouldn't refresh
   * rollups for archived nodes (no writes target them), but the function
   * is defensive either way.
   *
   * Caller is responsible for walking the ancestor chain and invoking this
   * once per ancestor — that's why getAncestors is exposed separately.
   */
  refreshBucket(input: {
    tenantId: string;
    hierarchyNodeId: string;
    metricCategory: MetricCategory;
    granularity: RollupGranularity;
    recordGranularity: Granularity;
    bucketStart: Date;
    bucketEnd: Date;
  }): Promise<void>;

  /**
   * Returns every ancestor node id for a given node, inclusive of the node
   * itself. Ordered deepest-first (starting node → root). Archived nodes are
   * excluded — refreshing rollups on archived nodes would resurrect them in
   * the UI. The recursion is bounded to 32 levels to defend against data
   * corruption (circular parent_id chain); the design tree is 3 levels deep.
   */
  getAncestors(tenantId: string, nodeId: string): Promise<string[]>;
}

// Bounded-int hash for pg_advisory_xact_lock — Postgres advisory-lock args are
// bigint (signed 64-bit). We hash a stable key to a bigint; collisions are
// acceptable (locks are per-bucket correctness, not per-tenant isolation).
function advisoryLockKey(parts: string[]): string {
  // FNV-1a 64-bit, returned as a signed-bigint-safe string.
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = FNV_OFFSET;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      hash = ((hash ^ BigInt(p.charCodeAt(i))) * FNV_PRIME) & MASK;
    }
  }
  // Reinterpret as signed bigint so it fits pg's int8 advisory key.
  const signed = hash >= 0x8000000000000000n ? hash - 0x10000000000000000n : hash;
  return signed.toString();
}

export function metricRollupRepo(db: Database | DatabaseTransaction): MetricRollupRepo {
  return {
    async refreshBucket(input) {
      const runRefresh = async (tx: DatabaseTransaction) => {
        const {
          tenantId,
          hierarchyNodeId,
          metricCategory,
          granularity,
          recordGranularity,
          bucketStart,
          bucketEnd,
        } = input;
        const startIso = bucketStart.toISOString();
        const endIso = bucketEnd.toISOString();
        const lockKey = advisoryLockKey([
          tenantId,
          hierarchyNodeId,
          metricCategory,
          granularity,
          startIso,
        ]);

        await tx.execute(sql`SELECT pg_advisory_xact_lock(${sql.raw(lockKey)}::bigint)`);
        await tx.execute(sql`
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
              AND em.granularity = ${recordGranularity}::granularity
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
              COALESCE((SELECT SUM(effective_value) FROM matched), 0)        AS effective_total,
              COALESCE((SELECT SUM(raw_value)       FROM matched), 0)        AS raw_total,
              COALESCE((SELECT COUNT(*)::int        FROM matched), 0)        AS record_count,
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
      };

      // Wrap lock + compute + upsert in a single transaction so the advisory
      // lock auto-releases on commit/abort. Any concurrent refresh for the
      // same (tenant, node, category, granularity, bucket) tuple waits here.
      // If the repo was constructed with an existing route transaction, reuse
      // it so callers can make fact writes and rollup refreshes atomic.
      if ("transaction" in db) {
        await db.transaction(runRefresh);
      } else {
        await runRefresh(db);
      }
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
          WHERE c.depth < 32
        )
        SELECT id::text FROM chain ORDER BY depth
      `);
      return rows.map((r) => r.id);
    },
  };
}
