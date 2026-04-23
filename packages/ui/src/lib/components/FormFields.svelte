<script context="module" lang="ts">
  export type FieldOverride = {
    label?: string;
    options?: { value: string; label: string }[];
  };

  export type FieldNode = {
    kind: "field";
    path: string;
    label: string;
    type: "string" | "integer" | "number" | "boolean";
    enum?: string[];
    override?: FieldOverride;
  };

  export type GroupNode = {
    kind: "group";
    path: string;
    groupLabel: string;
    children: RenderNode[];
  };

  export type RenderNode = FieldNode | GroupNode;
</script>

<script lang="ts">
  import Chevron from "./Chevron.svelte";

  export let nodes: RenderNode[];
  export let flat: Record<string, string | boolean>;

  function getFlat(path: string): string | boolean {
    return flat[path] ?? "";
  }
</script>

<!--
  Editorial form field styling. Consumed by FormFromSchema, which renders
  in the manual-entry page. The <label>/<input> association is preserved
  via the `for`/`id` attributes so Playwright's `getByLabel(...)` anchors
  continue to resolve correctly.
-->
<div class="space-y-6">
  {#each nodes as node (node.path)}
    {#if node.kind === "group"}
      <fieldset
        class="border-t border-hairline pt-5 space-y-4 [&:first-child]:border-t-0 [&:first-child]:pt-0"
      >
        <legend class="eyebrow mb-3 px-0">
          {node.groupLabel}
        </legend>
        <svelte:self nodes={node.children} {flat} />
      </fieldset>
    {:else}
      {@const id = `field-${node.path}`}
      {#if node.type === "boolean"}
        <div class="flex items-center gap-3">
          <input
            {id}
            type="checkbox"
            checked={flat[node.path] === true}
            on:change={(e) => { flat[node.path] = (e.target as HTMLInputElement).checked; }}
            class="h-4 w-4 cursor-pointer border-hairline text-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <label for={id} class="cursor-pointer text-sm text-ink">{node.label}</label>
        </div>
      {:else if node.override?.options}
        <div>
          <label for={id} class="eyebrow">{node.label}</label>
          <div class="relative mt-2">
            <select
              {id}
              value={getFlat(node.path)}
              on:change={(e) => { flat[node.path] = (e.target as HTMLSelectElement).value; }}
              class="field-underline appearance-none pr-6"
            >
              {#each node.override.options as opt (opt.value)}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
            <Chevron class="absolute right-0 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      {:else if node.enum}
        <div>
          <label for={id} class="eyebrow">{node.label}</label>
          <div class="relative mt-2">
            <select
              {id}
              value={getFlat(node.path)}
              on:change={(e) => { flat[node.path] = (e.target as HTMLSelectElement).value; }}
              class="field-underline appearance-none pr-6"
            >
              {#each node.enum as opt (opt)}
                <option value={opt}>{opt}</option>
              {/each}
            </select>
            <Chevron class="absolute right-0 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      {:else}
        <div>
          <label for={id} class="eyebrow">{node.label}</label>
          <input
            {id}
            type={node.type === "integer" || node.type === "number" ? "number" : "text"}
            value={getFlat(node.path)}
            on:input={(e) => { flat[node.path] = (e.target as HTMLInputElement).value; }}
            class="field-underline mt-2"
          />
        </div>
      {/if}
    {/if}
  {/each}
</div>
