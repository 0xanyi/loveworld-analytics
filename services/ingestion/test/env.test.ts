import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@lwa/contracts";
import { loadEnv } from "../src/env";

const VALID: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://user:pw@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  LWA_KEK_V1: Buffer.alloc(32, 7).toString("base64"),
};

describe("loadEnv", () => {
  it("returns ok with defaults applied", () => {
    const r = loadEnv(VALID);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.NODE_ENV).toBe("development");
      expect(r.value.LOG_LEVEL).toBe("info");
      expect(r.value.INGESTION_CONCURRENCY).toBe(4);
    }
  });

  it("coerces INGESTION_CONCURRENCY from a string env var", () => {
    const r = loadEnv({ ...VALID, INGESTION_CONCURRENCY: "8" });
    expect(isOk(r) && r.value.INGESTION_CONCURRENCY).toBe(8);
  });

  it("rejects non-positive INGESTION_CONCURRENCY", () => {
    expect(isErr(loadEnv({ ...VALID, INGESTION_CONCURRENCY: "0" }))).toBe(true);
    expect(isErr(loadEnv({ ...VALID, INGESTION_CONCURRENCY: "-1" }))).toBe(true);
  });

  it("rejects non-postgres DATABASE_URL schemes", () => {
    const r = loadEnv({ ...VALID, DATABASE_URL: "http://bad" });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.flatten().fieldErrors.DATABASE_URL).toBeDefined();
    }
  });

  it("accepts both postgres:// and postgresql:// schemes", () => {
    expect(isOk(loadEnv({ ...VALID, DATABASE_URL: "postgres://a:b@h/c" }))).toBe(true);
    expect(isOk(loadEnv({ ...VALID, DATABASE_URL: "postgresql://a:b@h/c" }))).toBe(true);
  });

  it("rejects non-redis REDIS_URL schemes", () => {
    const r = loadEnv({ ...VALID, REDIS_URL: "http://localhost" });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.flatten().fieldErrors.REDIS_URL).toBeDefined();
    }
  });

  it("accepts both redis:// and rediss:// schemes", () => {
    expect(isOk(loadEnv({ ...VALID, REDIS_URL: "redis://host:6379" }))).toBe(true);
    expect(isOk(loadEnv({ ...VALID, REDIS_URL: "rediss://host:6379" }))).toBe(true);
  });

  it("rejects missing DATABASE_URL", () => {
    const { DATABASE_URL: _, ...rest } = VALID;
    expect(isErr(loadEnv(rest))).toBe(true);
  });

  it("rejects missing REDIS_URL", () => {
    const { REDIS_URL: _, ...rest } = VALID;
    expect(isErr(loadEnv(rest))).toBe(true);
  });
});
