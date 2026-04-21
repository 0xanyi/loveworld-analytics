import { Hono } from "hono";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Database, MetricCategory } from "@lwa/db";
import { metricRollup } from "@lwa/db";
import { requireCapability } from "../middleware/rbac";
import { isNodeInScope } from "../lib/hierarchy-scope";

const querySchema = z.object({
  hierarchyNodeId: z.string().uuid(),
  period: z.enum(["week", "month", "quarter", "ytd"]).default("week"),
  granularity: z.enum(["day", "week", "month", "quarter"]).default("day"),
  comparison: z.enum(["yoy", "qoq", "mom", "none"]).default("yoy"),
});

const TILE_CATEGORIES: MetricCategory[] = ["tv_households", "web_visitors"];

export function metricsRoutes(db: Database): Hono {
  const app = new Hono();

  app.get(
    "/tenants/:slug/metrics/board",
    requireCapability(db, "view_dashboard"),
    zValidator("query", querySchema),
    async (c) => {
      const tenantCtx = c.get("tenant");
      const q = c.req.valid("query");

      if (tenantCtx.role === "station_manager") {
        const allowed = await isNodeInScope(
          db,
          tenantCtx.tenantId,
          tenantCtx.scopeNodeIds,
          q.hierarchyNodeId,
        );
        if (!allowed) {
          return c.json({ error: "forbidden", missing_capability: "view_dashboard" }, 403);
        }
      }

      const [cur, prev] = computeComparisonWindows(q.period, q.comparison);

      const currentRows = await db
        .select()
        .from(metricRollup)
        .where(
          and(
            eq(metricRollup.tenantId, tenantCtx.tenantId),
            eq(metricRollup.hierarchyNodeId, q.hierarchyNodeId),
            inArray(metricRollup.metricCategory, TILE_CATEGORIES),
            eq(metricRollup.granularity, q.granularity),
            gte(metricRollup.bucketStart, cur.start),
            lt(metricRollup.bucketStart, cur.end),
          ),
        );

      const priorRows = await db
        .select()
        .from(metricRollup)
        .where(
          and(
            eq(metricRollup.tenantId, tenantCtx.tenantId),
            eq(metricRollup.hierarchyNodeId, q.hierarchyNodeId),
            inArray(metricRollup.metricCategory, TILE_CATEGORIES),
            eq(metricRollup.granularity, q.granularity),
            gte(metricRollup.bucketStart, prev.start),
            lt(metricRollup.bucketStart, prev.end),
          ),
        );

      const tiles = TILE_CATEGORIES.map((category) => {
        const curByCat = currentRows.filter((r) => r.metricCategory === category);
        const prevByCat = priorRows.filter((r) => r.metricCategory === category);

        const current = curByCat.reduce((a, r) => a + Number(r.effectiveTotal), 0);
        const prior = prevByCat.reduce((a, r) => a + Number(r.effectiveTotal), 0);

        return {
          category,
          current,
          prior,
          deltaPct: prior === 0 ? null : ((current - prior) / prior) * 100,
          sparkline: curByCat
            .sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime())
            .map((r) => ({ t: r.bucketStart, v: Number(r.effectiveTotal) })),
          sourceBreakdown: mergeBreakdowns(curByCat.map((r) => r.sourceBreakdown)),
          hasAdjustments: curByCat.some((r) => r.hasAdjustments),
        };
      });

      return c.json({ tiles, window: cur, comparisonWindow: prev });
    },
  );

  return app;
}

function computeComparisonWindows(
  period: "week" | "month" | "quarter" | "ytd",
  comparison: "yoy" | "qoq" | "mom" | "none",
): [{ start: Date; end: Date }, { start: Date; end: Date }] {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);

  switch (period) {
    case "week":
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    case "month":
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    case "quarter":
      start.setUTCMonth(start.getUTCMonth() - 3);
      break;
    case "ytd":
      start.setUTCMonth(0);
      start.setUTCDate(1);
      break;
  }

  const prev = { start: new Date(start), end: new Date(end) };
  switch (comparison) {
    case "yoy":
      prev.start.setUTCFullYear(prev.start.getUTCFullYear() - 1);
      prev.end.setUTCFullYear(prev.end.getUTCFullYear() - 1);
      break;
    case "qoq":
      prev.start.setUTCMonth(prev.start.getUTCMonth() - 3);
      prev.end.setUTCMonth(prev.end.getUTCMonth() - 3);
      break;
    case "mom":
      prev.start.setUTCMonth(prev.start.getUTCMonth() - 1);
      prev.end.setUTCMonth(prev.end.getUTCMonth() - 1);
      break;
    case "none":
      break;
  }

  return [{ start, end }, prev];
}

function mergeBreakdowns(bs: Array<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bs) {
    for (const [k, v] of Object.entries(b)) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}
