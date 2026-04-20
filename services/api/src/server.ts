import { serve } from "@hono/node-server";
import { createDb } from "@lwa/db";
import { createAuth } from "@lwa/auth";
import { buildApp } from "./app";
import { loadEnv } from "./env";
import { createEmailSender } from "./lib/email";

const env = loadEnv();
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

const app = buildApp({ auth });

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
