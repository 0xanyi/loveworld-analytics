import { describe, it } from "vitest";
import type { ConnectorError } from "../src/connector-error";

/**
 * These tests assert the discriminated-union invariant at compile time.
 * The `@ts-expect-error` directives *must* trigger an error; if the type
 * ever weakens to allow the disallowed shape, TypeScript flags the directive
 * as unused and the file fails `tsc --noEmit`.
 */
describe("ConnectorError (type-level)", () => {
  it("RATE_LIMITED may carry retryAfterSeconds", () => {
    const e: ConnectorError = {
      code: "RATE_LIMITED",
      message: "429",
      retryAfterSeconds: 60,
    };
    void e;
  });

  it("RATE_LIMITED may omit retryAfterSeconds", () => {
    const e: ConnectorError = { code: "RATE_LIMITED", message: "429 no header" };
    void e;
  });

  it("non-RATE_LIMITED codes cannot carry retryAfterSeconds", () => {
    const e: ConnectorError = {
      code: "AUTH_EXPIRED",
      message: "token expired",
      // @ts-expect-error — retryAfterSeconds is not allowed on AUTH_EXPIRED
      retryAfterSeconds: 60,
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
