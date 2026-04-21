import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { serverApiFetch } from "$lib/server/api";
import { findDefaultHierarchyNodeId, type DashboardTile, type HierarchyNodeRecord } from "$lib/hierarchy";

const VALID_PERIODS = new Set(["week", "month", "quarter", "ytd"]);
const VALID_COMPARISONS = new Set(["yoy", "qoq", "mom", "none"]);

export const load: PageServerLoad = async ({ params, cookies, url }) => {
  const period = VALID_PERIODS.has(url.searchParams.get("period") ?? "")
    ? (url.searchParams.get("period") as "week" | "month" | "quarter" | "ytd")
    : "week";
  const comparison = VALID_COMPARISONS.has(url.searchParams.get("comparison") ?? "")
    ? (url.searchParams.get("comparison") as "yoy" | "qoq" | "mom" | "none")
    : "none";

  const hierarchyRes = await serverApiFetch(`/tenants/${params.tenant}/hierarchy`, { cookies });
  if (!hierarchyRes.ok) {
    error(hierarchyRes.status, "Failed to load tenant hierarchy");
  }

  const hierarchyBody = (await hierarchyRes.json()) as { nodes: HierarchyNodeRecord[] };
  const selectedNodeId = url.searchParams.get("hierarchyNodeId") ?? findDefaultHierarchyNodeId(hierarchyBody.nodes);

  if (!selectedNodeId) {
    return {
      tenantSlug: params.tenant,
      hierarchyNodes: hierarchyBody.nodes,
      selectedNodeId: null,
      period,
      comparison,
      tiles: [],
    };
  }

  const query = new URLSearchParams({
    hierarchyNodeId: selectedNodeId,
    period,
    granularity: "day",
    comparison,
  });

  const metricsRes = await serverApiFetch(`/tenants/${params.tenant}/metrics/board?${query.toString()}`, {
    cookies,
  });

  if (!metricsRes.ok) {
    error(metricsRes.status, "Failed to load dashboard metrics");
  }

  const metricsBody = (await metricsRes.json()) as { tiles: DashboardTile[] };

  return {
    tenantSlug: params.tenant,
    hierarchyNodes: hierarchyBody.nodes,
    selectedNodeId,
    period,
    comparison,
    tiles: metricsBody.tiles,
  };
};
