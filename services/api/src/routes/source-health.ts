import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@lwa/db";
import { connectorConfig, ingestionRun, source } from "@lwa/db";
import { requireCapability } from "../middleware/rbac";

const RECENT_RUNS_LIMIT = 50;

export function sourceHealthRoutes(db: Database): Hono {
  const app = new Hono();

  app.get(
    "/tenants/:slug/source-health",
    requireCapability(db, "view_source_health"),
    async (c) => {
      const tenantCtx = c.get("tenant");

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
    },
  );

  app.get(
    "/tenants/:slug/source-health/:id",
    requireCapability(db, "view_source_health"),
    async (c) => {
      const tenantCtx = c.get("tenant");
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
        .limit(RECENT_RUNS_LIMIT);

      return c.json({ connector: cfg, runs });
    },
  );

  return app;
}
