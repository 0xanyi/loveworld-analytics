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

<div class="flex flex-wrap items-center gap-2" aria-label="Period picker">
  {#each options as option}
    <a
      href={hrefFor(option.value)}
      class={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${value === option.value ? "bg-brand-500 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
      aria-current={value === option.value ? "page" : undefined}
    >
      {option.label}
    </a>
  {/each}
</div>
