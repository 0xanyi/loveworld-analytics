import { Hono } from "hono";
import { registry } from "@lwa/connectors";
import { zodToJsonSchema } from "zod-to-json-schema";

export function sourcesRoutes(): Hono {
  const app = new Hono();

  app.get("/sources", (c) => {
    return c.json({
      sources: registry.all().map((conn) => ({
        key: conn.key,
        name: conn.name,
        category: conn.category,
        authMethod: conn.authMethod,
        kind: conn.kind,
        supportedGranularities: conn.supportedGranularities,
        credentialsSchema: zodToJsonSchema(conn.credentialsSchema, { name: "creds" }),
        entrySchema:
          conn.kind === "manual" ? zodToJsonSchema(conn.entrySchema, { name: "entry" }) : undefined,
      })),
    });
  });

  return app;
}
