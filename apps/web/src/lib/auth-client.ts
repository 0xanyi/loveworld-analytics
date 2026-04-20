import { createAuthClient } from "better-auth/svelte";

/**
 * Better Auth client, talks to the API's /api/auth/* endpoints.
 * VITE_API_BASE_URL is read at build time (Vite inlines env vars prefixed with VITE_).
 * Defaults to http://localhost:3001 for local dev.
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001",
});
