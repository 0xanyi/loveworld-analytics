/**
 * Ambient declaration so TypeScript accepts `import Button from "./Button.svelte"`
 * from plain .ts files (e.g., `src/lib/components/index.ts`).
 *
 * What this shim does:
 * - Satisfies module resolution for any tool that runs plain `tsc` (the shim
 *   gives .svelte imports a nominal `Component` type).
 * - Is effectively overridden by svelte-check's native .svelte resolution at
 *   `pnpm -F @lwa/ui typecheck` time (svelte-check understands component props,
 *   slots, bindings, etc.).
 *
 * Known limitation — .ts consumers do NOT get prop inference:
 *   Any .ts file (e.g., a dynamic component registry, Storybook story, test
 *   helper) that imports a .svelte component sees `Component<{}>` — no props,
 *   no bindings. This is acceptable today because all consumers are .svelte
 *   files and svelte-check types them correctly. If a .ts consumer needs
 *   typed props, the long-term fix is to build this package with
 *   `svelte-package`, which emits per-component .d.ts files. Defer until
 *   needed.
 */
declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component;
  export default component;
}
