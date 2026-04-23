<script lang="ts">
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";
  import { ArrowIcon, Button } from "@lwa/ui";

  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let submitting = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    submitting = true;

    let signedIn = false;
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) {
        error = res.error.message ?? "Sign-in failed";
      } else {
        signedIn = true;
      }
    } catch (e) {
      // Only the authentication call is wrapped in the try/catch: a
      // post-sign-in `goto()` failure is unrelated to network/credentials
      // and would mis-report a successful authentication as a network error.
      // In dev we surface the real reason to the console; in prod we keep
      // the user-facing message generic to avoid leaking internals.
      if (import.meta.env.DEV) {
        console.warn("[login] sign-in failed:", e);
      }
      error = "Network error. Please try again.";
    } finally {
      submitting = false;
    }

    if (signedIn) {
      // Phase 0: bounce to root; Phase 1 routes single-tenant users straight
      // to their tenant, multi-tenant users to the selector. Any navigation
      // error here is handled by SvelteKit's own error boundary.
      await goto("/");
    }
  }

  const nowLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date());
</script>

<main class="grid min-h-screen grid-cols-1 bg-paper lg:grid-cols-[1.15fr_1fr]">
  <!-- ──────────── Cover panel (editorial masthead) ──────────── -->
  <aside
    class="paper-grain relative hidden flex-col justify-between overflow-hidden bg-paper-soft p-12 lg:flex xl:p-16"
    aria-hidden="true"
  >
    <div class="hairline-grid pointer-events-none absolute inset-0 opacity-70"></div>
    <!-- Diagonal accent ribbon -->
    <div
      class="pointer-events-none absolute -right-24 top-20 h-[1px] w-[520px] rotate-[-18deg] bg-brand-500 opacity-80"
    ></div>
    <div
      class="pointer-events-none absolute -left-24 bottom-40 h-[1px] w-[520px] rotate-[-18deg] bg-ink opacity-30"
    ></div>

    <!-- Top masthead: issue stamp + date -->
    <header class="relative z-10 flex items-start justify-between">
      <div class="flex items-center gap-3">
        <span class="block h-2 w-2 rounded-full bg-brand-500"></span>
        <span class="eyebrow">Loveworld · Analytics</span>
      </div>
      <div class="text-right">
        <p class="eyebrow">Volume 01</p>
        <p class="mt-1 font-mono text-[11px] text-ink-muted">{nowLabel}</p>
      </div>
    </header>

    <!-- Hero wordmark -->
    <div class="relative z-10 rise rise-2">
      <p class="eyebrow mb-5">Cross-platform rollup</p>
      <h2 class="font-display text-[clamp(56px,7.2vw,108px)] font-[420] leading-[0.9] text-ink">
        The
        <span class="font-display-italic text-brand-600">reach</span>
        <br />
        of every
        <br />
        signal.
      </h2>
      <p class="mt-6 max-w-md text-[14px] leading-relaxed text-ink-muted">
        Consolidate satellite households, freeview reach, and web traffic across every
        station and language channel in your network &mdash; into a single board-ready ledger.
      </p>
    </div>

    <!-- Bottom capability strip — qualitative, not quantitative. Avoids the
         "fake marketing statistics" trap on an unauthenticated page. -->
    <footer class="relative z-10 rise rise-3">
      <div class="border-t border-hairline pt-6">
        <dl class="grid grid-cols-3 gap-6">
          <div>
            <dt class="eyebrow">Satellite</dt>
            <dd class="font-display mt-2 text-lg leading-tight text-ink">
              Household reach <br /> and retention.
            </dd>
          </div>
          <div class="border-l border-hairline pl-6">
            <dt class="eyebrow">Freeview</dt>
            <dd class="font-display mt-2 text-lg leading-tight text-ink">
              Geographic <br /> signal coverage.
            </dd>
          </div>
          <div class="border-l border-hairline pl-6">
            <dt class="eyebrow">Web</dt>
            <dd class="font-display mt-2 text-lg leading-tight text-ink">
              Visitor and <br /> engagement rollup.
            </dd>
          </div>
        </dl>
      </div>
    </footer>
  </aside>

  <!-- ──────────── Form panel ──────────── -->
  <section class="relative flex items-center justify-center px-6 py-16 lg:px-16">
    <!-- Tiny mobile masthead (hidden on lg+ because the cover shows on the left).
         Uses env(safe-area-inset-*) so notched devices don't overlap status bar. -->
    <div
      class="absolute left-6 top-6 flex items-center gap-2 lg:hidden"
      style="top: max(1.5rem, env(safe-area-inset-top)); left: max(1.5rem, env(safe-area-inset-left));"
    >
      <span class="block h-2 w-2 rounded-full bg-brand-500"></span>
      <span class="eyebrow">Loveworld · Analytics</span>
    </div>

    <div class="w-full max-w-md rise rise-1">
      <p class="eyebrow">Authorized access</p>
      <h1 class="font-display mt-3 text-5xl leading-[1.02] text-ink">
        Sign in<span class="text-brand-600">.</span>
      </h1>
      <p class="mt-4 text-[14px] leading-relaxed text-ink-muted">
        Welcome back. Access your network&rsquo;s rollup — credentials issued by your administrator.
      </p>

      <form onsubmit={handleSubmit} class="mt-10 space-y-7" novalidate>
        <label class="block">
          <span class="eyebrow">Email</span>
          <input
            type="email"
            name="email"
            bind:value={email}
            required
            autocomplete="email"
            placeholder="you@loveworld.example"
            class="field-underline mt-2"
          />
        </label>

        <label class="block">
          <span class="eyebrow">Password</span>
          <input
            type="password"
            name="password"
            bind:value={password}
            required
            autocomplete="current-password"
            placeholder="••••••••"
            class="field-underline mt-2"
          />
        </label>

        {#if error}
          <p
            class="border-l-2 border-negative bg-negative/6 px-3 py-2 text-sm text-negative"
            role="alert"
          >
            {error}
          </p>
        {/if}

        <Button type="submit" variant="primary" size="lg" disabled={submitting} class="w-full">
          <span>{submitting ? "Signing in…" : "Sign in"}</span>
          <ArrowIcon />
        </Button>
      </form>

      <div class="mt-12 flex items-center gap-3">
        <span class="h-px flex-1 bg-hairline"></span>
        <span class="eyebrow">§</span>
        <span class="h-px flex-1 bg-hairline"></span>
      </div>

      <p class="mt-6 text-center text-[12px] text-ink-muted">
        Need access? Contact your network administrator.
      </p>
    </div>
  </section>
</main>
