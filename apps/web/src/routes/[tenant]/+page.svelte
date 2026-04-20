<script lang="ts">
  import { Card } from "@lwa/ui";
  let { data } = $props();
</script>

<Card>
  <h2 class="mb-2 text-xl font-semibold">Dashboard</h2>
  <p class="text-slate-600">
    Welcome to Loveworld Analytics. Phase 0 placeholder — real dashboard arrives in Phase 1.
  </p>
  <p class="mt-4 text-sm text-slate-500">Tenant: <code>{data.tenantSlug}</code></p>
</Card>
