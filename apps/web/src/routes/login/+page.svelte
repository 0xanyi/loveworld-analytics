<script lang="ts">
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";
  import { Button, Card } from "@lwa/ui";

  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let submitting = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    submitting = true;
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) {
        error = res.error.message ?? "Sign-in failed";
      } else {
        // Phase 0: bounce to root; Phase 1 will route to the user's first tenant.
        await goto("/");
      }
    } catch (_e) {
      error = "Network error. Please try again.";
    } finally {
      submitting = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center px-4">
  <Card class="w-full max-w-md">
    <h1 class="mb-6 text-2xl font-semibold">Sign in</h1>
    <form onsubmit={handleSubmit} class="space-y-4">
      <label class="block">
        <span class="text-sm font-medium">Email</span>
        <input
          type="email"
          name="email"
          bind:value={email}
          required
          autocomplete="email"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label class="block">
        <span class="text-sm font-medium">Password</span>
        <input
          type="password"
          name="password"
          bind:value={password}
          required
          autocomplete="current-password"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      {#if error}
        <p class="text-sm text-red-600" role="alert">{error}</p>
      {/if}
      <Button type="submit" disabled={submitting} class="w-full">
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  </Card>
</div>
