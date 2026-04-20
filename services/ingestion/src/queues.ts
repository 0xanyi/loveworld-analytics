export const QUEUES = {
  PULL: "connector.pull",
  BACKFILL: "connector.backfill",
  ROLLUP_REFRESH: "rollup.refresh",
  HEALTH: "connector.health",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

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
