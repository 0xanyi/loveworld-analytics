<script module lang="ts">
  export type TreeNode = {
    id: string;
    name: string;
    type: string;
    parentId: string | null;
    children: TreeNode[];
  };
</script>

<script lang="ts">
  import TreeItem from "./TreeItem.svelte";
  let {
    node,
    selectedId = null,
    onSelect,
    onCreateChild,
    onRename,
    onArchive,
  }: {
    node: TreeNode;
    selectedId?: string | null;
    onSelect?: (node: TreeNode) => void;
    onCreateChild?: (node: TreeNode) => void;
    onRename?: (node: TreeNode) => void;
    onArchive?: (node: TreeNode) => void;
  } = $props();

  const isSelected = $derived(selectedId === node.id);
  const typeLabel = $derived(node.type.replaceAll("_", " "));
</script>

<li>
  <div class={`rounded-lg border p-3 ${isSelected ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}>
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <button
        type="button"
        class="text-left"
        onclick={() => onSelect?.(node)}
      >
        <div class="font-medium text-slate-900">{node.name}</div>
        <div class="text-sm capitalize text-slate-500">{typeLabel}</div>
      </button>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="rounded-md bg-slate-100 px-2.5 py-1 text-sm" onclick={() => onCreateChild?.(node)}>
          Add child
        </button>
        <button type="button" class="rounded-md bg-slate-100 px-2.5 py-1 text-sm" onclick={() => onRename?.(node)}>
          Rename
        </button>
        <button type="button" class="rounded-md bg-red-50 px-2.5 py-1 text-sm text-red-700" onclick={() => onArchive?.(node)}>
          Archive
        </button>
      </div>
    </div>
  </div>

  {#if node.children.length > 0}
    <ul class="mt-3 space-y-3 border-l border-slate-200 pl-4">
      {#each node.children as child (child.id)}
        <TreeItem
          node={child}
          {selectedId}
          {onSelect}
          {onCreateChild}
          {onRename}
          {onArchive}
        />
      {/each}
    </ul>
  {/if}
</li>
