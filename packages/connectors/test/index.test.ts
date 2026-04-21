import { describe, expect, it } from "vitest";
import { registry } from "../src/index";

describe("connectors index registration", () => {
  it("registers the 4 Phase 1 P0 connectors", () => {
    expect(registry.all().map((c) => c.key)).toEqual([
      "manual_satellite",
      "manual_freeview",
      "cloudflare_analytics",
      "ga4",
    ]);
  });
});
