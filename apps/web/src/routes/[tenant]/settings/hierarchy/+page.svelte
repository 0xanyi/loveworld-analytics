<script lang="ts">
  import { Tree } from "@lwa/ui";
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
    const form = document.getElementById(`archive-${node.id}`) as HTMLFormElement | null;
    form?.requestSubmit();
  }
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
  <section class="space-y-4">
    <div>
      <h2 class="text-2xl font-semibold text-slate-950">Hierarchy</h2>
      <p class="mt-2 text-slate-600">Create and manage tenant hierarchy nodes.</p>
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

  <section class="space-y-6">
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 class="text-lg font-semibold text-slate-950">Create node</h3>
      <form method="POST" action="?/create" class="mt-4 space-y-4">
        <input type="hidden" name="parentId" value={createParentId ?? ""} />

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Node name</span>
          <input
            name="name"
            required
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="e.g. LW Europe"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Slug</span>
          <input
            name="slug"
            required
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="lw-europe"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Type</span>
          <select name="type" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
            <option value="station">Station</option>
            <option value="broadcast_channel">Broadcast channel</option>
            <option value="language_channel">Language channel</option>
          </select>
        </label>

        <button type="submit" class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white">
          Create node
        </button>
      </form>
    </div>

    {#if renameId}
      <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 class="text-lg font-semibold text-slate-950">Rename node</h3>
        <form method="POST" action="?/rename" class="mt-4 space-y-4">
          <input type="hidden" name="id" value={renameId} />
          <label class="block">
            <span class="text-sm font-medium text-slate-700">New name</span>
            <input name="name" bind:value={renameName} required class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <button type="submit" class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Save name
          </button>
        </form>
      </div>
    {/if}

    {#if form?.error}
      <p class="text-sm text-red-600" role="alert">{form.error}</p>
    {/if}
  </section>
</div>
