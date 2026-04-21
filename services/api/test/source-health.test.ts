import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Auth } from "@lwa/auth";
import {
  type Database,
  connectorConfig,
  ingestionRun,
  source,
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

describe("source-health routes", () => {
  it("network_admin can list source health", async () => {
    const ctx = await seedCtx(db, "network_admin");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health`, {
      headers: { "x-test-user-id": ctx.userId },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connectors: Array<{ id: string }> };
    expect(Array.isArray(body.connectors)).toBe(true);
    expect(body.connectors.some((c) => c.id === ctx.connectorId)).toBe(true);
  });

  it("network_admin can get source health detail", async () => {
    const ctx = await seedCtx(db, "network_admin");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health/${ctx.connectorId}`, {
      headers: { "x-test-user-id": ctx.userId },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connector: { id: string }; runs: unknown[] };
    expect(body.connector.id).toBe(ctx.connectorId);
    expect(Array.isArray(body.runs)).toBe(true);
    expect(body.runs).toHaveLength(1);
  });

  it("station_manager can list source health", async () => {
    const ctx = await seedCtx(db, "station_manager");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health`, {
      headers: { "x-test-user-id": ctx.userId },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connectors: unknown[] };
    expect(Array.isArray(body.connectors)).toBe(true);
  });

  it("station_manager can get source health detail", async () => {
    const ctx = await seedCtx(db, "station_manager");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health/${ctx.connectorId}`, {
      headers: { "x-test-user-id": ctx.userId },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connector: { id: string }; runs: unknown[] };
    expect(body.connector.id).toBe(ctx.connectorId);
  });

  it("board_viewer is forbidden from source-health list", async () => {
    const ctx = await seedCtx(db, "board_viewer");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health`, {
      headers: { "x-test-user-id": ctx.userId },
    });

    expect(res.status).toBe(403);
  });

  it("board_viewer is forbidden from source-health detail", async () => {
    const ctx = await seedCtx(db, "board_viewer");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health/${ctx.connectorId}`, {
      headers: { "x-test-user-id": ctx.userId },
    });

    expect(res.status).toBe(403);
  });

  it("unauthenticated request returns 401", async () => {
    const ctx = await seedCtx(db, "network_admin");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health`);
    expect(res.status).toBe(401);
  });

  it("non-member gets 404", async () => {
    const ctx = await seedCtx(db, "network_admin");
    // Create a second user who is not a member of this tenant
    const suffix = crypto.randomUUID().slice(0, 8);
    const [outsider] = await db
      .insert(user)
      .values({ email: `outsider-${suffix}@example.com`, name: "Outsider", emailVerified: true })
      .returning();

    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health`, {
      headers: { "x-test-user-id": outsider!.id },
    });

    expect(res.status).toBe(404);
  });

  it("list response includes expected summary fields", async () => {
    const ctx = await seedCtx(db, "network_admin");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health`, {
      headers: { "x-test-user-id": ctx.userId },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connectors: Array<{
        id: string;
        sourceKey: string;
        sourceName: string;
        enabled: boolean;
        status: string;
        lastRunAt: string | null;
        lastError: string | null;
      }>;
    };
    const row = body.connectors.find((c) => c.id === ctx.connectorId);
    expect(row).toBeDefined();
    expect(typeof row!.sourceKey).toBe("string");
    expect(typeof row!.sourceName).toBe("string");
    expect(typeof row!.enabled).toBe("boolean");
    expect(typeof row!.status).toBe("string");
  });

  it("detail response includes connector summary and recent runs", async () => {
    const ctx = await seedCtx(db, "network_admin");
    const app = buildApp({ db, auth: testAuth() });

    const res = await app.request(`/tenants/${ctx.slug}/source-health/${ctx.connectorId}`, {
      headers: { "x-test-user-id": ctx.userId },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connector: {
        id: string;
        sourceKey: string;
        sourceName: string;
        enabled: boolean;
        status: string;
        lastRunAt: string | null;
        lastError: string | null;
      };
      runs: Array<{ id: string; status: string }>;
    };

    expect(body.connector.id).toBe(ctx.connectorId);
    expect(typeof body.connector.sourceKey).toBe("string");
    expect(typeof body.connector.sourceName).toBe("string");
    expect(typeof body.connector.enabled).toBe("boolean");
    expect(Array.isArray(body.runs)).toBe(true);
    // runs should be ordered most recent first
    if (body.runs.length > 1) {
      const dates = body.runs.map((r) => new Date((r as unknown as { startedAt: string }).startedAt).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1]!).toBeGreaterThanOrEqual(dates[i]!);
      }
    }
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
) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const slug = `sh-${suffix}`;

  const [t] = await db.insert(tenant).values({ name: `SourceHealth ${suffix}`, slug }).returning();
  const [u] = await db
    .insert(user)
    .values({ email: `${suffix}@example.com`, name: "SH User", emailVerified: true })
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

  const [cfg] = await db
    .insert(connectorConfig)
    .values({
      tenantId: t!.id,
      sourceId: manualSource!.id,
      schedule: "0 3 * * *",
    })
    .returning();

  // Seed one ingestion run
  const now = new Date();
  const periodStart = new Date(now.getTime() - 86400000);
  await db.insert(ingestionRun).values({
    connectorConfigId: cfg!.id,
    periodStart,
    periodEnd: now,
    status: "success",
    recordsWritten: 42,
  });

  return {
    slug,
    tenantId: t!.id,
    userId: u!.id,
    nodeId: node!.id,
    connectorId: cfg!.id,
  };
}
