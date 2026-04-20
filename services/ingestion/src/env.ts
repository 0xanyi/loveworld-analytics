import { z } from "zod";
import { err, ok, type Result } from "@lwa/contracts";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// or postgresql:// URL"),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, "REDIS_URL must be a redis:// or rediss:// URL"),
  INGESTION_CONCURRENCY: z.coerce.number().int().positive().default(4),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Same Result-based pattern as @lwa/api: pure validator, caller owns the
 * exit decision. Deviation from plan (plan calls process.exit) kept
 * consistent with Task 6 code-review fix.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Result<Env, z.ZodError> {
  const parsed = EnvSchema.safeParse(source);
  return parsed.success ? ok(parsed.data) : err(parsed.error);
}
