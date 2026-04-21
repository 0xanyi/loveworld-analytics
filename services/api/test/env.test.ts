import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@lwa/contracts";
import { loadEnv } from "../src/env";

const VALID: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://user:pw@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "a".repeat(32),
  AUTH_BASE_URL: "http://localhost:3001",
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

  it("loads secrets from *_FILE env vars", () => {
    const dir = mkdtempSync(join(tmpdir(), "lwa-api-env-"));
    const databaseUrlPath = join(dir, "database-url");
    const authSecretPath = join(dir, "auth-secret");
    writeFileSync(databaseUrlPath, VALID.DATABASE_URL ?? "", "utf8");
    writeFileSync(authSecretPath, VALID.AUTH_SECRET ?? "", "utf8");

    const r = loadEnv({
      REDIS_URL: VALID.REDIS_URL,
      AUTH_BASE_URL: VALID.AUTH_BASE_URL,
      DATABASE_URL_FILE: databaseUrlPath,
      AUTH_SECRET_FILE: authSecretPath,
    });

    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.DATABASE_URL).toBe(VALID.DATABASE_URL);
      expect(r.value.AUTH_SECRET).toBe(VALID.AUTH_SECRET);
    }
  });

  it("prefers direct env vars over *_FILE values", () => {
    const dir = mkdtempSync(join(tmpdir(), "lwa-api-env-"));
    const databaseUrlPath = join(dir, "database-url");
    writeFileSync(databaseUrlPath, "postgres://other:pw@localhost:5432/other", "utf8");

    const r = loadEnv({
      ...VALID,
      DATABASE_URL_FILE: databaseUrlPath,
    });

    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.DATABASE_URL).toBe(VALID.DATABASE_URL);
    }
  });

  it("rejects missing DATABASE_URL", () => {
    const { DATABASE_URL: _, ...rest } = VALID;
    const r = loadEnv(rest);
    expect(isErr(r)).toBe(true);
  });
});
