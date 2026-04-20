import { describe, expect, it } from "vitest";
import { MetricCategorySchema } from "../src/metric-category";
import { GranularitySchema } from "../src/granularity";
import { ConnectorErrorCodeSchema } from "../src/connector-error";

describe("MetricCategorySchema", () => {
  it.each(["tv_households", "web_visitors", "streaming", "social_reach", "engagement"])(
    "accepts %s",
    (v) => {
      expect(MetricCategorySchema.safeParse(v).success).toBe(true);
    },
  );

  it("rejects unknown categories", () => {
    expect(MetricCategorySchema.safeParse("podcast").success).toBe(false);
    expect(MetricCategorySchema.safeParse("TV_HOUSEHOLDS").success).toBe(false);
  });
});

describe("GranularitySchema", () => {
  it.each(["hour", "day", "week", "month", "quarter"])("accepts %s", (v) => {
    expect(GranularitySchema.safeParse(v).success).toBe(true);
  });

  it("rejects unsupported granularities", () => {
    expect(GranularitySchema.safeParse("year").success).toBe(false);
    expect(GranularitySchema.safeParse("minute").success).toBe(false);
  });
});

describe("ConnectorErrorCodeSchema", () => {
  it.each([
    "AUTH_EXPIRED",
    "AUTH_INVALID",
    "RATE_LIMITED",
    "TRANSIENT",
    "UPSTREAM_UNAVAILABLE",
    "CONFIG_INVALID",
    "NO_DATA",
  ])("accepts %s", (v) => {
    expect(ConnectorErrorCodeSchema.safeParse(v).success).toBe(true);
  });

  it("rejects lowercase and unknown codes", () => {
    expect(ConnectorErrorCodeSchema.safeParse("rate_limited").success).toBe(false);
    expect(ConnectorErrorCodeSchema.safeParse("UNKNOWN").success).toBe(false);
  });
});
