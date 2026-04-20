import { z } from "zod";

export const GranularitySchema = z.enum(["hour", "day", "week", "month", "quarter"]);
export type Granularity = z.infer<typeof GranularitySchema>;
