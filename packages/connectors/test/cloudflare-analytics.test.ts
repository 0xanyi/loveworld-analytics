import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { isOk } from "@lwa/contracts";
import { runConnectorContract } from "../src/lib/contract-suite";
import { cloudflareAnalyticsConnector } from "../src/cloudflare-analytics";

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/cloudflare-analytics/${name}`, import.meta.url), "utf8"),
  ) as Record<string, unknown>;
}

describe("cloudflare_analytics", () => {
  let agent: MockAgent;
  const original = getGlobalDispatcher();

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    await agent.close();
    setGlobalDispatcher(original);
  });

  it("validateCredentials returns ok on 200", async () => {
    agent
      .get("https://api.cloudflare.com")
      .intercept({ path: "/client/v4/user/tokens/verify", method: "GET" })
      .reply(200, { success: true });

    const r = await cloudflareAnalyticsConnector.validateCredentials({ apiToken: "x".repeat(40) });
    expect(isOk(r)).toBe(true);
  });

  it("validateCredentials returns AUTH_INVALID on 401", async () => {
    agent
      .get("https://api.cloudflare.com")
      .intercept({ path: "/client/v4/user/tokens/verify", method: "GET" })
      .reply(401, {});

    const r = await cloudflareAnalyticsConnector.validateCredentials({ apiToken: "x".repeat(40) });
    expect(r).toMatchObject({ _tag: "err", error: { code: "AUTH_INVALID" } });
  });

  it("listAccounts returns zones", async () => {
    agent
      .get("https://api.cloudflare.com")
      .intercept({ path: "/client/v4/zones?per_page=50&page=1", method: "GET" })
      .reply(200, fixture("list-zones.json"));

    const r = await cloudflareAnalyticsConnector.listAccounts!({ apiToken: "x".repeat(40) });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toHaveLength(2);
      expect(r.value[0]?.externalId).toBe("zone-abc");
    }
  });

  it("listAccounts paginates across multiple pages", async () => {
    agent
      .get("https://api.cloudflare.com")
      .intercept({ path: "/client/v4/zones?per_page=50&page=1", method: "GET" })
      .reply(200, {
        result: [{ id: "zone-1", name: "one.example" }],
        result_info: { page: 1, total_pages: 2 },
      });

    agent
      .get("https://api.cloudflare.com")
      .intercept({ path: "/client/v4/zones?per_page=50&page=2", method: "GET" })
      .reply(200, {
        result: [{ id: "zone-2", name: "two.example" }],
        result_info: { page: 2, total_pages: 2 },
      });

    const r = await cloudflareAnalyticsConnector.listAccounts!({ apiToken: "x".repeat(40) });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.map((x) => x.externalId)).toEqual(["zone-1", "zone-2"]);
    }
  });

  it("pull returns 3 metrics per day (pageviews + unique_visitors + requests)", async () => {
    agent
      .get("https://api.cloudflare.com")
      .intercept({ path: "/client/v4/graphql", method: "POST" })
      .reply(200, fixture("pull-day.json"));

    const r = await cloudflareAnalyticsConnector.pull({
      config: {
        id: "c1",
        tenantId: "t1",
        sourceId: "s1",
        sourceKey: "cloudflare_analytics",
        credentials: { apiToken: "x".repeat(40) },
        schedule: "",
      },
      account: { id: "a1", externalId: "zone-abc", hierarchyNodeId: "h1", config: {} },
      period: {
        start: new Date("2026-01-05T00:00:00.000Z"),
        end: new Date("2026-01-06T00:00:00.000Z"),
        granularity: "day",
      },
      context: {
        tenantId: "t1",
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        rateLimiter: { acquire: async () => {} },
      },
    });

    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.records).toHaveLength(3);
      const byType = Object.fromEntries(r.value.records.map((x) => [x.metricType, x.value]));
      expect(byType).toEqual({ pageviews: 34567, unique_visitors: 8910, requests: 123456 });
    }
  });

  it("pull with hour granularity expands GraphQL date window to a non-empty day range", async () => {
    let seenStart = "";
    let seenEnd = "";

    agent
      .get("https://api.cloudflare.com")
      .intercept({ path: "/client/v4/graphql", method: "POST" })
      .reply((opts) => {
        const payload = JSON.parse(String(opts.body)) as {
          variables: { start: string; end: string };
        };
        seenStart = payload.variables.start;
        seenEnd = payload.variables.end;
        return {
          statusCode: 200,
          data: fixture("pull-day.json"),
        };
      });

    const r = await cloudflareAnalyticsConnector.pull({
      config: {
        id: "c1",
        tenantId: "t1",
        sourceId: "s1",
        sourceKey: "cloudflare_analytics",
        credentials: { apiToken: "x".repeat(40) },
        schedule: "",
      },
      account: { id: "a1", externalId: "zone-abc", hierarchyNodeId: "h1", config: {} },
      period: {
        start: new Date("2026-01-05T12:00:00.000Z"),
        end: new Date("2026-01-05T13:00:00.000Z"),
        granularity: "hour",
      },
      context: {
        tenantId: "t1",
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        rateLimiter: { acquire: async () => {} },
      },
    });

    expect(isOk(r)).toBe(true);
    expect(seenStart).toBe("2026-01-05");
    expect(seenEnd).toBe("2026-01-06");
  });

  describe("contract", () => {
    beforeEach(() => {
      agent
        .get("https://api.cloudflare.com")
        .intercept({ path: "/client/v4/user/tokens/verify", method: "GET" })
        .reply(200, { success: true });

      agent
        .get("https://api.cloudflare.com")
        .intercept({ path: "/client/v4/graphql", method: "POST" })
        .reply(200, { data: { viewer: { zones: [{ httpRequests1dGroups: [] }] } } });
    });

    runConnectorContract(cloudflareAnalyticsConnector, {
      validCredentials: { apiToken: "x".repeat(40) },
      invalidCredentials: { apiToken: "" },
      mockPullInput: {
        config: {
          id: "cfg-contract",
          tenantId: "tenant-contract",
          sourceId: "source-contract",
          sourceKey: "cloudflare_analytics",
          credentials: { apiToken: "x".repeat(40) },
          schedule: "0 3 * * *",
        },
        account: {
          id: "account-contract",
          externalId: "zone-abc",
          hierarchyNodeId: "00000000-0000-0000-0000-000000000000",
          config: {},
        },
        period: {
          start: new Date("2026-01-05T00:00:00.000Z"),
          end: new Date("2026-01-06T00:00:00.000Z"),
          granularity: "day",
        },
        context: {
          tenantId: "tenant-contract",
          logger: { info: () => {}, warn: () => {}, error: () => {} },
          rateLimiter: { acquire: async () => {} },
        },
      },
    });
  });
});
