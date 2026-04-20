import { describe, expect, it } from "vitest";
import type { Auth } from "@lwa/auth";
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

  it("does not mount /api/auth/* when auth is absent", async () => {
    const app = buildApp({});
    const res = await app.request("/api/auth/ok");
    expect(res.status).toBe(404);
  });

  it("does not set CORS headers when allowlist is empty", async () => {
    const app = buildApp({});
    const res = await app.request("/health", {
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("reflects allowlisted origins with credentials=true", async () => {
    const app = buildApp({ allowedOrigins: ["http://localhost:5173"] });
    const res = await app.request("/health", {
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("omits CORS headers for non-allowlisted origins", async () => {
    const app = buildApp({ allowedOrigins: ["http://localhost:5173"] });
    const res = await app.request("/health", {
      headers: { origin: "https://evil.example.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("delegates /api/auth/* to auth.handler when auth is present", async () => {
    let calledWith: string | null = null;
    const stubAuth = {
      handler: (req: Request) => {
        calledWith = new URL(req.url).pathname;
        return Promise.resolve(new Response(JSON.stringify({ stub: true }), { status: 200 }));
      },
      api: {
        getSession: () => Promise.resolve(null),
      },
    } as unknown as Auth;

    const app = buildApp({ auth: stubAuth });
    const res = await app.request("/api/auth/any-path");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stub: true });
    expect(calledWith).toBe("/api/auth/any-path");
  });
});
