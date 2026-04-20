import { describe, expect, it } from "vitest";
import { can, capabilitiesFor, type Role, type Capability } from "../src/permissions";

const ROLES = ["network_admin", "station_manager", "board_viewer", "analyst"] as const satisfies readonly Role[];

const CAPABILITIES = [
  "view_dashboard",
  "view_drill_down",
  "view_records_table",
  "export_csv",
  "export_pdf",
  "log_manual_entry",
  "override_metric",
  "reverse_override",
  "manage_connectors",
  "trigger_backfill",
  "invite_users",
  "edit_hierarchy",
  "change_tenant_settings",
  "view_audit_log",
] as const satisfies readonly Capability[];

/**
 * Expected matrix — duplicated from the source of truth so any silent
 * change in permissions.ts surfaces as a failing test (deliberate
 * double-bookkeeping of security-critical data).
 */
const EXPECTED: Record<Role, ReadonlySet<Capability>> = {
  network_admin: new Set<Capability>([...CAPABILITIES]),
  station_manager: new Set<Capability>([
    "view_dashboard",
    "view_drill_down",
    "view_records_table",
    "export_csv",
    "export_pdf",
    "log_manual_entry",
    "override_metric",
    "reverse_override",
    "trigger_backfill",
    "view_audit_log",
  ]),
  board_viewer: new Set<Capability>(["view_dashboard", "view_drill_down", "export_pdf"]),
  analyst: new Set<Capability>([
    "view_dashboard",
    "view_drill_down",
    "view_records_table",
    "export_csv",
    "export_pdf",
    "view_audit_log",
  ]),
};

describe("can(role, capability) — exhaustive 56-cell matrix", () => {
  for (const role of ROLES) {
    for (const cap of CAPABILITIES) {
      const expected = EXPECTED[role].has(cap);
      it(`${role} ${expected ? "can" : "cannot"} ${cap}`, () => {
        expect(can(role, cap)).toBe(expected);
      });
    }
  }
});

describe("capabilitiesFor(role)", () => {
  it.each(ROLES)("returns the expected set for %s", (role) => {
    expect(capabilitiesFor(role)).toEqual(EXPECTED[role]);
  });

  it("sizes match the design: 14/10/3/6", () => {
    expect(capabilitiesFor("network_admin").size).toBe(14);
    expect(capabilitiesFor("station_manager").size).toBe(10);
    expect(capabilitiesFor("board_viewer").size).toBe(3);
    expect(capabilitiesFor("analyst").size).toBe(6);
  });
});

describe("matrix coverage invariants", () => {
  it("every role entry is a subset of the full capability list", () => {
    for (const role of ROLES) {
      for (const cap of capabilitiesFor(role)) {
        expect(CAPABILITIES).toContain(cap);
      }
    }
  });

  it("network_admin has every declared capability (superset)", () => {
    const admin = capabilitiesFor("network_admin");
    for (const cap of CAPABILITIES) {
      expect(admin.has(cap)).toBe(true);
    }
  });
});
