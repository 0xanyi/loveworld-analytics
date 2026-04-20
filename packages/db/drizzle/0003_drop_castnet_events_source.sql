-- CastNet platform is being retired in favour of Love World Europe One.
-- No tenant has a configured connector or ingested data against this source
-- in any environment yet, so this cleanup is safe to apply forward-only.
--
-- Deletes cascade from source → connector_config → platform_account in that
-- order to respect FK constraints. Any metric_record, metric_rollup, or
-- ingestion_run rows that reference these would also be orphaned, but none
-- exist yet (Phase 1 hasn't shipped data yet).

DELETE FROM platform_account
  WHERE source_id IN (SELECT id FROM source WHERE key = 'castnet_events');
DELETE FROM connector_config
  WHERE source_id IN (SELECT id FROM source WHERE key = 'castnet_events');
DELETE FROM source
  WHERE key = 'castnet_events';
