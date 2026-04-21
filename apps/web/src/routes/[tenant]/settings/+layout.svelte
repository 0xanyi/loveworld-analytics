<script lang="ts">
  let { children, data } = $props();
</script>

<div class="space-y-6">
  <nav class="flex flex-wrap gap-3 border-b border-slate-200 pb-4 text-sm font-medium">
    <a class="rounded-md bg-slate-100 px-3 py-2 text-slate-800" href={`/${data.tenantSlug}/settings/hierarchy`}>
      Hierarchy
    </a>
  </nav>

  {@render children()}
</div>
