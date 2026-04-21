<script module lang="ts">
  export type SparklinePoint = { t: Date | string; v: number };
</script>

<script lang="ts">
  let {
    points = [],
    class: className = "",
  }: {
    points?: SparklinePoint[];
    class?: string;
  } = $props();

  const width = 120;
  const height = 32;
  const pad = 2;

  function toPath(input: SparklinePoint[]) {
    if (input.length === 0) return "";

    const values = input.map((point) => point.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = input.length === 1 ? 0 : (width - pad * 2) / (input.length - 1);

    return input
      .map((point, index) => {
        const x = pad + index * step;
        const y = height - pad - ((point.v - min) / range) * (height - pad * 2);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }

  const path = $derived(toPath(points));
</script>

{#if points.length === 0}
  <div class={`h-8 w-[120px] rounded bg-slate-100 ${className}`}></div>
{:else}
  <svg
    viewBox={`0 0 ${width} ${height}`}
    class={className}
    role="img"
    aria-label="Trend sparkline"
  >
    <path d={path} fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
  </svg>
{/if}
