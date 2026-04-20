import type { SourceConnector } from "@lwa/contracts";

/**
 * Registry of SourceConnector implementations, keyed by connector.key.
 * Phase 0: empty. Phase 1+: connectors register themselves here at worker boot.
 */
export class ConnectorRegistry {
  private readonly map = new Map<string, SourceConnector>();

  register(connector: SourceConnector): void {
    if (this.map.has(connector.key)) {
      throw new Error(`Connector '${connector.key}' is already registered`);
    }
    this.map.set(connector.key, connector);
  }

  get(key: string): SourceConnector | undefined {
    return this.map.get(key);
  }

  all(): SourceConnector[] {
    return Array.from(this.map.values());
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  size(): number {
    return this.map.size;
  }
}

// Shared singleton for the worker process. Tests should construct their own
// ConnectorRegistry instead of mutating this one.
export const registry = new ConnectorRegistry();
