<script lang="ts">
  import { enhance } from "$app/forms";
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
  // pending payload stored outside of Svelte state to avoid timing issues
  let pendingPayloadStore = { value: "" };

  const selectedConnector = $derived(
    manualConnectors.find((c) => c.key === selectedKey) ?? manualConnectors[0],
  );

  $effect(() => {
    if (!selectedKey && manualConnectors.length > 0) {
      selectedKey = manualConnectors[0]!.key;
    }
  });

  let hiddenForm = $state<HTMLFormElement | null>(null);

  function handleEntrySubmit(payload: Record<string, unknown>) {
    pendingPayloadStore.value = JSON.stringify(payload);
    hiddenForm?.requestSubmit();
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
          <FormFromSchema
            schema={selectedConnector.entrySchema as EntryJsonSchema}
            overrides={overrides}
            onSubmit={handleEntrySubmit}
            submitLabel="Submit"
          />
        </div>
      {/if}
    </div>

    <!-- hidden form that posts to the server action via use:enhance -->
    <form
      bind:this={hiddenForm}
      method="POST"
      class="hidden"
      use:enhance={({ formData }) => {
        // inject payload into form data at submit time (bypasses timing issues)
        formData.set("connectorKey", selectedKey);
        formData.set("payload", pendingPayloadStore.value);

        return async ({ update }) => {
          await update();
        };
      }}
    >
      <input type="hidden" name="connectorKey" value="" />
      <input type="hidden" name="payload" value="" />
    </form>

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
