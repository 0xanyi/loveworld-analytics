import { pgTable, uuid, text, jsonb, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";

export const hierarchyNodeTypeEnum = pgEnum("hierarchy_node_type", [
  "station",
  "broadcast_channel",
  "language_channel",
]);

export const hierarchyNode = pgTable(
  "hierarchy_node",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    type: hierarchyNodeTypeEnum("type").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => hierarchyNode.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    slugIdx: uniqueIndex("hierarchy_node_tenant_slug_idx").on(t.tenantId, t.slug),
    tenantIdx: index("hierarchy_node_tenant_idx").on(t.tenantId),
    parentIdx: index("hierarchy_node_parent_idx").on(t.parentId),
  }),
);

export type HierarchyNode = typeof hierarchyNode.$inferSelect;
export type HierarchyNodeType = (typeof hierarchyNodeTypeEnum.enumValues)[number];
