<script lang="ts">
  import ArrowIcon from "./ArrowIcon.svelte";
  import Button from "./Button.svelte";
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

      // Override options take precedence over schema enum — a caller that
      // supplies overrides for an enum-backed field expects *their* options
      // to drive both render and the default-selection fallback below.
      const overrideValues = node.override?.options?.map((option) => option.value);
      const options = overrideValues ?? node.enum;
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

  // Returns true if any leaf in the subtree holds a non-default value the
  // user could have produced:
  //   - string: non-empty
  //   - integer/number: any numeric value (coerce() only produces numbers
  //     from non-blank input, so `0` counts as user intent)
  //   - boolean: true (checkboxes default to false)
  //
  // Known limitation: enums auto-select their first option on mount, so an
  // optional group containing an enum-backed field will always look
  // "touched". No current P0 connector schema hits this case.
  function hasTouchedDescendant(
    data: Record<string, unknown>,
    props: Record<string, JsonSchemaProperty>,
  ): boolean {
    for (const [key, prop] of Object.entries(props)) {
      const value = data[key];
      if (prop.type === "object" && prop.properties && typeof value === "object" && value !== null) {
        if (hasTouchedDescendant(value as Record<string, unknown>, prop.properties)) return true;
      } else if (prop.type === "boolean") {
        if (value === true) return true;
      } else if (typeof value === "number") {
        return true;
      } else if (typeof value === "string" && value !== "") {
        return true;
      }
    }
    return false;
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
        // An optional object group with no user-touched descendants should
        // be omitted entirely — otherwise required/boolean children at
        // their defaults force the group to render in the payload.
        if (!required && !hasTouchedDescendant(value as Record<string, unknown>, prop.properties)) {
          continue;
        }
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

<form on:submit={handleSubmit} class="space-y-8">
  <FormFields nodes={renderNodes} {flat} />
  <Button type="submit" variant="primary" size="lg">
    <span>{submitLabel}</span>
    <ArrowIcon />
  </Button>
</form>
