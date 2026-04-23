<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import { authClient } from "$lib/auth-client";
  import type { Capability } from "@lwa/auth/permissions";

  let { children, data } = $props();

  // Capabilities the current user holds in this tenant. Server-enforced
  // auth stays authoritative — these checks only hide dead-end nav links
  // that would 403 for read-only roles (board_viewer / analyst).
  const caps = $derived(new Set(data.capabilities as Capability[]));

  // ── user menu ────────────────────────────────────────────────────────
  let userMenuOpen = $state(false);
  let userMenuEl = $state<HTMLDivElement | null>(null);
  let signingOut = $state(false);

  const userDisplay = $derived(
    data.currentUser?.name?.trim()
      ? data.currentUser.name
      : (data.currentUser?.email ?? "Account"),
  );
  // Initials for the avatar chip — first-letter of name (or email local-part).
  const userInitial = $derived((userDisplay[0] ?? "?").toUpperCase());

  function toggleUserMenu(event: Event) {
    event.stopPropagation();
    userMenuOpen = !userMenuOpen;
  }

  function closeUserMenu() {
    userMenuOpen = false;
  }

  // Click-outside + Escape handlers. Registered only while the menu is
  // open so we're not paying the listener cost on every navigation.
  $effect(() => {
    if (!userMenuOpen) return;

    const onDocClick = (e: MouseEvent) => {
      if (userMenuEl && !userMenuEl.contains(e.target as Node)) closeUserMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeUserMenu();
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  });

  async function handleSignOut() {
    signingOut = true;
    try {
      await authClient.signOut();
    } finally {
      signingOut = false;
      closeUserMenu();
    }
    // Clear any cached layout data bound to the previous session, then
    // bounce to login. invalidateAll() ensures server loads re-run against
    // the now-unauthenticated cookie state if the user navigates back.
    await invalidateAll();
    await goto("/login");
  }

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

    <!-- ─────────── User menu ────────────
         Disclosure panel holding user identity + sign-out. Hidden behind
         a small initial-chip trigger on the far right of the masthead so
         the navigation stays the visual hero. -->
    <div class="relative ml-2 md:ml-4" bind:this={userMenuEl}>
      <button
        type="button"
        onclick={toggleUserMenu}
        aria-haspopup="menu"
        aria-expanded={userMenuOpen}
        aria-label="Account menu"
        class="group flex items-center gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <span
          class="flex h-8 w-8 items-center justify-center border border-hairline bg-surface font-mono text-[12px] text-ink transition-colors group-hover:border-ink"
          aria-hidden="true"
        >
          {userInitial}
        </span>
        <span class="hidden max-w-[10rem] truncate text-[12px] font-medium uppercase tracking-[0.16em] text-ink-muted transition-colors group-hover:text-ink lg:inline">
          {userDisplay}
        </span>
      </button>

      {#if userMenuOpen}
        <div
          role="menu"
          class="absolute right-0 top-full z-50 mt-2 w-72 border border-hairline bg-paper shadow-[0_10px_30px_-12px_rgba(28,25,23,0.25)]"
        >
          <!-- Identity header: name + email, monospaced for precision. -->
          <div class="border-b border-hairline px-5 py-4">
            <p class="eyebrow">Signed in as</p>
            {#if data.currentUser?.name}
              <p class="font-display mt-2 truncate text-lg leading-tight text-ink">
                {data.currentUser.name}
              </p>
            {/if}
            <p class="font-mono mt-1 truncate text-[12px] text-ink-muted">
              {data.currentUser?.email ?? "—"}
            </p>
          </div>

          <!-- Switch tenant (always available; landing page handles the list). -->
          <a
            href="/"
            role="menuitem"
            onclick={closeUserMenu}
            class="flex items-center justify-between px-5 py-3 text-[12px] font-medium uppercase tracking-[0.16em] text-ink-muted transition-colors hover:bg-ink/4 hover:text-ink focus-visible:outline-none focus-visible:bg-ink/4 focus-visible:text-ink"
          >
            <span>Switch tenant</span>
            <span aria-hidden="true" class="font-mono text-[11px]">→</span>
          </a>

          <!-- Sign out — separated with a hairline so it reads as
               destructive / terminal relative to the nav items above. -->
          <div class="border-t border-hairline">
            <button
              type="button"
              role="menuitem"
              onclick={handleSignOut}
              disabled={signingOut}
              class="flex w-full items-center justify-between px-5 py-3 text-[12px] font-medium uppercase tracking-[0.16em] text-negative transition-colors hover:bg-negative/6 focus-visible:outline-none focus-visible:bg-negative/6 disabled:opacity-60"
            >
              <span>{signingOut ? "Signing out…" : "Sign out"}</span>
              <span aria-hidden="true" class="font-mono text-[11px]">§</span>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>

<!-- ──────────── Page body ──────────── -->
<main class="mx-auto max-w-7xl px-6 pb-24 pt-10 lg:px-10">
  {@render children()}
</main>
