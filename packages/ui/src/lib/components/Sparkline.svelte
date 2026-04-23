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

  const width = 140;
  const height = 40;
  const pad = 2;

  function toPath(input: SparklinePoint[]) {
    if (input.length === 0) return { line: "", area: "" };

    const values = input.map((point) => point.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = input.length === 1 ? 0 : (width - pad * 2) / (input.length - 1);

    const coords = input.map((point, index) => {
      const x = pad + index * step;
      const y = height - pad - ((point.v - min) / range) * (height - pad * 2);
      return { x, y };
    });

    const line = coords
      .map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ");

    // Closed path for the filled area under the line — adds a subtle tone
    // without relying on shadows. Rendered behind the stroke.
    const area =
      `${line} L${coords[coords.length - 1]!.x.toFixed(2)} ${(height - pad).toFixed(2)} ` +
      `L${coords[0]!.x.toFixed(2)} ${(height - pad).toFixed(2)} Z`;

    return { line, area };
  }

  const path = $derived(toPath(points));
</script>

{#if points.length === 0}
  <div class={`h-10 w-[140px] border-b border-dashed border-hairline ${className}`}></div>
{:else}
  <svg
    viewBox={`0 0 ${width} ${height}`}
    class={className}
    role="img"
    aria-label="Trend sparkline"
    preserveAspectRatio="none"
  >
    <path d={path.area} fill="currentColor" opacity="0.08" />
    <path
      d={path.line}
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/if}
