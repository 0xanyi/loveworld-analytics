import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { user } from "./user";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenant.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => user.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (t) => ({
    tenantTimeIdx: index("audit_log_tenant_time_idx").on(t.tenantId, t.occurredAt),
    actionIdx: index("audit_log_action_idx").on(t.action),
  }),
);

export type AuditLog = typeof auditLog.$inferSelect;
