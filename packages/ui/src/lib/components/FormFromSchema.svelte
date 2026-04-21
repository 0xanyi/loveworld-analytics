<script lang="ts">
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

  type FieldOverride = {
    options: { value: string; label: string }[];
  };

  export let schema: JsonSchema;
  export let initialValue: Record<string, unknown> = {};
  export let overrides: Record<string, FieldOverride> = {};
  export let onSubmit: (data: Record<string, unknown>) => void;
  export let submitLabel: string = "Submit";

  // Flat state: dotted paths -> string | boolean
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

  function isRequired(key: string, req: string[] | undefined): boolean {
    return req?.includes(key) ?? false;
  }

  // Reactive helper to get/set flat values
  function getFlat(path: string): FlatValue {
    return flat[path] ?? "";
  }
</script>

<form on:submit={handleSubmit}>
  {#if schema.properties}
    {#each Object.entries(schema.properties) as [key, prop]}
      {@const path = key}
      {@const required = isRequired(key, schema.required)}
      {@const label = (prop.title ?? key) + (required ? " *" : "")}
      {@const id = `field-${path}`}

      {#if prop.type === "object" && prop.properties}
        <fieldset>
          <legend>{prop.title ?? key}</legend>
          {#each Object.entries(prop.properties) as [childKey, childProp]}
            {@const childPath = `${path}.${childKey}`}
            {@const childRequired = isRequired(childKey, prop.required)}
            {@const childLabel = (childProp.title ?? childKey) + (childRequired ? " *" : "")}
            {@const childId = `field-${childPath}`}
            <div>
              <label for={childId}>{childLabel}</label>
              <input
                id={childId}
                type="text"
                value={getFlat(childPath)}
                on:input={(e) => { flat[childPath] = (e.target as HTMLInputElement).value; }}
              />
            </div>
          {/each}
        </fieldset>
      {:else if prop.type === "boolean"}
        <div>
          <label for={id}>{label}</label>
          <input
            id={id}
            type="checkbox"
            checked={flat[path] === true}
            on:click={() => { flat[path] = !(flat[path] === true); }}
          />
        </div>
      {:else if prop.enum}
        <div>
          <label for={id}>{label}</label>
          <select
            id={id}
            value={getFlat(path)}
            on:change={(e) => { flat[path] = (e.target as HTMLSelectElement).value; }}
          >
            {#each prop.enum as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </div>
      {:else if overrides[key]?.options}
        <div>
          <label for={id}>{label}</label>
          <select
            id={id}
            value={getFlat(path)}
            on:change={(e) => { flat[path] = (e.target as HTMLSelectElement).value; }}
          >
            {#each overrides[key]!.options as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
      {:else}
        <div>
          <label for={id}>{label}</label>
          <input
            id={id}
            type={prop.type === "integer" || prop.type === "number" ? "number" : "text"}
            value={getFlat(path)}
            on:input={(e) => { flat[path] = (e.target as HTMLInputElement).value; }}
          />
        </div>
      {/if}
    {/each}
  {/if}

  <button type="submit">{submitLabel}</button>
</form>
