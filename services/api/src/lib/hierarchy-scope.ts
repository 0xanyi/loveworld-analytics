import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@lwa/db";
import { hierarchyNode } from "@lwa/db";

/**
 * Returns true when `nodeId` is inside the subtree rooted at any of
 * `scopeNodeIds`. Empty scope means tenant-wide access (no restriction).
 *
 * Archived nodes are excluded from the hierarchy graph before traversal.
 * Consequence: if any ancestor on the path from `nodeId` up to its scope
 * root is archived, the path is broken and the check returns `false`,
 * even if an unarchived scope root exists further up. This matches how
 * archival is used as a soft-delete gate elsewhere in the API (archived
 * nodes are also hidden from list / read endpoints).
 *
 * Cross-tenant safety: the function only loads nodes owned by `tenantId`,
 * so a `nodeId` belonging to another tenant always returns `false`.
 */
export async function isNodeInScope(
  db: Database,
  tenantId: string,
  scopeNodeIds: string[],
  nodeId: string,
): Promise<boolean> {
  const checks = await areNodesInScope(db, tenantId, scopeNodeIds, [nodeId]);
  return checks[0] ?? false;
}

/**
 * Batch variant of scope checking. Result array is aligned with `nodeIds` order.
 */
export async function areNodesInScope(
  db: Database,
  tenantId: string,
  scopeNodeIds: string[],
  nodeIds: string[],
): Promise<boolean[]> {
  if (nodeIds.length === 0) return [];

  const rows = await db
    .select({ id: hierarchyNode.id, parentId: hierarchyNode.parentId })
    .from(hierarchyNode)
    .where(and(eq(hierarchyNode.tenantId, tenantId), isNull(hierarchyNode.archivedAt)));

  const byId = new Map(rows.map((r) => [r.id, r.parentId]));

  // Empty scope means tenant-wide access — but only for nodes that actually
  // belong to `tenantId`. A cross-tenant `nodeId` must never be in scope,
  // even under empty-scope (tenant-wide) access. This is defense in depth;
  // downstream queries already filter by tenant, but we do not rely on that.
  if (scopeNodeIds.length === 0) {
    return nodeIds.map((id) => byId.has(id));
  }

  if (rows.length === 0) return nodeIds.map(() => false);

  const scope = new Set(scopeNodeIds);

  const isSingleNodeInScope = (nodeId: string): boolean => {
    if (!byId.has(nodeId)) return false;

    let cursor: string | null | undefined = nodeId;
    const visited = new Set<string>();

    while (cursor) {
      if (scope.has(cursor)) return true;
      if (visited.has(cursor)) break;
      visited.add(cursor);
      cursor = byId.get(cursor) ?? null;
    }

    return false;
  };

  return nodeIds.map((nodeId) => isSingleNodeInScope(nodeId));
}
