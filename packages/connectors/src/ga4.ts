import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import {
  err,
  ok,
  type ConnectorError,
  type PlatformAccountCandidate,
  type PullConnector,
  type PullResult,
  type Result,
} from "@lwa/contracts";
import { classifyHttpError, classifyNetworkError } from "./lib/errors";

export const ga4CredentialsSchema = z.object({
  serviceAccountJson: z.string().refine((value) => {
    try {
      const parsed = JSON.parse(value) as { type?: unknown; private_key?: unknown; client_email?: unknown };
      return (
        parsed.type === "service_account" &&
        typeof parsed.private_key === "string" &&
        typeof parsed.client_email === "string"
      );
    } catch {
      return false;
    }
  }, "must be valid service-account JSON"),
});

export type Ga4Creds = z.infer<typeof ga4CredentialsSchema>;

type ReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

function parseCreds(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

function clientFromCreds(raw: string): BetaAnalyticsDataClient {
  return new BetaAnalyticsDataClient({ credentials: parseCreds(raw) });
}

function authFromCreds(raw: string): GoogleAuth {
  return new GoogleAuth({
    credentials: parseCreds(raw),
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
}

export const ga4Connector: PullConnector = {
  key: "ga4",
  name: "Google Analytics 4",
  category: "web_visitors",
  kind: "pull",
  authMethod: "service_account",
  credentialsSchema: ga4CredentialsSchema,
  supportedGranularities: ["day"],

  validateCredentials: async (creds) => {
    const parsed = ga4CredentialsSchema.safeParse(creds);
    if (!parsed.success) return err({ code: "AUTH_INVALID", message: "bad creds shape", retryable: false });

    try {
      const auth = authFromCreds(parsed.data.serviceAccountJson);
      const tokenClient = await auth.getClient();
      await tokenClient.getAccessToken();
      return ok(undefined);
    } catch (error) {
      const classified = classifyGa4Error(error);
      if (classified.code === "CONFIG_INVALID") {
        return err({ code: "AUTH_INVALID", message: classified.message, retryable: false });
      }
      return err(classified.code === "AUTH_INVALID" ? classified : { ...classified, code: "AUTH_INVALID", retryable: false });
    }
  },

  listAccounts: async (): Promise<Result<PlatformAccountCandidate[], ConnectorError>> => {
    return ok([]);
  },

  pull: async (input): Promise<Result<PullResult, ConnectorError>> => {
    const creds = ga4CredentialsSchema.safeParse(input.config.credentials);
    if (!creds.success) return err({ code: "AUTH_INVALID", message: "bad creds", retryable: false });
    if (!input.account) return err({ code: "CONFIG_INVALID", message: "no platform_account", retryable: false });

    const account = input.account;
    const propertyId = account.externalId;
    const property = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;

    await input.context.rateLimiter.acquire();

    try {
      const client = clientFromCreds(creds.data.serviceAccountJson);
      const dateRange = toGa4DateRange(input.period.start, input.period.end);
      const [response] = await client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
      });

      const rows = (response as ReportResponse).rows ?? [];
      if (rows.length === 0) return ok({ records: [] });

      const records = rows.flatMap((row) => {
        const dateStr = row.dimensionValues?.[0]?.value ?? "";
        if (!/^\d{8}$/.test(dateStr)) {
          return [];
        }

        const periodStart = new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T00:00:00.000Z`);
        const periodEnd = new Date(periodStart);
        periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);

        const base = {
          hierarchyNodeId: account.hierarchyNodeId,
          metricCategory: "web_visitors" as const,
          dimensions: {},
          periodStart,
          periodEnd,
          granularity: "day" as const,
          unit: "count",
        };

        return [
          {
            ...base,
            metricType: "unique_visitors",
            value: Number(row.metricValues?.[0]?.value ?? 0),
          },
          {
            ...base,
            metricType: "sessions",
            value: Number(row.metricValues?.[1]?.value ?? 0),
          },
          {
            ...base,
            metricType: "pageviews",
            value: Number(row.metricValues?.[2]?.value ?? 0),
          },
        ];
      });

      return ok({ records });
    } catch (error) {
      return err(classifyGa4Error(error));
    }
  },
};

function classifyGa4Error(error: unknown): ConnectorError {
  const message = error instanceof Error ? error.message : String(error);

  const httpStatus =
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response &&
    typeof error.response.status === "number"
      ? error.response.status
      : undefined;

  if (httpStatus) {
    return classifyHttpError(httpStatus, message);
  }

  const errorCode =
    typeof error === "object" && error !== null && "code" in error
      ? (error.code as unknown)
      : undefined;

  if (errorCode === 16 || errorCode === "UNAUTHENTICATED") {
    return { code: "AUTH_INVALID", message, retryable: false };
  }
  if (
    errorCode === 7 ||
    errorCode === "PERMISSION_DENIED" ||
    errorCode === 3 ||
    errorCode === "INVALID_ARGUMENT" ||
    errorCode === 5 ||
    errorCode === "NOT_FOUND"
  ) {
    return { code: "CONFIG_INVALID", message, retryable: false };
  }
  if (errorCode === 8 || errorCode === "RESOURCE_EXHAUSTED") {
    return { code: "RATE_LIMITED", message, retryable: true };
  }
  if (errorCode === 14 || errorCode === "UNAVAILABLE") {
    return { code: "UPSTREAM_UNAVAILABLE", message, retryable: true };
  }

  if (message.match(/invalid_grant|unauthenticated|invalid credentials/i)) {
    return { code: "AUTH_INVALID", message, retryable: false };
  }
  if (message.match(/permission denied|insufficient permissions|forbidden/i)) {
    return { code: "CONFIG_INVALID", message, retryable: false };
  }

  return classifyNetworkError(error);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toGa4DateRange(start: Date, end: Date): { startDate: string; endDate: string } {
  const startDate = isoDate(start);

  const exclusiveEnd = new Date(end);
  if (exclusiveEnd.getTime() <= start.getTime()) {
    return { startDate, endDate: startDate };
  }

  if (isoDate(start) === isoDate(end)) {
    return { startDate, endDate: startDate };
  }

  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() - 1);
  const endDate = isoDate(exclusiveEnd);

  if (endDate < startDate) {
    return { startDate, endDate: startDate };
  }

  return { startDate, endDate };
}
