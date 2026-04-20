import { serve } from "@hono/node-server";
import { createDb } from "@lwa/db";
import { createAuth } from "@lwa/auth";
import { isErr } from "@lwa/contracts";
import { buildApp } from "./app";
import { loadEnv } from "./env";
import { createEmailSender } from "./lib/email";

const envResult = loadEnv();
if (isErr(envResult)) {
  console.error("Invalid environment:", envResult.error.flatten().fieldErrors);
  process.exit(1);
}
const env = envResult.value;

const db = createDb(env.DATABASE_URL);
const sendEmail = createEmailSender(env);

const auth = createAuth({
  db,
  secret: env.AUTH_SECRET,
  baseUrl: env.AUTH_BASE_URL,
  sendMagicLink: async (to, url) => {
    await sendEmail(to, "Your Loveworld Analytics sign-in link", `Sign in: ${url}`);
  },
});

const allowedOrigins = env.ALLOWED_ORIGINS;

const app = buildApp({ auth, allowedOrigins });

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

// Fail loudly on unhandled async errors so operators see them. Node 22's
// default is "throw", but explicit handling gives us a chance to log context
// before the process dies.
process.on("unhandledRejection", (reason) => {
  console.error("[api] unhandledRejection:", reason);
  process.exit(1);
});

// Graceful shutdown: allow in-flight requests to finish before exit.
const shutdown = (signal: string) => {
  console.log(`[api] ${signal} received — draining connections`);
  server.close(() => {
    console.log("[api] shutdown complete");
    process.exit(0);
  });
  // Hard-kill if drain takes too long.
  setTimeout(() => {
    console.error("[api] drain timeout — forcing exit");
    process.exit(1);
  }, 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
