import { describe, it } from "vitest";
import type { ConnectorError } from "../src/connector-error";

describe("ConnectorError (type-level)", () => {
  it("RATE_LIMITED may carry retryAfterMs and must declare retryable", () => {
    const e: ConnectorError = {
      code: "RATE_LIMITED",
      message: "429",
      retryable: true,
      retryAfterMs: 60_000,
    };
    void e;
  });

  it("RATE_LIMITED may omit retryAfterMs", () => {
    const e: ConnectorError = {
      code: "RATE_LIMITED",
      message: "429 no header",
      retryable: true,
    };
    void e;
  });

  it("non-RATE_LIMITED codes may also carry retryable=false", () => {
    const e: ConnectorError = {
      code: "AUTH_EXPIRED",
      message: "token expired",
      retryable: false,
    };
    void e;
  });

  it("accepts all seven error codes", () => {
    const codes: ConnectorError["code"][] = [
      "AUTH_EXPIRED",
      "AUTH_INVALID",
      "RATE_LIMITED",
      "TRANSIENT",
      "UPSTREAM_UNAVAILABLE",
      "CONFIG_INVALID",
      "NO_DATA",
    ];
    void codes;
  });
});
