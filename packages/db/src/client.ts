import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export interface CreateDbOptions {
  /** Max connections in the pool. Default: 10. */
  max?: number;
  /** Idle timeout in seconds. Default: 20. */
  idleTimeout?: number;
}

export function createDb(connectionString: string, options: CreateDbOptions = {}) {
  const client = postgres(connectionString, {
    max: options.max ?? 10,
    idle_timeout: options.idleTimeout ?? 20,
  });
  return drizzle(client, { schema });
}
