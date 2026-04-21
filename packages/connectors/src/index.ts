import { cloudflareAnalyticsConnector } from "./cloudflare-analytics";
import { manualFreeviewConnector } from "./manual-freeview";
import { manualSatelliteConnector } from "./manual-satellite";
import { registry, ConnectorRegistry } from "./registry";

registry.register(manualSatelliteConnector);
registry.register(manualFreeviewConnector);
registry.register(cloudflareAnalyticsConnector);

export {
  registry,
  ConnectorRegistry,
  manualSatelliteConnector,
  manualFreeviewConnector,
  cloudflareAnalyticsConnector,
};
export * from "./lib/errors";
export * from "./lib/period";
export * from "./lib/contract-suite";
