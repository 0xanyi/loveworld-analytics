import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { envKekProvider } from "../src/env-provider";

describe("envKekProvider", () => {
  it("loads current key from env", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const provider = envKekProvider({
      LWA_KEK_CURRENT: "v1",
      LWA_KEK_V1: key,
    });

    expect(provider.currentVersion).toBe("v1");
    expect(provider.getKey("v1")).toEqual(Buffer.from(key, "base64"));
  });

  it("loads current key from *_FILE env vars", () => {
    const dir = mkdtempSync(join(tmpdir(), "lwa-crypto-env-"));
    const key = Buffer.alloc(32, 5).toString("base64");
    const keyPath = join(dir, "kek");
    writeFileSync(keyPath, key, "utf8");

    const provider = envKekProvider({
      LWA_KEK_CURRENT: "v1",
      LWA_KEK_V1_FILE: keyPath,
    });

    expect(provider.getKey("v1")).toEqual(Buffer.from(key, "base64"));
  });

  it("prefers direct env vars over *_FILE values", () => {
    const dir = mkdtempSync(join(tmpdir(), "lwa-crypto-env-"));
    const directKey = Buffer.alloc(32, 7).toString("base64");
    const fileKey = Buffer.alloc(32, 9).toString("base64");
    const keyPath = join(dir, "kek");
    writeFileSync(keyPath, fileKey, "utf8");

    const provider = envKekProvider({
      LWA_KEK_CURRENT: "v1",
      LWA_KEK_V1: directKey,
      LWA_KEK_V1_FILE: keyPath,
    });

    expect(provider.getKey("v1")).toEqual(Buffer.from(directKey, "base64"));
  });

  it("throws for unknown version", () => {
    const provider = envKekProvider({ LWA_KEK_CURRENT: "v2" });
    expect(() => provider.getKey("v999")).toThrow(/unknown kek version/);
  });

  it("throws when key is not 32 bytes", () => {
    const shortKey = Buffer.alloc(16, 1).toString("base64");
    const provider = envKekProvider({
      LWA_KEK_CURRENT: "v1",
      LWA_KEK_V1: shortKey,
    });

    expect(() => provider.getKey("v1")).toThrow(/must be 32 bytes/);
  });
});
