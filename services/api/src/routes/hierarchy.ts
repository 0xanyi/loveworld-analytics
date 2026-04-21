import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Database } from "@lwa/db";
import { hierarchyNode } from "@lwa/db";
import { requireCapability } from "../middleware/rbac";

const nodeInput = z.object({
  type: z.enum(["station", "broadcast_channel", "language_channel"]),
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  metadata: z.record(z.unknown()).optional(),
});

export function hierarchyRoutes(db: Database): Hono {
  const app = new Hono();

  app.get("/tenants/:slug/hierarchy", requireCapability(db, "view_dashboard"), async (c) => {
    const tenantCtx = c.get("tenant") as { tenantId: string };
    const rows = await db
      .select()
      .from(hierarchyNode)
      .where(and(eq(hierarchyNode.tenantId, tenantCtx.tenantId), isNull(hierarchyNode.archivedAt)));
    return c.json({ nodes: rows });
  });

  app.post(
    "/tenants/:slug/hierarchy",
    requireCapability(db, "edit_hierarchy"),
    zValidator("json", nodeInput),
    async (c) => {
      const tenantCtx = c.get("tenant") as { tenantId: string };
      const body = c.req.valid("json");

      if (body.parentId) {
        const [parent] = await db
          .select({ id: hierarchyNode.id })
          .from(hierarchyNode)
          .where(
            and(
              eq(hierarchyNode.id, body.parentId),
              eq(hierarchyNode.tenantId, tenantCtx.tenantId),
              isNull(hierarchyNode.archivedAt),
            ),
          )
          .limit(1);
        if (!parent) return c.json({ error: "parent not found" }, 404);
      }

      const [row] = await db
        .insert(hierarchyNode)
        .values({
          tenantId: tenantCtx.tenantId,
          type: body.type,
          parentId: body.parentId ?? null,
          name: body.name,
          slug: body.slug,
          metadata: body.metadata ?? {},
        })
        .returning();

      return c.json(row, 201);
    },
  );

  app.patch(
    "/tenants/:slug/hierarchy/:id",
    requireCapability(db, "edit_hierarchy"),
    zValidator("json", nodeInput.partial()),
    async (c) => {
      const tenantCtx = c.get("tenant") as { tenantId: string };
      const id = c.req.param("id");
      const body = c.req.valid("json");

      if (body.parentId) {
        const [parent] = await db
          .select({ id: hierarchyNode.id })
          .from(hierarchyNode)
          .where(
            and(
              eq(hierarchyNode.id, body.parentId),
              eq(hierarchyNode.tenantId, tenantCtx.tenantId),
              isNull(hierarchyNode.archivedAt),
            ),
          )
          .limit(1);
        if (!parent) return c.json({ error: "parent not found" }, 404);
      }

      const [row] = await db
        .update(hierarchyNode)
        .set(body)
        .where(and(eq(hierarchyNode.id, id), eq(hierarchyNode.tenantId, tenantCtx.tenantId)))
        .returning();

      if (!row) return c.json({ error: "not found" }, 404);
      return c.json(row);
    },
  );

  app.delete("/tenants/:slug/hierarchy/:id", requireCapability(db, "edit_hierarchy"), async (c) => {
    const tenantCtx = c.get("tenant") as { tenantId: string };
    const id = c.req.param("id");

    const [row] = await db
      .update(hierarchyNode)
      .set({ archivedAt: new Date() })
      .where(and(eq(hierarchyNode.id, id), eq(hierarchyNode.tenantId, tenantCtx.tenantId)))
      .returning({ id: hierarchyNode.id });

    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ archived: true });
  });

  return app;
}
