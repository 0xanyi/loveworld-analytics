import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Database } from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import { createTenantAndAdmin, normalizeSlug } from "../src/admin/create-tenant";

let container: StartedPostgreSqlContainer;
let db: Database;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const res = await createTestDb(container.getConnectionUri());
  db = res.db;
  cleanup = res.cleanup;
});

afterAll(async () => {
  await cleanup();
  await container.stop();
});

describe("createTenantAndAdmin", () => {
  it("creates a tenant, user, and network_admin membership atomically", async () => {
    const result = await createTenantAndAdmin(db, {
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
      createTenantAndAdmin(db, {
        tenantName: "LW Europe Clone",
        tenantSlug: "lw-europe",
        adminEmail: "other@example.com",
        adminName: "Other",
      }),
    ).rejects.toThrow();
  });

  it("rolls back all inserts when tenant slug conflicts (no orphan rows)", async () => {
    const usersBefore = (await db.query.user.findMany()).length;
    const membershipsBefore = (await db.query.tenantMembership.findMany()).length;

    await expect(
      createTenantAndAdmin(db, {
        tenantName: "Duplicate Attempt",
        tenantSlug: "lw-europe", // already exists from first test
        adminEmail: "orphan@example.com", // new email; should NOT be inserted
        adminName: "Orphan",
      }),
    ).rejects.toThrow();

    const usersAfter = (await db.query.user.findMany()).length;
    const membershipsAfter = (await db.query.tenantMembership.findMany()).length;
    expect(usersAfter).toBe(usersBefore);
    expect(membershipsAfter).toBe(membershipsBefore);
  });

  it("reuses existing user when email already present (idempotent on email)", async () => {
    const r1 = await createTenantAndAdmin(db, {
      tenantName: "First Tenant",
      tenantSlug: "first-tenant",
      adminEmail: "shared@example.com",
      adminName: "Shared User",
    });

    const r2 = await createTenantAndAdmin(db, {
      tenantName: "Second Tenant",
      tenantSlug: "second-tenant",
      adminEmail: "shared@example.com",
      adminName: "Should Be Ignored",
    });

    expect(r2.user.id).toBe(r1.user.id); // same user row reused
    expect(r2.user.name).toBe(r1.user.name); // original name preserved
    expect(r2.tenant.id).not.toBe(r1.tenant.id); // different tenant
    expect(r2.membership.tenantId).toBe(r2.tenant.id);
    expect(r2.membership.userId).toBe(r1.user.id);
  });

  it("normalizes email to lowercase (case-insensitive matching)", async () => {
    const r1 = await createTenantAndAdmin(db, {
      tenantName: "Case Tenant",
      tenantSlug: "case-tenant",
      adminEmail: "Mixed.Case@Example.COM",
      adminName: "Mixed Case",
    });
    expect(r1.user.email).toBe("mixed.case@example.com");

    // Different case for the same email → reuses the existing user
    const r2 = await createTenantAndAdmin(db, {
      tenantName: "Case Tenant 2",
      tenantSlug: "case-tenant-2",
      adminEmail: "MIXED.case@example.com",
      adminName: "Different Name",
    });
    expect(r2.user.id).toBe(r1.user.id);
  });
});

describe("normalizeSlug", () => {
  it("lowercases, replaces non-alphanumeric runs, and trims hyphens", () => {
    expect(normalizeSlug("Loveworld Europe")).toBe("loveworld-europe");
    expect(normalizeSlug("  with SPACES  ")).toBe("with-spaces");
    expect(normalizeSlug("abc!!!123")).toBe("abc-123");
    expect(normalizeSlug("---leading-trailing---")).toBe("leading-trailing");
    expect(normalizeSlug("already-ok")).toBe("already-ok");
  });
});
