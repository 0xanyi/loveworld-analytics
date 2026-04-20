import { describe, it, expect } from "vitest";
import { chunkPeriod, weekBucketStart } from "../src/lib/period";

describe("chunkPeriod", () => {
  it("splits a week into 7 days", () => {
    const chunks = chunkPeriod(
      new Date("2026-01-05T00:00:00Z"),
      new Date("2026-01-12T00:00:00Z"),
      "day",
    );
    expect(chunks).toHaveLength(7);
    expect(chunks[0]!.start.toISOString()).toBe("2026-01-05T00:00:00.000Z");
    expect(chunks[6]!.end.toISOString()).toBe("2026-01-12T00:00:00.000Z");
  });

  it("splits 2 months into 2 month chunks", () => {
    const chunks = chunkPeriod(
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-03-01T00:00:00Z"),
      "month",
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[1]!.start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("weekBucketStart", () => {
  it("returns Monday for any day of the week (UTC)", () => {
    expect(weekBucketStart(new Date("2026-01-07T12:00:00Z")).toISOString()).toBe(
      "2026-01-05T00:00:00.000Z",
    );
    expect(weekBucketStart(new Date("2026-01-11T23:59:00Z")).toISOString()).toBe(
      "2026-01-05T00:00:00.000Z",
    );
    expect(weekBucketStart(new Date("2026-01-05T00:00:00Z")).toISOString()).toBe(
      "2026-01-05T00:00:00.000Z",
    );
  });
});
