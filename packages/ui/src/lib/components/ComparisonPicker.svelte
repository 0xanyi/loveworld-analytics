<script lang="ts">
  export type ComparisonOption = "yoy" | "qoq" | "mom" | "none";

  let {
    value,
    hrefFor,
  }: {
    value: ComparisonOption;
    hrefFor: (option: ComparisonOption) => string;
  } = $props();

  const options: Array<{ value: ComparisonOption; label: string }> = [
    { value: "yoy", label: "YoY" },
    { value: "qoq", label: "QoQ" },
    { value: "mom", label: "MoM" },
    { value: "none", label: "None" },
  ];
</script>

<div class="flex flex-col gap-2" aria-label="Comparison picker">
  <span class="eyebrow">Compare</span>
  <div class="flex items-center divide-x divide-hairline border border-hairline">
    {#each options as option (option.value)}
      {@const active = value === option.value}
      <a
        href={hrefFor(option.value)}
        class={`px-4 py-2 text-[12px] font-medium uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
          active
            ? "bg-brand-500 text-paper"
            : "text-ink-muted hover:text-ink hover:bg-brand-500/6"
        }`}
        aria-current={active ? "page" : undefined}
      >
        {option.label}
      </a>
    {/each}
  </div>
</div>
