import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { loadMemberships } from "$lib/server/session";

export const load: PageServerLoad = async ({ cookies, url }) => {
  const memberships = await loadMemberships(cookies);

  if (!memberships || memberships.length === 0) {
    redirect(303, `/login${url.search}`);
  }

  if (memberships.length === 1) {
    redirect(303, `/${memberships[0]!.tenantSlug}${url.search}`);
  }

  return { memberships };
};
