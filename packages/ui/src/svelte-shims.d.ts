/**
 * Ambient declaration so TypeScript accepts `import Button from "./Button.svelte"`
 * from plain .ts files (e.g., `src/lib/components/index.ts`).
 *
 * tsc itself does not parse .svelte files — svelte-check (run by the SvelteKit
 * app downstream in Task 8) handles the real type analysis of components.
 * This shim only covers the module-resolution step.
 *
 * Deviation from plan: required to make `pnpm -F @lwa/ui typecheck` pass without
 * adding svelte-check or svelte-preprocess at this layer.
 */
declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component;
  export default component;
}
