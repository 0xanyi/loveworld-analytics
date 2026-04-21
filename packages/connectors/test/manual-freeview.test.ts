import { runConnectorContract } from "../src/lib/contract-suite";
import { manualFreeviewConnector } from "../src/manual-freeview";

runConnectorContract(manualFreeviewConnector, {
  validCredentials: {},
  invalidCredentials: {},
});
