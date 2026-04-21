/**
 * Shared response shapes for `/tenants/:slug/source-health` and
 * `/tenants/:slug/source-health/:id`. Mirrors the API response surface
 * — keep in sync with `services/api/src/routes/source-health.ts` and
 * `packages/db/src/schema/ingestion-run.ts`.
 */

export type SourceHealth = {
  id: string;
  sourceKey: string;
  sourceName: string;
  enabled: boolean;
  status: "active" | "error" | "paused";
  lastRunAt: string | null;
  lastError: string | null;
};

export type IngestionRun = {
  id: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt: string;
  finishedAt: string | null;
  periodStart: string;
  periodEnd: string;
  recordsWritten: number;
  errorCode: string | null;
  errorMessage: string | null;
  warnings: string[];
};
