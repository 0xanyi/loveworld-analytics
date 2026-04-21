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
