import { describe, it, expect } from "vitest";
import { classifyHttpError, classifyNetworkError, isRetryable } from "../src/lib/errors";

describe("classifyHttpError", () => {
  it.each([
    [401, "AUTH_INVALID", false],
    [403, "CONFIG_INVALID", false],
    [429, "RATE_LIMITED", true],
    [500, "TRANSIENT", true],
    [502, "TRANSIENT", true],
    [404, "CONFIG_INVALID", false],
  ])("status %i → %s (retryable=%s)", (status, code, retryable) => {
    const e = classifyHttpError(status, "x");
    expect(e.code).toBe(code);
    expect(isRetryable(e)).toBe(retryable);
  });
});

describe("classifyNetworkError", () => {
  it("UPSTREAM_UNAVAILABLE on ECONNREFUSED", () => {
    expect(classifyNetworkError(new Error("connect ECONNREFUSED 127.0.0.1:5432")).code).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
  });

  it("UPSTREAM_UNAVAILABLE when code field is present", () => {
    const err = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    expect(classifyNetworkError(err).code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("TRANSIENT on unknown error", () => {
    expect(classifyNetworkError(new Error("whatever")).code).toBe("TRANSIENT");
  });
});
