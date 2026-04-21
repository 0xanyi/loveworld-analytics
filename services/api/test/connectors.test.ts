import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Auth } from "@lwa/auth";
import type { KekProvider } from "@lwa/crypto";
import {
  type Database,
  connectorConfig,
  hierarchyNode,
  source,
  tenant,
  tenantMembership,
  user,
} from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import "@lwa/connectors";
import { buildApp } from "../src/app";

let container: StartedPostgreSqlContainer;
let db: Database;
let cleanup: () => Promise<void>;

const kekKey = randomBytes(32);
const kek: KekProvider = {
  currentVersion: "v1",
  getKey(version) {
    if (version !== "v1") throw new Error(`unknown kek version: ${version}`);
    return kekKey;
  },
};

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

describe("connectors routes", () => {
  it("network_admin can create/test/list connector and upsert account", async () => {
    const ctx = await seedCtx(db, "network_admin");
    const app = buildApp({ db, auth: testAuth(), kek });

    const createRes = await app.request(`/tenants/${ctx.slug}/connectors`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": ctx.userId,
      },
      body: JSON.stringify({
        connectorKey: "manual_satellite",
        schedule: "0 3 * * *",
        credentials: {},
      }),
    });

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const listRes = await app.request(`/tenants/${ctx.slug}/connectors`, {
      headers: { "x-test-user-id": ctx.userId },
    });
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { connectors: Array<{ id: string }> };
    expect(listed.connectors.some((c) => c.id === created.id)).toBe(true);

    const testRes = await app.request(`/tenants/${ctx.slug}/connectors/${created.id}/test`, {
      method: "POST",
      headers: { "x-test-user-id": ctx.userId },
    });
    expect(testRes.status).toBe(200);

    const accountRes = await app.request(`/tenants/${ctx.slug}/connectors/${created.id}/accounts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": ctx.userId,
      },
      body: JSON.stringify({
        externalId: "manual-account-1",
        displayName: "Manual Account",
        hierarchyNodeId: ctx.nodeId,
      }),
    });

    expect(accountRes.status).toBe(201);

    const runsRes = await app.request(`/tenants/${ctx.slug}/connectors/${created.id}/runs`, {
      headers: { "x-test-user-id": ctx.userId },
    });

    expect(runsRes.status).toBe(200);
    const runs = (await runsRes.json()) as { runs: unknown[] };
    expect(Array.isArray(runs.runs)).toBe(true);
  });

  it("board_viewer cannot access connector management endpoints", async () => {
    const ctx = await seedCtx(db, "board_viewer");
    const app = buildApp({ db, auth: testAuth(), kek });

    const listRes = await app.request(`/tenants/${ctx.slug}/connectors`, {
      headers: { "x-test-user-id": ctx.userId },
    });
    expect(listRes.status).toBe(403);
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

async function seedCtx(db: Database, role: "network_admin" | "station_manager" | "board_viewer" | "analyst") {
  const suffix = crypto.randomUUID().slice(0, 8);
  const slug = `c-${suffix}`;

  const [t] = await db.insert(tenant).values({ name: `Connectors ${suffix}`, slug }).returning();
  const [u] = await db
    .insert(user)
    .values({ email: `${suffix}@example.com`, name: "Connector User", emailVerified: true })
    .returning();

  await db.insert(tenantMembership).values({
    tenantId: t!.id,
    userId: u!.id,
    role,
  });

  const [node] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: t!.id,
      type: "station",
      name: "Node",
      slug: `n-${suffix}`,
    })
    .returning();

  let manualSource = await db.query.source.findFirst({
    where: (s, { eq }) => eq(s.key, "manual_satellite"),
  });
  if (!manualSource) {
    const [inserted] = await db
      .insert(source)
      .values({
        key: "manual_satellite",
        name: "Satellite Viewership (Manual)",
        category: "tv_broadcast",
        authMethod: "none",
      })
      .returning();
    manualSource = inserted;
  }

  await db.insert(connectorConfig).values({
    tenantId: t!.id,
    sourceId: manualSource!.id,
    schedule: "0 3 * * *",
  });

  return { slug, tenantId: t!.id, userId: u!.id, nodeId: node!.id };
}
