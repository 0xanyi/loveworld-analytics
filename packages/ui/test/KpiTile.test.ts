import { describe, expect, it } from "vitest";
import {
  deltaTone,
  formatCompactValue,
  formatDeltaPct,
} from "../src/lib/components/KpiTile";

describe("KpiTile formatting", () => {
  it("formats compact values", () => {
    expect(formatCompactValue(12500)).toBe("12.5K");
    expect(formatCompactValue(820)).toBe("820");
  });

  it("formats positive, negative, and null deltas", () => {
    expect(formatDeltaPct(12.4)).toBe("+12.4%");
    expect(formatDeltaPct(-3.2)).toBe("-3.2%");
    expect(formatDeltaPct(null)).toBe("No comparison");
  });

  it("returns tone classes and supports adjustment-driven scenarios", () => {
    expect(deltaTone(4)).toBe("text-positive");
    expect(deltaTone(-1)).toBe("text-negative");
    expect(deltaTone(null)).toBe("text-ink-muted");
  });
});
