// Registry now lives in @lwa/connectors. Keeping this file as a re-export so
// that worker.ts import paths don't need touching until Task 4.
export { registry, ConnectorRegistry } from "@lwa/connectors";
