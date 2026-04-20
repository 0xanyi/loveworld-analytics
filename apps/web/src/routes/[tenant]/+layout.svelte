<script lang="ts">
  let { children, data } = $props();
</script>

<div class="mx-auto max-w-6xl px-6 py-8">
  <header class="mb-8">
    <p class="text-sm text-slate-500">Tenant</p>
    <h1 class="text-2xl font-semibold">{data.tenantSlug}</h1>
  </header>
  {@render children()}
</div>
