# Phase 1 UI Ops Slice Design

**Date:** 2026-04-21  
**Branch:** `feat/phase-1-finish-gate`  
**Status:** Proposed / approved in chat, pending written-spec review

## Goal

Ship the UI-first remainder slice for Phase 1 by adding:

- a small schema-driven form component in `@lwa/ui`
- a manual entry page for configured manual connectors
- source health list/detail pages with read-only access for `network_admin` and `station_manager`

This slice should move tenant operations from API-only to usable web UI without taking on the remaining CLI/gate automation work yet.

## Why this slice exists

The repo now has the tenant switcher, dashboard, hierarchy management, auth flow, and CI-safe Playwright setup. The remaining Phase 1 gap on the product side is operational UI:

- manual connectors can ingest entries, but only through the API
- connector status and recent runs exist, but only through management endpoints
- station managers need visibility into source health without inheriting full connector-management permissions

This design closes those gaps while keeping the branch small enough to review and verify.

## Scope

### In scope

- `packages/ui/src/lib/components/FormFromSchema.svelte`
- tests for the supported schema subset
- `apps/web/src/routes/[tenant]/entry/*`
- `apps/web/src/routes/[tenant]/sources/*`
- minimal API additions needed to support read-only source health access for `station_manager`
- Playwright coverage for manual entry and source health

### Out of scope

- `admin:set-password`
- `phase1:gate`
- CI gate wiring beyond the new route/spec coverage
- expanding the JSON Schema renderer into a generic form engine
- connector creation, testing, credential updates, or account attachment UI
- drag-and-drop hierarchy or richer operations UI

## Key decisions

### 1. Manual entry shows only configured manual connectors

The manual entry page will display only connectors that are both:

- present in the tenant's configured connector list, and
- manual connectors according to `/sources`

This avoids a dead-end UX because `POST /tenants/:slug/entries` already requires the connector to be configured for the tenant.

### 2. Source health is read-only for `network_admin` and `station_manager`

Read visibility and management are split.

- existing mutating connector endpoints remain gated by `manage_connectors`
- new read-only source-health endpoints will be accessible to:
  - `network_admin`
  - `station_manager`

This preserves the existing RBAC model while giving station managers operational visibility.

### 3. SSR-first route design

The new web pages will follow the existing Phase 1 pattern:

- route data loaded in `+page.server.ts`
- API requests made through `serverApiFetch`
- auth failures redirected to `/login`
- server actions used for submission when practical

No client-side bootstrap fetch layer will be introduced.

## Recommended approach

### Approach A — Reuse existing connector endpoints and broaden permissions

**Pros**
- least backend work
- fast to implement

**Cons**
- merges read-only visibility with management surfaces
- risks accidental future permission creep
- makes the boundary harder to reason about

### Approach B — Add dedicated read-only source-health endpoints

**Pros**
- clean permission model
- matches the difference between viewing and managing connectors
- keeps UI behavior explicit and predictable

**Cons**
- slight extra backend work

**Recommendation:** Approach B.

### Approach C — Only do manual entry now and defer source health

**Pros**
- smallest slice

**Cons**
- leaves Phase 1 operations UI incomplete
- forces a second UI branch immediately after this one

Not recommended.

## Architecture

## 1. `FormFromSchema` component

### Purpose

Render the small JSON Schema subset already produced by `GET /sources` for manual connectors.

### Supported schema subset

- `type: string` → text input
- `type: number` / `integer` → numeric input
- `enum` → select input
- `type: boolean` → checkbox
- `type: object` → grouped nested fields
- `required` → required state/indicator

### Explicitly unsupported in this slice

- arrays
- `oneOf` / `anyOf` / `allOf`
- arbitrary format/widget plugins
- recursive schema rendering beyond nested objects already used here

### API shape

The component will accept:

- `schema`
- `initialValue`
- optional field overrides for known cases where the page needs tenant-specific choices
- a submit callback or emitted payload carrying a plain object

The implementation should reconstruct nested objects from rendered fields and return a plain JS object matching the schema structure.

### Tenant-specific field override need

`hierarchyNodeId` is currently represented in connector entry schemas as a UUID string. The page needs that field rendered as a select using tenant hierarchy nodes rather than a plain free-text input.

To keep the component reusable without building a full widget system, the design will allow a narrow override map such as:

- custom options for enum-like fields
- label/help overrides
- hidden/read-only handling for fields prefilled by the route

This is enough for Phase 1 without expanding into a generic form framework.

## 2. Manual entry page

### Route files

- `apps/web/src/routes/[tenant]/entry/+page.server.ts`
- `apps/web/src/routes/[tenant]/entry/+page.svelte`

### Data loading

The page load will fetch:

- tenant hierarchy: `GET /tenants/:slug/hierarchy`
- tenant connector configs: existing connector list endpoint or a read-safe equivalent if required
- source catalog: `GET /sources`

The loader will join configured tenant connectors with the source catalog and keep only:

- configured connectors whose source exists in `/sources`
- sources with `kind === "manual"`

The returned page data will include:

- `tenantSlug`
- hierarchy nodes
- configured manual connector choices
- per-connector `entrySchema`

### UI flow

1. User lands on `/<tenant>/entry`
2. Page shows connector picker for configured manual connectors
3. Selected connector schema is rendered through `FormFromSchema`
4. `hierarchyNodeId` renders as a select sourced from hierarchy nodes
5. Form submits to `POST /tenants/:slug/entries`
6. Page shows success/error feedback inline

### Empty states

If no configured manual connectors exist, the page renders an operational empty state that explains the tenant has no manual sources configured yet.

### Submission shape

The page will submit:

```json
{
  "connectorKey": "manual_satellite",
  "entry": {
    "hierarchyNodeId": "...",
    "period": {
      "start": "...",
      "end": "..."
    },
    "householdsReached": 12345,
    "estimationMethod": "panel"
  }
}
```

The page should preserve the API contract rather than inventing a web-specific adapter.

## 3. Source health pages

### Route files

- `apps/web/src/routes/[tenant]/sources/+page.server.ts`
- `apps/web/src/routes/[tenant]/sources/+page.svelte`
- `apps/web/src/routes/[tenant]/sources/[id]/+page.server.ts`
- `apps/web/src/routes/[tenant]/sources/[id]/+page.svelte`

### Required API shape

To support read-only visibility for `station_manager`, add dedicated read-only endpoints rather than reusing management endpoints directly.

Recommended endpoints:

- `GET /tenants/:slug/source-health`
- `GET /tenants/:slug/source-health/:id`

These endpoints should return only the data needed for the pages:

#### List page
- connector config id
- source key
- source name
- enabled flag
- status
- last run timestamp
- last error

#### Detail page
- connector config summary
- recent runs (up to 50)

### Permission rule

These endpoints should use a read-only capability check equivalent to:

- allow `network_admin`
- allow `station_manager`
- deny `board_viewer`
- deny `analyst`

This can be implemented either by:

- a new dedicated API middleware helper for role-checked read access, or
- a focused route-local membership check

The important boundary is semantic: source health is read-only operational visibility, not connector management.

### UI behavior

#### List page
Shows one row/card per configured connector with:

- source name
- source key
- enabled/disabled state
- connector status
- last run time
- last error if present
- link to the detail page

#### Detail page
Shows:

- connector summary metadata
- recent run history
- run status
- start/finish timestamps
- error message and warnings when present

### Empty states

- no connectors configured → list page shows an empty operational state
- no runs yet → detail page explains that the connector has not run yet

## 4. Navigation and layout

The current tenant shell is minimal. This slice should add links in the existing tenant experience so the new pages are discoverable.

Recommended additions:

- dashboard
- manual entry
- source health
- settings / hierarchy

This should stay lightweight and consistent with the existing shell rather than introducing a larger navigation redesign.

## Data flow

### Manual entry

1. SSR load fetches hierarchy + configured connectors + source catalog
2. User selects configured manual connector
3. `FormFromSchema` renders schema-backed fields
4. User submits form
5. Server action or route-side submit calls `POST /tenants/:slug/entries`
6. Success or validation error is rendered back into the page

### Source health

1. SSR load calls read-only source-health list endpoint
2. List page renders connector summaries
3. User clicks a connector
4. Detail page SSR load calls read-only source-health detail endpoint
5. Detail page renders recent runs and status information

## Error handling

### Authentication

- 401 from API → redirect to `/login`

### Authorization

- forbidden pages should surface as 403 page errors rather than ambiguous empty states

### Missing data

- no configured manual connectors → empty state on entry page
- no connectors configured → empty state on source health page
- no runs yet → empty state on source health detail

### Validation

- field-level validation from API stays authoritative
- the UI may provide basic HTML constraints, but should not duplicate business logic beyond obvious input types

## Testing strategy

## 1. UI package tests

Create `packages/ui/test/FormFromSchema.test.ts` covering:

- string field rendering/collection
- integer/number field rendering/collection
- enum select behavior
- required fields represented correctly
- nested object reconstruction on submit
- boolean handling if present

The test should target the supported subset only.

## 2. Playwright: manual entry

Create `apps/web/tests/manual-entry.spec.ts` covering:

- configured manual connector is visible
- unconfigured manual sources are not offered
- hierarchy node can be selected
- valid form submission succeeds
- success state is visible after submit

Seed data must include:

- tenant
- hierarchy node(s)
- at least one configured manual connector
- at least one additional manual source not configured for negative coverage if useful

## 3. Playwright: source health

Create `apps/web/tests/source-health.spec.ts` covering:

- network admin can open list/detail
- station manager can open list/detail
- source list shows status metadata
- detail page shows recent runs
- unauthorized roles are denied if covered in the easiest stable way

## 4. Verification commands

Expected branch-level verification:

```bash
pnpm -F @lwa/ui test -- test/FormFromSchema.test.ts
pnpm -F @lwa/ui typecheck
pnpm -F @lwa/web test:e2e -- manual-entry.spec.ts source-health.spec.ts
pnpm -F @lwa/web typecheck
pnpm -F @lwa/api test -- test/source-health*.test.ts
pnpm -F @lwa/api typecheck
```

Exact API test filenames may vary based on the final route test split.

## Risks and mitigations

### Risk: JSON Schema rendering grows beyond current need

**Mitigation:** keep support limited to the connector schemas already present in the repo. If a future schema needs arrays or advanced composition, that should be a new design step.

### Risk: station manager read access becomes entangled with management APIs

**Mitigation:** keep source health on separate read-only endpoints.

### Risk: form-field overrides become a hidden widget system

**Mitigation:** keep overrides narrow and declarative: options, labels, read-only/hidden state, and nothing more.

## Rollout

This slice can land independently before the remaining Phase 1 ops tasks.

Follow-on work after this branch:

1. `admin:set-password`
2. `phase1:gate`
3. CI/runbook wiring for the gate

## Success criteria

This design is successful when:

- a tenant admin can submit manual entries from the web UI using configured manual connectors
- a station manager can view source health and recent runs without connector-management permissions
- the schema renderer is small, testable, and limited to the current repo needs
- the new pages follow the same SSR/server-load pattern as the rest of the Phase 1 web app
