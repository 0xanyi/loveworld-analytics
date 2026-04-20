import type { ConnectorError } from "@lwa/contracts";

const NETWORK_ERROR_CODES = new Set(["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"]);

export function classifyHttpError(status: number, message: string): ConnectorError {
  if (status === 401) return { code: "AUTH_INVALID", message, retryable: false };
  if (status === 403) return { code: "CONFIG_INVALID", message, retryable: false };
  if (status === 429) return { code: "RATE_LIMITED", message, retryable: true };
  if (status === 404) return { code: "CONFIG_INVALID", message, retryable: false };
  if (status >= 500) return { code: "TRANSIENT", message, retryable: true };
  return { code: "TRANSIENT", message, retryable: true };
}

export function classifyNetworkError(err: unknown): ConnectorError {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
      ? err.code
      : undefined;

  if (
    (code && NETWORK_ERROR_CODES.has(code)) ||
    message.match(/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET/)
  ) {
    return { code: "UPSTREAM_UNAVAILABLE", message, retryable: true };
  }

  return { code: "TRANSIENT", message, retryable: true };
}

export function isRetryable(err: ConnectorError): boolean {
  return err.retryable === true;
}
