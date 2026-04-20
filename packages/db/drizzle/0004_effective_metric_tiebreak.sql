-- Review follow-up: harden the effective_metric view.
--   1. Tie-break on `id` after `created_at` so adjustments landing in the
--      same microsecond produce a deterministic pick. Previously the
--      LIMIT 1 result could flip between refreshes when two adjustments
--      shared a timestamp (bulk inserts, concurrent writes).
--   2. Defence-in-depth: require `adj.tenant_id = mr.tenant_id`. The FK
--      from metric_adjustment.metric_record_id already enforces this in
--      practice, but an application bug (or a direct SQL write) that
--      mis-populated tenant_id would leak across tenant boundaries via
--      this view. Explicit is safer.

CREATE OR REPLACE VIEW effective_metric AS
SELECT
  mr.id                    AS metric_record_id,
  mr.tenant_id,
  mr.source_id,
  mr.connector_config_id,
  mr.hierarchy_node_id,
  mr.platform_account_id,
  mr.metric_type,
  mr.metric_category,
  mr.granularity,
  mr.dimensions,
  mr.dimensions_hash,
  mr.period_start,
  mr.period_end,
  mr.raw_value,
  CASE
    WHEN latest_adj.adjustment_type = 'replace' THEN latest_adj.adjusted_value
    WHEN latest_adj.adjustment_type = 'delta'   THEN mr.raw_value + latest_adj.adjusted_value
    ELSE mr.raw_value
  END AS effective_value,
  (latest_adj.id IS NOT NULL) AS has_adjustment,
  latest_adj.id               AS applied_adjustment_id
FROM metric_record mr
LEFT JOIN LATERAL (
  SELECT adj.id, adj.adjustment_type, adj.adjusted_value
  FROM metric_adjustment adj
  WHERE adj.metric_record_id = mr.id
    AND adj.tenant_id        = mr.tenant_id
    AND adj.status           = 'applied'
  ORDER BY adj.created_at DESC, adj.id DESC
  LIMIT 1
) latest_adj ON TRUE;
