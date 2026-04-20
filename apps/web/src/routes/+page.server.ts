import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * Phase 0: root always redirects to /login. Phase 1 will check session and
 * redirect authenticated users to their first tenant dashboard.
 */
export const load: PageServerLoad = ({ url }) => {
  redirect(303, `/login${url.search}`);
};
