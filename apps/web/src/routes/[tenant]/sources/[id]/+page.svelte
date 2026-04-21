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

  type IngestionRun = {
    id: string;
    status: "pending" | "running" | "success" | "failed" | "skipped";
    startedAt: string;
    finishedAt: string | null;
    periodStart: string;
    periodEnd: string;
    recordsWritten: number;
    errorCode: string | null;
    errorMessage: string | null;
    warnings: string[];
  };

  const connector = $derived(data.connector as SourceHealth);
  const runs = $derived(data.runs as IngestionRun[]);
  const tenantSlug = $derived(data.tenantSlug as string);

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString();
  }

  const statusClass: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    paused: "bg-yellow-100 text-yellow-700",
    success: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    running: "bg-blue-100 text-blue-700",
    pending: "bg-slate-100 text-slate-600",
    skipped: "bg-slate-100 text-slate-600",
  };
</script>

<div class="space-y-6">
  <div class="flex items-center gap-3">
    <a
      href="/{tenantSlug}/sources"
      class="text-sm font-medium text-blue-600 hover:underline"
    >
      ← Back to sources
    </a>
  </div>

  <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <h1 class="text-2xl font-semibold text-slate-950">{connector.sourceName}</h1>
    <p class="mt-1 font-mono text-sm text-slate-500">{connector.sourceKey}</p>

    <dl class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div>
        <dt class="text-xs font-medium text-slate-500">Status</dt>
        <dd class="mt-1">
          <span
            class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {statusClass[connector.status] ?? 'bg-slate-100 text-slate-600'}"
          >
            {connector.status}
          </span>
        </dd>
      </div>
      <div>
        <dt class="text-xs font-medium text-slate-500">State</dt>
        <dd class="mt-1 text-sm text-slate-800">{connector.enabled ? "Enabled" : "Disabled"}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium text-slate-500">Last run</dt>
        <dd class="mt-1 text-sm text-slate-800">{formatDate(connector.lastRunAt)}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium text-slate-500">Last error</dt>
        <dd class="mt-1 text-sm text-slate-800">{connector.lastError ?? "—"}</dd>
      </div>
    </dl>
  </div>

  <section>
    <h2 class="mb-3 text-lg font-semibold text-slate-800">Recent runs</h2>

    {#if runs.length === 0}
      <p class="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
        No runs recorded yet for this connector.
      </p>
    {:else}
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full text-sm">
          <thead class="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium">Started</th>
              <th class="px-4 py-3 font-medium">Finished</th>
              <th class="px-4 py-3 font-medium">Records</th>
              <th class="px-4 py-3 font-medium">Warnings</th>
              <th class="px-4 py-3 font-medium">Error</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#each runs as run (run.id)}
              <tr class="hover:bg-slate-50">
                <td class="px-4 py-3">
                  <span
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {statusClass[run.status] ?? 'bg-slate-100 text-slate-600'}"
                  >
                    {run.status}
                  </span>
                </td>
                <td class="px-4 py-3 text-slate-600">{formatDate(run.startedAt)}</td>
                <td class="px-4 py-3 text-slate-600">{formatDate(run.finishedAt)}</td>
                <td class="px-4 py-3 text-slate-800">{run.recordsWritten}</td>
                <td class="px-4 py-3 text-slate-600">{run.warnings.length}</td>
                <td class="px-4 py-3 max-w-xs truncate text-slate-500">
                  {run.errorMessage ?? "—"}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
