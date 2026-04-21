import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { serverApiFetch } from "$lib/server/api";

type SourceHealth = {
  id: string;
  sourceKey: string;
  sourceName: string;
  enabled: boolean;
  status: "active" | "error" | "paused";
  lastRunAt: string | null;
  lastError: string | null;
};

type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  definitions?: Record<string, JsonSchemaObject>;
  $ref?: string;
  [k: string]: unknown;
};

type Source = {
  key: string;
  name: string;
  kind: string;
  entrySchema?: JsonSchemaObject;
};

type HierarchyNode = {
  id: string;
  name: string;
  type: string;
  slug: string;
  parentId: string | null;
};

function resolveSchemaRef(schema: JsonSchemaObject): JsonSchemaObject {
  if (schema.$ref && schema.definitions) {
    const refKey = schema.$ref.replace("#/definitions/", "");
    const resolved = schema.definitions[refKey];
    if (resolved) {
      return { ...resolved, definitions: schema.definitions };
    }
  }
  return schema;
}

export const load: PageServerLoad = async ({ params, cookies }) => {
  const slug = params.tenant;

  const [hierarchyRes, sourcesRes, healthRes] = await Promise.all([
    serverApiFetch(`/tenants/${slug}/hierarchy`, { cookies }),
    serverApiFetch("/sources", { cookies }),
    serverApiFetch(`/tenants/${slug}/source-health`, { cookies }),
  ]);

  if (hierarchyRes.status === 401 || sourcesRes.status === 401 || healthRes.status === 401) {
    throw redirect(303, "/login");
  }

  if (!hierarchyRes.ok) {
    throw error(hierarchyRes.status, "Failed to load tenant hierarchy");
  }
  if (!sourcesRes.ok) {
    throw error(sourcesRes.status, "Failed to load sources");
  }
  if (!healthRes.ok) {
    throw error(healthRes.status, "Failed to load source health");
  }

  const hierarchyBody = (await hierarchyRes.json()) as { nodes: HierarchyNode[] };
  const sourcesBody = (await sourcesRes.json()) as { sources: Source[] };
  const healthBody = (await healthRes.json()) as { connectors: SourceHealth[] };

  const sourceMap = new Map<string, Source>(sourcesBody.sources.map((s) => [s.key, s]));

  const manualConnectors = healthBody.connectors
    .filter((cfg) => {
      const src = sourceMap.get(cfg.sourceKey);
      return src?.kind === "manual";
    })
    .map((cfg) => {
      const src = sourceMap.get(cfg.sourceKey)!;
      const rawSchema = src.entrySchema;
      const entrySchema = rawSchema ? resolveSchemaRef(rawSchema) : undefined;
      return {
        key: cfg.sourceKey,
        name: src.name,
        status: cfg.status,
        enabled: cfg.enabled,
        entrySchema,
      };
    });

  return {
    tenantSlug: slug,
    hierarchyNodes: hierarchyBody.nodes,
    manualConnectors,
  };
};

export const actions: Actions = {
  default: async ({ request, params, cookies }) => {
    const form = await request.formData();
    const connectorKey = String(form.get("connectorKey") ?? "");
    const payloadRaw = String(form.get("payload") ?? "{}");

    let entry: unknown;
    try {
      entry = JSON.parse(payloadRaw);
    } catch {
      return fail(400, { error: "Invalid payload" });
    }

    const res = await serverApiFetch(`/tenants/${params.tenant}/entries`, {
      cookies,
      method: "POST",
      body: { connectorKey, entry },
    });

    if (res.status === 401) {
      throw redirect(303, "/login");
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return fail(res.status, { error: body.error ?? "Failed to save entry" });
    }

    return { success: true };
  },
};
