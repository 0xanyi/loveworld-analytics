export type HierarchyNodeRecord = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
};

export type TreeNode = HierarchyNodeRecord & {
  children: TreeNode[];
};

export type DashboardTile = {
  category: string;
  current: number;
  prior: number;
  deltaPct: number | null;
  sparkline: Array<{ t: string | Date; v: number }>;
  sourceBreakdown: Record<string, number>;
  hasAdjustments: boolean;
};

export function buildHierarchyTree(nodes: HierarchyNodeRecord[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();

  for (const node of nodes) {
    byId.set(node.id, {
      ...node,
      children: [],
    });
  }

  const roots: TreeNode[] = [];

  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function findDefaultHierarchyNodeId(nodes: HierarchyNodeRecord[]): string | null {
  const station = nodes.find((node) => node.type === "station");
  return station?.id ?? nodes[0]?.id ?? null;
}
