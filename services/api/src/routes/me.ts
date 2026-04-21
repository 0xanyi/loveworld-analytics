import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@lwa/db";
import { tenant, tenantMembership } from "@lwa/db";

// Return an EXPLICIT subset of session.user rather than passing the raw object
// through. Better Auth's runtime session includes extra fields (createdAt,
// updatedAt, and anything future plugins add) that we don't want to leak
// through /me accidentally. This is the API-contract boundary with the
// frontend — keep it explicit.
export function meRoutes(db?: Database): Hono {
  const app = new Hono();

  app.get("/me", async (c) => {
    const session = c.get("session");
    if (!session?.user) return c.json({ error: "unauthenticated" }, 401);

    const user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
      image: session.user.image ?? null,
      twoFactorEnabled: session.user.twoFactorEnabled ?? false,
    };

    if (!db) {
      return c.json({ user, memberships: [] });
    }

    // Join tenantMembership → tenant, exclude archived tenants.
    const rows = await db
      .select({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        role: tenantMembership.role,
        scopeNodeIds: tenantMembership.scopeNodeIds,
      })
      .from(tenantMembership)
      .innerJoin(tenant, eq(tenantMembership.tenantId, tenant.id))
      .where(
        and(
          eq(tenantMembership.userId, session.user.id),
          isNull(tenant.archivedAt),
        ),
      );

    return c.json({ user, memberships: rows });
  });

  return app;
}
