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

  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined;

      if (code !== "57P03" || attempt === 9) {
        await client.end();
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (lastError) {
    await client.end();
    throw lastError;
  }

  return {
    db,
    cleanup: async () => {
      await client.end();
    },
  };
}
