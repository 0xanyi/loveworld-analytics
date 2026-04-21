import { randomUUID } from "node:crypto";
import { connectorConfig, createDb, hierarchyNode, ingestionRun, metricRollup, source, tenant, tenantMembership, user } from "@lwa/db";
import { eq, sql } from "drizzle-orm";

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

type RunSeed = {
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt: string;
  finishedAt?: string | null;
  periodStart: string;
  periodEnd: string;
  recordsWritten?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  warnings?: string[];
};

type ConnectorSeed = {
  key: string;
  status?: "active" | "error" | "paused";
  enabled?: boolean;
  lastError?: string | null;
  lastRunAt?: string | null;
  runs?: RunSeed[];
};

type TenantSeed = {
  name: string;
  slug: string;
  role: "network_admin" | "station_manager" | "board_viewer" | "analyst";
  scopeNodeKeys?: string[];
  hierarchy?: HierarchySeed[];
  metrics?: MetricSeed[];
  connectors?: ConnectorSeed[];
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

const tenantResults: Array<{ slug: string; tenantId: string; nodeIds: Record<string, string>; connectorIds: Record<string, string> }> = [];

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
    const now = new Date();
    const bucketStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
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

  const connectorIds: Record<string, string> = {};

  for (const connectorSeed of tenantSeed.connectors ?? []) {
    const [sourceRow] = await db.select().from(source).where(eq(source.key, connectorSeed.key));
    if (!sourceRow) throw new Error(`source not found for connector key: ${connectorSeed.key}`);

    const [configRow] = await db
      .insert(connectorConfig)
      .values({
        tenantId: tenantRow.id,
        sourceId: sourceRow.id,
        status: connectorSeed.status ?? "active",
        enabled: connectorSeed.enabled ?? true,
        lastError: connectorSeed.lastError ?? null,
        lastRunAt: connectorSeed.lastRunAt ? new Date(connectorSeed.lastRunAt) : null,
      })
      .returning();

    if (!configRow) throw new Error(`failed to create connector config for ${connectorSeed.key}`);
    connectorIds[connectorSeed.key] = configRow.id;

    for (const runSeed of connectorSeed.runs ?? []) {
      await db.insert(ingestionRun).values({
        connectorConfigId: configRow.id,
        status: runSeed.status,
        startedAt: new Date(runSeed.startedAt),
        finishedAt: runSeed.finishedAt ? new Date(runSeed.finishedAt) : null,
        periodStart: new Date(runSeed.periodStart),
        periodEnd: new Date(runSeed.periodEnd),
        recordsWritten: runSeed.recordsWritten ?? 0,
        errorCode: runSeed.errorCode ?? null,
        errorMessage: runSeed.errorMessage ?? null,
        warnings: runSeed.warnings ?? [],
      });
    }
  }

  tenantResults.push({ slug: tenantSeed.slug, tenantId: tenantRow.id, nodeIds, connectorIds });
}

console.log(JSON.stringify({ userId: existingUser.id, tenants: tenantResults, seedId: randomUUID() }));
