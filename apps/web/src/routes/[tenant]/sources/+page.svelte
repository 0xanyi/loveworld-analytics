<script lang="ts">
  let { data } = $props();

  type SourceHealth = {
    id: string;
    sourceKey: string;
    sourceName: string;
    enabled: boolean;
    status: "active" | "error" | "paused";
    lastRunAt: string | null;
    lastError: string | null;
  };

  const connectors = $derived(data.connectors as SourceHealth[]);
  const tenantSlug = $derived(data.tenantSlug as string);

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  }

  const statusClass: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    paused: "bg-yellow-100 text-yellow-700",
  };
</script>

<div class="space-y-6">
  <h1 class="text-2xl font-semibold text-slate-950">Source health</h1>

  {#if connectors.length === 0}
    <p class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">
      No sources configured for this tenant.
    </p>
  {:else}
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table class="w-full text-sm">
        <thead class="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3 font-medium">Source</th>
            <th class="px-4 py-3 font-medium">Key</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">State</th>
            <th class="px-4 py-3 font-medium">Last run</th>
            <th class="px-4 py-3 font-medium">Last error</th>
            <th class="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each connectors as connector (connector.id)}
            <tr class="hover:bg-slate-50">
              <td class="px-4 py-3 font-medium text-slate-800">{connector.sourceName}</td>
              <td class="px-4 py-3 font-mono text-xs text-slate-500">{connector.sourceKey}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {statusClass[connector.status] ?? 'bg-slate-100 text-slate-600'}"
                >
                  {connector.status}
                </span>
              </td>
              <td class="px-4 py-3 text-slate-600">
                {connector.enabled ? "Enabled" : "Disabled"}
              </td>
              <td class="px-4 py-3 text-slate-500">{formatDate(connector.lastRunAt)}</td>
              <td class="px-4 py-3 max-w-xs truncate text-slate-500">
                {connector.lastError ?? "—"}
              </td>
              <td class="px-4 py-3">
                <a
                  href="/{tenantSlug}/sources/{connector.id}"
                  class="text-sm font-medium text-blue-600 hover:underline"
                >
                  View
                </a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
