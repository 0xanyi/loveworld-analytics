import { Hono } from "hono";
import type { Auth } from "@lwa/auth";

export function authRoutes(auth: Auth): Hono {
  const app = new Hono();
  // Better Auth's default internal base path is /api/auth (not /auth as the
  // plan originally specified). Smoke-tested: requests to /auth/* return 404
  // because auth.handler matches against request.url's path vs its own basePath.
  // Mounting at /api/auth matches the documented Better Auth + Hono pattern.
  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
  return app;
}
