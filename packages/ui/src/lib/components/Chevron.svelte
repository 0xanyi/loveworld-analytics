<script lang="ts">
  import { cn } from "../cn";

  // Decorative caret used by native <select> elements styled with
  // `.field-underline`. Rendered over the select (not inside) — the
  // real widget keeps keyboard + screen-reader semantics.
  //
  // Default direction is "down" (paired with a select); other directions
  // are available for breadcrumb / collapsible affordances later.
  let {
    direction = "down",
    class: className = "",
  }: {
    direction?: "up" | "down" | "left" | "right";
    class?: string;
  } = $props();

  const paths: Record<typeof direction, string> = {
    down: "M2 4l4 4 4-4",
    up: "M2 8l4-4 4 4",
    left: "M8 2L4 6l4 4",
    right: "M4 2l4 4-4 4",
  };
</script>

<svg
  class={cn("pointer-events-none h-3 w-3 text-ink-muted", className)}
  viewBox="0 0 12 12"
  fill="none"
  aria-hidden="true"
>
  <path
    d={paths[direction]}
    stroke="currentColor"
    stroke-width="1.25"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
