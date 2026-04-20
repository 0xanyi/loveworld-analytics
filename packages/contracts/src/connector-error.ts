import { z } from "zod";

export const ConnectorErrorCodeSchema = z.enum([
  "AUTH_EXPIRED",
  "AUTH_INVALID",
  "RATE_LIMITED",
  "TRANSIENT",
  "UPSTREAM_UNAVAILABLE",
  "CONFIG_INVALID",
  "NO_DATA",
]);

export type ConnectorErrorCode = z.infer<typeof ConnectorErrorCodeSchema>;

/**
 * Discriminated union: `retryAfterSeconds` is only meaningful for `RATE_LIMITED`.
 * The type system prevents attaching it to other codes (e.g., `AUTH_EXPIRED`)
 * where a retry delay would mask a dead config.
 */
export type ConnectorError =
  | {
      code: "RATE_LIMITED";
      message: string;
      retryAfterSeconds?: number;
      cause?: unknown;
    }
  | {
      code: Exclude<ConnectorErrorCode, "RATE_LIMITED">;
      message: string;
      cause?: unknown;
    };
