import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { serverApiFetch } from "$lib/server/api";
import type { IngestionRun, SourceHealth } from "$lib/types/source-health";

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
