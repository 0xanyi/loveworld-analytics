import { pgTable, uuid, text, jsonb, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { hierarchyNode } from "./hierarchy-node";
import { source } from "./source";

export const platformAccountStatusEnum = pgEnum("platform_account_status", [
  "active",
  "paused",
  "error",
]);

/**
 * One row per (tenant, source, external account) — a YouTube channel, FB page,
 * GA4 property, Cloudflare zone, etc. Attaches a platform-side identity to
 * exactly one hierarchy_node (1:1 attribution for v1). Many-to-many is a v1.1
 * concern and is deliberately not modelled here.
 *
 * `config` carries per-account, non-credential context (region, time zone,
 * connector-specific toggles). Secrets never live here — they belong on the
 * parent `connector_config.credentials_ciphertext`.
 */
export const platformAccount = pgTable(
  "platform_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenant.id, { onDelete: "cascade" }),
    hierarchyNodeId: uuid("hierarchy_node_id")
      .notNull()
      .references(() => hierarchyNode.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => source.id),
    externalId: text("external_id").notNull(),
    displayName: text("display_name").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    status: platformAccountStatusEnum("status").default("active").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // (tenant, source, external_id) uniqueness prevents two platform_account
    // rows from claiming the same upstream identity inside a tenant.
    uniq: uniqueIndex("platform_account_tenant_source_external_idx").on(
      t.tenantId,
      t.sourceId,
      t.externalId,
    ),
    tenantIdx: index("platform_account_tenant_idx").on(t.tenantId),
    nodeIdx: index("platform_account_node_idx").on(t.hierarchyNodeId),
  }),
);

export type PlatformAccount = typeof platformAccount.$inferSelect;
export type NewPlatformAccount = typeof platformAccount.$inferInsert;
export type PlatformAccountStatus = (typeof platformAccountStatusEnum.enumValues)[number];
