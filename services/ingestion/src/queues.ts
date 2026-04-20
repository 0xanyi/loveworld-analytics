import type { JobsOptions } from "bullmq";

export const QUEUES = {
  PULL: "connector.pull",
  BACKFILL: "connector.backfill",
  ROLLUP_REFRESH: "rollup.refresh",
  HEALTH: "connector.health",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * Retry policies live with the queue names so that producers and consumers
 * share a single source of truth. BullMQ applies retry config at the producer
 * side (queue.add(..., options) or Queue's defaultJobOptions), not the worker
 * side — this worker is a consumer only.
 *
 * Rationale:
 *   PULL     : transient API failures are common; 5 attempts with exp backoff
 *              covers most rate-limit hiccups and TCP resets.
 *   BACKFILL : chunk jobs are expensive; retrying many times wastes work.
 *   ROLLUP   : pure DB-side; fast to retry, short backoff.
 *   HEALTH   : informational only; fail fast and re-run on next tick.
 */
export const QUEUE_DEFAULTS = {
  PULL: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2_000 },
  },
  BACKFILL: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
  ROLLUP_REFRESH: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1_000 },
  },
  HEALTH: {
    attempts: 1,
  },
} as const satisfies Record<keyof typeof QUEUES, JobsOptions>;

export type PullJobData = {
  connectorConfigId: string;
  periodStart: string; // ISO
  periodEnd: string; // ISO
  granularity: "hour" | "day" | "week" | "month" | "quarter";
};

export type BackfillJobData = PullJobData & {
  backfillRunId: string;
  chunkIndex: number;
};

export type RollupRefreshJobData = {
  tenantId: string;
  hierarchyNodeId: string;
  metricCategory: "tv_households" | "web_visitors" | "streaming" | "social_reach" | "engagement";
  granularity: "day" | "week" | "month" | "quarter";
  bucketStart: string; // ISO
};

export type HealthJobData = {
  connectorConfigId: string;
};
