import { z } from "zod";
import { MetricCategorySchema } from "./metric-category";
import { GranularitySchema } from "./granularity";

const MAX_DIMENSIONS = 20;
const MAX_DIMENSION_KEY_LENGTH = 64;
const MAX_DIMENSION_VALUE_LENGTH = 256;

export const MetricRecordDraftSchema = z
  .object({
    hierarchyNodeId: z.string().uuid(),
    metricType: z.string().min(1).max(64),
    metricCategory: MetricCategorySchema,
    dimensions: z
      .record(
        z.string().min(1).max(MAX_DIMENSION_KEY_LENGTH),
        z.string().max(MAX_DIMENSION_VALUE_LENGTH),
      )
      .refine((d) => Object.keys(d).length <= MAX_DIMENSIONS, {
        message: `dimensions may have at most ${MAX_DIMENSIONS} keys`,
      }),
    periodStart: z.date(),
    periodEnd: z.date(),
    granularity: GranularitySchema,
    // `.finite()` blocks Infinity/-Infinity/NaN; `.nonnegative()` blocks negatives
    // (but would allow Infinity on its own — hence the ordering).
    value: z.number().finite().nonnegative(),
    unit: z.string().min(1).max(32),
  })
  .refine((d) => d.periodStart <= d.periodEnd, {
    message: "periodStart must be <= periodEnd",
    path: ["periodEnd"],
  });

export type MetricRecordDraft = z.infer<typeof MetricRecordDraftSchema>;
