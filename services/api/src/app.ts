import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Auth } from "@lwa/auth";
import { requireSession } from "@lwa/auth";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { authRoutes } from "./routes/auth";

export type AppDeps = {
  auth?: Auth;
};

// CORS is intentionally NOT mounted in Phase 0:
// - No browser-origin frontend exists yet (Task 8 adds SvelteKit).
// - A permissive default (`origin: *` + `credentials: true`) reflected with
//   the request Origin is a CSRF superhighway if it survives into prod.
// - Task 8 will add env-driven CORS with an explicit ALLOWED_ORIGINS allowlist.
// Better Auth enforces its own Origin check on mutation endpoints, so auth
// flows remain CSRF-safe even without app-level CORS.
export function buildApp(deps: AppDeps = {}): Hono {
  const app = new Hono();

  app.use("*", logger());

  app.route("/", healthRoutes);

  if (deps.auth) {
    app.route("/", authRoutes(deps.auth));
    app.use("/me", requireSession(deps.auth));
  }

  app.route("/", meRoutes);

  return app;
}
