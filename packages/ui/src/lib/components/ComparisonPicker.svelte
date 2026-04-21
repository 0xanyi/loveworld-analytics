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

<div class="flex flex-wrap items-center gap-2" aria-label="Comparison picker">
  {#each options as option}
    <a
      href={hrefFor(option.value)}
      class={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${value === option.value ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
      aria-current={value === option.value ? "page" : undefined}
    >
      {option.label}
    </a>
  {/each}
</div>
