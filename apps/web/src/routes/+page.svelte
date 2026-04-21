<script lang="ts">
  import { Button, Card } from "@lwa/ui";
  let { data } = $props();
</script>

<div class="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-12">
  <div class="mb-8">
    <p class="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Loveworld Analytics</p>
    <h1 class="mt-2 text-3xl font-semibold text-slate-950">Choose a tenant</h1>
    <p class="mt-2 text-slate-600">You belong to multiple workspaces. Pick where you want to continue.</p>
  </div>

  <div class="grid gap-4 md:grid-cols-2">
    {#each data.memberships as membership}
      <Card class="flex flex-col gap-4">
        <div>
          <h2 class="text-xl font-semibold text-slate-950">{membership.tenantName}</h2>
          <p class="mt-1 text-sm text-slate-500">Role: {membership.role.replaceAll("_", " ")}</p>
        </div>
        <div>
          <a
            href={`/${membership.tenantSlug}`}
            class="inline-flex h-10 items-center justify-center rounded-md bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Open tenant
          </a>
        </div>
      </Card>
    {/each}
  </div>
</div>
