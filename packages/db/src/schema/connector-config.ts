import { pgTable, uuid, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { tenant } from "./tenant";
import { source } from "./source";

export const connectorConfigStatusEnum = pgEnum("connector_config_status", [
  "active",
  "error",
  "paused",
]);

export const connectorConfig = pgTable("connector_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenant.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => source.id),
  credentialsCiphertext: text("credentials_ciphertext"),
  credentialsKekVersion: text("credentials_kek_version"),
  schedule: text("schedule").notNull().default("0 3 * * *"),
  enabled: boolean("enabled").default(true).notNull(),
  status: connectorConfigStatusEnum("status").default("active").notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ConnectorConfig = typeof connectorConfig.$inferSelect;
