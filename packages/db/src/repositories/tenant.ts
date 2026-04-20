import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { tenant, type NewTenant, type Tenant } from "../schema/tenant";

export function tenantRepo(db: Database) {
  return {
    async create(input: NewTenant): Promise<Tenant> {
      const [row] = await db.insert(tenant).values(input).returning();
      if (!row) throw new Error("tenant insert returned no rows");
      return row;
    },
    async getById(id: string): Promise<Tenant | undefined> {
      return db.query.tenant.findFirst({ where: eq(tenant.id, id) });
    },
    async getBySlug(slug: string): Promise<Tenant | undefined> {
      return db.query.tenant.findFirst({ where: eq(tenant.slug, slug) });
    },
    async archive(id: string): Promise<void> {
      await db.update(tenant).set({ archivedAt: new Date() }).where(eq(tenant.id, id));
    },
  };
}
