import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Auth } from "@lwa/auth";
import { type Database, hierarchyNode, tenant, tenantMembership, user } from "@lwa/db";
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

describe("rbac matrix", () => {
  it("network_admin can edit hierarchy and board_viewer cannot", async () => {
    const admin = await seedCtx(db, "network_admin");
    const viewer = await seedCtx(db, "board_viewer", admin.slug, admin.tenantId);

    const app = buildApp({ db, auth: testAuth() });

    const okRes = await app.request(`/tenants/${admin.slug}/hierarchy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": admin.userId,
      },
      body: JSON.stringify({
        type: "station",
        name: "Editable",
        slug: `editable-${crypto.randomUUID().slice(0, 8)}`,
      }),
    });
    expect(okRes.status).toBe(201);

    const forbiddenRes = await app.request(`/tenants/${admin.slug}/hierarchy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": viewer.userId,
      },
      body: JSON.stringify({
        type: "station",
        name: "Forbidden",
        slug: `forbidden-${crypto.randomUUID().slice(0, 8)}`,
      }),
    });
    expect(forbiddenRes.status).toBe(403);
  });

  it("station_manager can access board metrics but analyst cannot edit hierarchy", async () => {
    const manager = await seedCtx(db, "station_manager");
    const analyst = await seedCtx(db, "analyst", manager.slug, manager.tenantId);

    const app = buildApp({ db, auth: testAuth() });

    const boardRes = await app.request(
      `/tenants/${manager.slug}/metrics/board?hierarchyNodeId=${manager.nodeId}&period=week&granularity=day&comparison=none`,
      {
        headers: { "x-test-user-id": manager.userId },
      },
    );
    expect(boardRes.status).toBe(200);

    const editRes = await app.request(`/tenants/${manager.slug}/hierarchy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": analyst.userId,
      },
      body: JSON.stringify({
        type: "station",
        name: "Nope",
        slug: `nope-${crypto.randomUUID().slice(0, 8)}`,
      }),
    });
    expect(editRes.status).toBe(403);
  });

  it("returns 404 when user is not a member of tenant (anti-enumeration)", async () => {
    const owner = await seedCtx(db, "network_admin");
    const outsider = await seedCtx(db, "network_admin");

    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${owner.slug}/hierarchy`, {
      headers: { "x-test-user-id": outsider.userId },
    });

    expect(res.status).toBe(404);
  });
});

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

async function seedCtx(
  db: Database,
  role: "network_admin" | "station_manager" | "board_viewer" | "analyst",
  existingSlug?: string,
  existingTenantId?: string,
) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const slug = existingSlug ?? `r-${suffix}`;

  let tenantId = existingTenantId;
  if (!tenantId) {
    const [t] = await db.insert(tenant).values({ name: `RBAC ${suffix}`, slug }).returning();
    tenantId = t!.id;
  }

  const [u] = await db
    .insert(user)
    .values({ email: `${suffix}@example.com`, name: "RBAC User", emailVerified: true })
    .returning();

  const [node] = await db
    .insert(hierarchyNode)
    .values({
      tenantId,
      type: "station",
      name: "Node",
      slug: `node-${suffix}`,
    })
    .returning();

  await db.insert(tenantMembership).values({
    tenantId,
    userId: u!.id,
    role,
    scopeNodeIds: role === "station_manager" ? [node!.id] : [],
  });

  return { slug, tenantId, userId: u!.id, nodeId: node!.id };
}
