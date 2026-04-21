<script lang="ts">
  import FormFields from "./FormFields.svelte";
  import type { FieldOverride, RenderNode } from "./FormFields.svelte";

  type JsonSchemaProperty = {
    type: "string" | "integer" | "number" | "boolean" | "object";
    title?: string;
    enum?: string[];
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
  };

  type JsonSchema = {
    type: "object";
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
  };

  export let schema: JsonSchema;
  export let initialValue: Record<string, unknown> = {};
  export let overrides: Record<string, FieldOverride> = {};
  export let onSubmit: (data: Record<string, unknown>) => void;
  export let submitLabel: string = "Submit";

  // ── flat state (dotted paths → string | boolean) ─────────────────────────────
  type FlatValue = string | boolean;
  const flat: Record<string, FlatValue> = {};

  function initFlat(
    props: Record<string, JsonSchemaProperty>,
    init: Record<string, unknown>,
    prefix: string,
  ) {
    for (const [key, prop] of Object.entries(props)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (prop.type === "object" && prop.properties) {
        const nested = (init[key] as Record<string, unknown>) ?? {};
        initFlat(prop.properties, nested, path);
      } else if (prop.type === "boolean") {
        flat[path] = typeof init[key] === "boolean" ? (init[key] as boolean) : false;
      } else {
        flat[path] = init[key] !== undefined ? String(init[key]) : "";
      }
    }
  }

  if (schema.properties) {
    initFlat(schema.properties, initialValue, "");
  }

  // ── render tree ───────────────────────────────────────────────────────────────
  function collectNodes(
    props: Record<string, JsonSchemaProperty>,
    parentRequired: string[] | undefined,
    prefix: string,
  ): RenderNode[] {
    const nodes: RenderNode[] = [];
    for (const [key, prop] of Object.entries(props)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const required = parentRequired?.includes(key) ?? false;
      const label = (prop.title ?? key) + (required ? " *" : "");

      if (prop.type === "object" && prop.properties) {
        nodes.push({
          kind: "group",
          path,
          groupLabel: prop.title ?? key,
          children: collectNodes(prop.properties, prop.required, path),
        });
      } else {
        nodes.push({
          kind: "field",
          path,
          label,
          type: prop.type as "string" | "integer" | "number" | "boolean",
          enum: prop.enum,
          override: overrides[path] ?? overrides[key],
        });
      }
    }
    return nodes;
  }

  const renderNodes: RenderNode[] = schema.properties
    ? collectNodes(schema.properties, schema.required, "")
    : [];

  // Align select state with first visible option when no initialValue was given.
  function initSelectDefaults(nodes: RenderNode[]) {
    for (const node of nodes) {
      if (node.kind === "group") {
        initSelectDefaults(node.children);
      } else if (flat[node.path] === "") {
        if (node.enum && node.enum.length > 0) {
          flat[node.path] = node.enum[0]!;
        } else if (node.override && node.override.options.length > 0) {
          flat[node.path] = node.override.options[0]!.value;
        }
      }
    }
  }
  initSelectDefaults(renderNodes);

  // ── submission ────────────────────────────────────────────────────────────────
  function buildNested(paths: Record<string, FlatValue>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [dotPath, val] of Object.entries(paths)) {
      const parts = dotPath.split(".");
      let cur: Record<string, unknown> = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i]!;
        if (!(p in cur) || typeof cur[p] !== "object") cur[p] = {};
        cur = cur[p] as Record<string, unknown>;
      }
      cur[parts[parts.length - 1]!] = val;
    }
    return result;
  }

  function coerce(
    data: Record<string, unknown>,
    props: Record<string, JsonSchemaProperty>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(props)) {
      const v = data[key];
      if (prop.type === "integer" || prop.type === "number") {
        out[key] = v !== undefined && v !== "" ? Number(v) : v;
      } else if (prop.type === "object" && prop.properties && typeof v === "object" && v !== null) {
        out[key] = coerce(v as Record<string, unknown>, prop.properties);
      } else {
        out[key] = v;
      }
    }
    return out;
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    const nested = buildNested(flat);
    const coerced = schema.properties ? coerce(nested, schema.properties) : nested;
    onSubmit(coerced);
  }
</script>

<form on:submit={handleSubmit}>
  <FormFields nodes={renderNodes} {flat} />
  <button type="submit">{submitLabel}</button>
</form>
