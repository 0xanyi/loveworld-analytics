import { describe, expect, it } from "vitest";
import * as connectors from "../src/index";

describe("connectors index registration", () => {
  it("registers the 4 Phase 1 P0 connectors", () => {
    expect(connectors.registry.all().map((c) => c.key)).toEqual([
      "manual_satellite",
      "manual_freeview",
      "cloudflare_analytics",
      "ga4",
    ]);
  });

  it("does not export test-only helpers from the runtime package entrypoint", () => {
    expect("runConnectorContract" in connectors).toBe(false);
  });
});
