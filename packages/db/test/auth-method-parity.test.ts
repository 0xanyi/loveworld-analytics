import { describe, expectTypeOf, it } from "vitest";
import type { AuthMethod } from "@lwa/contracts";
import type { authMethodEnum } from "../src/schema/source";

/**
 * Parity guard: `@lwa/contracts.AuthMethod` (the platform-wide string union)
 * MUST match `@lwa/db.authMethodEnum` (the Postgres storage enum).
 *
 * If the two drift — e.g., someone adds `"magic_link"` to one and forgets the
 * other — this test fails to compile, surfacing the mismatch at typecheck time.
 */
describe("AuthMethod parity (contracts ↔ db)", () => {
  it("matches the db enum values", () => {
    type DbAuthMethod = (typeof authMethodEnum.enumValues)[number];
    expectTypeOf<AuthMethod>().toEqualTypeOf<DbAuthMethod>();
  });
});
