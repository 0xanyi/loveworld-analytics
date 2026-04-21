import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Auth } from "@lwa/auth";
import {
  type Database,
  metricRollup,
  tenant,
  tenantMembership,
  user,
  hierarchyNode,
} from "@lwa/db";
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

describe("metrics routes", () => {
  it("returns board tiles for tv_households + web_visitors", async () => {
    const ctx = await seedCtx(db, "network_admin");
    const app = buildApp({ db, auth: testAuth() });

    const now = new Date();
    const bucketStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

    await db.insert(metricRollup).values([
      {
        tenantId: ctx.tenantId,
        hierarchyNodeId: ctx.nodeId,
        metricCategory: "tv_households",
        granularity: "day",
        bucketStart,
        effectiveTotal: "1200",
        rawTotal: "1200",
        recordCount: 1,
        sourceBreakdown: { manual_satellite: 1200 },
        hasAdjustments: false,
      },
      {
        tenantId: ctx.tenantId,
        hierarchyNodeId: ctx.nodeId,
        metricCategory: "web_visitors",
        granularity: "day",
        bucketStart,
        effectiveTotal: "3400",
        rawTotal: "3400",
        recordCount: 1,
        sourceBreakdown: { ga4: 3400 },
        hasAdjustments: true,
      },
    ]);

    const res = await app.request(
      `/tenants/${ctx.slug}/metrics/board?hierarchyNodeId=${ctx.nodeId}&period=week&granularity=day&comparison=none`,
      {
        headers: { "x-test-user-id": ctx.userId },
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tiles: Array<{ category: string; current: number; sourceBreakdown: Record<string, number> }>;
    };

    expect(body.tiles).toHaveLength(2);
    expect(body.tiles.find((t) => t.category === "tv_households")?.current).toBe(1200);
    expect(body.tiles.find((t) => t.category === "web_visitors")?.current).toBe(3400);
  });

  it("station_manager with scoped nodes cannot query outside scope", async () => {
    const ctx = await seedCtx(db, "station_manager");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(
      `/tenants/${ctx.slug}/metrics/board?hierarchyNodeId=${ctx.otherNodeId}&period=week&granularity=day&comparison=none`,
      {
        headers: { "x-test-user-id": ctx.userId },
      },
    );

    expect(res.status).toBe(403);
  });

  it("station_manager can query descendant node within scope subtree", async () => {
    const ctx = await seedCtx(db, "station_manager");
    const app = buildApp({ db, auth: testAuth() });

    const [childNode] = await db
      .insert(hierarchyNode)
      .values({
        tenantId: ctx.tenantId,
        type: "broadcast_channel",
        parentId: ctx.nodeId,
        name: "Child",
        slug: `child-${crypto.randomUUID().slice(0, 8)}`,
      })
      .returning();

    const now = new Date();
    const bucketStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

    await db.insert(metricRollup).values({
      tenantId: ctx.tenantId,
      hierarchyNodeId: childNode!.id,
      metricCategory: "tv_households",
      granularity: "day",
      bucketStart,
      effectiveTotal: "10",
      rawTotal: "10",
      recordCount: 1,
      sourceBreakdown: { manual_satellite: 10 },
      hasAdjustments: false,
    });

    const res = await app.request(
      `/tenants/${ctx.slug}/metrics/board?hierarchyNodeId=${childNode!.id}&period=week&granularity=day&comparison=none`,
      {
        headers: { "x-test-user-id": ctx.userId },
      },
    );

    expect(res.status).toBe(200);
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
  const slug = `m-${suffix}`;

  const [t] = await db.insert(tenant).values({ name: `Metrics ${suffix}`, slug }).returning();
  const [u] = await db
    .insert(user)
    .values({ email: `${suffix}@example.com`, name: "Metrics User", emailVerified: true })
    .returning();

  const [node] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: t!.id,
      type: "station",
      name: "Node",
      slug: `node-${suffix}`,
    })
    .returning();

  const [otherNode] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: t!.id,
      type: "station",
      name: "Other Node",
      slug: `other-${suffix}`,
    })
    .returning();

  await db.insert(tenantMembership).values({
    tenantId: t!.id,
    userId: u!.id,
    role,
    scopeNodeIds: role === "station_manager" ? [node!.id] : [],
  });

  return { slug, tenantId: t!.id, userId: u!.id, nodeId: node!.id, otherNodeId: otherNode!.id };
}
