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
  <p class="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
    No hierarchy nodes yet.
  </p>
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
