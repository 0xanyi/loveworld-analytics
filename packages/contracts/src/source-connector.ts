import type { z } from "zod";
import type { MetricCategory } from "./metric-category";
import type { Granularity } from "./granularity";
import type { MetricRecordDraft } from "./metric-record";
import type { Result } from "./result";
import type { ConnectorError } from "./connector-error";

export type AuthMethod = "oauth2" | "api_key" | "service_account" | "none";

export type PlatformAccountCandidate = {
  externalId: string;
  displayName: string;
  thumbnailUrl?: string;
};

export type PullInput = {
  config: {
    id: string;
    tenantId: string;
    credentials: unknown;
    schedule: string;
  };
  account: {
    id: string;
    externalId: string;
    hierarchyNodeId: string;
  } | null;
  period: {
    start: Date;
    end: Date;
    granularity: Granularity;
  };
  context: {
    tenantId: string;
    logger: {
      info: (msg: string, data?: unknown) => void;
      warn: (msg: string, data?: unknown) => void;
      error: (msg: string, data?: unknown) => void;
    };
    rateLimiter: { acquire: (cost?: number) => Promise<void> };
  };
};

export type PullResult = {
  records: MetricRecordDraft[];
  nextCursor?: string;
  warnings?: string[];
};

export type BackfillInput = PullInput & { checkpoint?: string };

export interface PullConnector {
  readonly key: string;
  readonly name: string;
  readonly category: MetricCategory;
  readonly authMethod: AuthMethod;
  readonly credentialsSchema: z.ZodTypeAny;
  readonly supportedGranularities: readonly Granularity[];
  readonly kind: "pull";

  validateCredentials(creds: unknown): Promise<Result<void, ConnectorError>>;
  pull(input: PullInput): Promise<Result<PullResult, ConnectorError>>;
  listAccounts?(creds: unknown): Promise<Result<PlatformAccountCandidate[], ConnectorError>>;
  backfill?(input: BackfillInput): Promise<Result<PullResult, ConnectorError>>;
}

export interface ManualConnector {
  readonly key: string;
  readonly name: string;
  readonly category: MetricCategory;
  readonly authMethod: "none";
  readonly credentialsSchema: z.ZodTypeAny;
  readonly supportedGranularities: readonly Granularity[];
  readonly kind: "manual";
  readonly entrySchema: z.ZodTypeAny;

  validateCredentials(creds: unknown): Promise<Result<void, ConnectorError>>;
}

export type SourceConnector = PullConnector | ManualConnector;
