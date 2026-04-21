import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import type { Auth } from "@lwa/auth";
import { requireSession } from "@lwa/auth";
import type { KekProvider } from "@lwa/crypto";
import type { Database } from "@lwa/db";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { authRoutes } from "./routes/auth";
import { entriesRoutes } from "./routes/entries";
import { hierarchyRoutes } from "./routes/hierarchy";
import { connectorRoutes } from "./routes/connectors";
import { sourcesRoutes } from "./routes/sources";
import { metricsRoutes } from "./routes/metrics";
import { backfillRoutes, type BackfillQueue } from "./routes/backfill";
import { sourceHealthRoutes } from "./routes/source-health";

export type AppDeps = {
  auth?: Auth;
  /**
   * Explicit origin allowlist for CORS. If empty/omitted, CORS is not mounted
   * at all — appropriate when the API is called only from same-origin code
   * (e.g., server-side render) or when no browser client exists yet.
   */
  allowedOrigins?: readonly string[];
  db?: Database;
  kek?: KekProvider;
  redisUrl?: string;
  backfillQueue?: BackfillQueue;
};

export function buildApp(deps: AppDeps = {}): Hono {
  const app = new Hono();

  app.use("*", logger());

  if (deps.allowedOrigins && deps.allowedOrigins.length > 0) {
    const allowlist = new Set(deps.allowedOrigins);
    app.use(
      "*",
      cors({
        // Reflect ONLY origins on the explicit allowlist. Requests from any
        // other origin get no CORS headers, so the browser blocks them.
        // Returning `null` from Hono's origin callback means "no CORS headers",
        // which is the correct denial semantics.
        origin: (origin) => (origin && allowlist.has(origin) ? origin : null),
        credentials: true,
      }),
    );
  }

  app.route("/", healthRoutes);
  app.route("/", sourcesRoutes());

  if (deps.auth) {
    app.route("/", authRoutes(deps.auth));
    app.use("/me", requireSession(deps.auth));
    app.use("/tenants/:slug/*", requireSession(deps.auth));
  }

  app.route("/", meRoutes(deps.db));

  if (deps.db) {
    app.route("/", entriesRoutes(deps.db));
    app.route("/", hierarchyRoutes(deps.db));
    app.route("/", metricsRoutes(deps.db));
    app.route("/", sourceHealthRoutes(deps.db));

    if (deps.kek) {
      app.route("/", connectorRoutes(deps.db, deps.kek));

      if (deps.redisUrl || deps.backfillQueue) {
        app.route(
          "/",
          backfillRoutes(deps.db, {
            redisUrl: deps.redisUrl,
            queue: deps.backfillQueue,
          }),
        );
      }
    }
  }

  return app;
}
