import { randomUUID } from "node:crypto";
import { createDb, hierarchyNode, metricRollup, tenant, tenantMembership, user } from "@lwa/db";
import { sql } from "drizzle-orm";

type HierarchySeed = {
  key: string;
  type: "station" | "broadcast_channel" | "language_channel";
  name: string;
  slug: string;
  parentKey?: string;
};

type MetricSeed = {
  hierarchyKey: string;
  category: "tv_households" | "web_visitors";
  effectiveTotal: number;
  rawTotal?: number;
  sourceBreakdown: Record<string, number>;
  hasAdjustments?: boolean;
};

type TenantSeed = {
  name: string;
  slug: string;
  role: "network_admin" | "station_manager" | "board_viewer" | "analyst";
  scopeNodeKeys?: string[];
  hierarchy?: HierarchySeed[];
  metrics?: MetricSeed[];
};

type Input = {
  email: string;
  tenants: TenantSeed[];
};

const raw = process.argv[2];
if (!raw) throw new Error("missing seed json argument");

const input = JSON.parse(raw) as Input;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const db = createDb(databaseUrl);
const normalizedEmail = input.email.toLowerCase();

const existingUser = await db.query.user.findFirst({
  where: sql`lower(${user.email}) = ${normalizedEmail}`,
});

if (!existingUser) {
  throw new Error(`user not found for ${input.email}`);
}

const tenantResults: Array<{ slug: string; tenantId: string; nodeIds: Record<string, string> }> = [];

for (const tenantSeed of input.tenants) {
  const [tenantRow] = await db
    .insert(tenant)
    .values({ name: tenantSeed.name, slug: tenantSeed.slug })
    .returning();

  if (!tenantRow) throw new Error(`failed to create tenant ${tenantSeed.slug}`);

  const nodeIds: Record<string, string> = {};

  for (const nodeSeed of tenantSeed.hierarchy ?? []) {
    const [row] = await db
      .insert(hierarchyNode)
      .values({
        tenantId: tenantRow.id,
        type: nodeSeed.type,
        name: nodeSeed.name,
        slug: nodeSeed.slug,
        parentId: nodeSeed.parentKey ? nodeIds[nodeSeed.parentKey] : null,
      })
      .returning();

    if (!row) throw new Error(`failed to create node ${nodeSeed.key}`);
    nodeIds[nodeSeed.key] = row.id;
  }

  const scopeNodeIds = (tenantSeed.scopeNodeKeys ?? []).map((key) => {
    const nodeId = nodeIds[key];
    if (!nodeId) throw new Error(`missing scope node key: ${key}`);
    return nodeId;
  });

  await db.insert(tenantMembership).values({
    userId: existingUser.id,
    tenantId: tenantRow.id,
    role: tenantSeed.role,
    scopeNodeIds,
  });

  for (const metricSeed of tenantSeed.metrics ?? []) {
    const bucketStart = new Date(Date.UTC(2026, 3, 20));
    const hierarchyNodeId = nodeIds[metricSeed.hierarchyKey];
    if (!hierarchyNodeId) {
      throw new Error(`missing metric hierarchy key: ${metricSeed.hierarchyKey}`);
    }

    await db.insert(metricRollup).values({
      tenantId: tenantRow.id,
      hierarchyNodeId,
      metricCategory: metricSeed.category,
      granularity: "day",
      bucketStart,
      effectiveTotal: String(metricSeed.effectiveTotal),
      rawTotal: String(metricSeed.rawTotal ?? metricSeed.effectiveTotal),
      recordCount: 1,
      sourceBreakdown: metricSeed.sourceBreakdown,
      hasAdjustments: metricSeed.hasAdjustments ?? false,
    });
  }

  tenantResults.push({ slug: tenantSeed.slug, tenantId: tenantRow.id, nodeIds });
}

console.log(JSON.stringify({ userId: existingUser.id, tenants: tenantResults, seedId: randomUUID() }));
