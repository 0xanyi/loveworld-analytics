import { error, redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { loadMeResponse } from "$lib/server/session";
import type { Capability, Role } from "@lwa/auth/permissions";
import { capabilitiesFor } from "@lwa/auth/permissions";

export const load: LayoutServerLoad = async ({ params, cookies }) => {
  if (!params.tenant) error(404, "Tenant not specified");

  // Single /me round-trip for both memberships and the logged-in user's
  // display info. Prevents a second fetch just to show the header badge.
  const me = await loadMeResponse(cookies);
  if (!me) {
    throw redirect(303, "/login");
  }

  const membership = me.memberships.find((m) => m.tenantSlug === params.tenant);
  if (!membership) {
    throw error(404, "Tenant not found");
  }

  const role = membership.role as Role;
  const capabilities = Array.from(capabilitiesFor(role)) as Capability[];

  return {
    tenantSlug: params.tenant,
    role,
    capabilities,
    currentUser: {
      email: me.user.email,
      name: me.user.name,
    },
  };
};
