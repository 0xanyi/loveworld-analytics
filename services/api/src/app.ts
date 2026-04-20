import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import type { Auth } from "@lwa/auth";
import { requireSession } from "@lwa/auth";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { authRoutes } from "./routes/auth";

export type AppDeps = {
  auth?: Auth;
};

export function buildApp(deps: AppDeps = {}): Hono {
  const app = new Hono();

  app.use("*", logger());
  // NOTE: reflecting the request Origin with credentials=true is intentional
  // for Phase 0 local dev but is NOT safe for production — any site a logged-in
  // user visits could forge authenticated requests. Replace with an explicit
  // allowlist (driven by env.ALLOWED_ORIGINS) in Task 8/Phase 1 before shipping.
  app.use(
    "*",
    cors({
      origin: (origin) => origin ?? "*",
      credentials: true,
    }),
  );

  app.route("/", healthRoutes);

  if (deps.auth) {
    app.route("/", authRoutes(deps.auth));
    app.use("/me", requireSession(deps.auth));
  }

  app.route("/", meRoutes);

  return app;
}
