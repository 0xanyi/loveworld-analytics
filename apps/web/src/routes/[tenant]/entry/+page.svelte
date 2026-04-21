<script lang="ts">
  import { applyAction, deserialize } from "$app/forms";
  import type { ActionResult } from "@sveltejs/kit";
  import { FormFromSchema } from "@lwa/ui";

  let { data, form } = $props();

  type JsonSchemaProperty = {
    type: "string" | "integer" | "number" | "boolean" | "object";
    title?: string;
    enum?: string[];
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
  };

  type EntryJsonSchema = {
    type: "object";
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
  };

  type ManualConnector = {
    key: string;
    name: string;
    status: "active" | "error" | "paused";
    enabled: boolean;
    entrySchema: EntryJsonSchema | undefined;
  };

  type HierarchyNode = {
    id: string;
    name: string;
    type: string;
    slug: string;
    parentId: string | null;
  };

  const manualConnectors = $derived(data.manualConnectors as ManualConnector[]);
  const hierarchyNodes = $derived(data.hierarchyNodes as HierarchyNode[]);

  let selectedKey = $state<string>("");
  // Monotonic counter — incremented on successful submit to `{#key}`-remount
  // <FormFromSchema>, which resets all filled values.
  let formInstance = $state(0);

  const selectedConnector = $derived(
    manualConnectors.find((c) => c.key === selectedKey) ?? manualConnectors[0],
  );

  $effect(() => {
    if (!selectedKey && manualConnectors.length > 0) {
      selectedKey = manualConnectors[0]!.key;
    }
  });

  async function handleEntrySubmit(payload: Record<string, unknown>) {
    const body = new URLSearchParams({
      connectorKey: selectedKey,
      payload: JSON.stringify(payload),
    });

    // POST to the current route URL to invoke the default action.
    // Mirrors what `use:enhance` does internally (see @sveltejs/kit
    // runtime/app/forms.js: it posts to `form_element.action`, which
    // defaults to the current URL for a form without an `action` attr).
    const res = await fetch(window.location.pathname + window.location.search, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "x-sveltekit-action": "true",
      },
      body,
    });

    const result = deserialize(await res.text()) as ActionResult;
    await applyAction(result);

    if (result.type === "success") {
      formInstance += 1;
    }
  }

  const hierarchyOverride = $derived({
    hierarchyNodeId: {
      options: hierarchyNodes.map((n) => ({ value: n.id, label: n.name })),
    },
    "period.start": { label: "Start" },
    "period.end": { label: "End" },
    householdsReached: { label: "Households Reached" },
    estimationMethod: { label: "Estimation Method" },
  });

  const overrides = $derived({ ...hierarchyOverride });
</script>

<div class="mx-auto max-w-2xl space-y-6 p-6">
  <h1 class="text-2xl font-semibold text-slate-950">Manual entry</h1>

  {#if manualConnectors.length === 0}
    <p class="text-slate-500">No manual connectors are configured for this tenant.</p>
  {:else}
    <div class="space-y-4">
      <label class="block">
        <span class="text-sm font-medium text-slate-700">Source</span>
        <select
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          bind:value={selectedKey}
          aria-label="Source"
        >
          {#each manualConnectors as connector (connector.key)}
            <option value={connector.key}>{connector.name}</option>
          {/each}
        </select>
      </label>

      {#if selectedConnector?.entrySchema}
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {#key formInstance}
            <FormFromSchema
              schema={selectedConnector.entrySchema as EntryJsonSchema}
              overrides={overrides}
              onSubmit={handleEntrySubmit}
              submitLabel="Submit"
            />
          {/key}
        </div>
      {/if}
    </div>

    {#if form?.success}
      <p class="rounded-md bg-green-50 p-4 text-sm font-medium text-green-700" role="status">
        Entry saved
      </p>
    {/if}

    {#if form?.error}
      <p class="rounded-md bg-red-50 p-4 text-sm text-red-700" role="alert">{form.error}</p>
    {/if}
  {/if}
</div>
