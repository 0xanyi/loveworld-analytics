import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { tenantRepo } from "../src/repositories/tenant";
import { hierarchyRepo } from "../src/repositories/hierarchy";
import { seedSources } from "../src/seeds/sources";
import type { Database } from "../src/client";
import * as schema from "../src/schema";

let container: StartedPostgreSqlContainer;
let db: Database;
let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  client = postgres(container.getConnectionUri(), { max: 5 });
  db = drizzle(client, { schema }) as unknown as Database;
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

  it("returns undefined for a missing slug", async () => {
    const repo = tenantRepo(db);
    const fetched = await repo.getBySlug("does-not-exist");
    expect(fetched).toBeUndefined();
  });

  it("enforces slug uniqueness", async () => {
    const repo = tenantRepo(db);
    await repo.create({ name: "First", slug: "unique-slug" });
    await expect(repo.create({ name: "Second", slug: "unique-slug" })).rejects.toThrow();
  });

  it("archives a tenant and excludes it from default reads", async () => {
    const repo = tenantRepo(db);
    const created = await repo.create({ name: "Temp", slug: "temp-archive" });
    await repo.archive(created.id);

    // Default: archived tenant is hidden.
    expect(await repo.getById(created.id)).toBeUndefined();
    expect(await repo.getBySlug("temp-archive")).toBeUndefined();

    // Opt-in: archived tenant is visible and carries a timestamp.
    const including = await repo.getById(created.id, { includeArchived: true });
    expect(including?.archivedAt).not.toBeNull();
  });

  it("throws when archiving a non-existent tenant", async () => {
    const repo = tenantRepo(db);
    await expect(repo.archive("00000000-0000-0000-0000-000000000000")).rejects.toThrow(/no tenant with id=/);
  });
});

describe("hierarchyRepo", () => {
  it("creates a node and lists it for the tenant", async () => {
    const tRepo = tenantRepo(db);
    const hRepo = hierarchyRepo(db);
    const tenantRow = await tRepo.create({ name: "Hierarchy Tenant", slug: "hier-tenant" });

    const station = await hRepo.create({
      tenantId: tenantRow.id,
      type: "station",
      parentId: null,
      name: "HQ",
      slug: "hq",
    });

    expect(station.id).toBeDefined();
    const list = await hRepo.listForTenant(tenantRow.id);
    expect(list.map((n) => n.slug)).toContain("hq");
  });

  it("supports parent → child self-reference", async () => {
    const tRepo = tenantRepo(db);
    const hRepo = hierarchyRepo(db);
    const tenantRow = await tRepo.create({ name: "Parent-Child Tenant", slug: "pc-tenant" });

    const parent = await hRepo.create({
      tenantId: tenantRow.id,
      type: "station",
      parentId: null,
      name: "Parent",
      slug: "parent-node",
    });
    const child = await hRepo.create({
      tenantId: tenantRow.id,
      type: "broadcast_channel",
      parentId: parent.id,
      name: "Child",
      slug: "child-node",
    });

    const fetched = await hRepo.getById(child.id);
    expect(fetched?.parentId).toBe(parent.id);
  });

  it("enforces unique (tenant_id, slug)", async () => {
    const tRepo = tenantRepo(db);
    const hRepo = hierarchyRepo(db);
    const tenantRow = await tRepo.create({ name: "Unique Slug Tenant", slug: "uniq-slug-tenant" });
    await hRepo.create({
      tenantId: tenantRow.id,
      type: "station",
      parentId: null,
      name: "One",
      slug: "dup",
    });
    await expect(
      hRepo.create({
        tenantId: tenantRow.id,
        type: "station",
        parentId: null,
        name: "Two",
        slug: "dup",
      }),
    ).rejects.toThrow();
  });
});

describe("seedSources", () => {
  it("is idempotent across multiple runs", async () => {
    await seedSources(db);
    const first = await db.query.source.findMany();
    await seedSources(db);
    const second = await db.query.source.findMany();

    // 9 after Phase 1 dropped castnet_events (CastNet platform retiring).
    expect(first.length).toBe(9);
    expect(second.length).toBe(9);
    // Same rows — onConflictDoUpdate shouldn't create duplicates.
    expect(new Set(second.map((s) => s.key))).toEqual(new Set(first.map((s) => s.key)));
  });

  it("does not seed castnet_events (platform retiring)", async () => {
    await seedSources(db);
    const all = await db.query.source.findMany();
    expect(all.find((s) => s.key === "castnet_events")).toBeUndefined();
  });
});
