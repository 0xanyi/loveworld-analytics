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
  let flat: Record<string, FlatValue> = {};
  let renderNodes: RenderNode[] = [];

  function initFlat(
    target: Record<string, FlatValue>,
    props: Record<string, JsonSchemaProperty>,
    init: Record<string, unknown>,
    prefix: string,
  ) {
    for (const [key, prop] of Object.entries(props)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (prop.type === "object" && prop.properties) {
        const nested = (init[key] as Record<string, unknown>) ?? {};
        initFlat(target, prop.properties, nested, path);
      } else if (prop.type === "boolean") {
        target[path] = typeof init[key] === "boolean" ? (init[key] as boolean) : false;
      } else {
        target[path] = init[key] !== undefined ? String(init[key]) : "";
      }
    }
  }

  function createFlat(
    props: Record<string, JsonSchemaProperty> | undefined,
    init: Record<string, unknown>,
  ): Record<string, FlatValue> {
    if (!props) return {};

    const next: Record<string, FlatValue> = {};
    initFlat(next, props, init, "");
    return next;
  }

  // ── render tree ───────────────────────────────────────────────────────────────
  function collectNodes(
    props: Record<string, JsonSchemaProperty>,
    parentRequired: string[] | undefined,
    prefix: string,
    currentOverrides: Record<string, FieldOverride>,
  ): RenderNode[] {
    const nodes: RenderNode[] = [];
    for (const [key, prop] of Object.entries(props)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const override = currentOverrides[path] ?? currentOverrides[key];
      const required = parentRequired?.includes(key) ?? false;
      const baseLabel = override?.label ?? prop.title ?? key;
      const label = baseLabel + (required ? " *" : "");

      if (prop.type === "object" && prop.properties) {
        nodes.push({
          kind: "group",
          path,
          groupLabel: prop.title ?? key,
          children: collectNodes(prop.properties, prop.required, path, currentOverrides),
        });
      } else {
        nodes.push({
          kind: "field",
          path,
          label,
          type: prop.type as "string" | "integer" | "number" | "boolean",
          enum: prop.enum,
          override,
        });
      }
    }
    return nodes;
  }

  // Align select state with the first visible option when current state is empty or stale.
  function initSelectDefaults(nodes: RenderNode[], target: Record<string, FlatValue>) {
    for (const node of nodes) {
      if (node.kind === "group") {
        initSelectDefaults(node.children, target);
        continue;
      }

      const options = node.enum ?? node.override?.options?.map((option) => option.value);
      if (!options || options.length === 0) continue;

      const currentValue = target[node.path];
      if (typeof currentValue !== "string" || !options.includes(currentValue)) {
        target[node.path] = options[0]!;
      }
    }
  }

  $: renderNodes = schema.properties ? collectNodes(schema.properties, schema.required, "", overrides) : [];
  $: flat = createFlat(schema.properties, initialValue);
  $: initSelectDefaults(renderNodes, flat);

  // ── submission ────────────────────────────────────────────────────────────────
  // INVARIANT: property keys in the JSON Schema must not contain `.`.
  // `buildNested` uses `.` as the path separator to reconstruct the nested
  // payload from the flat state. A key like "foo.bar" at a single level
  // would collide with the nested "foo" → "bar" structure. All P0
  // connector schemas satisfy this invariant; add validation here if that
  // ever changes.
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

  function omitOptionalBlankFields(
    data: Record<string, unknown>,
    props: Record<string, JsonSchemaProperty>,
    parentRequired: string[] | undefined,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(props)) {
      const required = parentRequired?.includes(key) ?? false;
      const value = data[key];

      if (prop.type === "object" && prop.properties && typeof value === "object" && value !== null) {
        const nested = omitOptionalBlankFields(value as Record<string, unknown>, prop.properties, prop.required);
        if (required || Object.keys(nested).length > 0) {
          out[key] = nested;
        }
        continue;
      }

      if (required || prop.type === "boolean" || (value !== undefined && value !== "")) {
        out[key] = value;
      }
    }
    return out;
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    const nested = buildNested(flat);
    const coerced = schema.properties ? coerce(nested, schema.properties) : nested;
    const payload = schema.properties
      ? omitOptionalBlankFields(coerced, schema.properties, schema.required)
      : coerced;
    onSubmit(payload);
  }
</script>

<form on:submit={handleSubmit}>
  <FormFields nodes={renderNodes} {flat} />
  <button type="submit">{submitLabel}</button>
</form>
