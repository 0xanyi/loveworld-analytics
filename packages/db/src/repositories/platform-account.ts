import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { platformAccount, type PlatformAccount } from "../schema";

export interface PlatformAccountRepo {
  listByConnector(tenantId: string, sourceId: string): Promise<PlatformAccount[]>;

  /**
   * Insert-or-update keyed on (tenant, source, external_id). The connector
   * registry re-invokes `listAccounts` periodically; this repo lets the API
   * refresh display names / configs without creating duplicates.
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
      const [row] = await db
        .insert(platformAccount)
        .values({
          tenantId: input.tenantId,
          hierarchyNodeId: input.hierarchyNodeId,
          sourceId: input.sourceId,
          externalId: input.externalId,
          displayName: input.displayName,
          config: input.config ?? {},
        })
        .onConflictDoUpdate({
          target: [platformAccount.tenantId, platformAccount.sourceId, platformAccount.externalId],
          set: {
            displayName: input.displayName,
            config: input.config ?? {},
            hierarchyNodeId: input.hierarchyNodeId,
          },
        })
        .returning();
      return row!;
    },

    async updateLastSynced(id) {
      await db
        .update(platformAccount)
        .set({ lastSyncedAt: new Date() })
        .where(eq(platformAccount.id, id));
    },
  };
}
