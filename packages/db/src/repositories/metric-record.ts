import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { metricRecord, type NewMetricRecord } from "../schema";

/**
 * A MetricRecordDraft is a connector-supplied insert payload. The repo fills in
 * `dimensionsHash` and `ingestedAt`; the caller must supply everything else.
 * Kept separate from `NewMetricRecord` so callers can't accidentally pass a
 * stale `dimensionsHash` and silently skip the dedup path.
 */
export type MetricRecordDraft = Omit<NewMetricRecord, "id" | "dimensionsHash" | "ingestedAt">;

/**
 * Canonical hash of a `dimensions` map. Keys are sorted alphabetically before
 * serialisation so `{ a:"1", b:"2" }` and `{ b:"2", a:"1" }` produce the same
 * hash. SHA-256 (not BLAKE3) because Node ships SHA-256 natively — migrating
 * to a faster hash later is a one-off backfill, not a code change.
 */
export function hashDimensions(dims: Record<string, string>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(dims).sort(([a], [b]) => a.localeCompare(b))),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export interface MetricRecordRepo {
  /**
   * Upsert many drafts in one round trip. Conflicts on the dedup unique index
   * (tenant, source, node, type, period, dims_hash) overwrite `raw_value` and
   * `provenance` and refresh `ingested_at`. Returns the number of rows written
   * (inserted + updated).
   */
  upsertMany(drafts: MetricRecordDraft[]): Promise<{ written: number }>;
}

export function metricRecordRepo(db: Database): MetricRecordRepo {
  return {
    async upsertMany(drafts) {
      if (drafts.length === 0) return { written: 0 };
      const rows = drafts.map((d) => ({
        ...d,
        dimensions: d.dimensions ?? {},
        dimensionsHash: hashDimensions(
          (d.dimensions ?? {}) as Record<string, string>,
        ),
      }));
      const result = await db
        .insert(metricRecord)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            metricRecord.tenantId,
            metricRecord.sourceId,
            metricRecord.hierarchyNodeId,
            metricRecord.metricType,
            metricRecord.periodStart,
            metricRecord.periodEnd,
            metricRecord.dimensionsHash,
          ],
          set: {
            rawValue: sql`excluded.raw_value`,
            provenance: sql`excluded.provenance`,
            ingestedAt: sql`now()`,
          },
        })
        .returning({ id: metricRecord.id });
      return { written: result.length };
    },
  };
}
