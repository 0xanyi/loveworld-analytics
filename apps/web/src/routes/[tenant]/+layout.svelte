<script lang="ts">
  import { page } from "$app/stores";
  import type { Capability } from "@lwa/auth/permissions";

  let { children, data } = $props();

  // Capabilities the current user holds in this tenant. Server-enforced
  // auth stays authoritative — these checks only hide dead-end nav links
  // that would 403 for read-only roles (board_viewer / analyst).
  const caps = $derived(new Set(data.capabilities as Capability[]));

  type NavLink = { href: string; label: string; requires: Capability; match: (pathname: string) => boolean };

  const base = $derived(`/${data.tenantSlug}`);
  const navLinks: NavLink[] = $derived([
    {
      href: base,
      label: "Dashboard",
      requires: "view_dashboard",
      // Dashboard is active only on the exact tenant root — otherwise
      // every /<tenant>/* path would match "startsWith(base)".
      match: (pathname) => pathname === base,
    },
    {
      href: `${base}/entry`,
      label: "Manual entry",
      requires: "log_manual_entry",
      match: (pathname) => pathname.startsWith(`${base}/entry`),
    },
    {
      href: `${base}/sources`,
      label: "Source health",
      requires: "view_source_health",
      match: (pathname) => pathname.startsWith(`${base}/sources`),
    },
    {
      href: `${base}/settings/hierarchy`,
      label: "Hierarchy",
      requires: "edit_hierarchy",
      match: (pathname) => pathname.startsWith(`${base}/settings`),
    },
  ]);

  const visibleNavLinks = $derived(navLinks.filter((link) => caps.has(link.requires)));
  const currentPath = $derived($page.url.pathname);
</script>

<!-- ──────────── Top masthead bar ──────────── -->
<header class="sticky top-0 z-40 border-b border-hairline bg-paper/92 backdrop-blur">
  <div class="mx-auto flex h-16 max-w-7xl items-center gap-6 px-6 lg:px-10">
    <!-- Wordmark -->
    <a href="/" class="group flex items-center gap-3" aria-label="Loveworld Analytics home">
      <span class="block h-2 w-2 rounded-full bg-brand-500 transition-transform group-hover:scale-125"></span>
      <span class="font-display text-lg leading-none text-ink">
        Loveworld<span class="font-display-italic text-brand-600">/</span>Analytics
      </span>
    </a>

    <!-- Tenant badge -->
    <div class="hidden items-center gap-3 border-l border-hairline pl-6 md:flex">
      <span class="eyebrow">Tenant</span>
      <span class="font-mono text-[12px] text-ink">{data.tenantSlug}</span>
    </div>

    <!-- Nav -->
    <nav class="ml-auto hidden items-center gap-1 md:flex" aria-label="Tenant sections">
      {#each visibleNavLinks as link (link.href)}
        {@const active = link.match(currentPath)}
        <a
          href={link.href}
          class={`relative px-3 py-2 text-[12px] font-medium uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
            active
              ? "text-ink"
              : "text-ink-muted hover:text-ink"
          }`}
          aria-current={active ? "page" : undefined}
        >
          {link.label}
          {#if active}
            <span
              class="absolute inset-x-3 -bottom-px h-px bg-brand-500"
              aria-hidden="true"
            ></span>
          {/if}
        </a>
      {/each}
    </nav>

    <!-- Mobile nav fallback -->
    <nav class="ml-auto flex items-center gap-3 overflow-x-auto md:hidden" aria-label="Tenant sections">
      {#each visibleNavLinks as link (link.href)}
        {@const active = link.match(currentPath)}
        <a
          href={link.href}
          class={`whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.14em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
            active ? "text-brand-600" : "text-ink-muted"
          }`}
          aria-current={active ? "page" : undefined}
        >
          {link.label}
        </a>
      {/each}
    </nav>
  </div>
</header>

<!-- ──────────── Page body ──────────── -->
<main class="mx-auto max-w-7xl px-6 pb-24 pt-10 lg:px-10">
  {@render children()}
</main>
