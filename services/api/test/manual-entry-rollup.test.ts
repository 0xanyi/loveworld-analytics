import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Auth } from "@lwa/auth";
import {
  connectorConfig,
  hierarchyNode,
  source,
  tenant,
  tenantMembership,
  type Database,
  user,
} from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import "@lwa/connectors";
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

describe("manual entries refresh dashboard rollups", () => {
  it("returns a non-zero tv_households board tile after manual entry", async () => {
    const ctx = await seedManualCtx(db);
    const app = buildApp({ db, auth: testAuth(ctx.userId) });
    const periodStart = boardVisibleUtcWeekMonday();
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 7);

    const entryRes = await app.request(`/tenants/${ctx.slug}/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": ctx.userId,
      },
      body: JSON.stringify({
        connectorKey: "manual_satellite",
        entry: {
          hierarchyNodeId: ctx.childNodeId,
          period: {
            start: periodStart.toISOString().slice(0, 10),
            end: periodEnd.toISOString().slice(0, 10),
          },
          householdsReached: 1200,
          estimationMethod: "operator_report",
        },
      }),
    });

    expect(entryRes.status).toBe(200);

    const boardRes = await app.request(
      `/tenants/${ctx.slug}/metrics/board?hierarchyNodeId=${ctx.stationNodeId}&period=week&granularity=week&comparison=none`,
      { headers: { "x-test-user-id": ctx.userId } },
    );

    expect(boardRes.status).toBe(200);
    const board = (await boardRes.json()) as {
      tiles: Array<{ category: string; current: number; sourceBreakdown: Record<string, number> }>;
    };
    const tvHouseholds = board.tiles.find((tile) => tile.category === "tv_households");
    expect(tvHouseholds?.current).toBe(1200);
    expect(tvHouseholds?.sourceBreakdown.manual_satellite).toBe(1200);
  });
});

function testAuth(userId: string): Auth {
  return {
    handler: () => Promise.resolve(new Response("not found", { status: 404 })),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user-id");
        if (!id || id !== userId) return null;
        return {
          user: {
            id,
            email: "manual-rollup@example.com",
            emailVerified: true,
            name: "Manual Rollup User",
            image: null,
            twoFactorEnabled: false,
          },
        };
      },
    },
  } as unknown as Auth;
}

async function seedManualCtx(db: Database) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const slug = `manual-rollup-${suffix}`;

  const [tenantRow] = await db.insert(tenant).values({ name: `Manual Rollup ${suffix}`, slug }).returning();

  const [stationNode] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: tenantRow!.id,
      type: "station",
      name: "Manual Rollup Station",
      slug: `manual-rollup-station-${suffix}`,
    })
    .returning();

  const [childNode] = await db
    .insert(hierarchyNode)
    .values({
      tenantId: tenantRow!.id,
      parentId: stationNode!.id,
      type: "broadcast_channel",
      name: "Manual Rollup Broadcast",
      slug: `manual-rollup-broadcast-${suffix}`,
    })
    .returning();

  let sourceRow = await db.query.source.findFirst({
    where: (s, { eq }) => eq(s.key, "manual_satellite"),
  });
  if (!sourceRow) {
    const [inserted] = await db
      .insert(source)
      .values({
        key: "manual_satellite",
        name: "Satellite (Manual)",
        category: "tv_broadcast",
        authMethod: "none",
      })
      .returning();
    sourceRow = inserted;
  }

  await db.insert(connectorConfig).values({
    tenantId: tenantRow!.id,
    sourceId: sourceRow!.id,
    schedule: "0 3 * * *",
  });

  const [userRow] = await db
    .insert(user)
    .values({
      email: `manual-rollup-${suffix}@example.com`,
      name: "Manual Rollup User",
      emailVerified: true,
    })
    .returning();

  await db.insert(tenantMembership).values({
    tenantId: tenantRow!.id,
    userId: userRow!.id,
    role: "network_admin",
  });

  return {
    slug,
    stationNodeId: stationNode!.id,
    childNodeId: childNode!.id,
    userId: userRow!.id,
  };
}

function boardVisibleUtcWeekMonday(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 7 : dow));
  return d;
}
