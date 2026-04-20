import { describe, expect, it } from "vitest";
import { isErr, isOk, type PullConnector, type Result, type SourceConnector } from "@lwa/contracts";

export interface ContractFixture {
  validCredentials: unknown;
  invalidCredentials: unknown;
  mockPullInput?: Parameters<PullConnector["pull"]>[0];
}

export function runConnectorContract(connector: SourceConnector, fixture: ContractFixture) {
  describe(`contract: ${connector.key}`, () => {
    it("exposes a stable key, name, category, kind, supportedGranularities", () => {
      expect(connector.key).toMatch(/^[a-z][a-z0-9_]+$/);
      expect(connector.name).toBeTruthy();
      expect(["pull", "manual"]).toContain(connector.kind);
      expect(connector.supportedGranularities.length).toBeGreaterThan(0);
    });

    it("validateCredentials(validCredentials) returns ok", async () => {
      const r = await connector.validateCredentials(fixture.validCredentials);
      expect(isOk(r)).toBe(true);
    });

    it("validateCredentials(invalidCredentials) returns err", async () => {
      const r = await connector.validateCredentials(fixture.invalidCredentials);
      expect(isErr(r)).toBe(true);
    });

    if (connector.kind === "pull" && fixture.mockPullInput) {
      const pull = connector as PullConnector;
      const mockPullInput = fixture.mockPullInput;
      it("pull returns a Result with records[]", async () => {
        const r: Result<unknown, unknown> = await pull.pull(mockPullInput);
        expect("_tag" in r).toBe(true);
      });
    }

    if (connector.kind === "manual") {
      it("entrySchema is a Zod schema", () => {
        expect(connector.entrySchema).toBeDefined();
        expect(typeof connector.entrySchema.parse).toBe("function");
      });
    }
  });
}
