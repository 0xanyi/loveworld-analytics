import { pgTable, uuid, text, integer, pgEnum } from "drizzle-orm/pg-core";

export const sourceCategoryEnum = pgEnum("source_category", [
  "tv_broadcast",
  "web",
  "streaming",
  "social",
  "app",
]);

export const authMethodEnum = pgEnum("auth_method", [
  "oauth2",
  "api_key",
  "service_account",
  "none",
]);

export const source = pgTable("source", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: sourceCategoryEnum("category").notNull(),
  authMethod: authMethodEnum("auth_method").notNull(),
  schemaVersion: integer("schema_version").default(1).notNull(),
});

export type Source = typeof source.$inferSelect;
