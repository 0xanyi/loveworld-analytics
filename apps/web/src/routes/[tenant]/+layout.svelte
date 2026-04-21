<script lang="ts">
  let { children, data } = $props();
</script>

<div class="mx-auto max-w-6xl px-6 py-8">
  <header class="mb-8">
    <p class="text-sm text-slate-500">Tenant</p>
    <h1 class="text-2xl font-semibold">{data.tenantSlug}</h1>
    <nav class="mt-4 flex gap-4 text-sm">
      <a href="/{data.tenantSlug}" class="text-slate-600 hover:text-slate-900">Dashboard</a>
      <a href="/{data.tenantSlug}/entry" class="text-slate-600 hover:text-slate-900">Manual entry</a>
      <a href="/{data.tenantSlug}/sources" class="text-slate-600 hover:text-slate-900">Source health</a>
      <a href="/{data.tenantSlug}/settings/hierarchy" class="text-slate-600 hover:text-slate-900">Hierarchy</a>
    </nav>
  </header>
  {@render children()}
</div>
