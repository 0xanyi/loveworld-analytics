import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openCredentials, sealCredentials, type KekProvider } from "../src/envelope";

const kek = randomBytes(32);
const provider: KekProvider = {
  currentVersion: "v1",
  getKey: (v) => {
    if (v === "v1") return kek;
    throw new Error(`unknown kek ${v}`);
  },
};

describe("envelope crypto", () => {
  it("roundtrips plaintext", async () => {
    const plain = { apiKey: "secret-123", propertyIds: ["p1", "p2"] };
    const sealed = await sealCredentials(plain, provider);
    expect(sealed.ciphertext).toBeTypeOf("string");
    expect(sealed.kekVersion).toBe("v1");
    const opened = await openCredentials<typeof plain>(sealed, provider);
    expect(opened).toEqual(plain);
  });

  it("tamper detection: mutated ciphertext fails with GCM auth error", async () => {
    const sealed = await sealCredentials({ x: 1 }, provider);
    const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice(0, -4) + "XXXX" };
    await expect(openCredentials(tampered, provider)).rejects.toThrow();
  });

  it("rejects unknown kek version", async () => {
    const sealed = await sealCredentials({ x: 1 }, provider);
    await expect(openCredentials({ ...sealed, kekVersion: "v999" }, provider)).rejects.toThrow(
      /unknown kek/,
    );
  });

  it("different plaintexts produce different ciphertexts (random IV)", async () => {
    const a = await sealCredentials({ x: 1 }, provider);
    const b = await sealCredentials({ x: 1 }, provider);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});
