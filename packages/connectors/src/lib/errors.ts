import type { ConnectorError } from "@lwa/contracts";

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
  if (message.match(/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET/)) {
    return { code: "UPSTREAM_UNAVAILABLE", message, retryable: true };
  }
  return { code: "TRANSIENT", message, retryable: true };
}

export function isRetryable(err: ConnectorError): boolean {
  return err.retryable === true;
}
