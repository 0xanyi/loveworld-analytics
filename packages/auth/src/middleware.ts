import type { MiddlewareHandler } from "hono";
import { and, eq } from "drizzle-orm";
import type { Auth } from "./auth";
import type { Database } from "@lwa/db";
import { schema } from "@lwa/db";
import type { Capability, Role } from "./permissions";
import { can } from "./permissions";

export type TenantContext = {
  userId: string;
  tenantId: string;
  role: Role;
  scopeNodeIds: string[];
};

declare module "hono" {
  interface ContextVariableMap {
    tenant: TenantContext;
  }
}

export function requireSession(auth: Auth): MiddlewareHandler {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "unauthenticated" }, 401);
    c.set("session", session);
    await next();
  };
}

export function requireTenant(db: Database): MiddlewareHandler {
  return async (c, next) => {
    const session = c.get("session") as { user: { id: string } } | undefined;
    if (!session) return c.json({ error: "unauthenticated" }, 401);

    const tenantSlug = c.req.param("tenant") ?? c.req.header("x-tenant-slug");
    if (!tenantSlug) return c.json({ error: "tenant not specified" }, 400);

    const tenantRow = await db.query.tenant.findFirst({
      where: eq(schema.tenant.slug, tenantSlug),
    });
    if (!tenantRow) return c.json({ error: "tenant not found" }, 404);

    const membership = await db.query.tenantMembership.findFirst({
      where: and(
        eq(schema.tenantMembership.userId, session.user.id),
        eq(schema.tenantMembership.tenantId, tenantRow.id),
      ),
    });
    if (!membership) return c.json({ error: "not a member of this tenant" }, 403);

    c.set("tenant", {
      userId: session.user.id,
      tenantId: tenantRow.id,
      role: membership.role,
      scopeNodeIds: membership.scopeNodeIds,
    });
    await next();
  };
}

export function requireCapability(capability: Capability): MiddlewareHandler {
  return async (c, next) => {
    const tenant = c.get("tenant");
    if (!tenant) return c.json({ error: "tenant context missing" }, 500);
    if (!can(tenant.role, capability)) {
      return c.json({ error: "forbidden", missing_capability: capability }, 403);
    }
    await next();
  };
}
