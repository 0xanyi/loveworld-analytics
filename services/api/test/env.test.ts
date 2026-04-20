import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@lwa/contracts";
import { loadEnv } from "../src/env";

const VALID: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://user:pw@localhost:5432/db",
  AUTH_SECRET: "a".repeat(32),
  AUTH_BASE_URL: "http://localhost:5173",
};

describe("loadEnv", () => {
  it("returns ok with parsed env when all required fields are present", () => {
    const r = loadEnv(VALID);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.DATABASE_URL).toBe(VALID.DATABASE_URL);
      expect(r.value.API_PORT).toBe(3001); // default
      expect(r.value.NODE_ENV).toBe("development"); // default
    }
  });

  it("rejects AUTH_SECRET shorter than 32 chars", () => {
    const r = loadEnv({ ...VALID, AUTH_SECRET: "too-short" });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.flatten().fieldErrors.AUTH_SECRET).toBeDefined();
    }
  });

  it("rejects non-postgres DATABASE_URL schemes", () => {
    const r = loadEnv({ ...VALID, DATABASE_URL: "javascript:alert(1)" });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.flatten().fieldErrors.DATABASE_URL).toBeDefined();
    }
  });

  it("accepts both postgres:// and postgresql:// schemes", () => {
    expect(isOk(loadEnv({ ...VALID, DATABASE_URL: "postgres://a:b@h/c" }))).toBe(true);
    expect(isOk(loadEnv({ ...VALID, DATABASE_URL: "postgresql://a:b@h/c" }))).toBe(true);
  });

  it("rejects missing DATABASE_URL", () => {
    const { DATABASE_URL: _, ...rest } = VALID;
    const r = loadEnv(rest);
    expect(isErr(r)).toBe(true);
  });
});
