import type { JobsOptions } from "bullmq";

export const QUEUES = {
  PULL: "connector.pull",
  BACKFILL: "connector.backfill",
  ROLLUP_REFRESH: "rollup.refresh",
  HEALTH: "connector.health",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

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
  granularity: "hour" | "day" | "week" | "month" | "quarter";
  periodStart?: string;
  periodEnd?: string;
};

export type BackfillJobData = {
  connectorConfigId: string;
  granularity: "hour" | "day" | "week" | "month" | "quarter";
  periodStart: string;
  periodEnd: string;
  backfillRunId: string;
  chunkIndex: number;
};

export type RollupRefreshJobData = {
  tenantId: string;
  hierarchyNodeId: string;
  metricCategory: "tv_households" | "web_visitors" | "streaming" | "social_reach" | "engagement";
  granularity: "day" | "week" | "month" | "quarter";
  recordGranularity: "hour" | "day" | "week" | "month" | "quarter";
  bucketStart: string;
};

export type HealthJobData = {
  connectorConfigId: string;
};
