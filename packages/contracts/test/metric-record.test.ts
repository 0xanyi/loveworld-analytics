import { describe, expect, it } from "vitest";
import { MetricRecordDraftSchema } from "../src/metric-record";

describe("MetricRecordDraftSchema", () => {
  it("accepts a valid draft", () => {
    const result = MetricRecordDraftSchema.safeParse({
      hierarchyNodeId: "00000000-0000-0000-0000-000000000001",
      metricType: "views",
      metricCategory: "streaming",
      dimensions: { country: "GB" },
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-02"),
      granularity: "day",
      value: 12345,
      unit: "count",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid metric_category", () => {
    const result = MetricRecordDraftSchema.safeParse({
      hierarchyNodeId: "00000000-0000-0000-0000-000000000001",
      metricType: "views",
      metricCategory: "bogus",
      dimensions: {},
      periodStart: new Date(),
      periodEnd: new Date(),
      granularity: "day",
      value: 1,
      unit: "count",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative value", () => {
    const result = MetricRecordDraftSchema.safeParse({
      hierarchyNodeId: "00000000-0000-0000-0000-000000000001",
      metricType: "views",
      metricCategory: "streaming",
      dimensions: {},
      periodStart: new Date(),
      periodEnd: new Date(),
      granularity: "day",
      value: -5,
      unit: "count",
    });
    expect(result.success).toBe(false);
  });
});
