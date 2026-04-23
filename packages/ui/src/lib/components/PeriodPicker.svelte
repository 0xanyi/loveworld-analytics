<script lang="ts">
  export type PeriodOption = "week" | "month" | "quarter" | "ytd";

  let {
    value,
    hrefFor,
  }: {
    value: PeriodOption;
    hrefFor: (option: PeriodOption) => string;
  } = $props();

  const options: Array<{ value: PeriodOption; label: string }> = [
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "quarter", label: "Quarter" },
    { value: "ytd", label: "YTD" },
  ];
</script>

<!-- Segmented inline selector. A top-aligned hairline underline marks the
     active option; resting options live on the shared baseline. -->
<div
  class="flex flex-col gap-2"
  aria-label="Period picker"
>
  <span class="eyebrow">Period</span>
  <div class="flex items-center divide-x divide-hairline border border-hairline">
    {#each options as option (option.value)}
      {@const active = value === option.value}
      <a
        href={hrefFor(option.value)}
        class={`relative px-4 py-2 text-[12px] font-medium uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
          active
            ? "bg-ink text-paper"
            : "text-ink-muted hover:text-ink hover:bg-ink/4"
        }`}
        aria-current={active ? "page" : undefined}
      >
        {option.label}
      </a>
    {/each}
  </div>
</div>
