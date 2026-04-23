<script lang="ts">
  import { cn } from "../cn";
  import type { HTMLAttributes } from "svelte/elements";

  let { class: className = "", children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<!-- Editorial card: hairline border, subtle surface, no heavy shadow.
     Cards feel lifted from paper, not floating over it. -->
<div
  class={cn(
    "relative rounded-none border border-hairline bg-surface p-6",
    className,
  )}
  {...rest}
>
  {@render children?.()}
</div>
