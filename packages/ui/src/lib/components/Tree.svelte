<script lang="ts">
  import TreeItem, { type TreeNode } from "./TreeItem.svelte";

  let {
    nodes = [],
    selectedId = null,
    onSelect,
    onCreateChild,
    onRename,
    onArchive,
  }: {
    nodes?: TreeNode[];
    selectedId?: string | null;
    onSelect?: (node: TreeNode) => void;
    onCreateChild?: (node: TreeNode) => void;
    onRename?: (node: TreeNode) => void;
    onArchive?: (node: TreeNode) => void;
  } = $props();
</script>

{#if nodes.length === 0}
  <div
    class="flex flex-col items-center justify-center gap-3 border border-dashed border-hairline bg-surface px-6 py-16 text-center"
  >
    <p class="eyebrow">Empty tree</p>
    <p class="font-display text-2xl text-ink">No hierarchy nodes yet.</p>
    <p class="max-w-sm text-sm text-ink-muted">
      Create a root node to begin modelling stations, broadcast channels, and language
      streams for this tenant.
    </p>
  </div>
{:else}
  <ul class="space-y-3">
    {#each nodes as node (node.id)}
      <TreeItem
        {node}
        {selectedId}
        {onSelect}
        {onCreateChild}
        {onRename}
        {onArchive}
      />
    {/each}
  </ul>
{/if}
