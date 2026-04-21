import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Auth } from "@lwa/auth";
import { type Database, tenant, tenantMembership, user } from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import { buildApp } from "../src/app";

let container: StartedPostgreSqlContainer;
let db: Database;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const res = await createTestDb(container.getConnectionUri());
  db = res.db;
  cleanup = res.cleanup;
});

afterAll(async () => {
  await cleanup();
  await container.stop();
});

// Minimal stub auth that resolves x-test-user-id header to a session.
function testAuth(): Auth {
  return {
    handler: () => Promise.resolve(new Response("not found", { status: 404 })),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user-id");
        if (!id) return null;
        return {
          user: {
            id,
            email: "test@example.com",
            emailVerified: true,
            name: "Test User",
            image: null,
            twoFactorEnabled: false,
          },
        };
      },
    },
  } as unknown as Auth;
}

async function seedUser(suffix: string) {
  const [u] = await db
    .insert(user)
    .values({ email: `${suffix}@example.com`, name: "Test User", emailVerified: true })
    .returning();
  return u!;
}

async function seedTenant(suffix: string, opts?: { archived?: boolean }) {
  const [t] = await db
    .insert(tenant)
    .values({
      name: `Tenant ${suffix}`,
      slug: `tenant-${suffix}`,
      archivedAt: opts?.archived ? new Date("2024-01-01") : null,
    })
    .returning();
  return t!;
}

async function seedMembership(
  userId: string,
  tenantId: string,
  role: "network_admin" | "station_manager" | "board_viewer" | "analyst",
  scopeNodeIds: string[] = [],
) {
  const [m] = await db
    .insert(tenantMembership)
    .values({ userId, tenantId, role, scopeNodeIds })
    .returning();
  return m!;
}

describe("GET /me", () => {
  it("returns 503 when authenticated but db is not configured", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const u = await seedUser(suffix);
    // Build app with auth but no db — simulates server misconfiguration.
    const app = buildApp({ auth: testAuth() });
    const res = await app.request("/me", {
      headers: { "x-test-user-id": u.id },
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/database not configured/);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp({ db, auth: testAuth() });
    const res = await app.request("/me");
    expect(res.status).toBe(401);
  });

  it("returns user fields and empty memberships when user has no memberships", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const u = await seedUser(suffix);
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request("/me", {
      headers: { "x-test-user-id": u.id },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { user: unknown; memberships: unknown[] };
    // The stub auth returns fixed email/name; only id comes from the seeded user.
    expect(body.user).toMatchObject({
      id: u.id,
      email: "test@example.com",
      name: "Test User",
    });
    expect(body.memberships).toEqual([]);
  });

  it("returns memberships with required fields", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const u = await seedUser(suffix);
    const t = await seedTenant(suffix);
    await seedMembership(u.id, t.id, "network_admin");

    const app = buildApp({ db, auth: testAuth() });
    const res = await app.request("/me", {
      headers: { "x-test-user-id": u.id },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      user: unknown;
      memberships: {
        tenantId: string;
        tenantSlug: string;
        tenantName: string;
        role: string;
        scopeNodeIds: string[];
      }[];
    };

    expect(body.memberships).toHaveLength(1);
    const m = body.memberships[0]!;
    expect(m.tenantId).toBe(t.id);
    expect(m.tenantSlug).toBe(t.slug);
    expect(m.tenantName).toBe(t.name);
    expect(m.role).toBe("network_admin");
    expect(Array.isArray(m.scopeNodeIds)).toBe(true);
  });

  it("excludes archived tenants from memberships", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const u = await seedUser(suffix);
    const active = await seedTenant(`active-${suffix}`);
    const archived = await seedTenant(`archived-${suffix}`, { archived: true });
    await seedMembership(u.id, active.id, "board_viewer");
    await seedMembership(u.id, archived.id, "board_viewer");

    const app = buildApp({ db, auth: testAuth() });
    const res = await app.request("/me", {
      headers: { "x-test-user-id": u.id },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { memberships: { tenantId: string }[] };
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0]!.tenantId).toBe(active.id);
  });

  it("does not expose raw Better Auth session fields", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const u = await seedUser(suffix);

    const app = buildApp({ db, auth: testAuth() });
    const res = await app.request("/me", {
      headers: { "x-test-user-id": u.id },
    });
    const body = (await res.json()) as Record<string, unknown>;

    // Only `user` and `memberships` keys should be present
    expect(Object.keys(body).sort()).toEqual(["memberships", "user"]);

    const userFields = Object.keys(body.user as object);
    expect(userFields).not.toContain("updatedAt");
    expect(userFields).not.toContain("createdAt");
  });
});
