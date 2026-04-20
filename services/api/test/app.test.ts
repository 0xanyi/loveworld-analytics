import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("api app", () => {
  it("GET /health returns 200 with status ok", async () => {
    const app = buildApp({});
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; time: string };
    expect(body).toMatchObject({ status: "ok" });
    expect(typeof body.time).toBe("string");
  });

  it("GET /me returns 401 when unauthenticated", async () => {
    const app = buildApp({});
    const res = await app.request("/me");
    expect(res.status).toBe(401);
  });
});
