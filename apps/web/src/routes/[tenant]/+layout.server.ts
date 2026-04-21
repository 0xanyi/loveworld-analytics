import { error, redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { loadMemberships } from "$lib/server/session";
import type { Capability, Role } from "@lwa/auth/permissions";
import { capabilitiesFor } from "@lwa/auth/permissions";

export const load: LayoutServerLoad = async ({ params, cookies }) => {
  if (!params.tenant) error(404, "Tenant not specified");

  const memberships = await loadMemberships(cookies);
  if (!memberships) {
    throw redirect(303, "/login");
  }

  const membership = memberships.find((m) => m.tenantSlug === params.tenant);
  if (!membership) {
    throw error(404, "Tenant not found");
  }

  const role = membership.role as Role;
  const capabilities = Array.from(capabilitiesFor(role)) as Capability[];

  return {
    tenantSlug: params.tenant,
    role,
    capabilities,
  };
};
