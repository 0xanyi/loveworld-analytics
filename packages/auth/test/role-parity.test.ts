import { describe, expectTypeOf, it } from "vitest";
import type { Role } from "../src/permissions";
import type { roleEnum } from "@lwa/db/schema";

/**
 * Parity guard: `@lwa/auth.Role` (the permission-matrix key type) MUST
 * match `@lwa/db.roleEnum` (the Postgres storage enum).
 *
 * If the two drift — e.g., someone adds a new role to the pgEnum but not
 * the matrix — this test fails to compile. Without it, `MATRIX[role].has(cap)`
 * would throw "Cannot read properties of undefined" at request time for any
 * user carrying the missing role.
 */
describe("Role parity (auth ↔ db)", () => {
  it("matches the db enum values", () => {
    type DbRole = (typeof roleEnum.enumValues)[number];
    expectTypeOf<Role>().toEqualTypeOf<DbRole>();
  });
});
