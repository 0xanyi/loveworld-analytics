<script lang="ts">
  import { applyAction, deserialize } from "$app/forms";
  import type { ActionResult } from "@sveltejs/kit";
  import { Chevron, FormFromSchema } from "@lwa/ui";

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

<!-- Page uses the tenant layout's full max-w-7xl width so the header
     aligns with Dashboard / Source Health / Hierarchy. The entry form
     itself is constrained further down — long text inputs are harder to
     scan, so the form card caps at max-w-3xl. -->
<div>
  <!-- ──────────── Header ──────────── -->
  <section class="rise">
    <div class="border-b border-hairline pb-8">
      <p class="eyebrow">Write ledger</p>
      <h1 class="font-display mt-3 text-6xl leading-[0.95] text-ink">
        Manual entry
      </h1>
      <p class="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
        Log a period of viewership directly into the rollup. Entries are attributed to
        the selected hierarchy node and versioned alongside automated ingestion.
      </p>
    </div>
  </section>

  {#if manualConnectors.length === 0}
    <section
      class="mt-12 flex flex-col items-center justify-center gap-3 border border-dashed border-hairline bg-surface px-8 py-20 text-center rise rise-1"
    >
      <p class="eyebrow">Unavailable</p>
      <p class="font-display text-3xl text-ink">
        No manual connectors configured.
      </p>
      <p class="max-w-md text-sm text-ink-muted">
        Ask your network administrator to enable a manual connector for this tenant
        before recording entries.
      </p>
    </section>
  {:else}
    <!-- Interactive controls (source picker + form) are constrained so
         individual inputs stay a comfortable scan width on wide screens.
         Left-aligned to match the header; not centred. -->
    <div class="max-w-3xl">
      <!-- ──────────── Source picker ──────────── -->
      <section class="mt-10 rise rise-1">
        <label class="block max-w-md">
          <span class="eyebrow">Source</span>
          <div class="relative mt-2">
            <select
              class="field-underline appearance-none pr-6"
              bind:value={selectedKey}
              aria-label="Source"
            >
              {#each manualConnectors as connector (connector.key)}
                <option value={connector.key}>{connector.name}</option>
              {/each}
            </select>
            <Chevron class="absolute right-0 top-1/2 -translate-y-1/2" />
          </div>
        </label>
      </section>

      <!-- ──────────── Entry form ──────────── -->
      {#if selectedConnector?.entrySchema}
        <section class="mt-10 border border-hairline bg-surface p-8 rise rise-2 lg:p-10">
          <p class="eyebrow mb-6">Entry · {selectedConnector.name}</p>
          {#key formInstance}
            <FormFromSchema
              schema={selectedConnector.entrySchema as EntryJsonSchema}
              overrides={overrides}
              onSubmit={handleEntrySubmit}
              submitLabel="Submit"
            />
          {/key}
        </section>
      {/if}

      <!-- ──────────── Result banners ──────────── -->
      {#if form?.success}
        <p
          class="mt-8 flex items-center gap-3 border-l-2 border-positive bg-positive/6 px-4 py-3 text-sm font-medium text-positive rise"
          role="status"
        >
          <span class="inline-block h-1.5 w-1.5 rounded-full bg-positive" aria-hidden="true"></span>
          Entry saved
        </p>
      {/if}

      {#if form?.error}
        <p
          class="mt-8 border-l-2 border-negative bg-negative/6 px-4 py-3 text-sm text-negative rise"
          role="alert"
        >
          {form.error}
        </p>
      {/if}
    </div>
  {/if}
</div>
