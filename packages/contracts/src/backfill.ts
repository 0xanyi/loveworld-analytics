/**
 * Deterministic BullMQ job id for a backfill chunk.
 *
 * Shared between the API producer (to get at-least-once dedupe from BullMQ
 * when admins re-submit a backfill) and the ingestion consumer (so it can
 * correlate a job with its `ingestion_run` row). Kept here in
 * `@lwa/contracts` so both sides import the same implementation.
 */
export function backfillChunkJobId(backfillRunId: string, chunkIndex: number): string {
  return `bf:${backfillRunId}:${chunkIndex}`;
}
