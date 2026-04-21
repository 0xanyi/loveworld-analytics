import { z } from "zod";
import { ok, type ConnectorError, type PullConnector, type PullResult, type Result } from "@lwa/contracts";

export const stubPullConnector: PullConnector = {
  key: "_stub_pull",
  name: "Stub Pull",
  category: "web_visitors",
  kind: "pull",
  authMethod: "none",
  credentialsSchema: z.object({}),
  supportedGranularities: ["day"],
  validateCredentials: async () => ok(undefined),
  pull: async (input): Promise<Result<PullResult, ConnectorError>> => {
    return ok({
      records: [
        {
          hierarchyNodeId: input.account!.hierarchyNodeId,
          metricType: "page_views",
          metricCategory: "web_visitors",
          dimensions: {},
          periodStart: input.period.start,
          periodEnd: input.period.end,
          granularity: input.period.granularity,
          value: 42,
          unit: "count",
        },
      ],
    });
  },
};
