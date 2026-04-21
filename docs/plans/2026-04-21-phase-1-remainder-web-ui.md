# Phase 1 Remainder — Web UI Core Implementation Plan

> **REQUIRED SUB-SKILL:** Use `/skill:subagent-driven-development` (recommended) or `/skill:executing-plans` to implement this plan task-by-task.

**Goal:** Finish the remaining Phase 1 web experience by adding tenant-aware root routing, hierarchy management UI, and the first real dashboard UI on top of the already-implemented Phase 1 backend APIs.

**Architecture:** Keep the backend changes minimal and targeted: add one explicit session-membership API for root routing, then build server-loaded SvelteKit pages that call the existing tenant hierarchy and metrics endpoints. Reuse the existing `@lwa/ui` package for new presentational components, and keep the web app thin by centralising SSR-friendly API helpers in `apps/web/src/lib`.

**Tech Stack:** SvelteKit 2, Svelte 5, Playwright, Hono API, Better Auth, existing `@lwa/ui` package

---

## Current repo reality

This plan is intentionally based on the repo as it exists now, not the older Phase 1 plan's assumptions.

Already implemented and reusable:
- `GET /tenants/:slug/hierarchy`
- hierarchy CRUD API
- `GET /tenants/:slug/metrics/board`
- RBAC middleware and scoped hierarchy checks
- tenant-scoped shell at `apps/web/src/routes/[tenant]/+layout.*`
- browser API helper in `apps/web/src/lib/api-client.ts`
- login page and Better Auth client wiring
- `@lwa/ui` package with base primitives (`Button`, `Card`)

Missing and required for the UI remainder:
- root tenant selection data source (`/me` currently returns only `user`)
- SSR-friendly web API client helper
- tenant switcher root page
- hierarchy management pages and reusable hierarchy UI components
- KPI/dashboard UI components and tenant dashboard page
- Playwright coverage for the new UI paths

## File structure map

### Backend/API
- Modify: `services/api/src/routes/me.ts`
  - expand `/me` to return memberships explicitly for authenticated users
- Modify: `services/api/test/app.test.ts`
  - preserve unauthenticated contract and add membership shape coverage
- Create or modify: `services/api/test/me.test.ts` if needed
  - focused authenticated `/me` coverage

### Web shared helpers
- Create: `apps/web/src/lib/server/api.ts`
  - SSR-friendly API helper that forwards cookies to the API origin
- Create: `apps/web/src/lib/server/session.ts`
  - small helpers for root/membership loading if needed
- Keep: `apps/web/src/lib/api-client.ts`
  - browser-side helper for client actions/forms

### UI package
- Create: `packages/ui/src/lib/components/TreeItem.svelte`
- Create: `packages/ui/src/lib/components/Tree.svelte`
- Create: `packages/ui/src/lib/components/KpiTile.svelte`
- Create: `packages/ui/src/lib/components/Sparkline.svelte`
- Create: `packages/ui/src/lib/components/PeriodPicker.svelte`
- Create: `packages/ui/src/lib/components/ComparisonPicker.svelte`
- Modify: `packages/ui/src/lib/components/index.ts`
- Modify: `packages/ui/src/lib/index.ts` if needed
- Create: `packages/ui/test/KpiTile.test.ts`

### Web routes
- Modify: `apps/web/src/routes/+page.server.ts`
  - stop always redirecting to `/login`; route based on session + memberships
- Create: `apps/web/src/routes/+page.svelte`
  - tenant switcher page for multi-tenant users
- Create: `apps/web/src/routes/[tenant]/settings/+layout.svelte`
  - small settings subnav container if needed
- Create: `apps/web/src/routes/[tenant]/settings/hierarchy/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/settings/hierarchy/+page.svelte`
- Modify: `apps/web/src/routes/[tenant]/+page.svelte`
  - replace placeholder card with real dashboard UI
- Create: `apps/web/src/routes/[tenant]/+page.server.ts`
  - load metrics board data and resolve default hierarchy node

### Web tests
- Create: `apps/web/tests/root-routing.spec.ts`
- Create: `apps/web/tests/hierarchy.spec.ts`
- Create: `apps/web/tests/dashboard.spec.ts`

---

## Task 1: Extend `/me` to expose tenant memberships explicitly

**TDD scenario:** Modifying tested code — add targeted route tests first, then expand the route contract.

**Files:**
- Modify: `services/api/src/routes/me.ts`
- Modify: `services/api/test/app.test.ts`
- Create: `services/api/test/me.test.ts`

**Why this task exists:** The web root page cannot implement tenant-aware routing without knowing which tenants the current user belongs to. The current `/me` route intentionally exposes only `user`, which is too small for Phase 1 web routing. This task expands the API contract in one explicit place instead of inventing ad-hoc frontend workarounds.

- [ ] **Step 1: Write authenticated `/me` route tests**

Create `services/api/test/me.test.ts` with tests for:
- authenticated `/me` returns `user` plus `memberships`
- memberships include `tenantId`, `tenantSlug`, `tenantName`, `role`, `scopeNodeIds`
- memberships exclude archived tenants
- unauthenticated still returns 401

Use the existing auth stubbing style from `services/api/test/rbac.test.ts` and `services/api/test/connectors.test.ts`.

- [ ] **Step 2: Run the new tests to verify they fail**

Run:
```bash
pnpm -F @lwa/api test -- test/me.test.ts
```

Expected:
- FAIL because `/me` does not yet return `memberships`

- [ ] **Step 3: Implement the expanded `/me` route**

Modify `services/api/src/routes/me.ts` so it:
- keeps the explicit `user` subset
- queries `tenant` + `tenantMembership` for the authenticated user
- filters archived tenants
- returns:

```ts
{
  user: {
    id,
    email,
    name,
    emailVerified,
    image,
    twoFactorEnabled,
  },
  memberships: [
    {
      tenantId: string,
      tenantSlug: string,
      tenantName: string,
      role: "network_admin" | "station_manager" | "board_viewer" | "analyst",
      scopeNodeIds: string[],
    }
  ]
}
```

Implementation requirement:
- do **not** return the raw Better Auth session object
- do **not** collapse this into middleware; keep `/me` the explicit frontend contract boundary

- [ ] **Step 4: Verify route tests pass**

Run:
```bash
pnpm -F @lwa/api test -- test/me.test.ts test/app.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Verify API typecheck**

Run:
```bash
pnpm -F @lwa/api typecheck
```

Expected:
- exit 0

---

## Task 2: Add SSR-friendly API helpers for the web app

**TDD scenario:** New helper in lightly-tested area — typecheck plus route integration will be the main verification.

**Files:**
- Create: `apps/web/src/lib/server/api.ts`
- Create: `apps/web/src/lib/server/session.ts`
- Optionally modify: `apps/web/src/lib/api-client.ts`

**Why this task exists:** The current `api-client.ts` is browser-only and unsuitable for SvelteKit server loads. The Phase 1 pages need a server-side helper that forwards cookies to the API, uses the configured API base URL, and keeps route load functions small.

- [ ] **Step 1: Create SSR API helper**

Create `apps/web/src/lib/server/api.ts` with a helper shaped like:

```ts
import { env } from "$env/dynamic/private";
import type { Cookies } from "@sveltejs/kit";

const API_BASE = env.API_BASE_URL ?? env.AUTH_BASE_URL ?? "http://localhost:3001";

export async function serverApiFetch(
  path: string,
  options: {
    cookies: Cookies;
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
  },
): Promise<Response> {
  const cookieHeader = options.cookies
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  return fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}
```

- [ ] **Step 2: Add small session helpers**

Create `apps/web/src/lib/server/session.ts` with helpers like:
- `loadCurrentUser(cookies)`
- `loadMemberships(cookies)`
- `requireMembershipsOrRedirect(cookies)`

These should wrap `serverApiFetch("/me")` and keep route code terse.

- [ ] **Step 3: Verify web typecheck**

Run:
```bash
pnpm -F @lwa/web typecheck
```

Expected:
- exit 0

---

## Task 3: Tenant-aware root routing and switcher page

**TDD scenario:** New feature — Playwright e2e plus route-load verification through runtime behavior.

**Files:**
- Modify: `apps/web/src/routes/+page.server.ts`
- Create: `apps/web/src/routes/+page.svelte`
- Create: `apps/web/tests/root-routing.spec.ts`

**Why this task exists:** Today `/` always redirects to `/login`. Phase 1 needs `/` to behave like a tenant-aware landing page: unauthenticated users go to login, single-tenant users go straight to their tenant dashboard, multi-tenant users get a switcher.

- [ ] **Step 1: Write Playwright coverage for root routing**

Create `apps/web/tests/root-routing.spec.ts` covering:
- unauthenticated `GET /` redirects to `/login`
- authenticated single-tenant user reaches `/<slug>`
- authenticated multi-tenant user sees a tenant switcher page listing memberships

Use the existing `apps/web/tests/login.spec.ts` style and existing local dev assumptions.

- [ ] **Step 2: Run the new Playwright spec to verify current failure**

Run:
```bash
pnpm -F @lwa/web test:e2e -- root-routing.spec.ts
```

Expected:
- FAIL because `/` still always redirects to `/login`

- [ ] **Step 3: Implement root server load behavior**

Modify `apps/web/src/routes/+page.server.ts` so it:
- calls `loadMemberships(cookies)`
- redirects unauthenticated users to `/login`
- redirects single-tenant users to `/${tenantSlug}`
- returns `{ memberships }` for multi-tenant users

- [ ] **Step 4: Implement tenant switcher UI**

Create `apps/web/src/routes/+page.svelte` to render membership cards/buttons linking to `/${tenantSlug}`.

Requirements:
- no client fetch on mount; use server-loaded data
- simple UI is fine; reuse `Card` / `Button`
- show tenant name and role

- [ ] **Step 5: Verify root routing spec passes**

Run:
```bash
pnpm -F @lwa/web test:e2e -- root-routing.spec.ts
```

Expected:
- PASS

---

## Task 4: Build hierarchy UI components in `@lwa/ui`

**TDD scenario:** New feature — keep components small and deterministic; verification will come mainly through web usage and typecheck.

**Files:**
- Create: `packages/ui/src/lib/components/TreeItem.svelte`
- Create: `packages/ui/src/lib/components/Tree.svelte`
- Modify: `packages/ui/src/lib/components/index.ts`

**Why this task exists:** The hierarchy management page needs a reusable way to render tenant trees. A small recursive component pair is enough for Phase 1 and avoids baking hierarchy rendering directly into the route page.

- [ ] **Step 1: Create `TreeItem.svelte`**

Create a focused recursive component that accepts:
- `node`
- `selectedId`
- `onSelect`
- `onCreateChild`
- `onRename`
- `onArchive`

Node shape:

```ts
export type TreeNode = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  children: TreeNode[];
};
```

- [ ] **Step 2: Create `Tree.svelte`**

`Tree.svelte` should:
- accept flat root nodes already assembled into a tree
- render `TreeItem` recursively
- remain presentational only

- [ ] **Step 3: Export the new components**

Modify `packages/ui/src/lib/components/index.ts` and package exports so web routes can import `Tree`.

- [ ] **Step 4: Verify UI package typecheck**

Run:
```bash
pnpm -F @lwa/ui typecheck
```

Expected:
- exit 0

---

## Task 5: Implement hierarchy management page

**TDD scenario:** New feature — browser behavior validated by Playwright; minimal server/load logic validated through real page execution.

**Files:**
- Create: `apps/web/src/routes/[tenant]/settings/+layout.svelte`
- Create: `apps/web/src/routes/[tenant]/settings/hierarchy/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/settings/hierarchy/+page.svelte`
- Create: `apps/web/tests/hierarchy.spec.ts`

**Why this task exists:** Task 8 already shipped hierarchy CRUD in the API. This task makes that functionality usable from the web app so admins can build the tenant hierarchy without raw API calls.

- [ ] **Step 1: Write Playwright hierarchy flow**

Create `apps/web/tests/hierarchy.spec.ts` covering:
- network admin can open `/<tenant>/settings/hierarchy`
- can create a root station node
- can create a child broadcast or language node
- can rename a node
- archived nodes disappear from the active list

- [ ] **Step 2: Run the spec to verify failure**

Run:
```bash
pnpm -F @lwa/web test:e2e -- hierarchy.spec.ts
```

Expected:
- FAIL because the page does not exist yet

- [ ] **Step 3: Implement hierarchy page server load**

Create `apps/web/src/routes/[tenant]/settings/hierarchy/+page.server.ts` to:
- load the tenant hierarchy via `GET /tenants/:slug/hierarchy`
- fail with `error(status, ...)` on non-OK response
- return flat nodes to the page

- [ ] **Step 4: Implement hierarchy page UI**

Create `apps/web/src/routes/[tenant]/settings/hierarchy/+page.svelte` with:
- tree view assembled from flat nodes
- simple create form
- simple rename flow
- archive action
- optimistic behavior is optional; server refresh after action is acceptable

Implementation constraints:
- use existing API endpoints only
- use standard SvelteKit `form` or button handlers; avoid adding client state frameworks
- keep Phase 1 scope narrow: no drag-and-drop, no fancy reordering

- [ ] **Step 5: Add settings shell if needed**

Create `apps/web/src/routes/[tenant]/settings/+layout.svelte` with a minimal subnav linking to hierarchy.

- [ ] **Step 6: Verify hierarchy spec passes**

Run:
```bash
pnpm -F @lwa/web test:e2e -- hierarchy.spec.ts
```

Expected:
- PASS

---

## Task 6: Add KPI UI components in `@lwa/ui`

**TDD scenario:** New feature — component unit test for formatting behavior, then route integration later.

**Files:**
- Create: `packages/ui/src/lib/components/Sparkline.svelte`
- Create: `packages/ui/src/lib/components/KpiTile.svelte`
- Create: `packages/ui/src/lib/components/PeriodPicker.svelte`
- Create: `packages/ui/src/lib/components/ComparisonPicker.svelte`
- Modify: `packages/ui/src/lib/components/index.ts`
- Create: `packages/ui/test/KpiTile.test.ts`

**Why this task exists:** The metrics API is already live. The missing piece is the presentation layer that turns those responses into real dashboard tiles and controls.

- [ ] **Step 1: Write a focused `KpiTile` test**

Create `packages/ui/test/KpiTile.test.ts` to cover:
- compact number formatting
- positive/negative/null delta presentation
- adjustment badge rendering

If the repo does not yet have Svelte component test setup in `@lwa/ui`, add the minimum necessary test wiring in this task only.

- [ ] **Step 2: Run the UI test to verify failure**

Run:
```bash
pnpm -F @lwa/ui test -- test/KpiTile.test.ts
```

Expected:
- FAIL because the component does not exist yet

- [ ] **Step 3: Implement `Sparkline.svelte`**

Keep it dependency-free:
- pure SVG path generation
- accepts `Array<{ t: Date | string; v: number }>`
- handles empty or single-point input gracefully

- [ ] **Step 4: Implement `KpiTile.svelte`**

Props:
- `label`
- `value`
- `deltaPct`
- `sparkline`
- `sourceChips`
- `hasAdjustments`
- optional `unit`

- [ ] **Step 5: Implement `PeriodPicker` and `ComparisonPicker`**

Keep them as small button groups for:
- period: `week`, `month`, `quarter`, `ytd`
- comparison: `yoy`, `qoq`, `mom`, `none`

- [ ] **Step 6: Export components and verify tests**

Run:
```bash
pnpm -F @lwa/ui test -- test/KpiTile.test.ts
pnpm -F @lwa/ui typecheck
```

Expected:
- PASS
- exit 0

---

## Task 7: Replace the tenant dashboard placeholder with the real board page

**TDD scenario:** New feature — Playwright plus real route/server integration.

**Files:**
- Create: `apps/web/src/routes/[tenant]/+page.server.ts`
- Modify: `apps/web/src/routes/[tenant]/+page.svelte`
- Create: `apps/web/tests/dashboard.spec.ts`

**Why this task exists:** The Phase 0 placeholder is still present at `apps/web/src/routes/[tenant]/+page.svelte`. The metrics API already returns the two Phase 1 tiles; this task wires them into the web app.

- [ ] **Step 1: Write dashboard Playwright coverage**

Create `apps/web/tests/dashboard.spec.ts` to assert:
- tenant dashboard renders tile labels for TV and Web
- non-zero values are visible when seeded data exists
- period/comparison controls update the URL and rerender

- [ ] **Step 2: Run the dashboard spec to verify failure**

Run:
```bash
pnpm -F @lwa/web test:e2e -- dashboard.spec.ts
```

Expected:
- FAIL because the dashboard is still the Phase 0 placeholder

- [ ] **Step 3: Implement server load for tenant dashboard**

Create `apps/web/src/routes/[tenant]/+page.server.ts` that:
- reads `period`, `comparison`, and optional `hierarchyNodeId` from the URL
- loads hierarchy via `/tenants/:slug/hierarchy`
- resolves a default root station node when `hierarchyNodeId` is absent
- loads board metrics from `/tenants/:slug/metrics/board`
- returns `{ tenantSlug, hierarchyNodes, selectedNodeId, period, comparison, tiles }`

- [ ] **Step 4: Implement dashboard UI**

Modify `apps/web/src/routes/[tenant]/+page.svelte` to:
- remove the Phase 0 placeholder copy
- render `PeriodPicker` + `ComparisonPicker`
- render the two `KpiTile`s from API data
- optionally provide a simple hierarchy-node selector if needed for usability

Constraints:
- no custom chart library
- no client-only fetch bootstrap
- the page must work through SSR load + navigation

- [ ] **Step 5: Verify dashboard spec passes**

Run:
```bash
pnpm -F @lwa/web test:e2e -- dashboard.spec.ts
```

Expected:
- PASS

---

## Task 8: Full verification for the web remainder

**TDD scenario:** Verification-only task.

**Files:**
- No new product files

**Why this task exists:** Before handing off Task 11 work, the web remainder needs proof that the new API contract, new routes, and new UI all behave together.

- [ ] **Step 1: Run targeted package tests**

Run:
```bash
pnpm -F @lwa/api test -- test/me.test.ts test/app.test.ts
pnpm -F @lwa/ui test -- test/KpiTile.test.ts
pnpm -F @lwa/web test:e2e -- root-routing.spec.ts hierarchy.spec.ts dashboard.spec.ts
```

Expected:
- all pass

- [ ] **Step 2: Run typechecks**

Run:
```bash
pnpm -F @lwa/api typecheck
pnpm -F @lwa/ui typecheck
pnpm -F @lwa/web typecheck
```

Expected:
- all exit 0

- [ ] **Step 3: Run broader workspace verification**

Run:
```bash
pnpm -w turbo lint typecheck test
```

Expected:
- green workspace run

- [ ] **Step 4: Commit**

```bash
git add services/api/src/routes/me.ts services/api/test/app.test.ts services/api/test/me.test.ts apps/web/src/lib/server/api.ts apps/web/src/lib/server/session.ts apps/web/src/routes/+page.server.ts apps/web/src/routes/+page.svelte apps/web/src/routes/[tenant]/settings/+layout.svelte apps/web/src/routes/[tenant]/settings/hierarchy/+page.server.ts apps/web/src/routes/[tenant]/settings/hierarchy/+page.svelte apps/web/src/routes/[tenant]/+page.server.ts apps/web/src/routes/[tenant]/+page.svelte apps/web/tests/root-routing.spec.ts apps/web/tests/hierarchy.spec.ts apps/web/tests/dashboard.spec.ts packages/ui/src/lib/components/TreeItem.svelte packages/ui/src/lib/components/Tree.svelte packages/ui/src/lib/components/Sparkline.svelte packages/ui/src/lib/components/KpiTile.svelte packages/ui/src/lib/components/PeriodPicker.svelte packages/ui/src/lib/components/ComparisonPicker.svelte packages/ui/src/lib/components/index.ts packages/ui/test/KpiTile.test.ts
```

Commit message:
```bash
git commit -m "feat(web,ui): finish Phase 1 hierarchy and dashboard UI"
```

---

## Self-review

### Spec coverage
- tenant switcher root page: covered
- membership source for root routing: covered via `/me` expansion
- hierarchy management UI: covered
- dashboard UI components: covered
- TV-households + Web tiles: covered
- SSR-friendly API loading: covered
- verification: covered

### Placeholder scan
- no TBD/TODO placeholders remain
- no old assumption that `/me` already returns memberships

### Type consistency
- UI routes rely on existing API endpoints plus one explicit `/me` contract expansion
- no Task 11-only concerns are mixed in here

---

Plan complete and saved to `docs/plans/2026-04-21-phase-1-remainder-web-ui.md`. Two execution options:

**1. Subagent-Driven (recommended, this session)** — Fresh subagent per task with two-stage review. Better for plans with many independent or moderately-coupled tasks.

**2. Parallel Session (separate)** — Execute in a separate session using checkpoints. Better when tasks are tightly coupled or you want stronger human review between batches.
