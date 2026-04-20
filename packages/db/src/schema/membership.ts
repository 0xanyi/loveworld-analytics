import { pgTable, uuid, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { user } from "./user";

export const roleEnum = pgEnum("role", [
  "network_admin",
  "station_manager",
  "board_viewer",
  "analyst",
]);

export const tenantMembership = pgTable(
  "tenant_membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    scopeNodeIds: uuid("scope_node_ids").array().default([]).notNull(),
    invitedBy: uuid("invited_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => ({
    uniqueMembership: uniqueIndex("tenant_membership_user_tenant_idx").on(t.userId, t.tenantId),
  }),
);

export type TenantMembership = typeof tenantMembership.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
