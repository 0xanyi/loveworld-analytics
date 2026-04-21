<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    ComparisonPicker,
    KpiTile,
    PeriodPicker,
  } from "@lwa/ui";
  import type { DashboardTile, HierarchyNodeRecord } from "$lib/hierarchy";

  let { data } = $props();
  const tiles = $derived(data.tiles as DashboardTile[]);
  const hierarchyNodes = $derived(data.hierarchyNodes as HierarchyNodeRecord[]);

  const labelByCategory: Record<string, string> = {
    tv_households: "TV Households",
    web_visitors: "Web Visitors",
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
</script>

<div class="space-y-6">
  <section class="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h2 class="text-2xl font-semibold text-slate-950">Dashboard</h2>
      <p class="mt-2 text-slate-600">View the current board metrics for the selected hierarchy node.</p>
    </div>

    <div class="space-y-3">
      <PeriodPicker value={data.period} hrefFor={(period) => buildHref({ period })} />
      <ComparisonPicker value={data.comparison} hrefFor={(comparison) => buildHref({ comparison })} />
    </div>
  </section>

  <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <label class="block max-w-sm">
      <span class="text-sm font-medium text-slate-700">Hierarchy node</span>
      <select
        class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        onchange={handleNodeChange}
        value={data.selectedNodeId ?? ""}
      >
        {#each hierarchyNodes as node}
          <option value={node.id}>{node.name}</option>
        {/each}
      </select>
    </label>
  </section>

  {#if tiles.length === 0}
    <section class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">
      No metrics available yet for this tenant.
    </section>
  {:else}
    <section class="grid gap-4 md:grid-cols-2">
      {#each tiles as tile}
        <KpiTile
          label={labelByCategory[tile.category] ?? tile.category}
          value={tile.current}
          deltaPct={tile.deltaPct}
          sparkline={tile.sparkline}
          hasAdjustments={tile.hasAdjustments}
          sourceChips={Object.keys(tile.sourceBreakdown)}
        />
      {/each}
    </section>
  {/if}
</div>
