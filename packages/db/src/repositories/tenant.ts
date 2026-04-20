import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { tenant, type NewTenant, type Tenant } from "../schema/tenant";

export function tenantRepo(db: Database) {
  return {
    async create(input: NewTenant): Promise<Tenant> {
      const [row] = await db.insert(tenant).values(input).returning();
      if (!row) throw new Error(`tenant insert returned no rows for slug=${input.slug}`);
      return row;
    },
    async getById(id: string, { includeArchived = false } = {}): Promise<Tenant | undefined> {
      const where = includeArchived
        ? eq(tenant.id, id)
        : and(eq(tenant.id, id), isNull(tenant.archivedAt));
      return db.query.tenant.findFirst({ where });
    },
    async getBySlug(slug: string, { includeArchived = false } = {}): Promise<Tenant | undefined> {
      const where = includeArchived
        ? eq(tenant.slug, slug)
        : and(eq(tenant.slug, slug), isNull(tenant.archivedAt));
      return db.query.tenant.findFirst({ where });
    },
    async archive(id: string): Promise<void> {
      const [row] = await db
        .update(tenant)
        .set({ archivedAt: new Date() })
        .where(eq(tenant.id, id))
        .returning({ id: tenant.id });
      if (!row) throw new Error(`tenant archive: no tenant with id=${id}`);
    },
  };
}
