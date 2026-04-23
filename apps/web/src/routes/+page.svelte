<script lang="ts">
  import { ArrowIcon } from "@lwa/ui";

  let { data } = $props();

  function pad(n: number): string {
    return n.toString().padStart(2, "0");
  }
</script>

<main class="paper-grain min-h-screen">
  <div class="relative z-10 mx-auto max-w-5xl px-6 py-20 lg:px-10">
    <!-- Masthead -->
    <header class="rise">
      <div class="flex items-center gap-3">
        <span class="block h-2 w-2 rounded-full bg-brand-500"></span>
        <span class="eyebrow">Loveworld · Analytics</span>
      </div>
      <div class="mt-12 border-t border-hairline pt-10">
        <p class="eyebrow">Step 01 · Select workspace</p>
        <h1 class="font-display mt-4 text-5xl leading-[1.05] text-ink lg:text-6xl">
          Choose a <span class="font-display-italic">tenant</span>.
        </h1>
        <p class="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-muted">
          You belong to multiple workspaces. Pick where you want to continue — each
          tenant has its own hierarchy, sources, and board metrics.
        </p>
      </div>
    </header>

    <!-- Tenant list, rendered as editorial index entries -->
    <ol class="mt-14 divide-y divide-hairline border-y border-hairline rise rise-2">
      {#each data.memberships as membership, index (membership.tenantSlug)}
        <li>
          <a
            href={`/${membership.tenantSlug}`}
            class="group flex items-center gap-6 py-7 transition-colors hover:bg-ink/3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper lg:gap-10"
          >
            <span
              class="font-display num w-14 text-2xl text-ink-muted transition-colors group-hover:text-brand-500"
            >
              {pad(index + 1)}
            </span>
            <div class="flex-1">
              <h2 class="font-display text-3xl leading-tight text-ink">
                {membership.tenantName}
              </h2>
              <p class="mt-1 text-[12px] uppercase tracking-[0.18em] text-ink-muted">
                {membership.role.replaceAll("_", " ")}
              </p>
            </div>
            <span
              class="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-ink-muted transition-colors group-hover:text-ink"
            >
              Open
              <ArrowIcon />
            </span>
          </a>
        </li>
      {/each}
    </ol>

    <footer class="mt-12 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-ink-muted">
      <span>{data.memberships.length} workspace{data.memberships.length === 1 ? "" : "s"}</span>
      <span class="font-mono">§ {new Date().getFullYear()}</span>
    </footer>
  </div>
</main>
