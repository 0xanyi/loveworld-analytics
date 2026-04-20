import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { tenantRepo } from "../src/repositories/tenant";
import type { Database } from "../src/client";
import * as schema from "../src/schema";

let container: StartedPostgreSqlContainer;
let db: Database;
let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  client = postgres(container.getConnectionUri(), { max: 5 });
  db = drizzle(client, { schema });
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe("tenantRepo", () => {
  it("creates a tenant and retrieves it by slug", async () => {
    const repo = tenantRepo(db);
    const created = await repo.create({ name: "Loveworld Europe", slug: "lw-europe" });
    expect(created.id).toBeDefined();
    const fetched = await repo.getBySlug("lw-europe");
    expect(fetched?.name).toBe("Loveworld Europe");
  });

  it("archives a tenant", async () => {
    const repo = tenantRepo(db);
    const created = await repo.create({ name: "Temp", slug: "temp" });
    await repo.archive(created.id);
    const fetched = await repo.getById(created.id);
    expect(fetched?.archivedAt).not.toBeNull();
  });
});
