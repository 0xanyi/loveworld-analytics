import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Database } from "@lwa/db";
import { backfillRun, connectorConfig, platformAccount } from "@lwa/db";
import { requireCapability } from "../middleware/rbac";

const schema = z
  .object({
    rangeStart: z.coerce.date(),
    rangeEnd: z.coerce.date(),
    chunkSizeDays: z.number().int().min(1).max(31).default(7),
  })
  .refine((v) => v.rangeStart < v.rangeEnd, {
    message: "rangeStart must be before rangeEnd",
    path: ["rangeEnd"],
  });

export type BackfillQueue = {
  add: (
    name: string,
    data: {
      connectorConfigId: string;
      granularity: "day";
      periodStart: string;
      periodEnd: string;
      backfillRunId: string;
      chunkIndex: number;
    },
  ) => Promise<unknown>;
};

export function backfillRoutes(
  db: Database,
  options: {
    redisUrl?: string;
    queue?: BackfillQueue;
  },
): Hono {
  const app = new Hono();

  const queue: BackfillQueue =
    options.queue ??
    new Queue("connector.backfill", {
      connection: new IORedis(options.redisUrl!, { maxRetriesPerRequest: null }),
    });

  app.post(
    "/tenants/:slug/connectors/:id/backfill",
    requireCapability(db, "trigger_backfill"),
    zValidator("json", schema),
    async (c) => {
      const tenantCtx = c.get("tenant") as {
        tenantId: string;
        userId: string;
        role: "network_admin" | "station_manager" | "board_viewer" | "analyst";
        scopeNodeIds: string[];
      };

      const id = c.req.param("id");
      const { rangeStart, rangeEnd, chunkSizeDays } = c.req.valid("json");

      const [cfg] = await db
        .select()
        .from(connectorConfig)
        .where(and(eq(connectorConfig.id, id), eq(connectorConfig.tenantId, tenantCtx.tenantId)))
        .limit(1);
      if (!cfg) return c.json({ error: "not found" }, 404);

      if (tenantCtx.role === "station_manager" && tenantCtx.scopeNodeIds.length > 0) {
        const accounts = await db
          .select({ hierarchyNodeId: platformAccount.hierarchyNodeId })
          .from(platformAccount)
          .where(
            and(
              eq(platformAccount.tenantId, tenantCtx.tenantId),
              eq(platformAccount.sourceId, cfg.sourceId),
            ),
          );

        const hasOutsideScope = accounts.some(
          (a) => !tenantCtx.scopeNodeIds.includes(a.hierarchyNodeId),
        );
        if (hasOutsideScope) {
          return c.json({ error: "forbidden", missing_capability: "trigger_backfill" }, 403);
        }
      }

      const chunks = chunkByDays(rangeStart, rangeEnd, chunkSizeDays);

      const [run] = await db
        .insert(backfillRun)
        .values({
          connectorConfigId: cfg.id,
          rangeStart,
          rangeEnd,
          chunkSizeDays,
          chunksTotal: chunks.length,
          startedByUserId: tenantCtx.userId,
          status: "running",
        })
        .returning();

      if (!run) return c.json({ error: "backfill run not created" }, 500);

      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (!ch) continue;

        await queue.add("backfill-chunk", {
          connectorConfigId: cfg.id,
          backfillRunId: run.id,
          chunkIndex: i,
          periodStart: ch.start.toISOString(),
          periodEnd: ch.end.toISOString(),
          granularity: "day",
        });
      }

      return c.json({ backfillRunId: run.id, chunks: chunks.length }, 202);
    },
  );

  return app;
}

function chunkByDays(start: Date, end: Date, chunkSizeDays: number): Array<{ start: Date; end: Date }> {
  const chunks: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(start);

  while (cursor < end) {
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + chunkSizeDays);
    const chunkEnd = next > end ? end : next;
    chunks.push({ start: new Date(cursor), end: new Date(chunkEnd) });
    cursor = next;
  }

  return chunks;
}
