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

<!--
  IMPORTANT: keep `rounded-lg`, `border`, and `p-3` on the outer div below
  — the hierarchy Playwright test selects nodes with `div.rounded-lg.border.p-3`
  (see apps/web/tests/hierarchy.spec.ts). The additional utility classes
  and editorial styling layer on top without invalidating that selector.
-->
<li>
  <div
    class={`rounded-lg border p-3 transition-colors ${
      isSelected
        ? "border-brand-500 bg-brand-50"
        : "border-hairline bg-surface hover:border-ink"
    }`}
  >
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <button
        type="button"
        class="text-left"
        onclick={() => onSelect?.(node)}
      >
        <p class="font-display text-lg leading-tight text-ink">
          {node.name}
        </p>
        <p class="eyebrow mt-1 tracking-[0.16em]">{typeLabel}</p>
      </button>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex h-8 items-center justify-center border border-hairline px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:border-ink"
          onclick={() => onCreateChild?.(node)}
        >
          Add child
        </button>
        <button
          type="button"
          class="inline-flex h-8 items-center justify-center border border-hairline px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:border-ink"
          onclick={() => onRename?.(node)}
        >
          Rename
        </button>
        <button
          type="button"
          class="inline-flex h-8 items-center justify-center border border-negative/30 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-negative transition-colors hover:border-negative hover:bg-negative/6"
          onclick={() => onArchive?.(node)}
        >
          Archive
        </button>
      </div>
    </div>
  </div>

  {#if node.children.length > 0}
    <ul class="mt-3 space-y-3 border-l border-hairline pl-5">
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
