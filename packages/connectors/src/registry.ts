import type { SourceConnector } from "@lwa/contracts";

/**
 * Registry of SourceConnector implementations, keyed by connector.key.
 * Phase 1: concrete connectors register themselves here from this shared
 * package so both the API and worker can import the same implementations.
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

export const registry = new ConnectorRegistry();
