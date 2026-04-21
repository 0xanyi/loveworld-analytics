<script lang="ts">
  import type { Capability } from "@lwa/auth/permissions";

  let { children, data } = $props();

  // Capabilities the current user holds in this tenant. Server-enforced
  // auth stays authoritative — these checks only hide dead-end nav links
  // that would 403 for read-only roles (board_viewer / analyst).
  const caps = $derived(new Set(data.capabilities as Capability[]));

  type NavLink = { href: string; label: string; requires: Capability };
  const navLinks: NavLink[] = $derived([
    { href: `/${data.tenantSlug}`, label: "Dashboard", requires: "view_dashboard" },
    { href: `/${data.tenantSlug}/entry`, label: "Manual entry", requires: "log_manual_entry" },
    { href: `/${data.tenantSlug}/sources`, label: "Source health", requires: "view_source_health" },
    { href: `/${data.tenantSlug}/settings/hierarchy`, label: "Hierarchy", requires: "edit_hierarchy" },
  ]);

  const visibleNavLinks = $derived(navLinks.filter((link) => caps.has(link.requires)));
</script>

<div class="mx-auto max-w-6xl px-6 py-8">
  <header class="mb-8">
    <p class="text-sm text-slate-500">Tenant</p>
    <h1 class="text-2xl font-semibold">{data.tenantSlug}</h1>
    <nav class="mt-4 flex gap-4 text-sm">
      {#each visibleNavLinks as link (link.href)}
        <a href={link.href} class="text-slate-600 hover:text-slate-900">{link.label}</a>
      {/each}
    </nav>
  </header>
  {@render children()}
</div>
