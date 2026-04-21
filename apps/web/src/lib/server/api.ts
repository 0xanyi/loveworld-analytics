import { env } from "$env/dynamic/private";
import type { Cookies } from "@sveltejs/kit";

const API_BASE =
  env.API_BASE_URL ?? env.AUTH_BASE_URL ?? "http://localhost:3001";

export async function serverApiFetch(
  path: string,
  options: {
    cookies: Cookies;
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
  },
): Promise<Response> {
  const cookieHeader = options.cookies
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  return fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}
