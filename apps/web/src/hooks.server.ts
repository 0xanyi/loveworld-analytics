import type { Handle } from "@sveltejs/kit";

/**
 * Phase 0: no server-side session fetch; authorization decisions happen
 * client-side via Better Auth. Phase 1 will fetch session here and populate
 * event.locals for SSR-rendered dashboards + guard tenant-scoped routes.
 */
export const handle: Handle = ({ event, resolve }) => resolve(event);
