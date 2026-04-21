import { describe, expect, it } from "vitest";
import { createAuth } from "../src/auth";

describe("createAuth", () => {
  it("passes trustedOrigins through to Better Auth options", () => {
    const auth = createAuth({
      db: {} as never,
      secret: "12345678901234567890123456789012",
      baseUrl: "http://localhost:3001",
      trustedOrigins: ["http://localhost:5173", "http://localhost:5174"],
      sendMagicLink: async () => {},
    });

    const options = auth.options as { trustedOrigins?: string[] };
    expect(options.trustedOrigins).toEqual(["http://localhost:5173", "http://localhost:5174"]);
  });
});
