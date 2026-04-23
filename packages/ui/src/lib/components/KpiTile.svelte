<script lang="ts">
  import Sparkline, { type SparklinePoint } from "./Sparkline.svelte";
  import { deltaTone, formatCompactValue, formatDeltaPct } from "./KpiTile";

  let {
    label,
    value,
    deltaPct = null,
    sparkline = [],
    sourceChips = [],
    hasAdjustments = false,
    unit = "",
  }: {
    label: string;
    value: number;
    deltaPct?: number | null;
    sparkline?: SparklinePoint[];
    sourceChips?: string[];
    hasAdjustments?: boolean;
    unit?: string;
  } = $props();

  const displayValue = $derived(formatCompactValue(value, unit));
  const deltaLabel = $derived(formatDeltaPct(deltaPct));
  const toneClass = $derived(deltaTone(deltaPct));
  const arrow = $derived(deltaPct === null ? "" : deltaPct >= 0 ? "↑" : "↓");
</script>

<!-- KPI tile as editorial "plate": the numeral is the hero. Everything else
     (label, delta, sparkline, source chips) is subordinate metadata arranged
     around it with hairline rules and small-caps typography. -->
<article
  class="group relative flex h-full flex-col justify-between border border-hairline bg-surface p-7 transition-colors duration-200 hover:border-ink"
>
  <header class="flex items-start justify-between gap-4">
    <p class="eyebrow">{label}</p>
    {#if hasAdjustments}
      <span
        class="inline-flex items-center gap-1.5 border border-brand-500/40 bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-brand-700"
      >
        <span class="h-1 w-1 rounded-full bg-brand-500"></span>
        Adjusted
      </span>
    {/if}
  </header>

  <div class="mt-6">
    <p class="font-display num text-[64px] font-[380] leading-[0.95] text-ink">
      {displayValue}
    </p>
  </div>

  <footer class="mt-6">
    <div class="flex items-end justify-between gap-4">
      <div class="flex flex-col gap-1">
        <span class="eyebrow">Δ vs. comparison</span>
        <span class={`num text-base font-medium ${toneClass}`}>
          {#if arrow}<span class="mr-1 text-sm">{arrow}</span>{/if}{deltaLabel}
        </span>
      </div>
      <Sparkline
        points={sparkline}
        class="h-10 w-[140px] text-brand-500"
      />
    </div>

    {#if sourceChips.length > 0}
      <div
        class="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-4"
      >
        <span class="eyebrow">Sources</span>
        {#each sourceChips as chip (chip)}
          <span
            class="font-mono text-[11px] text-ink-muted tracking-tight"
          >
            {chip}
          </span>
        {/each}
      </div>
    {/if}
  </footer>

  <!-- Decorative corner marks — subtle registration ticks. -->
  <span
    class="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-ink"
    aria-hidden="true"
  ></span>
  <span
    class="pointer-events-none absolute right-0 top-0 h-2 w-2 border-r border-t border-ink"
    aria-hidden="true"
  ></span>
  <span
    class="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-ink"
    aria-hidden="true"
  ></span>
  <span
    class="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-ink"
    aria-hidden="true"
  ></span>
</article>
