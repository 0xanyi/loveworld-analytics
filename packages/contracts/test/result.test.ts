import { describe, expect, it } from "vitest";
import { ok, err, isOk, isErr, type Result } from "../src/result";

describe("Result", () => {
  it("ok() produces a success result", () => {
    const r: Result<number, string> = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it("err() produces a failure result", () => {
    const r: Result<number, string> = err("boom");
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) expect(r.error).toBe("boom");
  });
});
