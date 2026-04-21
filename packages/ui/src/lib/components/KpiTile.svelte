<script lang="ts">
  import Card from "./Card.svelte";
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
</script>

<Card class="flex h-full flex-col gap-4">
  <div class="flex items-start justify-between gap-4">
    <div>
      <p class="text-sm font-medium text-slate-500">{label}</p>
      <p class="mt-2 text-3xl font-semibold text-slate-950">{displayValue}</p>
    </div>
    {#if hasAdjustments}
      <span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
        Adjusted
      </span>
    {/if}
  </div>

  <div class="flex items-center justify-between gap-4">
    <p class={`text-sm font-medium ${toneClass}`}>{deltaLabel}</p>
    <Sparkline points={sparkline} class="h-8 w-[120px] text-brand-500" />
  </div>

  {#if sourceChips.length > 0}
    <div class="flex flex-wrap gap-2">
      {#each sourceChips as chip}
        <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{chip}</span>
      {/each}
    </div>
  {/if}
</Card>
