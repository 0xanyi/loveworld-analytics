<script lang="ts">
  import { cn } from "../cn";
  import type { HTMLButtonAttributes } from "svelte/elements";

  type Variant = "primary" | "secondary" | "ghost" | "destructive";
  type Size = "sm" | "md" | "lg";

  let {
    variant = "primary",
    size = "md",
    class: className = "",
    children,
    ...rest
  }: HTMLButtonAttributes & { variant?: Variant; size?: Size } = $props();

  // Editorial buttons: squared corners, uppercase micro-typography with
  // wide tracking, thin hairline borders on non-primary variants. The
  // `group` class on the base lets consumers compose hover-driven
  // sub-effects (e.g. a trailing arrow icon) via `group-hover:*`.
  const base =
    "group inline-flex items-center justify-center gap-3 rounded-none font-medium " +
    "uppercase transition-all duration-200 ease-out " +
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-2 " +
    "focus-visible:ring-brand-500 focus-visible:ring-offset-paper " +
    "disabled:pointer-events-none disabled:opacity-50";

  const variants: Record<Variant, string> = {
    primary:
      "bg-ink text-paper hover:bg-brand-600",
    secondary:
      "bg-transparent text-ink border border-ink hover:bg-ink hover:text-paper",
    ghost:
      "bg-transparent text-ink hover:bg-ink/6",
    destructive:
      // Tailwind v4's theme resolver doesn't cleanly emit utilities for
      // multi-word color tokens (e.g. `--color-negative-dark`), so we
      // keep the hover shade as an inline color-mix. `_` becomes space
      // at emit time; mixing 85% negative with 15% black darkens it.
      "bg-negative text-white hover:bg-[color-mix(in_oklab,var(--color-negative)_85%,black)]",
  };

  // Sizes reflect the editorial hierarchy:
  //  - sm: micro actions (toolbar / inline row actions)
  //  - md: standard form submit / secondary CTAs
  //  - lg: hero CTAs (login, primary schema-form submit) — wider tracking
  //    for gravitas, matches the cover-type rhythm.
  const sizes: Record<Size, string> = {
    sm: "h-8 px-3 text-[11px] tracking-[0.14em]",
    md: "h-11 px-6 text-[12px] tracking-[0.18em]",
    lg: "h-12 px-7 text-[12px] tracking-[0.22em]",
  };
</script>

<!-- type="button" is declared before {...rest} so consumers can override
     via <Button type="submit">; later-declared wins in Svelte's spread. This
     stops the component from accidentally submitting a parent <form> — the
     native HTML default for <button> with no type is "submit" inside a form. -->
<button type="button" class={cn(base, variants[variant], sizes[size], className)} {...rest}>
  {@render children?.()}
</button>
