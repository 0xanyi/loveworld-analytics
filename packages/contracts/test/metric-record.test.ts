import { describe, expect, it } from "vitest";
import { MetricRecordDraftSchema } from "../src/metric-record";

function valid() {
  return {
    hierarchyNodeId: "00000000-0000-0000-0000-000000000001",
    metricType: "views",
    metricCategory: "streaming" as const,
    dimensions: { country: "GB" },
    periodStart: new Date("2026-01-01"),
    periodEnd: new Date("2026-01-02"),
    granularity: "day" as const,
    value: 12345,
    unit: "count",
  };
}

describe("MetricRecordDraftSchema", () => {
  it("accepts a valid draft", () => {
    expect(MetricRecordDraftSchema.safeParse(valid()).success).toBe(true);
  });

  it("rejects invalid metric_category", () => {
    expect(
      MetricRecordDraftSchema.safeParse({ ...valid(), metricCategory: "bogus" }).success,
    ).toBe(false);
  });

  it("rejects negative value", () => {
    expect(MetricRecordDraftSchema.safeParse({ ...valid(), value: -5 }).success).toBe(false);
  });

  it("rejects value = Infinity", () => {
    expect(
      MetricRecordDraftSchema.safeParse({ ...valid(), value: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
  });

  it("rejects value = NaN", () => {
    expect(MetricRecordDraftSchema.safeParse({ ...valid(), value: Number.NaN }).success).toBe(false);
  });

  it("accepts value = 0", () => {
    expect(MetricRecordDraftSchema.safeParse({ ...valid(), value: 0 }).success).toBe(true);
  });

  it("rejects periodStart > periodEnd", () => {
    expect(
      MetricRecordDraftSchema.safeParse({
        ...valid(),
        periodStart: new Date("2026-01-05"),
        periodEnd: new Date("2026-01-01"),
      }).success,
    ).toBe(false);
  });

  it("accepts periodStart == periodEnd (instant)", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    expect(
      MetricRecordDraftSchema.safeParse({ ...valid(), periodStart: t, periodEnd: t }).success,
    ).toBe(true);
  });

  it("rejects non-UUID hierarchyNodeId", () => {
    expect(
      MetricRecordDraftSchema.safeParse({ ...valid(), hierarchyNodeId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects empty metricType", () => {
    expect(MetricRecordDraftSchema.safeParse({ ...valid(), metricType: "" }).success).toBe(false);
  });

  it("rejects metricType longer than 64 chars", () => {
    expect(
      MetricRecordDraftSchema.safeParse({ ...valid(), metricType: "x".repeat(65) }).success,
    ).toBe(false);
  });

  it("rejects unit longer than 32 chars", () => {
    expect(MetricRecordDraftSchema.safeParse({ ...valid(), unit: "x".repeat(33) }).success).toBe(
      false,
    );
  });

  it("rejects more than 20 dimensions", () => {
    const dims: Record<string, string> = {};
    for (let i = 0; i < 21; i++) dims[`k${i}`] = "v";
    expect(MetricRecordDraftSchema.safeParse({ ...valid(), dimensions: dims }).success).toBe(false);
  });

  it("accepts exactly 20 dimensions (boundary)", () => {
    const dims: Record<string, string> = {};
    for (let i = 0; i < 20; i++) dims[`k${i}`] = "v";
    expect(MetricRecordDraftSchema.safeParse({ ...valid(), dimensions: dims }).success).toBe(true);
  });

  it("rejects dimension values over 256 chars", () => {
    expect(
      MetricRecordDraftSchema.safeParse({
        ...valid(),
        dimensions: { long: "x".repeat(257) },
      }).success,
    ).toBe(false);
  });

  it("rejects empty dimension keys", () => {
    expect(
      MetricRecordDraftSchema.safeParse({ ...valid(), dimensions: { "": "v" } }).success,
    ).toBe(false);
  });

  it("rejects non-string dimension values", () => {
    expect(
      MetricRecordDraftSchema.safeParse({
        ...valid(),
        dimensions: { n: 42 as unknown as string },
      }).success,
    ).toBe(false);
  });
});
