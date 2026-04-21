// Namespaced export for callers that want `schema.metricRecord` etc.
export * as schema from "./schema";
// Flat re-export so callers can `import { metricRecord, tenant } from "@lwa/db"`.
// This is the preferred style for new consumers (services/ingestion, services/api).
export * from "./schema";
export { createDb, type Database } from "./client";
export { tenantRepo } from "./repositories/tenant";
export { hierarchyRepo } from "./repositories/hierarchy";
export { metricRecordRepo, hashDimensions, type MetricRecordDraft } from "./repositories/metric-record";
export { metricRollupRepo } from "./repositories/metric-rollup";
export { platformAccountRepo } from "./repositories/platform-account";
export { ingestionRunRepo } from "./repositories/ingestion-run";
export { connectorConfigRepo } from "./repositories/connector-config";
