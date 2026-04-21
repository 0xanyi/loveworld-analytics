import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Auth } from "@lwa/auth";
import { type Database, hierarchyNode, tenant, tenantMembership, user } from "@lwa/db";
import { eq } from "drizzle-orm";
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

describe("hierarchy routes", () => {
  it("network_admin can create/list/patch/archive hierarchy nodes", async () => {
    const ctx = await seedTenant(db, "network_admin");
    const app = buildApp({ db, auth: testAuth() });

    const createRes = await app.request(`/tenants/${ctx.slug}/hierarchy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": ctx.userId,
      },
      body: JSON.stringify({
        type: "station",
        name: "LW Europe",
        slug: `lw-europe-${crypto.randomUUID().slice(0, 8)}`,
        metadata: { region: "EU" },
      }),
    });

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; name: string };
    expect(created.name).toBe("LW Europe");

    const listRes = await app.request(`/tenants/${ctx.slug}/hierarchy`, {
      headers: { "x-test-user-id": ctx.userId },
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { nodes: Array<{ id: string }> };
    expect(list.nodes.some((n) => n.id === created.id)).toBe(true);

    const patchRes = await app.request(`/tenants/${ctx.slug}/hierarchy/${created.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": ctx.userId,
      },
      body: JSON.stringify({ name: "LW Europe Updated" }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { name: string };
    expect(patched.name).toBe("LW Europe Updated");

    const delRes = await app.request(`/tenants/${ctx.slug}/hierarchy/${created.id}`, {
      method: "DELETE",
      headers: { "x-test-user-id": ctx.userId },
    });
    expect(delRes.status).toBe(200);

    const [archived] = await db
      .select({ archivedAt: hierarchyNode.archivedAt })
      .from(hierarchyNode)
      .where(eq(hierarchyNode.id, created.id));
    expect(archived?.archivedAt).toBeTruthy();
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

async function seedTenant(db: Database, role: "network_admin" | "station_manager" | "board_viewer" | "analyst") {
  const suffix = crypto.randomUUID().slice(0, 8);
  const slug = `h-${suffix}`;

  const [t] = await db.insert(tenant).values({ name: `Hierarchy ${suffix}`, slug }).returning();
  const [u] = await db
    .insert(user)
    .values({ email: `${suffix}@example.com`, name: "Hierarchy User", emailVerified: true })
    .returning();

  await db.insert(tenantMembership).values({
    tenantId: t!.id,
    userId: u!.id,
    role,
  });

  return { slug, tenantId: t!.id, userId: u!.id };
}
