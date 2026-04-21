import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { platformAccount, type PlatformAccount } from "../schema";

export interface PlatformAccountRepo {
  listByConnector(tenantId: string, sourceId: string): Promise<PlatformAccount[]>;

  /**
   * Insert-or-update keyed on (tenant, source, external_id). When `config` is
   * omitted, the stored value is preserved — a caller refreshing only the
   * display name will not wipe per-account settings. Pass `config: {}`
   * explicitly to clear.
   */
  upsert(input: {
    tenantId: string;
    hierarchyNodeId: string;
    sourceId: string;
    externalId: string;
    displayName: string;
    config?: Record<string, unknown>;
  }): Promise<PlatformAccount>;

  /** Called by the pull handler after a successful pull against this account. */
  updateLastSynced(id: string): Promise<void>;
}

export function platformAccountRepo(db: Database): PlatformAccountRepo {
  return {
    async listByConnector(tenantId, sourceId) {
      return db
        .select()
        .from(platformAccount)
        .where(
          and(eq(platformAccount.tenantId, tenantId), eq(platformAccount.sourceId, sourceId)),
        );
    },

    async upsert(input) {
      // Only set config on conflict when the caller provided one. Drizzle's
      // onConflictDoUpdate uses `excluded.*` to refer to the attempted-insert
      // row, so we build the set dynamically.
      const conflictSet: Record<string, unknown> = {
        displayName: sql`excluded.display_name`,
        hierarchyNodeId: sql`excluded.hierarchy_node_id`,
      };
      if (input.config !== undefined) {
        conflictSet.config = sql`excluded.config`;
      }

      const [row] = await db
        .insert(platformAccount)
        .values({
          tenantId: input.tenantId,
          hierarchyNodeId: input.hierarchyNodeId,
          sourceId: input.sourceId,
          externalId: input.externalId,
          displayName: input.displayName,
          // On INSERT, default to {} when config is omitted; jsonb column is NOT NULL.
          config: input.config ?? {},
        })
        .onConflictDoUpdate({
          target: [platformAccount.tenantId, platformAccount.sourceId, platformAccount.externalId],
          set: conflictSet,
        })
        .returning();
      if (!row) {
        throw new Error(
          `platformAccountRepo.upsert: insert returned no row for (tenant=${input.tenantId}, source=${input.sourceId}, external=${input.externalId})`,
        );
      }
      return row;
    },

    async updateLastSynced(id) {
      await db
        .update(platformAccount)
        .set({ lastSyncedAt: new Date() })
        .where(eq(platformAccount.id, id));
    },
  };
}
