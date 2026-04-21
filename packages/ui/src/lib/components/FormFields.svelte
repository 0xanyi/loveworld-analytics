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
  export let nodes: RenderNode[];
  export let flat: Record<string, string | boolean>;

  function getFlat(path: string): string | boolean {
    return flat[path] ?? "";
  }
</script>

{#each nodes as node}
  {#if node.kind === "group"}
    <fieldset>
      <legend>{node.groupLabel}</legend>
      <svelte:self nodes={node.children} {flat} />
    </fieldset>
  {:else}
    {@const id = `field-${node.path}`}
    {#if node.type === "boolean"}
      <div>
        <label for={id}>{node.label}</label>
        <input
          {id}
          type="checkbox"
          checked={flat[node.path] === true}
          on:change={(e) => { flat[node.path] = (e.target as HTMLInputElement).checked; }}
        />
      </div>
    {:else if node.enum}
      <div>
        <label for={id}>{node.label}</label>
        <select
          {id}
          value={getFlat(node.path)}
          on:change={(e) => { flat[node.path] = (e.target as HTMLSelectElement).value; }}
        >
          {#each node.enum as opt}
            <option value={opt}>{opt}</option>
          {/each}
        </select>
      </div>
    {:else if node.override?.options}
      <div>
        <label for={id}>{node.label}</label>
        <select
          {id}
          value={getFlat(node.path)}
          on:change={(e) => { flat[node.path] = (e.target as HTMLSelectElement).value; }}
        >
          {#each node.override.options as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
    {:else}
      <div>
        <label for={id}>{node.label}</label>
        <input
          {id}
          type={node.type === "integer" || node.type === "number" ? "number" : "text"}
          value={getFlat(node.path)}
          on:input={(e) => { flat[node.path] = (e.target as HTMLInputElement).value; }}
        />
      </div>
    {/if}
  {/if}
{/each}
