import { request } from "undici";
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

export const cloudflareAnalyticsCredentialsSchema = z.object({
  apiToken: z.string().min(40),
});

export type CloudflareAnalyticsCreds = z.infer<typeof cloudflareAnalyticsCredentialsSchema>;

const GQL_URL = "https://api.cloudflare.com/client/v4/graphql";

type ZonesResponse = {
  result: Array<{ id: string; name: string }>;
  result_info?: {
    page?: number;
    total_pages?: number;
  };
};

type GraphqlGroup = {
  dimensions: { date: string };
  sum: { requests: number; pageViews: number };
  uniq: { uniques: number };
};

type GraphqlResponse = {
  data?: {
    viewer?: {
      zones?: Array<{ httpRequests1dGroups?: GraphqlGroup[] }>;
    };
  };
  errors?: unknown[];
};

export const cloudflareAnalyticsConnector: PullConnector = {
  key: "cloudflare_analytics",
  name: "Cloudflare Analytics",
  category: "web_visitors",
  kind: "pull",
  authMethod: "api_key",
  credentialsSchema: cloudflareAnalyticsCredentialsSchema,
  supportedGranularities: ["hour", "day"],

  validateCredentials: async (creds) => {
    const parsed = cloudflareAnalyticsCredentialsSchema.safeParse(creds);
    if (!parsed.success) {
      return err({ code: "AUTH_INVALID", message: "bad creds shape", retryable: false });
    }

    try {
      const res = await request("https://api.cloudflare.com/client/v4/user/tokens/verify", {
        method: "GET",
        headers: { authorization: `Bearer ${parsed.data.apiToken}` },
      });
      if (res.statusCode === 200) return ok(undefined);
      return err(classifyHttpError(res.statusCode, `verify returned ${res.statusCode}`));
    } catch (error) {
      return err(classifyNetworkError(error));
    }
  },

  listAccounts: async (creds): Promise<Result<PlatformAccountCandidate[], ConnectorError>> => {
    const parsed = cloudflareAnalyticsCredentialsSchema.safeParse(creds);
    if (!parsed.success) return err({ code: "AUTH_INVALID", message: "bad creds", retryable: false });

    try {
      const zones: PlatformAccountCandidate[] = [];
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const url = `https://api.cloudflare.com/client/v4/zones?per_page=50&page=${page}`;

        const res = await request(url, {
          method: "GET",
          headers: { authorization: `Bearer ${parsed.data.apiToken}` },
        });
        if (res.statusCode !== 200) {
          return err(classifyHttpError(res.statusCode, `zones returned ${res.statusCode}`));
        }

        const body = (await res.body.json()) as ZonesResponse;
        zones.push(...body.result.map((zone) => ({ externalId: zone.id, displayName: zone.name })));

        totalPages = body.result_info?.total_pages ?? 1;
        page += 1;
      }

      return ok(zones);
    } catch (error) {
      return err(classifyNetworkError(error));
    }
  },

  pull: async (input): Promise<Result<PullResult, ConnectorError>> => {
    const creds = cloudflareAnalyticsCredentialsSchema.safeParse(input.config.credentials);
    if (!creds.success) return err({ code: "AUTH_INVALID", message: "bad creds", retryable: false });
    if (!input.account) {
      return err({ code: "CONFIG_INVALID", message: "no platform_account", retryable: false });
    }

    await input.context.rateLimiter.acquire();

    const zoneTag = input.account.externalId;
    const query = `
      query($zoneTag: String!, $start: Time!, $end: Time!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequests1dGroups(limit: 10000, filter: { date_geq: $start, date_lt: $end }) {
              dimensions { date }
              sum { requests pageViews }
              uniq { uniques }
            }
          }
        }
      }
    `;

    try {
      const res = await request(GQL_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${creds.data.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: {
            zoneTag,
            ...toCloudflareDateWindow(input.period.start, input.period.end),
          },
        }),
      });

      if (res.statusCode !== 200) {
        return err(classifyHttpError(res.statusCode, `graphql returned ${res.statusCode}`));
      }

      const body = (await res.body.json()) as GraphqlResponse;
      if (body.errors?.length) {
        return err({
          code: "CONFIG_INVALID",
          message: JSON.stringify(body.errors),
          retryable: false,
        });
      }

      const groups = body.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
      if (groups.length === 0) return ok({ records: [] });

      const records = groups.flatMap((g) => {
        const periodStart = new Date(`${g.dimensions.date}T00:00:00.000Z`);
        const periodEnd = new Date(periodStart);
        periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);

        return [
          {
            hierarchyNodeId: input.account!.hierarchyNodeId,
            metricType: "pageviews",
            metricCategory: "web_visitors" as const,
            dimensions: {},
            periodStart,
            periodEnd,
            granularity: "day" as const,
            value: Number(g.sum.pageViews),
            unit: "count",
          },
          {
            hierarchyNodeId: input.account!.hierarchyNodeId,
            metricType: "unique_visitors",
            metricCategory: "web_visitors" as const,
            dimensions: {},
            periodStart,
            periodEnd,
            granularity: "day" as const,
            value: Number(g.uniq.uniques),
            unit: "count",
          },
          {
            hierarchyNodeId: input.account!.hierarchyNodeId,
            metricType: "requests",
            metricCategory: "web_visitors" as const,
            dimensions: {},
            periodStart,
            periodEnd,
            granularity: "day" as const,
            value: Number(g.sum.requests),
            unit: "count",
          },
        ];
      });

      return ok({ records });
    } catch (error) {
      return err(classifyNetworkError(error));
    }
  },
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toCloudflareDateWindow(start: Date, end: Date): { start: string; end: string } {
  const startDate = isoDate(start);
  const endDate = isoDate(end);

  if (endDate === startDate && end.getTime() > start.getTime()) {
    const dayAfterStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1));
    return {
      start: startDate,
      end: isoDate(dayAfterStart),
    };
  }

  return { start: startDate, end: endDate };
}
