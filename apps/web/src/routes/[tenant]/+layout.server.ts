import { error } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ params }) => {
  if (!params.tenant) error(404, "Tenant not specified");
  // Phase 0: tenant membership not validated server-side; Phase 1 wires
  // the API /me/memberships check here.
  return { tenantSlug: params.tenant };
};
