import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { isErr } from "@lwa/contracts";
import { registry } from "@lwa/connectors";
import type { KekProvider } from "@lwa/crypto";
import type { Database } from "@lwa/db";
import {
  connectorConfig,
  connectorConfigRepo,
  ingestionRun,
  platformAccountRepo,
  source,
  hierarchyNode,
} from "@lwa/db";
import { requireCapability } from "../middleware/rbac";

const createSchema = z.object({
  connectorKey: z.string().min(1),
  schedule: z.string().min(1).default("0 3 * * *"),
  credentials: z.unknown(),
});

const accountSchema = z.object({
  externalId: z.string().min(1),
  displayName: z.string().min(1),
  hierarchyNodeId: z.string().uuid(),
  config: z.record(z.unknown()).optional(),
});

export function connectorRoutes(db: Database, kek: KekProvider): Hono {
  const app = new Hono();
  const cfgRepo = connectorConfigRepo(db, kek);
  const paRepo = platformAccountRepo(db);

  app.get("/tenants/:slug/connectors", requireCapability(db, "manage_connectors"), async (c) => {
    const tenantCtx = c.get("tenant") as { tenantId: string };

    const rows = await db
      .select({
        id: connectorConfig.id,
        sourceKey: source.key,
        sourceName: source.name,
        schedule: connectorConfig.schedule,
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

  app.post(
    "/tenants/:slug/connectors",
    requireCapability(db, "manage_connectors"),
    zValidator("json", createSchema),
    async (c) => {
      const tenantCtx = c.get("tenant") as { tenantId: string };
      const { connectorKey, schedule, credentials } = c.req.valid("json");

      const connector = registry.get(connectorKey);
      if (!connector) return c.json({ error: `unknown connector ${connectorKey}` }, 400);

      const valid = await connector.validateCredentials(credentials);
      if (isErr(valid)) {
        return c.json({ error: "invalid credentials", detail: valid.error }, 422);
      }

      const [src] = await db.select().from(source).where(eq(source.key, connectorKey)).limit(1);
      if (!src) return c.json({ error: "source not seeded" }, 500);

      const cfg = await cfgRepo.create({
        tenantId: tenantCtx.tenantId,
        sourceId: src.id,
        schedule,
        credentials,
      });

      return c.json({ id: cfg.id }, 201);
    },
  );

  app.post(
    "/tenants/:slug/connectors/:id/test",
    requireCapability(db, "manage_connectors"),
    async (c) => {
      const tenantCtx = c.get("tenant") as { tenantId: string };
      const id = c.req.param("id");

      const [cfg] = await db
        .select()
        .from(connectorConfig)
        .where(and(eq(connectorConfig.id, id), eq(connectorConfig.tenantId, tenantCtx.tenantId)))
        .limit(1);
      if (!cfg) return c.json({ error: "not found" }, 404);

      const [src] = await db.select().from(source).where(eq(source.id, cfg.sourceId)).limit(1);
      if (!src) return c.json({ error: "source missing" }, 500);

      const connector = registry.get(src.key);
      if (!connector) return c.json({ error: "connector not registered" }, 500);

      const plaintext = await cfgRepo.readCredentials(id);
      const valid = await connector.validateCredentials(plaintext);
      const accounts = connector.kind === "pull" && connector.listAccounts
        ? await connector.listAccounts(plaintext)
        : undefined;

      return c.json({ valid, accounts });
    },
  );

  app.get("/tenants/:slug/connectors/:id/runs", requireCapability(db, "manage_connectors"), async (c) => {
    const tenantCtx = c.get("tenant") as { tenantId: string };
    const id = c.req.param("id");

    const [cfg] = await db
      .select({ id: connectorConfig.id })
      .from(connectorConfig)
      .where(and(eq(connectorConfig.id, id), eq(connectorConfig.tenantId, tenantCtx.tenantId)))
      .limit(1);
    if (!cfg) return c.json({ error: "not found" }, 404);

    const rows = await db
      .select()
      .from(ingestionRun)
      .where(eq(ingestionRun.connectorConfigId, id))
      .orderBy(desc(ingestionRun.startedAt))
      .limit(50);

    return c.json({ runs: rows });
  });

  app.post(
    "/tenants/:slug/connectors/:id/accounts",
    requireCapability(db, "manage_connectors"),
    zValidator("json", accountSchema),
    async (c) => {
      const tenantCtx = c.get("tenant") as { tenantId: string };
      const id = c.req.param("id");
      const payload = c.req.valid("json");

      const [cfg] = await db
        .select()
        .from(connectorConfig)
        .where(and(eq(connectorConfig.id, id), eq(connectorConfig.tenantId, tenantCtx.tenantId)))
        .limit(1);
      if (!cfg) return c.json({ error: "not found" }, 404);

      const [node] = await db
        .select({ id: hierarchyNode.id })
        .from(hierarchyNode)
        .where(and(eq(hierarchyNode.id, payload.hierarchyNodeId), eq(hierarchyNode.tenantId, tenantCtx.tenantId)))
        .limit(1);
      if (!node) return c.json({ error: "hierarchy node not found" }, 404);

      const row = await paRepo.upsert({
        tenantId: tenantCtx.tenantId,
        sourceId: cfg.sourceId,
        externalId: payload.externalId,
        displayName: payload.displayName,
        hierarchyNodeId: payload.hierarchyNodeId,
        config: payload.config,
      });

      return c.json(row, 201);
    },
  );

  return app;
}
