import { describe, expectTypeOf, it } from "vitest";
import type {
  BackfillInput,
  ConnectorRuntimeConfig,
  PlatformAccountRuntime,
  PullInput,
} from "../src/source-connector";

describe("source-connector runtime types", () => {
  it("PullInput.config exposes the enriched runtime fields", () => {
    expectTypeOf<PullInput["config"]>().toEqualTypeOf<ConnectorRuntimeConfig>();
  });

  it("PullInput.account exposes runtime config when present", () => {
    expectTypeOf<PullInput["account"]>().toEqualTypeOf<PlatformAccountRuntime | null>();
  });

  it("BackfillInput extends PullInput with optional checkpoint", () => {
    expectTypeOf<BackfillInput>().toMatchTypeOf<PullInput & { checkpoint?: string }>();
  });
});
