import { z } from "zod";
import { MetricCategorySchema } from "./metric-category";
import { GranularitySchema } from "./granularity";

export const MetricRecordDraftSchema = z.object({
  hierarchyNodeId: z.string().uuid(),
  metricType: z.string().min(1).max(64),
  metricCategory: MetricCategorySchema,
  dimensions: z.record(z.string(), z.string()),
  periodStart: z.date(),
  periodEnd: z.date(),
  granularity: GranularitySchema,
  value: z.number().nonnegative(),
  unit: z.string().min(1).max(32),
});

export type MetricRecordDraft = z.infer<typeof MetricRecordDraftSchema>;
