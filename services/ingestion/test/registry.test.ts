import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ok } from "@lwa/contracts";
import type { MetricCategory, SourceConnector } from "@lwa/contracts";
import { ConnectorRegistry } from "../src/registry";

function stubConnector(key: string, category: MetricCategory = "tv_households"): SourceConnector {
  return {
    kind: "manual",
    key,
    name: `stub-${key}`,
    category,
    authMethod: "none",
    credentialsSchema: z.object({}),
    supportedGranularities: ["day"],
    entrySchema: z.object({}),
    validateCredentials: () => Promise.resolve(ok(undefined)),
  };
}

describe("ConnectorRegistry", () => {
  it("registers and retrieves a connector by key", () => {
    const reg = new ConnectorRegistry();
    const c = stubConnector("alpha");
    reg.register(c);
    expect(reg.get("alpha")).toBe(c);
  });

  it("has() returns false for unknown keys and true after register", () => {
    const reg = new ConnectorRegistry();
    expect(reg.has("unknown")).toBe(false);
    reg.register(stubConnector("beta"));
    expect(reg.has("beta")).toBe(true);
  });

  it("throws when registering a duplicate key", () => {
    const reg = new ConnectorRegistry();
    reg.register(stubConnector("dup"));
    expect(() => reg.register(stubConnector("dup"))).toThrow(/already registered/);
  });

  it("all() returns registered connectors in insertion order", () => {
    const reg = new ConnectorRegistry();
    const a = stubConnector("a");
    const b = stubConnector("b");
    const c = stubConnector("c");
    reg.register(a);
    reg.register(b);
    reg.register(c);
    expect(reg.all()).toEqual([a, b, c]);
  });

  it("size() reflects the current count", () => {
    const reg = new ConnectorRegistry();
    expect(reg.size()).toBe(0);
    reg.register(stubConnector("x"));
    reg.register(stubConnector("y"));
    expect(reg.size()).toBe(2);
  });

  it("get() returns undefined for an unregistered key", () => {
    const reg = new ConnectorRegistry();
    expect(reg.get("ghost")).toBeUndefined();
  });
});
