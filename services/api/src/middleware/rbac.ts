import type { MiddlewareHandler } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import type { Capability } from "@lwa/auth";
import { can } from "@lwa/auth";
import type { Database } from "@lwa/db";
import { tenant, tenantMembership } from "@lwa/db";

/**
 * Resolves acting membership for :slug and enforces capability.
 * Scope filtering for station_manager is applied in query-level endpoints
 * that accept hierarchyNodeId.
 */
export function requireCapability(db: Database, capability: Capability): MiddlewareHandler {
  return async (c, next) => {
    const session = c.get("session") as { user?: { id: string } } | undefined;
    if (!session?.user) return c.json({ error: "unauthenticated" }, 401);

    const slug = c.req.param("slug");
    if (!slug) return c.json({ error: "tenant slug required" }, 400);

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
    if (!can(row.role, capability)) {
      return c.json({ error: "forbidden", missing_capability: capability }, 403);
    }

    c.set("tenant", {
      userId: session.user.id,
      tenantId: row.tenantId,
      role: row.role,
      scopeNodeIds: row.scopeNodeIds,
    });

    await next();
  };
}
