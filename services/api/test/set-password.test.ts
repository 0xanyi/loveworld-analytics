import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createAuth } from "@lwa/auth";
import { account, type Database } from "@lwa/db";
import { createTestDb } from "@lwa/db/test-utils";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createTenantAndAdmin } from "../src/admin/create-tenant";
import { setAdminPassword } from "../src/admin/set-password";
import { buildApp } from "../src/app";

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

describe("setAdminPassword", () => {
  it("creates a Better Auth credential for an existing user and permits sign-in", async () => {
    const email = `password-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const created = await createTenantAndAdmin(db, {
      tenantName: "Password Tenant",
      tenantSlug: `password-${crypto.randomUUID().slice(0, 8)}`,
      adminEmail: email,
      adminName: "Password Admin",
    });

    const before = await db.query.account.findMany({
      where: (a, { eq }) => eq(a.userId, created.user.id),
    });
    expect(before).toHaveLength(0);

    const result = await setAdminPassword(db, { email, password: "CorrectHorseBatteryStaple1" });
    expect(result.userId).toBe(created.user.id);
    expect(result.email).toBe(email);

    const after = await db.query.account.findMany({
      where: (a, { eq }) => eq(a.userId, created.user.id),
    });
    expect(after).toHaveLength(1);
    expect(after[0]?.providerId).toBe("credential");
    expect(after[0]?.accountId).toBe(created.user.id);
    expect(after[0]?.password).not.toBe("CorrectHorseBatteryStaple1");

    const auth = createAuth({
      db,
      secret: "test_secret_at_least_32_characters_long",
      baseUrl: "http://localhost:3001",
      trustedOrigins: ["http://localhost:5173"],
      sendMagicLink: async () => {},
    });
    const app = buildApp({ db, auth, allowedOrigins: ["http://localhost:5173"] });

    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "CorrectHorseBatteryStaple1" }),
    });

    expect(signIn.status).toBe(200);
  });

  it("updates an existing credential password", async () => {
    const email = `rotate-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const created = await createTenantAndAdmin(db, {
      tenantName: "Rotate Tenant",
      tenantSlug: `rotate-${crypto.randomUUID().slice(0, 8)}`,
      adminEmail: email,
      adminName: "Rotate Admin",
    });

    await setAdminPassword(db, { email, password: "FirstPassword123" });
    const [first] = await db.select().from(account).where(eq(account.userId, created.user.id));

    await setAdminPassword(db, { email, password: "SecondPassword123" });
    const rows = await db.select().from(account).where(eq(account.userId, created.user.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(first?.id);
    expect(rows[0]?.password).not.toBe(first?.password);
  });

  it("rejects unknown users and short passwords", async () => {
    await expect(
      setAdminPassword(db, { email: "missing@example.com", password: "LongEnough123" }),
    ).rejects.toThrow(/No user found/);

    await expect(
      setAdminPassword(db, { email: "missing@example.com", password: "short" }),
    ).rejects.toThrow(/at least 8 characters/);
  });
});
