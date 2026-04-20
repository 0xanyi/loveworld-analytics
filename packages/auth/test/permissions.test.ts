import { describe, expect, it } from "vitest";
import { can, type Role, type Capability } from "../src/permissions";

describe("can(role, capability)", () => {
  const matrix: Array<[Role, Capability, boolean]> = [
    ["network_admin", "view_dashboard", true],
    ["network_admin", "manage_connectors", true],
    ["network_admin", "invite_users", true],
    ["station_manager", "view_dashboard", true],
    ["station_manager", "log_manual_entry", true],
    ["station_manager", "override_metric", true],
    ["station_manager", "manage_connectors", false],
    ["station_manager", "invite_users", false],
    ["board_viewer", "view_dashboard", true],
    ["board_viewer", "export_pdf", true],
    ["board_viewer", "view_records_table", false],
    ["board_viewer", "log_manual_entry", false],
    ["analyst", "view_dashboard", true],
    ["analyst", "view_records_table", true],
    ["analyst", "export_csv", true],
    ["analyst", "log_manual_entry", false],
    ["analyst", "override_metric", false],
  ];

  for (const [role, capability, expected] of matrix) {
    it(`${role} ${expected ? "can" : "cannot"} ${capability}`, () => {
      expect(can(role, capability)).toBe(expected);
    });
  }
});
