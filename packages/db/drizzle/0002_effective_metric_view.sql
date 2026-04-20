-- effective_metric joins metric_record with its most-recent applied adjustment.
-- Dashboards never read the fact table directly — they read this view or the
-- rollup. The LATERAL + ORDER BY created_at DESC + LIMIT 1 pattern picks the
-- single latest 'applied' adjustment per metric_record; 'draft' / 'reversed' /
-- 'superseded' statuses fall through to raw_value.
--
-- `replace`  →  effective_value = adjusted_value
-- `delta`    →  effective_value = raw_value + adjusted_value
-- no adjustment  →  effective_value = raw_value

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
    AND adj.status = 'applied'
  ORDER BY adj.created_at DESC
  LIMIT 1
) latest_adj ON TRUE;
