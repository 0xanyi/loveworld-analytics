import { runConnectorContract } from "../src/lib/contract-suite";
import { manualSatelliteConnector } from "../src/manual-satellite";

runConnectorContract(manualSatelliteConnector, {
  validCredentials: {},
  invalidCredentials: {},
});
