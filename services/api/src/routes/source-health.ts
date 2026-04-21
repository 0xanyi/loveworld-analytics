import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@lwa/db";
import { connectorConfig, ingestionRun, source, tenant, tenantMembership } from "@lwa/db";

const ALLOWED_ROLES = new Set(["network_admin", "station_manager"]);

function requireSourceHealthAccess(db: Database) {
  return async (c: Parameters<Parameters<Hono["use"]>[1]>[0], next: () => Promise<void>) => {
    const session = c.get("session") as { user?: { id: string } } | undefined;
    if (!session?.user) return c.json({ error: "unauthenticated" }, 401);

    const slug = c.req.param("slug") ?? "";

    const [row] = await db
      .select({
        tenantId: tenant.id,
        role: tenantMembership.role,
        scopeNodeIds: tenantMembership.scopeNodeIds,
      })
      .from(tenant)
      .innerJoin(tenantMembership, eq(tenantMembership.tenantId, tenant.id))
      .where(
        and(
          eq(tenant.slug, slug),
          eq(tenantMembership.userId, session.user.id),
          isNull(tenant.archivedAt),
        ),
      )
      .limit(1);

    if (!row) return c.json({ error: "tenant not found" }, 404);
    if (!ALLOWED_ROLES.has(row.role)) return c.json({ error: "forbidden" }, 403);

    c.set("tenant", {
      userId: session.user.id,
      tenantId: row.tenantId,
      role: row.role,
      scopeNodeIds: row.scopeNodeIds,
    });

    await next();
  };
}

export function sourceHealthRoutes(db: Database): Hono {
  const app = new Hono();

  app.get("/tenants/:slug/source-health", requireSourceHealthAccess(db), async (c) => {
    const tenantCtx = c.get("tenant") as { tenantId: string };

    const rows = await db
      .select({
        id: connectorConfig.id,
        sourceKey: source.key,
        sourceName: source.name,
        enabled: connectorConfig.enabled,
        status: connectorConfig.status,
        lastRunAt: connectorConfig.lastRunAt,
        lastError: connectorConfig.lastError,
      })
      .from(connectorConfig)
      .innerJoin(source, eq(connectorConfig.sourceId, source.id))
      .where(eq(connectorConfig.tenantId, tenantCtx.tenantId));

    return c.json({ connectors: rows });
  });

  app.get("/tenants/:slug/source-health/:id", requireSourceHealthAccess(db), async (c) => {
    const tenantCtx = c.get("tenant") as { tenantId: string };
    const id = c.req.param("id");

    const [cfg] = await db
      .select({
        id: connectorConfig.id,
        sourceKey: source.key,
        sourceName: source.name,
        enabled: connectorConfig.enabled,
        status: connectorConfig.status,
        lastRunAt: connectorConfig.lastRunAt,
        lastError: connectorConfig.lastError,
      })
      .from(connectorConfig)
      .innerJoin(source, eq(connectorConfig.sourceId, source.id))
      .where(and(eq(connectorConfig.id, id), eq(connectorConfig.tenantId, tenantCtx.tenantId)))
      .limit(1);

    if (!cfg) return c.json({ error: "not found" }, 404);

    const runs = await db
      .select()
      .from(ingestionRun)
      .where(eq(ingestionRun.connectorConfigId, id))
      .orderBy(desc(ingestionRun.startedAt))
      .limit(50);

    return c.json({ connector: cfg, runs });
  });

  return app;
}
