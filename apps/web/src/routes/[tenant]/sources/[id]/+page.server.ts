import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { serverApiFetch } from "$lib/server/api";

type SourceHealth = {
  id: string;
  sourceKey: string;
  sourceName: string;
  enabled: boolean;
  status: "active" | "error" | "paused";
  lastRunAt: string | null;
  lastError: string | null;
};

type IngestionRun = {
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

export const load: PageServerLoad = async ({ params, cookies }) => {
  const slug = params.tenant;
  const id = params.id;

  const res = await serverApiFetch(`/tenants/${slug}/source-health/${id}`, { cookies });

  if (res.status === 401) {
    throw redirect(303, "/login");
  }

  if (!res.ok) {
    throw error(res.status, "Failed to load source health detail");
  }

  const body = (await res.json()) as { connector: SourceHealth; runs: IngestionRun[] };

  return {
    tenantSlug: slug,
    connector: body.connector,
    runs: body.runs,
  };
};
