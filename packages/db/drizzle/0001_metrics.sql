DO $$ BEGIN
 CREATE TYPE "public"."platform_account_status" AS ENUM('active', 'paused', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."granularity" AS ENUM('hour', 'day', 'week', 'month', 'quarter');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."metric_category" AS ENUM('tv_households', 'web_visitors', 'streaming', 'social_reach', 'engagement');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adjustment_status" AS ENUM('draft', 'applied', 'reversed', 'superseded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."adjustment_type" AS ENUM('replace', 'delta');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."rollup_granularity" AS ENUM('day', 'week', 'month', 'quarter');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ingestion_run_status" AS ENUM('pending', 'running', 'success', 'failed', 'skipped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."backfill_run_status" AS ENUM('queued', 'running', 'paused', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hierarchy_node_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"display_name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "platform_account_status" DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metric_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"connector_config_id" uuid NOT NULL,
	"platform_account_id" uuid,
	"hierarchy_node_id" uuid NOT NULL,
	"metric_type" text NOT NULL,
	"metric_category" "metric_category" NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dimensions_hash" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"granularity" "granularity" NOT NULL,
	"raw_value" numeric(20, 4) NOT NULL,
	"unit" text NOT NULL,
	"provenance" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adjustment_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metric_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_record_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"adjustment_type" "adjustment_type" NOT NULL,
	"adjusted_value" numeric(20, 4) NOT NULL,
	"reason" text NOT NULL,
	"evidence_url" text,
	"author_user_id" uuid NOT NULL,
	"status" "adjustment_status" DEFAULT 'draft' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metric_rollup" (
	"tenant_id" uuid NOT NULL,
	"hierarchy_node_id" uuid NOT NULL,
	"metric_category" "metric_category" NOT NULL,
	"granularity" "rollup_granularity" NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"effective_total" numeric(24, 4) NOT NULL,
	"raw_total" numeric(24, 4) NOT NULL,
	"record_count" integer NOT NULL,
	"source_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"has_adjustments" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_rollup_tenant_id_hierarchy_node_id_metric_category_granularity_bucket_start_pk" PRIMARY KEY("tenant_id","hierarchy_node_id","metric_category","granularity","bucket_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingestion_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_config_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "ingestion_run_status" DEFAULT 'pending' NOT NULL,
	"records_written" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error_code" text,
	"error_message" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bullmq_job_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backfill_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_config_id" uuid NOT NULL,
	"range_start" timestamp with time zone NOT NULL,
	"range_end" timestamp with time zone NOT NULL,
	"chunk_size_days" integer DEFAULT 7 NOT NULL,
	"chunks_total" integer NOT NULL,
	"chunks_completed" integer DEFAULT 0 NOT NULL,
	"last_checkpoint" timestamp with time zone,
	"status" "backfill_run_status" DEFAULT 'queued' NOT NULL,
	"started_by_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_account" ADD CONSTRAINT "platform_account_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_account" ADD CONSTRAINT "platform_account_hierarchy_node_id_hierarchy_node_id_fk" FOREIGN KEY ("hierarchy_node_id") REFERENCES "public"."hierarchy_node"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_account" ADD CONSTRAINT "platform_account_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_record" ADD CONSTRAINT "metric_record_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_record" ADD CONSTRAINT "metric_record_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_record" ADD CONSTRAINT "metric_record_connector_config_id_connector_config_id_fk" FOREIGN KEY ("connector_config_id") REFERENCES "public"."connector_config"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_record" ADD CONSTRAINT "metric_record_platform_account_id_platform_account_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_record" ADD CONSTRAINT "metric_record_hierarchy_node_id_hierarchy_node_id_fk" FOREIGN KEY ("hierarchy_node_id") REFERENCES "public"."hierarchy_node"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adjustment_batch" ADD CONSTRAINT "adjustment_batch_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "adjustment_batch" ADD CONSTRAINT "adjustment_batch_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_adjustment" ADD CONSTRAINT "metric_adjustment_metric_record_id_metric_record_id_fk" FOREIGN KEY ("metric_record_id") REFERENCES "public"."metric_record"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_adjustment" ADD CONSTRAINT "metric_adjustment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_adjustment" ADD CONSTRAINT "metric_adjustment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_adjustment" ADD CONSTRAINT "metric_adjustment_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_adjustment" ADD CONSTRAINT "metric_adjustment_batch_id_adjustment_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."adjustment_batch"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_rollup" ADD CONSTRAINT "metric_rollup_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_rollup" ADD CONSTRAINT "metric_rollup_hierarchy_node_id_hierarchy_node_id_fk" FOREIGN KEY ("hierarchy_node_id") REFERENCES "public"."hierarchy_node"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ingestion_run" ADD CONSTRAINT "ingestion_run_connector_config_id_connector_config_id_fk" FOREIGN KEY ("connector_config_id") REFERENCES "public"."connector_config"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backfill_run" ADD CONSTRAINT "backfill_run_connector_config_id_connector_config_id_fk" FOREIGN KEY ("connector_config_id") REFERENCES "public"."connector_config"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "backfill_run" ADD CONSTRAINT "backfill_run_started_by_user_id_user_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_account_tenant_source_external_idx" ON "platform_account" USING btree ("tenant_id","source_id","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_account_tenant_idx" ON "platform_account" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_account_node_idx" ON "platform_account" USING btree ("hierarchy_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metric_record_dedup_idx" ON "metric_record" USING btree ("tenant_id","source_id","hierarchy_node_id","metric_type","period_start","period_end","dimensions_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metric_record_category_idx" ON "metric_record" USING btree ("tenant_id","metric_category","period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metric_record_node_idx" ON "metric_record" USING btree ("hierarchy_node_id","period_start");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metric_adjustment_record_idx" ON "metric_adjustment" USING btree ("metric_record_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metric_adjustment_tenant_idx" ON "metric_adjustment" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingestion_run_config_idx" ON "ingestion_run" USING btree ("connector_config_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backfill_run_config_idx" ON "backfill_run" USING btree ("connector_config_id","started_at");