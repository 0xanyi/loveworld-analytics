import { manualFreeviewConnector } from "./manual-freeview";
import { manualSatelliteConnector } from "./manual-satellite";
import { registry, ConnectorRegistry } from "./registry";

registry.register(manualSatelliteConnector);
registry.register(manualFreeviewConnector);

export { registry, ConnectorRegistry, manualSatelliteConnector, manualFreeviewConnector };
export * from "./lib/errors";
export * from "./lib/period";
export * from "./lib/contract-suite";
