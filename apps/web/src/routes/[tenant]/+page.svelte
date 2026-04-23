<script lang="ts">
  import { goto } from "$app/navigation";
  import { Chevron, ComparisonPicker, KpiTile, PeriodPicker } from "@lwa/ui";
  import type { DashboardTile, HierarchyNodeRecord } from "$lib/hierarchy";

  let { data } = $props();
  const tiles = $derived(data.tiles as DashboardTile[]);
  const hierarchyNodes = $derived(data.hierarchyNodes as HierarchyNodeRecord[]);

  const labelByCategory: Record<string, string> = {
    tv_households: "TV Households",
    web_visitors: "Web Visitors",
  };

  const periodLabels: Record<string, string> = {
    week: "last week",
    month: "last month",
    quarter: "last quarter",
    ytd: "year-to-date",
  };

  function buildHref(next: { period?: string; comparison?: string; hierarchyNodeId?: string | null }) {
    const params = new URLSearchParams();
    params.set("period", next.period ?? data.period);
    params.set("comparison", next.comparison ?? data.comparison);
    const nodeId = next.hierarchyNodeId ?? data.selectedNodeId;
    if (nodeId) params.set("hierarchyNodeId", nodeId);
    return `/${data.tenantSlug}?${params.toString()}`;
  }

  async function handleNodeChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    await goto(buildHref({ hierarchyNodeId: value }));
  }

  const selectedNodeName = $derived(
    hierarchyNodes.find((n) => n.id === data.selectedNodeId)?.name ?? "All",
  );
  const todayLabel = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
</script>

<!-- ──────────── Page header (editorial dek) ──────────── -->
<section class="rise">
  <div class="flex items-baseline justify-between gap-6 border-b border-hairline pb-8">
    <div>
      <p class="eyebrow">Board report</p>
      <h1 class="font-display mt-3 text-6xl leading-[0.95] text-ink">
        Dashboard
      </h1>
      <p class="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
        Board-ready metrics for
        <span class="text-ink">{selectedNodeName}</span>,
        rolled up across every source and compared against the previous {periodLabels[data.period] ?? "period"}.
      </p>
    </div>
    <div class="hidden text-right md:block">
      <p class="eyebrow">As of</p>
      <p class="font-mono mt-2 text-[12px] text-ink">{todayLabel}</p>
    </div>
  </div>
</section>

<!-- ──────────── Filter strip ──────────── -->
<section
  class="mt-8 flex flex-col gap-8 border-b border-hairline pb-8 rise rise-1 lg:flex-row lg:items-end lg:justify-between"
>
  <label class="block max-w-sm flex-1">
    <span class="eyebrow">Hierarchy node</span>
    <div class="relative mt-2">
      <select
        class="field-underline pr-6 appearance-none"
        onchange={handleNodeChange}
        value={data.selectedNodeId ?? ""}
        aria-label="Hierarchy node"
      >
        {#each hierarchyNodes as node (node.id)}
          <option value={node.id}>{node.name}</option>
        {/each}
      </select>
      <Chevron class="absolute right-0 top-1/2 -translate-y-1/2" />
    </div>
  </label>

  <div class="flex flex-wrap items-end gap-6">
    <PeriodPicker value={data.period} hrefFor={(period) => buildHref({ period })} />
    <ComparisonPicker value={data.comparison} hrefFor={(comparison) => buildHref({ comparison })} />
  </div>
</section>

<!-- ──────────── Tiles ──────────── -->
{#if tiles.length === 0}
  <section
    class="mt-12 flex flex-col items-center justify-center gap-4 border border-dashed border-hairline bg-surface px-8 py-20 text-center rise rise-2"
  >
    <p class="eyebrow">Empty ledger</p>
    <p class="font-display text-3xl text-ink">No metrics recorded yet.</p>
    <p class="max-w-md text-sm text-ink-muted">
      Once a connector ingests data or a manual entry is logged, the rollup for this node
      will appear here.
    </p>
  </section>
{:else}
  <section class="mt-10 grid gap-px bg-hairline md:grid-cols-2 rise rise-2">
    <!-- Tiles are laid out on a shared hairline "grid lattice": cards sit
         above a 1px bg that bleeds through the gap. Keeps the composition
         visually joined rather than as floating cards. -->
    {#each tiles as tile (tile.category)}
      <div class="rise rise-3">
        <KpiTile
          label={labelByCategory[tile.category] ?? tile.category}
          value={tile.current}
          deltaPct={tile.deltaPct}
          sparkline={tile.sparkline}
          hasAdjustments={tile.hasAdjustments}
          sourceChips={Object.keys(tile.sourceBreakdown)}
        />
      </div>
    {/each}
  </section>
{/if}

<!-- ──────────── Footer mark ──────────── -->
<footer class="mt-20 flex items-center justify-between border-t border-hairline pt-6 text-[11px] uppercase tracking-[0.18em] text-ink-muted">
  <span>{data.tenantSlug}</span>
  <span class="font-mono">§ {tiles.length} metric{tiles.length === 1 ? "" : "s"}</span>
</footer>
