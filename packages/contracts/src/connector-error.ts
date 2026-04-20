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

export type ConnectorError = {
  code: ConnectorErrorCode;
  message: string;
  retryAfterSeconds?: number;
  cause?: unknown;
};
