import { betterAuth } from "better-auth";
import { magicLink, twoFactor } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "@lwa/db";

export type AuthConfig = {
  db: Database;
  secret: string;
  baseUrl: string;
  trustedOrigins?: string[];
  sendMagicLink: (to: string, url: string) => Promise<void>;
};

export function createAuth(config: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(config.db, { provider: "pg" }),
    secret: config.secret,
    baseURL: config.baseUrl,
    trustedOrigins: config.trustedOrigins,
    // Task 2's schema types id columns as `uuid`; Better Auth's default ID
    // generator produces nanoid-style 32-char strings which Postgres rejects
    // as invalid UUIDs. Force UUID generation here to match the schema.
    // Discovered by Task 6 smoke test.
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    session: {
      cookieCache: { enabled: true, maxAge: 60 * 5 },
      expiresIn: 60 * 60,
      updateAge: 60 * 10,
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await config.sendMagicLink(email, url);
        },
      }),
      twoFactor({ issuer: "Loveworld Analytics" }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
