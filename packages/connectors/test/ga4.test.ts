import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { isOk } from "@lwa/contracts";
import { runConnectorContract } from "../src/lib/contract-suite";

const reportFixture = JSON.parse(
  readFileSync(new URL("./fixtures/ga4/report.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const runReport = vi.hoisted(() => vi.fn());
const getAccessToken = vi.hoisted(() => vi.fn());
const getClient = vi.hoisted(() => vi.fn());

vi.mock("@google-analytics/data", () => ({
  BetaAnalyticsDataClient: vi.fn().mockImplementation(() => ({ runReport })),
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: vi.fn().mockImplementation(() => ({ getClient })),
}));

import { ga4Connector } from "../src/ga4";

const VALID_SA = JSON.stringify({
  type: "service_account",
  private_key: "fake",
  client_email: "x@y.iam.gserviceaccount.com",
});

describe("ga4", () => {
  beforeEach(() => {
    runReport.mockReset();
    runReport.mockResolvedValue([{}]);

    getAccessToken.mockReset();
    getAccessToken.mockResolvedValue({ token: "token" });

    getClient.mockReset();
    getClient.mockResolvedValue({ getAccessToken });
  });

  it("validateCredentials ok on valid service-account JSON", async () => {
    const r = await ga4Connector.validateCredentials({ serviceAccountJson: VALID_SA });
    expect(isOk(r)).toBe(true);
  });

  it("validateCredentials returns AUTH_INVALID on garbage JSON", async () => {
    const r = await ga4Connector.validateCredentials({ serviceAccountJson: "not-json" });
    expect(r).toMatchObject({ _tag: "err", error: { code: "AUTH_INVALID" } });
  });

  it("validateCredentials returns AUTH_INVALID when token exchange fails", async () => {
    getAccessToken.mockRejectedValueOnce({
      message: "invalid_grant",
      response: { status: 401 },
    });

    const r = await ga4Connector.validateCredentials({ serviceAccountJson: VALID_SA });
    expect(r).toMatchObject({ _tag: "err", error: { code: "AUTH_INVALID", retryable: false } });
  });

  it("pull returns 3 metrics x 2 days", async () => {
    runReport.mockResolvedValueOnce([reportFixture]);

    const r = await ga4Connector.pull({
      config: {
        id: "c1",
        tenantId: "t1",
        sourceId: "s1",
        sourceKey: "ga4",
        credentials: { serviceAccountJson: VALID_SA },
        schedule: "",
      },
      account: {
        id: "a1",
        externalId: "properties/123",
        hierarchyNodeId: "h1",
        config: {},
      },
      period: {
        start: new Date("2026-01-05T00:00:00.000Z"),
        end: new Date("2026-01-07T00:00:00.000Z"),
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
      expect(r.value.records).toHaveLength(6);
      expect(
        r.value.records.find(
          (x) =>
            x.metricType === "unique_visitors" &&
            x.periodStart.toISOString().startsWith("2026-01-05"),
        )?.value,
      ).toBe(1234);
    }
  });

  it("pull returns CONFIG_INVALID on GA4 permission errors", async () => {
    runReport.mockRejectedValueOnce({
      message: "permission denied",
      response: { status: 403 },
    });

    const r = await ga4Connector.pull({
      config: {
        id: "c1",
        tenantId: "t1",
        sourceId: "s1",
        sourceKey: "ga4",
        credentials: { serviceAccountJson: VALID_SA },
        schedule: "",
      },
      account: {
        id: "a1",
        externalId: "123",
        hierarchyNodeId: "h1",
        config: {},
      },
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

    expect(r).toMatchObject({ _tag: "err", error: { code: "CONFIG_INVALID", retryable: false } });
  });

  it("pull uses a non-inverted inclusive date range for same-day hour window", async () => {
    runReport.mockResolvedValueOnce([reportFixture]);

    const r = await ga4Connector.pull({
      config: {
        id: "c1",
        tenantId: "t1",
        sourceId: "s1",
        sourceKey: "ga4",
        credentials: { serviceAccountJson: VALID_SA },
        schedule: "",
      },
      account: {
        id: "a1",
        externalId: "123",
        hierarchyNodeId: "h1",
        config: {},
      },
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
    expect(runReport).toHaveBeenCalledWith(
      expect.objectContaining({
        property: "properties/123",
        dateRanges: [{ startDate: "2026-01-05", endDate: "2026-01-05" }],
      }),
    );
  });
});

runConnectorContract(ga4Connector, {
  validCredentials: { serviceAccountJson: VALID_SA },
  invalidCredentials: { serviceAccountJson: "bad" },
  mockPullInput: {
    config: {
      id: "cfg-contract",
      tenantId: "tenant-contract",
      sourceId: "source-contract",
      sourceKey: "ga4",
      credentials: { serviceAccountJson: VALID_SA },
      schedule: "0 3 * * *",
    },
    account: {
      id: "account-contract",
      externalId: "properties/123",
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
