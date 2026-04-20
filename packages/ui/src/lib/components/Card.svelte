<script lang="ts">
  import { cn } from "../cn";
  import type { HTMLAttributes } from "svelte/elements";

  let { class: className = "", children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class={cn("rounded-xl border border-slate-200 bg-white p-6 shadow-sm", className)} {...rest}>
  {@render children?.()}
</div>
