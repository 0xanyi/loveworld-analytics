import { eq, sql } from "drizzle-orm";
import { openCredentials, sealCredentials, type KekProvider } from "@lwa/crypto";
import type { Database } from "../client";
import { connectorConfig, type ConnectorConfig } from "../schema";

export interface ConnectorConfigRepo {
  create(input: {
    tenantId: string;
    sourceId: string;
    schedule: string;
    credentials: unknown;
  }): Promise<ConnectorConfig>;
  readCredentials<T>(configId: string): Promise<T>;
  listForScheduler(): Promise<Array<ConnectorConfig & { sourceKey: string }>>;
}

export function connectorConfigRepo(db: Database, kek: KekProvider): ConnectorConfigRepo {
  return {
    async create({ tenantId, sourceId, schedule, credentials }) {
      const sealed = await sealCredentials(credentials, kek);
      const [row] = await db
        .insert(connectorConfig)
        .values({
          tenantId,
          sourceId,
          schedule,
          credentialsCiphertext: sealed.ciphertext,
          credentialsKekVersion: sealed.kekVersion,
        })
        .returning();

      if (!row) {
        throw new Error(
          `connectorConfigRepo.create: insert returned no row for (tenant=${tenantId}, source=${sourceId})`,
        );
      }

      return row;
    },

    async readCredentials<T>(configId: string): Promise<T> {
      const [row] = await db
        .select({
          credentialsCiphertext: connectorConfig.credentialsCiphertext,
          credentialsKekVersion: connectorConfig.credentialsKekVersion,
        })
        .from(connectorConfig)
        .where(eq(connectorConfig.id, configId));

      if (!row) throw new Error(`connector_config ${configId} not found`);
      if (!row.credentialsCiphertext || !row.credentialsKekVersion) {
        throw new Error(`connector_config ${configId} has no credentials`);
      }

      return openCredentials<T>(
        {
          ciphertext: row.credentialsCiphertext,
          kekVersion: row.credentialsKekVersion,
        },
        kek,
      );
    },

    async listForScheduler() {
      return db.execute<ConnectorConfig & { sourceKey: string }>(sql`
        SELECT
          cc.id,
          cc.tenant_id AS "tenantId",
          cc.source_id AS "sourceId",
          cc.credentials_ciphertext AS "credentialsCiphertext",
          cc.credentials_kek_version AS "credentialsKekVersion",
          cc.schedule,
          cc.enabled,
          cc.status,
          cc.last_run_at AS "lastRunAt",
          cc.last_error AS "lastError",
          cc.created_at AS "createdAt",
          s.key AS "sourceKey"
        FROM connector_config cc
        JOIN source s ON s.id = cc.source_id
        WHERE cc.enabled = TRUE AND cc.status != 'paused'
      `);
    },
  };
}
