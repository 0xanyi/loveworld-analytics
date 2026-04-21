import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { KekProvider } from "@lwa/crypto";
import type { Database } from "../src/client";
import * as schema from "../src/schema";
import { connectorConfigRepo } from "../src/repositories/connector-config";

let container: StartedPostgreSqlContainer;
let db: Database;
let client: ReturnType<typeof postgres>;

const key = randomBytes(32);
const kek: KekProvider = {
  currentVersion: "v1",
  getKey: (version) => {
    if (version !== "v1") throw new Error(`unknown kek version: ${version}`);
    return key;
  },
};

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  client = postgres(container.getConnectionUri(), { max: 5 });
  db = drizzle(client, { schema }) as unknown as Database;
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
}, 60_000);

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe("connectorConfigRepo credentials", () => {
  it("seals on create, opens on read", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);

    const [t] = await db
      .insert(schema.tenant)
      .values({ name: `Acme-${suffix}`, slug: `acme-${suffix}` })
      .returning();

    const [s] = await db
      .insert(schema.source)
      .values({
        key: `ga4-test-${suffix}`,
        name: "GA4",
        category: "web",
        authMethod: "service_account",
      })
      .returning();

    const repo = connectorConfigRepo(db, kek);
    const cfg = await repo.create({
      tenantId: t!.id,
      sourceId: s!.id,
      schedule: "0 3 * * *",
      credentials: { propertyIds: ["p1"], serviceAccountJson: "{...}" },
    });

    expect(cfg.credentialsCiphertext).toBeTruthy();
    expect(cfg.credentialsKekVersion).toBe("v1");

    const plain = await repo.readCredentials<{ propertyIds: string[] }>(cfg.id);
    expect(plain.propertyIds).toEqual(["p1"]);
  });
});
