-- Track backfill chunk identity on ingestion_run so completion accounting
-- can dedupe by (backfill_run_id, chunk_index) instead of scanning
-- bullmq_job_id with a LIKE prefix. Makes idempotency under at-least-once
-- delivery a property of the data model rather than a jobId convention.
--
-- `bullmq_job_id` is retained for queue-level telemetry / correlation.
-- Live pulls leave backfill_run_id / chunk_index null.

ALTER TABLE "ingestion_run" ADD COLUMN "backfill_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ingestion_run" ADD COLUMN "chunk_index" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ingestion_run" ADD CONSTRAINT "ingestion_run_backfill_run_id_backfill_run_id_fk" FOREIGN KEY ("backfill_run_id") REFERENCES "public"."backfill_run"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingestion_run_backfill_idx" ON "ingestion_run" USING btree ("backfill_run_id","chunk_index");