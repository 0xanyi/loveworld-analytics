import type { Queue } from "bullmq";
import { connectorConfig, type Database } from "@lwa/db";

export interface SchedulerDeps {
  db: Database;
  pullQueue: Queue;
  logger: {
    info: (data: unknown, msg?: string) => void;
    error: (data: unknown, msg?: string) => void;
  };
  pollIntervalMs?: number;
}

export function startScheduler(deps: SchedulerDeps): { stop: () => Promise<void> } {
  const { db, pullQueue, logger, pollIntervalMs = 60_000 } = deps;
  let stopped = false;
  let inFlight = false;

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const rows = await db
        .select({
          id: connectorConfig.id,
          schedule: connectorConfig.schedule,
          enabled: connectorConfig.enabled,
          status: connectorConfig.status,
        })
        .from(connectorConfig);

      const desired = new Map<string, { configId: string; cron: string }>();
      for (const r of rows) {
        if (!r.enabled || r.status === "paused" || !r.schedule) continue;
        desired.set(`pull:${r.id}`, { configId: r.id, cron: r.schedule });
      }

      const existing = await pullQueue.getRepeatableJobs();

      for (const [name, cfg] of desired) {
        const matches = existing.filter((e) => e.name === name);
        const hasCurrent = matches.some((e) => e.pattern === cfg.cron);

        for (const e of matches) {
          if (e.pattern !== cfg.cron) {
            await pullQueue.removeRepeatableByKey(e.key);
          }
        }

        if (!hasCurrent) {
          await pullQueue.add(
            name,
            {
              connectorConfigId: cfg.configId,
              granularity: "hour",
            },
            {
              repeat: { pattern: cfg.cron },
              jobId: name,
              removeOnComplete: true,
            },
          );
        }
      }

      for (const e of existing) {
        if (e.name.startsWith("pull:") && !desired.has(e.name)) {
          await pullQueue.removeRepeatableByKey(e.key);
        }
      }

      logger.info({ active: desired.size }, "scheduler reconciled");
    } catch (err) {
      logger.error({ err }, "scheduler tick failed");
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const handle = setInterval(() => void tick(), pollIntervalMs);
  handle.unref?.();

  return {
    async stop() {
      stopped = true;
      clearInterval(handle);
    },
  };
}
