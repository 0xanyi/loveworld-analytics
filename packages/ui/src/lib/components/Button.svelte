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

  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 " +
    "disabled:pointer-events-none disabled:opacity-50";

  const variants: Record<Variant, string> = {
    primary: "bg-brand-500 text-white hover:bg-brand-600",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
    ghost: "hover:bg-slate-100",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };

  const sizes: Record<Size, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };
</script>

<button class={cn(base, variants[variant], sizes[size], className)} {...rest}>
  {@render children?.()}
</button>
