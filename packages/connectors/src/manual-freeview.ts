import { z } from "zod";
import { ok, type ManualConnector } from "@lwa/contracts";

export const manualFreeviewEntrySchema = z
  .object({
    hierarchyNodeId: z.string().uuid(),
    period: z
      .object({
        start: z.coerce.date(),
        end: z.coerce.date(),
      })
      .refine((p) => p.start < p.end, "start must be before end"),
    householdsReached: z.number().int().positive(),
    estimationMethod: z.enum(["barb", "internal_estimate"]),
    barbWeekNumber: z.number().int().min(1).max(53).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

export type ManualFreeviewEntry = z.infer<typeof manualFreeviewEntrySchema>;

export const manualFreeviewConnector: ManualConnector = {
  key: "manual_freeview",
  name: "Freeview Viewership (Manual)",
  category: "tv_households",
  kind: "manual",
  authMethod: "none",
  credentialsSchema: z.object({}).strict(),
  supportedGranularities: ["week", "month"],
  entrySchema: manualFreeviewEntrySchema,
  validateCredentials: async () => ok(undefined),
};
