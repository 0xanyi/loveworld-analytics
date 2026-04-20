import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://lwa:lwa_dev@localhost:5432/lwa_dev",
  },
  strict: true,
  verbose: true,
});
