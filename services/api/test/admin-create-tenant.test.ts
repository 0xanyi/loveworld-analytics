import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { schema } from "@lwa/db";
import { createTenantAndAdmin } from "../src/admin/create-tenant";

let container: StartedPostgreSqlContainer;
let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  client = postgres(container.getConnectionUri(), { max: 5 });
  db = drizzle(client, { schema });
  await migrate(db as unknown as Parameters<typeof migrate>[0], {
    migrationsFolder: "../../packages/db/drizzle",
  });
});

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe("createTenantAndAdmin", () => {
  it("creates a tenant, user, and network_admin membership atomically", async () => {
    const result = await createTenantAndAdmin(db as never, {
      tenantName: "Loveworld Europe",
      tenantSlug: "lw-europe",
      adminEmail: "admin@example.com",
      adminName: "Admin One",
    });

    expect(result.tenant.slug).toBe("lw-europe");
    expect(result.user.email).toBe("admin@example.com");
    expect(result.membership.role).toBe("network_admin");
    expect(result.membership.tenantId).toBe(result.tenant.id);
    expect(result.membership.userId).toBe(result.user.id);
  });

  it("rejects duplicate tenant slug", async () => {
    await expect(
      createTenantAndAdmin(db as never, {
        tenantName: "LW Europe Clone",
        tenantSlug: "lw-europe",
        adminEmail: "other@example.com",
        adminName: "Other",
      }),
    ).rejects.toThrow();
  });
});
