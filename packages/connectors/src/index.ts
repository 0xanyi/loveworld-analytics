import { cloudflareAnalyticsConnector } from "./cloudflare-analytics";
import { ga4Connector } from "./ga4";
import { manualFreeviewConnector } from "./manual-freeview";
import { manualSatelliteConnector } from "./manual-satellite";
import { registry, ConnectorRegistry } from "./registry";

registry.register(manualSatelliteConnector);
registry.register(manualFreeviewConnector);
registry.register(cloudflareAnalyticsConnector);
registry.register(ga4Connector);

export {
  registry,
  ConnectorRegistry,
  manualSatelliteConnector,
  manualFreeviewConnector,
  cloudflareAnalyticsConnector,
  ga4Connector,
};
export * from "./lib/errors";
export * from "./lib/period";
export * from "./lib/contract-suite";
