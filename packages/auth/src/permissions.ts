export type Role = "network_admin" | "station_manager" | "board_viewer" | "analyst";

export type Capability =
  | "view_dashboard"
  | "view_drill_down"
  | "view_records_table"
  | "export_csv"
  | "export_pdf"
  | "log_manual_entry"
  | "override_metric"
  | "reverse_override"
  | "manage_connectors"
  | "view_source_health"
  | "trigger_backfill"
  | "invite_users"
  | "edit_hierarchy"
  | "change_tenant_settings"
  | "view_audit_log";

const MATRIX: Record<Role, ReadonlySet<Capability>> = {
  network_admin: new Set<Capability>([
    "view_dashboard",
    "view_drill_down",
    "view_records_table",
    "export_csv",
    "export_pdf",
    "log_manual_entry",
    "override_metric",
    "reverse_override",
    "manage_connectors",
    "view_source_health",
    "trigger_backfill",
    "invite_users",
    "edit_hierarchy",
    "change_tenant_settings",
    "view_audit_log",
  ]),
  station_manager: new Set<Capability>([
    "view_dashboard",
    "view_drill_down",
    "view_records_table",
    "export_csv",
    "export_pdf",
    "log_manual_entry",
    "override_metric",
    "reverse_override",
    "view_source_health",
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

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].has(capability);
}

export function capabilitiesFor(role: Role): ReadonlySet<Capability> {
  return MATRIX[role];
}
