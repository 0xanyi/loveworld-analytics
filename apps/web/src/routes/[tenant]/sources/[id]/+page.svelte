<script lang="ts">
  import { ArrowIcon } from "@lwa/ui";
  import type { IngestionRun, SourceHealth } from "$lib/types/source-health";

  let { data } = $props();

  const connector = $derived(data.connector as SourceHealth);
  const runs = $derived(data.runs as IngestionRun[]);
  const tenantSlug = $derived(data.tenantSlug as string);

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString();
  }

  const statusColor: Record<string, string> = {
    active: "var(--color-positive)",
    error: "var(--color-negative)",
    paused: "var(--color-warning)",
    success: "var(--color-positive)",
    failed: "var(--color-negative)",
    running: "var(--color-brand-500)",
    pending: "var(--color-ink-muted)",
    skipped: "var(--color-ink-muted)",
  };
</script>

<nav class="rise" aria-label="Breadcrumb">
  <a
    href="/{tenantSlug}/sources"
    class="group inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted transition-colors hover:text-ink"
  >
    <ArrowIcon direction="left" />
    Back to sources
  </a>
</nav>

<!-- ──────────── Connector masthead ──────────── -->
<section class="mt-6 rise rise-1">
  <div class="border-b border-hairline pb-8">
    <p class="eyebrow">Connector</p>
    <h1 class="font-display mt-3 text-5xl leading-[0.98] text-ink">
      {connector.sourceName}
    </h1>
    <p class="font-mono mt-3 text-[13px] text-ink-muted">{connector.sourceKey}</p>
  </div>

  <dl class="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
    <div>
      <dt class="eyebrow">Status</dt>
      <dd class="mt-2 flex items-center gap-2">
        <span
          class="h-1.5 w-1.5 rounded-full"
          style:background-color={statusColor[connector.status] ?? "var(--color-ink-muted)"}
          aria-hidden="true"
        ></span>
        <span class="text-[13px] uppercase tracking-[0.14em] text-ink">
          {connector.status}
        </span>
      </dd>
    </div>
    <div>
      <dt class="eyebrow">State</dt>
      <dd class="mt-2 text-[15px] text-ink">{connector.enabled ? "Enabled" : "Disabled"}</dd>
    </div>
    <div>
      <dt class="eyebrow">Last run</dt>
      <dd class="font-mono mt-2 text-[13px] text-ink">{formatDate(connector.lastRunAt)}</dd>
    </div>
    <div>
      <dt class="eyebrow">Last error</dt>
      <dd class="mt-2 truncate text-[13px] text-ink" title={connector.lastError ?? ""}>
        {connector.lastError ?? "—"}
      </dd>
    </div>
  </dl>
</section>

<!-- ──────────── Recent runs ──────────── -->
<section class="mt-12 rise rise-2">
  <div class="flex items-baseline justify-between">
    <h2 class="font-display text-2xl text-ink">Recent runs</h2>
    <span class="eyebrow">{runs.length} record{runs.length === 1 ? "" : "s"}</span>
  </div>

  {#if runs.length === 0}
    <div
      class="mt-6 flex flex-col items-center justify-center gap-2 border border-dashed border-hairline bg-surface px-6 py-16 text-center"
    >
      <p class="eyebrow">Quiet ledger</p>
      <p class="font-display text-2xl text-ink">No runs recorded yet.</p>
      <p class="max-w-sm text-sm text-ink-muted">
        Once the scheduler picks up this connector, completed and failed runs will be
        listed here.
      </p>
    </div>
  {:else}
    <div class="mt-6 border border-hairline bg-surface">
      <table class="w-full">
        <caption class="sr-only">
          Recent ingestion runs for connector {connector.sourceName} — status, timing,
          records written, warnings, and errors for each run.
        </caption>
        <thead>
          <tr class="border-b border-hairline">
            <th scope="col" class="px-5 py-4 text-left eyebrow">Status</th>
            <th scope="col" class="px-5 py-4 text-left eyebrow">Started</th>
            <th scope="col" class="px-5 py-4 text-left eyebrow">Finished</th>
            <th scope="col" class="px-5 py-4 text-right eyebrow">Records</th>
            <th scope="col" class="px-5 py-4 text-right eyebrow">Warnings</th>
            <th scope="col" class="px-5 py-4 text-left eyebrow">Error</th>
          </tr>
        </thead>
        <tbody>
          {#each runs as run (run.id)}
            <tr class="border-b border-hairline last:border-b-0 hover:bg-ink/3">
              <td class="px-5 py-4">
                <span class="inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-ink">
                  <span
                    class="h-1.5 w-1.5 rounded-full"
                    style:background-color={statusColor[run.status] ?? "var(--color-ink-muted)"}
                    aria-hidden="true"
                  ></span>
                  {run.status}
                </span>
              </td>
              <td class="px-5 py-4 font-mono text-[12px] text-ink-muted">{formatDate(run.startedAt)}</td>
              <td class="px-5 py-4 font-mono text-[12px] text-ink-muted">{formatDate(run.finishedAt)}</td>
              <td class="px-5 py-4 text-right font-mono text-[13px] num text-ink">{run.recordsWritten}</td>
              <td class="px-5 py-4 text-right font-mono text-[13px] num text-ink-muted">{run.warnings.length}</td>
              <td class="max-w-xs truncate px-5 py-4 text-[12px] text-ink-muted" title={run.errorMessage ?? ""}>
                {run.errorMessage ?? "—"}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
