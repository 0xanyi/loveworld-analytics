import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./client";
import * as schema from "./schema";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "../drizzle");

/**
 * Create a fresh test database against the given connection string, run
 * all migrations, and return a `Database` handle + a cleanup function.
 *
 * Intended for integration tests that use testcontainers or a disposable
 * test DB. Not for production use — prefer `createDb` instead.
 */
export async function createTestDb(connectionUri: string): Promise<{
  db: Database;
  cleanup: () => Promise<void>;
}> {
  const client = postgres(connectionUri, { max: 5 });
  const db = drizzle(client, { schema }) as unknown as Database;
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
  return {
    db,
    cleanup: async () => {
      await client.end();
    },
  };
}
