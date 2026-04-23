<script lang="ts">
  import { page } from "$app/stores";

  let { children, data } = $props();

  type NavItem = { href: string; label: string; match: (pathname: string) => boolean };

  const items: NavItem[] = $derived([
    {
      href: `/${data.tenantSlug}/settings/hierarchy`,
      label: "Hierarchy",
      match: (p) => p.startsWith(`/${data.tenantSlug}/settings/hierarchy`),
    },
  ]);

  const currentPath = $derived($page.url.pathname);
</script>

<!-- Settings sub-nav rendered as inline tabs — they don't need their own
     header since the individual settings pages own their masthead. -->
<nav
  class="mb-10 flex flex-wrap items-center gap-6 border-b border-hairline pb-4"
  aria-label="Tenant settings"
>
  <span class="eyebrow">Settings</span>
  {#each items as item (item.href)}
    {@const active = item.match(currentPath)}
    <a
      href={item.href}
      class={`relative text-[12px] font-medium uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
        active ? "text-ink" : "text-ink-muted hover:text-ink"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {item.label}
      {#if active}
        <span class="absolute -bottom-[17px] left-0 right-0 h-px bg-brand-500" aria-hidden="true"></span>
      {/if}
    </a>
  {/each}
</nav>

{@render children()}
