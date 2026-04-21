import { z } from "zod";
import { ok, type ManualConnector } from "@lwa/contracts";

export const manualSatelliteEntrySchema = z
  .object({
    hierarchyNodeId: z.string().uuid(),
    period: z
      .object({
        start: z.coerce.date(),
        end: z.coerce.date(),
      })
      .refine((p) => p.start < p.end, "start must be before end"),
    householdsReached: z.number().int().positive(),
    estimationMethod: z.enum(["panel", "operator_report", "internal_estimate"]),
    sourceDocumentUrl: z.string().url().optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

export type ManualSatelliteEntry = z.infer<typeof manualSatelliteEntrySchema>;

export const manualSatelliteConnector: ManualConnector = {
  key: "manual_satellite",
  name: "Satellite Viewership (Manual)",
  category: "tv_households",
  kind: "manual",
  authMethod: "none",
  credentialsSchema: z.object({}).strict(),
  supportedGranularities: ["week", "month"],
  entrySchema: manualSatelliteEntrySchema,
  validateCredentials: async () => ok(undefined),
};
