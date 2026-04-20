import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { hierarchyNode, type HierarchyNode } from "../schema/hierarchy-node";

type NewHierarchyNode = typeof hierarchyNode.$inferInsert;

export function hierarchyRepo(db: Database) {
  return {
    async create(input: NewHierarchyNode): Promise<HierarchyNode> {
      const [row] = await db.insert(hierarchyNode).values(input).returning();
      if (!row)
        throw new Error(`hierarchy_node insert returned no rows for tenant=${input.tenantId} slug=${input.slug}`);
      return row;
    },
    async listForTenant(tenantId: string, includeArchived = false): Promise<HierarchyNode[]> {
      const where = includeArchived
        ? eq(hierarchyNode.tenantId, tenantId)
        : and(eq(hierarchyNode.tenantId, tenantId), isNull(hierarchyNode.archivedAt));
      return db.query.hierarchyNode.findMany({ where });
    },
    async getById(id: string): Promise<HierarchyNode | undefined> {
      return db.query.hierarchyNode.findFirst({ where: eq(hierarchyNode.id, id) });
    },
  };
}
