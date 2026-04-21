import type { Job, Queue } from "bullmq";
import type IORedis from "ioredis";
import { and, eq, inArray } from "drizzle-orm";
import { isErr, type ConnectorError, type PullInput } from "@lwa/contracts";
import { classifyNetworkError, type ConnectorRegistry } from "@lwa/connectors";
import type { KekProvider } from "@lwa/crypto";
import {
  connectorConfig,
  connectorConfigRepo,
  hierarchyNode,
  ingestionRunRepo,
  metricRecordRepo,
  platformAccountRepo,
  source,
  type Database,
} from "@lwa/db";
import type { PullJobData, RollupRefreshJobData } from "../queues";
import { RateLimiter } from "../lib/rate-limiter";
import { toBucketStart } from "../lib/rollup-debounce";

export interface PullHandlerDeps {
  db: Database;
  registry: ConnectorRegistry;
  kek: KekProvider;
  rollupQueue: Queue<RollupRefreshJobData>;
  redis: IORedis;
  logger: {
    info: (data: unknown, msg?: string) => void;
    warn: (data: unknown, msg?: string) => void;
    error: (data: unknown, msg?: string) => void;
  };
  rollupDelayMs?: number;
}

export function createPullHandler(deps: PullHandlerDeps) {
  const { db, registry, kek, rollupQueue, redis, logger, rollupDelayMs = 30_000 } = deps;

  const records = metricRecordRepo(db);
  const runs = ingestionRunRepo(db);
  const accountsRepo = platformAccountRepo(db);
  const configs = connectorConfigRepo(db, kek);

  const limiters = new Map<string, RateLimiter>();
  const limiterForSource = (sourceKey: string) => {
    const existing = limiters.get(sourceKey);
    if (existing) return existing;
    const created = new RateLimiter(redis, `ingestion:source:${sourceKey}`, 10, 10);
    limiters.set(sourceKey, created);
    return created;
  };

  return async function pullHandler(job: Job<PullJobData>): Promise<void> {
    const t0 = Date.now();
    const { connectorConfigId, granularity } = job.data;

    const [cfg] = await db.select().from(connectorConfig).where(eq(connectorConfig.id, connectorConfigId));
    if (!cfg) throw new Error(`connector_config ${connectorConfigId} not found`);

    const [src] = await db.select().from(source).where(eq(source.id, cfg.sourceId));
    if (!src) throw new Error(`source ${cfg.sourceId} not found`);

    const connector = registry.get(src.key);
    if (!connector) throw new Error(`connector ${src.key} not registered`);
    if (connector.kind !== "pull") throw new Error(`connector ${src.key} is not pull`);

    const period = resolvePeriodWindow(job.data);

    const run = await runs.start({
      connectorConfigId,
      periodStart: period.start,
      periodEnd: period.end,
      jobId: job.id?.toString(),
    });

    let finished = false;
    let totalWritten = 0;

    const finishRun = async (input: {
      status: "success" | "failed" | "skipped";
      recordsWritten: number;
      errorCode?: string;
      errorMessage?: string;
      warnings?: string[];
    }) => {
      if (finished) return;
      await runs.finish(run.id, {
        ...input,
        durationMs: Date.now() - t0,
      });
      finished = true;
    };

    try {
      const credentials =
        cfg.credentialsCiphertext && cfg.credentialsKekVersion
          ? await configs.readCredentials(cfg.id)
          : {};

      const accounts = await accountsRepo.listByConnector(cfg.tenantId, cfg.sourceId);
      if (accounts.length === 0) {
        logger.warn({ configId: cfg.id }, "no platform accounts — nothing to pull");
        await finishRun({ status: "skipped", recordsWritten: 0 });
        return;
      }

      const warnings: string[] = [];
      const affected = new Set<string>();

      for (const account of accounts) {
        const input: PullInput = {
          config: {
            id: cfg.id,
            tenantId: cfg.tenantId,
            sourceId: cfg.sourceId,
            sourceKey: src.key,
            credentials,
            schedule: cfg.schedule,
          },
          account: {
            id: account.id,
            externalId: account.externalId,
            hierarchyNodeId: account.hierarchyNodeId,
            config: account.config,
          },
          period: {
            start: period.start,
            end: period.end,
            granularity,
          },
          context: {
            tenantId: cfg.tenantId,
            logger: {
              info: (msg, data) => logger.info(data ?? {}, msg),
              warn: (msg, data) => logger.warn(data ?? {}, msg),
              error: (msg, data) => logger.error(data ?? {}, msg),
            },
            rateLimiter: limiterForSource(src.key),
          },
        };

        let result;
        try {
          result = await connector.pull(input);
        } catch (err) {
          const ce: ConnectorError = classifyNetworkError(err);
          await finishRun({
            status: "failed",
            recordsWritten: totalWritten,
            errorCode: ce.code,
            errorMessage: ce.message,
          });
          if (!ce.retryable) {
            await db
              .update(connectorConfig)
              .set({ status: "error", lastError: ce.message })
              .where(eq(connectorConfig.id, cfg.id));
            return;
          }
          throw err;
        }

        if (isErr(result)) {
          const ce = result.error;
          await finishRun({
            status: "failed",
            recordsWritten: totalWritten,
            errorCode: ce.code,
            errorMessage: ce.message,
          });
          if (!ce.retryable) {
            const nextStatus = ce.code === "AUTH_INVALID" || ce.code === "AUTH_EXPIRED" ? "paused" : "error";
            await db
              .update(connectorConfig)
              .set({ status: nextStatus, lastError: ce.message })
              .where(eq(connectorConfig.id, cfg.id));
            return;
          }
          throw new Error(ce.message);
        }

        if (result.value.warnings) warnings.push(...result.value.warnings);

        const nodeIds = [...new Set(result.value.records.map((r) => r.hierarchyNodeId))];
        if (nodeIds.length > 0) {
          const ownedNodes = await db
            .select({ id: hierarchyNode.id })
            .from(hierarchyNode)
            .where(and(eq(hierarchyNode.tenantId, cfg.tenantId), inArray(hierarchyNode.id, nodeIds)));

          if (ownedNodes.length !== nodeIds.length) {
            const owned = new Set(ownedNodes.map((n) => n.id));
            const invalidHierarchyNodeIds = nodeIds.filter((id) => !owned.has(id));
            const message = `connector returned hierarchy nodes outside tenant boundary: ${invalidHierarchyNodeIds.join(",")}`;

            await finishRun({
              status: "failed",
              recordsWritten: totalWritten,
              errorCode: "TENANT_BOUNDARY_VIOLATION",
              errorMessage: message,
            });
            await db
              .update(connectorConfig)
              .set({ status: "error", lastError: message })
              .where(eq(connectorConfig.id, cfg.id));
            return;
          }
        }

        const drafts = result.value.records.map((r) => ({
          tenantId: cfg.tenantId,
          sourceId: cfg.sourceId,
          connectorConfigId: cfg.id,
          platformAccountId: account.id,
          hierarchyNodeId: r.hierarchyNodeId,
          metricType: r.metricType,
          metricCategory: r.metricCategory,
          dimensions: r.dimensions,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          granularity: r.granularity,
          rawValue: String(r.value),
          unit: r.unit,
          provenance: `connector:${cfg.id}`,
        }));

        const { written } = await records.upsertMany(drafts);
        totalWritten += written;

        for (const r of result.value.records) {
          const rollupGranularity = mapToRollupGranularity(r.granularity);
          const bucketStart = toBucketStart(r.periodStart, rollupGranularity).toISOString();
          affected.add(
            [r.hierarchyNodeId, r.metricCategory, rollupGranularity, r.granularity, bucketStart].join("|"),
          );
        }

        await accountsRepo.updateLastSynced(account.id);
      }

      await db
        .update(connectorConfig)
        .set({ lastRunAt: new Date(), status: "active", lastError: null })
        .where(eq(connectorConfig.id, cfg.id));

      await finishRun({
        status: "success",
        recordsWritten: totalWritten,
        warnings: warnings.length ? warnings : undefined,
      });

      for (const key of affected) {
        const [hierarchyNodeId, metricCategory, rollupGranularity, recordGranularity, bucketStart] =
          key.split("|");

        if (
          !hierarchyNodeId ||
          !metricCategory ||
          !rollupGranularity ||
          !recordGranularity ||
          !bucketStart
        ) {
          logger.error({ key }, "invalid affected rollup key");
          continue;
        }

        await rollupQueue.add(
          "refresh",
          {
            tenantId: cfg.tenantId,
            hierarchyNodeId,
            metricCategory,
            granularity: rollupGranularity,
            recordGranularity,
            bucketStart,
          } as RollupRefreshJobData,
          {
            delay: rollupDelayMs,
            jobId: `rollup-${cfg.tenantId}-${hierarchyNodeId}-${metricCategory}-${rollupGranularity}-${recordGranularity}-${bucketStart.replace(/[:.]/g, "-")}`,
            removeOnComplete: true,
          },
        );
      }
    } catch (err) {
      await finishRun({
        status: "failed",
        recordsWritten: totalWritten,
        errorCode: "TRANSIENT",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      logger.error({ err, connectorConfigId }, "pull handler unexpected error");
      throw err;
    }
  };
}

function resolvePeriodWindow(data: PullJobData): { start: Date; end: Date } {
  if ((data.periodStart && !data.periodEnd) || (!data.periodStart && data.periodEnd)) {
    throw new Error("periodStart and periodEnd must be provided together");
  }

  if (data.periodStart && data.periodEnd) {
    const start = new Date(data.periodStart);
    const end = new Date(data.periodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("invalid periodStart/periodEnd");
    }
    if (start >= end) {
      throw new Error("periodStart must be before periodEnd");
    }
    return { start, end };
  }

  const now = new Date();
  const end = new Date(now);

  switch (data.granularity) {
    case "hour": {
      end.setUTCMinutes(0, 0, 0);
      const start = new Date(end);
      start.setUTCHours(start.getUTCHours() - 1);
      return { start, end };
    }
    case "day": {
      end.setUTCHours(0, 0, 0, 0);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 1);
      return { start, end };
    }
    case "week": {
      end.setUTCHours(0, 0, 0, 0);
      const dow = (end.getUTCDay() + 6) % 7;
      end.setUTCDate(end.getUTCDate() - dow);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 7);
      return { start, end };
    }
    case "month": {
      end.setUTCHours(0, 0, 0, 0);
      end.setUTCDate(1);
      const start = new Date(end);
      start.setUTCMonth(start.getUTCMonth() - 1);
      return { start, end };
    }
    case "quarter": {
      end.setUTCHours(0, 0, 0, 0);
      end.setUTCDate(1);
      const month = end.getUTCMonth();
      end.setUTCMonth(month - (month % 3));
      const start = new Date(end);
      start.setUTCMonth(start.getUTCMonth() - 3);
      return { start, end };
    }
    default:
      throw new Error(`unsupported granularity: ${String(data.granularity)}`);
  }
}

function mapToRollupGranularity(g: PullJobData["granularity"]): RollupRefreshJobData["granularity"] {
  if (g === "hour") return "day";
  if (g === "day" || g === "week" || g === "month" || g === "quarter") return g;
  throw new Error(`unsupported granularity for rollup: ${g}`);
}
