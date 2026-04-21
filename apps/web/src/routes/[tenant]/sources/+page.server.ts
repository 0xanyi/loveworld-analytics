import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { serverApiFetch } from "$lib/server/api";
import type { SourceHealth } from "$lib/types/source-health";

export const load: PageServerLoad = async ({ params, cookies }) => {
  const slug = params.tenant;

  const res = await serverApiFetch(`/tenants/${slug}/source-health`, { cookies });

  if (res.status === 401) {
    throw redirect(303, "/login");
  }

  if (!res.ok) {
    throw error(res.status, "Failed to load source health");
  }

  const body = (await res.json()) as { connectors: SourceHealth[] };

  return {
    tenantSlug: slug,
    connectors: body.connectors,
  };
};
