const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

/**
 * Browser fetch wrapper that includes cookies (so Better Auth's session is sent)
 * and defaults JSON content-type. Server-side (SSR) callers should use the raw
 * fetch passed via SvelteKit's load context instead of this helper.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}
