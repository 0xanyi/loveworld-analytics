import pino from "pino";

/**
 * Shared pino logger for the ingestion service. Reads `LOG_LEVEL` directly
 * from process.env so this module can be imported before `loadEnv()` runs.
 * Defaults to 'info' if unset or invalid.
 */
const level = process.env.LOG_LEVEL ?? "info";

export const logger = pino({
  level,
  base: { service: "ingestion" },
});

export type Logger = typeof logger;
