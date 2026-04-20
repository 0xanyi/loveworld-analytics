import { z } from "zod";

export const MetricCategorySchema = z.enum([
  "tv_households",
  "web_visitors",
  "streaming",
  "social_reach",
  "engagement",
]);

export type MetricCategory = z.infer<typeof MetricCategorySchema>;
