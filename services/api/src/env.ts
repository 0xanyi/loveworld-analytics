import { z } from "zod";
import { err, ok, type Result } from "@lwa/contracts";
import { resolveFileEnv } from "@lwa/crypto";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// or postgresql:// URL"),
  API_PORT: z.coerce.number().default(3001),
  AUTH_SECRET: z.string().min(32),
  AUTH_BASE_URL: z.string().url(),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, "REDIS_URL must be a redis:// or rediss:// URL"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("no-reply@example.com"),
  /**
   * Comma-separated list of origins allowed to make credentialed requests.
   * Required in staging/production; optional in dev/test.
   * Example: "https://app.loveworldanalytics.com,https://admin.loveworldanalytics.com"
   */
  ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Pure validator — returns Result instead of calling process.exit so the
 * function is testable in-process. `server.ts` owns the exit decision.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Result<Env, z.ZodError> {
  const resolved = resolveFileEnv(source, ["DATABASE_URL", "AUTH_SECRET", "SMTP_USER", "SMTP_PASS"]);
  const parsed = EnvSchema.safeParse(resolved);
  if (!parsed.success) return err(parsed.error);

  const env = parsed.data;
  if (
    (env.NODE_ENV === "staging" || env.NODE_ENV === "production") &&
    env.ALLOWED_ORIGINS.length === 0
  ) {
    return err(
      new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ["ALLOWED_ORIGINS"],
          message: "ALLOWED_ORIGINS is required when NODE_ENV is staging or production",
        },
      ]),
    );
  }

  return ok(env);
}
