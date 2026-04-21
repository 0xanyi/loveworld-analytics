import { redirect } from "@sveltejs/kit";
import type { Cookies } from "@sveltejs/kit";
import { serverApiFetch } from "./api.js";

export interface Membership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: "network_admin" | "station_manager" | "board_viewer" | "analyst";
  scopeNodeIds: string[];
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  image: string | null;
  twoFactorEnabled: boolean;
}

export interface MeResponse {
  user: CurrentUser;
  memberships: Membership[];
}

/**
 * Fetches /me and returns the full parsed response (user + memberships),
 * or null if unauthenticated. Throws on unexpected server errors.
 */
export async function loadMeResponse(
  cookies: Cookies,
): Promise<MeResponse | null> {
  const res = await serverApiFetch("/me", { cookies });
  if (res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`/me returned ${res.status}`);
  }
  return res.json() as Promise<MeResponse>;
}

/**
 * Returns the memberships array for the current session, or null if
 * unauthenticated.
 */
export async function loadMemberships(
  cookies: Cookies,
): Promise<Membership[] | null> {
  const me = await loadMeResponse(cookies);
  return me?.memberships ?? null;
}

/**
 * Ensures the user is authenticated and has at least one membership.
 * Redirects to /login if unauthenticated or if the user belongs to no tenant.
 * Returns the full { user, memberships } object so callers can access both
 * without a second fetch.
 */
export async function requireAuthOrRedirect(
  cookies: Cookies,
): Promise<MeResponse> {
  const me = await loadMeResponse(cookies);
  if (!me || me.memberships.length === 0) {
    redirect(303, "/login");
  }
  return me;
}
