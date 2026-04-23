<script lang="ts">
  import { ArrowIcon } from "@lwa/ui";
  import type { SourceHealth } from "$lib/types/source-health";

  let { data } = $props();

  const connectors = $derived(data.connectors as SourceHealth[]);
  const tenantSlug = $derived(data.tenantSlug as string);

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  }

  // Status glyph + label formatting. Colours come from CSS vars so the
  // palette stays consistent with the rest of the editorial system — no
  // ad-hoc bg-green-100 / text-red-700 pairs.
  const statusColor: Record<string, string> = {
    active: "var(--color-positive)",
    error: "var(--color-negative)",
    paused: "var(--color-warning)",
  };
</script>

<section class="rise">
  <div class="border-b border-hairline pb-8">
    <p class="eyebrow">Ingestion</p>
    <h1 class="font-display mt-3 text-6xl leading-[0.95] text-ink">
      Source health
    </h1>
    <p class="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
      Status of every connector configured for this tenant — including the most recent
      run, current state, and last surfaced error.
    </p>
  </div>
</section>

{#if connectors.length === 0}
  <section
    class="mt-12 flex flex-col items-center justify-center gap-3 border border-dashed border-hairline bg-surface px-8 py-20 text-center rise rise-1"
  >
    <p class="eyebrow">Empty register</p>
    <p class="font-display text-3xl text-ink">No sources configured.</p>
    <p class="max-w-md text-sm text-ink-muted">
      Configure a connector for this tenant to begin ingesting data into the rollup.
    </p>
  </section>
{:else}
  <section class="mt-10 border border-hairline bg-surface rise rise-1">
    <table class="w-full">
      <caption class="sr-only">
        Connectors configured for tenant {tenantSlug}, showing current status, state,
        last ingestion run, and most recent error for each source.
      </caption>
      <thead>
        <tr class="border-b border-hairline">
          <th scope="col" class="px-5 py-4 text-left eyebrow">Source</th>
          <th scope="col" class="px-5 py-4 text-left eyebrow">Key</th>
          <th scope="col" class="px-5 py-4 text-left eyebrow">Status</th>
          <th scope="col" class="px-5 py-4 text-left eyebrow">State</th>
          <th scope="col" class="px-5 py-4 text-left eyebrow">Last run</th>
          <th scope="col" class="px-5 py-4 text-left eyebrow">Last error</th>
          <th scope="col" class="px-5 py-4 text-right eyebrow" aria-label="Actions"></th>
        </tr>
      </thead>
      <tbody>
        {#each connectors as connector (connector.id)}
          <tr
            class="border-b border-hairline transition-colors last:border-b-0 hover:bg-ink/3"
          >
            <td class="px-5 py-5">
              <p class="font-display text-lg leading-tight text-ink">
                {connector.sourceName}
              </p>
            </td>
            <td class="px-5 py-5">
              <span class="font-mono text-[12px] text-ink-muted">{connector.sourceKey}</span>
            </td>
            <td class="px-5 py-5">
              <span
                class="inline-flex items-center gap-2 border border-hairline px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  style:background-color={statusColor[connector.status] ?? "var(--color-ink-muted)"}
                  aria-hidden="true"
                ></span>
                {connector.status}
              </span>
            </td>
            <td class="px-5 py-5">
              <span class="text-sm text-ink-muted">
                {connector.enabled ? "Enabled" : "Disabled"}
              </span>
            </td>
            <td class="px-5 py-5">
              <span class="font-mono text-[12px] text-ink-muted">
                {formatDate(connector.lastRunAt)}
              </span>
            </td>
            <td
              class="max-w-xs truncate px-5 py-5 text-sm text-ink-muted"
              title={connector.lastError ?? ""}
            >
              {connector.lastError ?? "—"}
            </td>
            <td class="px-5 py-5 text-right">
              <a
                href="/{tenantSlug}/sources/{connector.id}"
                class="group inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink transition-colors hover:text-brand-600"
                aria-label={`View ${connector.sourceName}`}
              >
                View
                <ArrowIcon />
              </a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <footer class="mt-10 flex items-center justify-between border-t border-hairline pt-6 text-[11px] uppercase tracking-[0.18em] text-ink-muted">
    <span>{tenantSlug}</span>
    <span class="font-mono">§ {connectors.length} connector{connectors.length === 1 ? "" : "s"}</span>
  </footer>
{/if}
