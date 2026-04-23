<script lang="ts">
  import { ArrowIcon, Button, Chevron, Tree } from "@lwa/ui";
  import { buildHierarchyTree, type HierarchyNodeRecord, type TreeNode } from "$lib/hierarchy";

  let { data, form } = $props();

  const nodes = $derived(data.nodes as HierarchyNodeRecord[]);
  const tree = $derived(buildHierarchyTree(nodes));
  let selectedId = $state<string | null>(null);
  let createParentId = $state<string | null>(null);
  let renameId = $state<string | null>(null);
  let renameName = $state("");

  function handleSelect(node: TreeNode) {
    selectedId = node.id;
  }

  function handleCreateChild(node: TreeNode) {
    createParentId = node.id;
  }

  function handleRename(node: TreeNode) {
    renameId = node.id;
    renameName = node.name;
  }

  function handleArchive(node: TreeNode) {
    // Named `archiveForm` to avoid shadowing the `form` prop from $props()
    // above — important if we ever need both in the same scope.
    const archiveForm = document.getElementById(`archive-${node.id}`) as HTMLFormElement | null;
    archiveForm?.requestSubmit();
  }

  function resetCreateContext() {
    createParentId = null;
    selectedId = null;
  }

  function cancelRename() {
    renameId = null;
    renameName = "";
  }

  const selectedParentName = $derived(
    nodes.find((n) => n.id === createParentId)?.name ?? null,
  );
</script>

<!-- ──────────── Header ──────────── -->
<section class="rise">
  <div class="border-b border-hairline pb-8">
    <p class="eyebrow">Tenant hierarchy</p>
    <h1 class="font-display mt-3 text-6xl leading-[0.95] text-ink">
      Hierarchy
    </h1>
    <p class="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
      Model the structure of your network — stations, broadcast channels, and language
      streams — that every rollup metric will be attributed to.
    </p>
  </div>
</section>

<div class="mt-10 grid gap-10 rise rise-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
  <!-- ──────────── Tree ──────────── -->
  <section class="space-y-4">
    <div class="flex items-baseline justify-between">
      <h2 class="font-display text-2xl text-ink">Nodes</h2>
      <span class="eyebrow">{nodes.length} record{nodes.length === 1 ? "" : "s"}</span>
    </div>

    <Tree
      nodes={tree}
      {selectedId}
      onSelect={handleSelect}
      onCreateChild={handleCreateChild}
      onRename={handleRename}
      onArchive={handleArchive}
    />

    {#each nodes as node (node.id)}
      <form id={`archive-${node.id}`} method="POST" action="?/archive" class="hidden">
        <input type="hidden" name="id" value={node.id} />
      </form>
    {/each}
  </section>

  <!-- ──────────── Action panel ──────────── -->
  <aside class="space-y-10">
    <!-- Create -->
    <section class="border border-hairline bg-surface p-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="eyebrow">Create node</p>
          <h3 class="font-display mt-2 text-2xl text-ink">
            {#if selectedParentName}
              New child of <span class="font-display-italic">{selectedParentName}</span>
            {:else}
              New root node
            {/if}
          </h3>
        </div>
        {#if createParentId}
          <button
            type="button"
            onclick={resetCreateContext}
            class="group inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowIcon direction="left" />
            <span>Back to root</span>
          </button>
        {/if}
      </div>

      <form method="POST" action="?/create" class="mt-6 space-y-6">
        <input type="hidden" name="parentId" value={createParentId ?? ""} />

        <label class="block">
          <span class="eyebrow">Node name</span>
          <input
            name="name"
            required
            class="field-underline mt-2"
            placeholder="e.g. LW Europe"
          />
        </label>

        <label class="block">
          <span class="eyebrow">Slug</span>
          <input
            name="slug"
            required
            class="field-underline mt-2"
            placeholder="lw-europe"
          />
        </label>

        <label class="block">
          <span class="eyebrow">Type</span>
          <div class="relative mt-2">
            <select name="type" class="field-underline appearance-none pr-6">
              <option value="station">Station</option>
              <option value="broadcast_channel">Broadcast channel</option>
              <option value="language_channel">Language channel</option>
            </select>
            <Chevron class="absolute right-0 top-1/2 -translate-y-1/2" />
          </div>
        </label>

        <Button type="submit" variant="primary" size="md">
          <span>Create node</span>
          <ArrowIcon />
        </Button>
      </form>
    </section>

    <!-- Rename -->
    {#if renameId}
      <section class="border border-hairline bg-surface p-6">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="eyebrow">Rename node</p>
            <h3 class="font-display mt-2 text-2xl text-ink">Edit name</h3>
          </div>
          <button
            type="button"
            onclick={cancelRename}
            class="shrink-0 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted transition-colors hover:text-ink"
          >
            Cancel
          </button>
        </div>

        <form method="POST" action="?/rename" class="mt-6 space-y-6">
          <input type="hidden" name="id" value={renameId} />
          <label class="block">
            <span class="eyebrow">New name</span>
            <input
              name="name"
              bind:value={renameName}
              required
              class="field-underline mt-2"
            />
          </label>
          <Button type="submit" variant="secondary" size="md">Save name</Button>
        </form>
      </section>
    {/if}

    {#if form?.error}
      <p
        class="border-l-2 border-negative bg-negative/6 px-4 py-3 text-sm text-negative"
        role="alert"
      >
        {form.error}
      </p>
    {/if}
  </aside>
</div>
