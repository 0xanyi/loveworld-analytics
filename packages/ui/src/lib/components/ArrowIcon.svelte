<script lang="ts">
  import { cn } from "../cn";

  // Direction-aware arrow glyph used alongside `<Button>` and editorial
  // "Open / Back / View" links. Pair with `group` on the parent + the
  // `group-hover:` transform below for the signature slide-on-hover.
  let {
    direction = "right",
    class: className = "",
  }: {
    direction?: "right" | "left";
    class?: string;
  } = $props();

  const right = "M1 6h10M7 2l4 4-4 4";
  const left = "M11 6H1M5 2L1 6l4 4";
</script>

<svg
  class={cn(
    "h-3 w-3 transition-transform duration-200",
    direction === "right" ? "group-hover:translate-x-1" : "group-hover:-translate-x-1",
    className,
  )}
  viewBox="0 0 12 12"
  fill="none"
  aria-hidden="true"
>
  <path
    d={direction === "right" ? right : left}
    stroke="currentColor"
    stroke-width="1.25"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
