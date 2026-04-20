import type { MiddlewareHandler } from "hono";
import { and, eq, isNull } from "drizzle-orm";
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

/**
 * Minimal session shape stored on the Hono context. We intentionally do NOT
 * widen to Better Auth's full session type because it transitively references
 * zod@4 internals via Better Auth's plugin inference, which is not portably
 * nameable in a .d.ts (TS2742). Downstream middleware only reads `user.id`.
 */
export type SessionContext = {
  user: { id: string; email?: string };
};

declare module "hono" {
  interface ContextVariableMap {
    session?: SessionContext;
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
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthenticated" }, 401);

    const tenantSlug = c.req.param("tenant") ?? c.req.header("x-tenant-slug");
    if (!tenantSlug) return c.json({ error: "tenant not specified" }, 400);

    // Single join: resolves tenant + membership in one round-trip.
    // Filters archived tenants so they behave like non-existent to outside callers.
    const rows = await db
      .select({
        tenantId: schema.tenant.id,
        role: schema.tenantMembership.role,
        scopeNodeIds: schema.tenantMembership.scopeNodeIds,
      })
      .from(schema.tenant)
      .innerJoin(
        schema.tenantMembership,
        eq(schema.tenantMembership.tenantId, schema.tenant.id),
      )
      .where(
        and(
          eq(schema.tenant.slug, tenantSlug),
          eq(schema.tenantMembership.userId, session.user.id),
          isNull(schema.tenant.archivedAt),
        ),
      )
      .limit(1);

    const row = rows[0];
    // Unified 404: does NOT distinguish "tenant doesn't exist" from
    // "user is not a member". Prevents tenant enumeration by authenticated
    // non-members (e.g., probing slugs to discover other tenants' existence).
    if (!row) return c.json({ error: "tenant not found" }, 404);

    c.set("tenant", {
      userId: session.user.id,
      tenantId: row.tenantId,
      role: row.role,
      scopeNodeIds: row.scopeNodeIds,
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
