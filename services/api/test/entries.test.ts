import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { type Database, tenant, hierarchyNode, source, connectorConfig, tenantMembership, user } from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import type { Auth } from "@lwa/auth";
import { buildApp } from "../src/app";
import "@lwa/connectors";

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

describe("POST /tenants/:slug/entries", () => {
  it("writes a metric_record for a valid manual_satellite entry", async () => {
    const ctx = await seedManualCtx(db);
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": ctx.userId,
      },
      body: JSON.stringify({
        connectorKey: "manual_satellite",
        entry: {
          hierarchyNodeId: ctx.nodeId,
          period: { start: "2026-01-05", end: "2026-01-12" },
          householdsReached: 1200,
          estimationMethod: "operator_report",
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { written: number };
    expect(body.written).toBe(1);

    const rows = await db.query.metricRecord.findMany({ where: (r, { eq }) => eq(r.tenantId, ctx.tenantId) });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metricCategory).toBe("tv_households");
    expect(rows[0]?.metricType).toBe("households");
  });

  it("returns 422 on schema validation failure", async () => {
    const ctx = await seedManualCtx(db);
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": ctx.userId,
      },
      body: JSON.stringify({
        connectorKey: "manual_satellite",
        entry: {
          hierarchyNodeId: ctx.nodeId,
          period: { start: "2026-01-05", end: "2026-01-12" },
          householdsReached: -1,
          estimationMethod: "panel",
        },
      }),
    });

    expect(res.status).toBe(422);
  });

  it("returns 400 on malformed JSON", async () => {
    const ctx = await seedManualCtx(db);
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": ctx.userId,
      },
      body: "{not-json",
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when authenticated user is not a tenant member", async () => {
    const ctx = await seedManualCtx(db);
    const outsider = await seedUser(db);
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": outsider.userId,
      },
      body: JSON.stringify({
        connectorKey: "manual_satellite",
        entry: {
          hierarchyNodeId: ctx.nodeId,
          period: { start: "2026-01-05", end: "2026-01-12" },
          householdsReached: 1200,
          estimationMethod: "operator_report",
        },
      }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 422 when week period is not Monday-aligned", async () => {
    const ctx = await seedManualCtx(db);
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": ctx.userId,
      },
      body: JSON.stringify({
        connectorKey: "manual_satellite",
        entry: {
          hierarchyNodeId: ctx.nodeId,
          period: { start: "2026-01-06", end: "2026-01-13" },
          householdsReached: 1200,
          estimationMethod: "operator_report",
        },
      }),
    });

    expect(res.status).toBe(422);
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

async function seedManualCtx(db: Database) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const slug = `manual-${suffix}`;

  const [t] = await db.insert(tenant).values({ name: `Manual ${suffix}`, slug }).returning();
  const [node] = await db
    .insert(hierarchyNode)
    .values({ tenantId: t!.id, type: "station", name: "Manual Node", slug: `manual-node-${suffix}` })
    .returning();

  let src = await db.query.source.findFirst({ where: (s, { eq }) => eq(s.key, "manual_satellite") });
  if (!src) {
    const [inserted] = await db
      .insert(source)
      .values({ key: "manual_satellite", name: "Satellite (Manual)", category: "tv_broadcast", authMethod: "none" })
      .returning();
    src = inserted;
  }

  await db.insert(connectorConfig).values({
    tenantId: t!.id,
    sourceId: src!.id,
    schedule: "0 3 * * *",
  });

  const [u] = await db
    .insert(user)
    .values({ email: `${suffix}@example.com`, name: "Manual User", emailVerified: true })
    .returning();

  await db.insert(tenantMembership).values({
    tenantId: t!.id,
    userId: u!.id,
    role: "network_admin",
  });

  return { slug, nodeId: node!.id, userId: u!.id, tenantId: t!.id };
}

async function seedUser(db: Database) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const [u] = await db
    .insert(user)
    .values({ email: `outsider-${suffix}@example.com`, name: "Outsider", emailVerified: true })
    .returning();
  return { userId: u!.id };
}
