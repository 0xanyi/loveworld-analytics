import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { registry } from "@lwa/connectors";
import type { Database } from "@lwa/db";
import {
  connectorConfig,
  hierarchyNode,
  metricRecordRepo,
  source,
  tenant,
  type Granularity,
  type MetricCategory,
} from "@lwa/db";

const bodySchema = z.object({
  connectorKey: z.string().min(1),
  entry: z.unknown(),
});

export function entriesRoutes(db: Database): Hono {
  const app = new Hono();
  const metricRecords = metricRecordRepo(db);

  app.post("/tenants/:slug/entries", async (c) => {
    const session = c.get("session");
    if (!session?.user) return c.json({ error: "unauthenticated" }, 401);

    const parsedBody = bodySchema.safeParse(await c.req.json());
    if (!parsedBody.success) {
      return c.json({ error: "validation", issues: parsedBody.error.flatten() }, 422);
    }

    const slug = c.req.param("slug");
    const [tenantRow] = await db.select().from(tenant).where(eq(tenant.slug, slug));
    if (!tenantRow) return c.json({ error: "tenant not found" }, 404);

    const connector = registry.get(parsedBody.data.connectorKey);
    if (!connector) return c.json({ error: `unknown connector ${parsedBody.data.connectorKey}` }, 400);
    if (connector.kind !== "manual") return c.json({ error: "connector is not manual" }, 400);

    const parsedEntry = connector.entrySchema.safeParse(parsedBody.data.entry);
    if (!parsedEntry.success) {
      return c.json({ error: "validation", issues: parsedEntry.error.flatten() }, 422);
    }

    const [sourceRow] = await db.select().from(source).where(eq(source.key, connector.key));
    if (!sourceRow) return c.json({ error: "source not seeded" }, 500);

    const [configRow] = await db
      .select()
      .from(connectorConfig)
      .where(and(eq(connectorConfig.tenantId, tenantRow.id), eq(connectorConfig.sourceId, sourceRow.id)));
    if (!configRow) return c.json({ error: "connector not configured for this tenant" }, 400);

    const entry = parsedEntry.data as {
      hierarchyNodeId: string;
      householdsReached: number;
      estimationMethod: string;
      period: { start: Date; end: Date };
      barbWeekNumber?: number;
    };

    const [nodeRow] = await db
      .select({ id: hierarchyNode.id })
      .from(hierarchyNode)
      .where(and(eq(hierarchyNode.id, entry.hierarchyNodeId), eq(hierarchyNode.tenantId, tenantRow.id)));
    if (!nodeRow) return c.json({ error: "hierarchy node not found" }, 400);

    const granularity = inferManualGranularity(entry.period.start, entry.period.end);
    if (!granularity) {
      return c.json({ error: "period must be exactly one week or one calendar month" }, 422);
    }

    const dimensions: Record<string, string> = { estimation_method: entry.estimationMethod };
    if (entry.barbWeekNumber !== undefined) {
      dimensions.barb_week_number = String(entry.barbWeekNumber);
    }

    const { written } = await metricRecords.upsertMany([
      {
        tenantId: tenantRow.id,
        sourceId: sourceRow.id,
        connectorConfigId: configRow.id,
        hierarchyNodeId: entry.hierarchyNodeId,
        metricType: "households",
        metricCategory: connector.category as MetricCategory,
        dimensions,
        periodStart: entry.period.start,
        periodEnd: entry.period.end,
        granularity,
        rawValue: String(entry.householdsReached),
        unit: "households",
        provenance: `manual:user:${session.user.id}`,
      },
    ]);

    return c.json({ written });
  });

  return app;
}

function inferManualGranularity(start: Date, end: Date): Granularity | null {
  if (!isUtcMidnight(start) || !isUtcMidnight(end)) return null;

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() === sevenDaysMs) {
    return "week";
  }

  if (start.getUTCDate() !== 1 || end.getUTCDate() !== 1) return null;
  if (start.getUTCHours() !== 0 || end.getUTCHours() !== 0) return null;

  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  if (nextMonth.getTime() === end.getTime()) {
    return "month";
  }

  return null;
}

function isUtcMidnight(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}
