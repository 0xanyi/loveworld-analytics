# Phase 1 Remainder — Finish and Gate Implementation Plan

> **REQUIRED SUB-SKILL:** Use `/skill:subagent-driven-development` (recommended) or `/skill:executing-plans` to implement this plan task-by-task.

**Goal:** Close the remaining Phase 1 gap after the web UI core lands by shipping the manual entry console, source health pages, `admin:set-password`, and a reproducible `phase1:gate` script.

**Architecture:** Reuse the Phase 1 APIs that already exist (`/sources`, `/tenants/:slug/entries`, connector management routes, runs list, backfill trigger) instead of inventing new backend surfaces. Keep the remaining backend change limited to the admin password CLI unless a concrete missing gap is discovered during implementation. The gate script becomes the single executable proof that a fresh tenant can go from setup to non-zero board tiles.

**Tech Stack:** SvelteKit 2, Svelte 5, Hono API, Better Auth, tsx CLI scripts, existing Phase 1 APIs

---

## Prerequisites

This plan assumes `docs/plans/2026-04-21-phase-1-remainder-web-ui.md` has already landed, because Task 11 depends on the web shell, tenant routing, hierarchy page, and dashboard page existing.

If that plan is not yet implemented, stop and do it first.

## Current repo reality

Already implemented and reusable:
- `GET /sources`
- `GET /tenants/:slug/connectors`
- `POST /tenants/:slug/connectors`
- `POST /tenants/:slug/connectors/:id/test`
- `GET /tenants/:slug/connectors/:id/runs`
- `POST /tenants/:slug/connectors/:id/accounts`
- `POST /tenants/:slug/entries`
- `POST /tenants/:slug/connectors/:id/backfill`
- `pnpm admin:create-tenant`

Missing and required for Phase 1 completion:
- generic schema-driven form component for manual and connector forms
- manual entry page
- source health list and connector detail page
- `admin:set-password`
- `phase1:gate`
- CI/runbook wiring for the gate

## File structure map

### UI package
- Create: `packages/ui/src/lib/components/FormFromSchema.svelte`
- Modify: `packages/ui/src/lib/components/index.ts`
- Create: `packages/ui/test/FormFromSchema.test.ts`

### Web routes
- Create: `apps/web/src/routes/[tenant]/entry/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/entry/+page.svelte`
- Create: `apps/web/src/routes/[tenant]/sources/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/sources/+page.svelte`
- Create: `apps/web/src/routes/[tenant]/sources/[id]/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/sources/[id]/+page.svelte`
- Create: `apps/web/tests/manual-entry.spec.ts`
- Create: `apps/web/tests/source-health.spec.ts`

### API / CLI
- Create: `services/api/src/admin/set-password.ts`
- Modify: `services/api/package.json`
- Modify: `package.json`
- Create: `services/api/test/set-password.test.ts`

### Gate automation
- Create: `scripts/phase1-gate.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/runbooks/phase1-gate.md`

---

## Task 1: Add schema-driven form support in `@lwa/ui`

**TDD scenario:** New feature — component-level tests first, then use it in the web routes.

**Files:**
- Create: `packages/ui/src/lib/components/FormFromSchema.svelte`
- Modify: `packages/ui/src/lib/components/index.ts`
- Create: `packages/ui/test/FormFromSchema.test.ts`

**Why this task exists:** The remaining Phase 1 web pages need to render forms from the JSON schemas already returned by `GET /sources`. A small reusable component avoids duplicating field rendering logic across connector setup and manual entry pages.

- [ ] **Step 1: Write a focused form test**

Create `packages/ui/test/FormFromSchema.test.ts` covering:
- text input from `type: string`
- numeric input from `type: number` / `integer`
- select input from `enum`
- required fields reflected in labels or validation state
- submit payload shape returned to the caller

- [ ] **Step 2: Run the test to verify failure**

Run:
```bash
pnpm -F @lwa/ui test -- test/FormFromSchema.test.ts
```

Expected:
- FAIL because the component does not exist yet

- [ ] **Step 3: Implement `FormFromSchema.svelte`**

The component should:
- accept `schema`
- accept `initialValue`
- emit `onSubmit` with a plain object payload
- support the subset currently needed by repo schemas:
  - string
  - number/integer
  - boolean if present
  - enum/select
  - nested object fields via dotted names or grouped sections
  - date-like string fields where necessary

Keep the implementation Phase-1-sized:
- no full JSON Schema engine
- no recursive arrays unless a current schema actually needs them

- [ ] **Step 4: Export the component and verify**

Run:
```bash
pnpm -F @lwa/ui test -- test/FormFromSchema.test.ts
pnpm -F @lwa/ui typecheck
```

Expected:
- PASS
- exit 0

---

## Task 2: Build the manual entry console

**TDD scenario:** New feature — Playwright-driven with real API usage.

**Files:**
- Create: `apps/web/src/routes/[tenant]/entry/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/entry/+page.svelte`
- Create: `apps/web/tests/manual-entry.spec.ts`

**Why this task exists:** The manual entry API already exists, but Phase 1 is not complete until an admin can actually submit manual entries from the UI.

- [ ] **Step 1: Write manual entry Playwright coverage**

Create `apps/web/tests/manual-entry.spec.ts` to assert:
- manual entry page loads manual connector definitions from `/sources`
- admin can choose a manual source
- admin can submit a valid entry
- successful submission leads to visible success state or refreshed page state

- [ ] **Step 2: Run the spec to verify failure**

Run:
```bash
pnpm -F @lwa/web test:e2e -- manual-entry.spec.ts
```

Expected:
- FAIL because the page does not exist yet

- [ ] **Step 3: Implement the page server load**

Create `apps/web/src/routes/[tenant]/entry/+page.server.ts` to load:
- `/sources`
- `/tenants/:slug/hierarchy`

Then return:
- tenant slug
- manual sources only (`kind === "manual"`)
- hierarchy nodes

- [ ] **Step 4: Implement the page UI**

Create `apps/web/src/routes/[tenant]/entry/+page.svelte` to:
- choose between manual connectors
- render the source's `entrySchema` through `FormFromSchema`
- inject hierarchy node choices where needed
- submit to `POST /tenants/:slug/entries`

Constraints:
- no bespoke form per manual connector unless the schema component proves insufficient
- keep UX simple and operational

- [ ] **Step 5: Verify the spec passes**

Run:
```bash
pnpm -F @lwa/web test:e2e -- manual-entry.spec.ts
```

Expected:
- PASS

---

## Task 3: Build source health and connector detail pages

**TDD scenario:** New feature — Playwright plus server-loaded pages.

**Files:**
- Create: `apps/web/src/routes/[tenant]/sources/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/sources/+page.svelte`
- Create: `apps/web/src/routes/[tenant]/sources/[id]/+page.server.ts`
- Create: `apps/web/src/routes/[tenant]/sources/[id]/+page.svelte`
- Create: `apps/web/tests/source-health.spec.ts`

**Why this task exists:** The source health list is part of the Phase 1 scope and is necessary for operators to see connector state, last errors, and recent runs without querying the API manually.

- [ ] **Step 1: Write Playwright coverage for source health**

Create `apps/web/tests/source-health.spec.ts` covering:
- source list page renders configured connectors
- status, last run, and last error are visible
- clicking a connector opens its detail page
- detail page renders recent runs

- [ ] **Step 2: Run the spec to verify failure**

Run:
```bash
pnpm -F @lwa/web test:e2e -- source-health.spec.ts
```

Expected:
- FAIL because the pages do not exist yet

- [ ] **Step 3: Implement source list server load**

Create `apps/web/src/routes/[tenant]/sources/+page.server.ts` to call:
- `GET /tenants/:slug/connectors`

- [ ] **Step 4: Implement source list UI**

Create `apps/web/src/routes/[tenant]/sources/+page.svelte` showing:
- connector name/key
- enabled/status
- last run time
- last error
- link to detail page

- [ ] **Step 5: Implement connector detail load and UI**

Create detail page files that call:
- `GET /tenants/:slug/connectors/:id/runs`

Render:
- connector id/basic metadata if available from navigation params or parent data
- last 50 runs
- status/error/warnings summary where present

- [ ] **Step 6: Verify the spec passes**

Run:
```bash
pnpm -F @lwa/web test:e2e -- source-health.spec.ts
```

Expected:
- PASS

---

## Task 4: Add `admin:set-password` CLI

**TDD scenario:** New feature — focused integration test first, then CLI implementation.

**Files:**
- Create: `services/api/src/admin/set-password.ts`
- Modify: `services/api/package.json`
- Modify: `package.json`
- Create: `services/api/test/set-password.test.ts`

**Why this task exists:** The onboarding flow still depends on manual Better Auth sign-up. Phase 1 explicitly calls for a CLI that lets the platform owner create a tenant and then set an admin password without hand-driving auth endpoints.

- [ ] **Step 1: Write the password CLI integration test**

Create `services/api/test/set-password.test.ts` to prove:
- a user row exists without a usable credential
- running the CLI sets or updates the credential password
- sign-in succeeds afterward with the new password

Test style:
- follow the existing Testcontainers integration pattern in `services/api/test/*.test.ts`
- prefer invoking the script entrypoint over unit-testing helpers only

- [ ] **Step 2: Run the test to verify failure**

Run:
```bash
pnpm -F @lwa/api test -- test/set-password.test.ts
```

Expected:
- FAIL because the CLI does not exist yet

- [ ] **Step 3: Implement `services/api/src/admin/set-password.ts`**

Implementation requirements:
- parse `--email` and `--password`
- use `loadEnv()` for DB/auth env
- use `createDb()` and the existing auth wiring from `@lwa/auth`
- prefer Better Auth's supported password-setting API if available in the installed version
- if not available, use the exact supported password hashing/storage path for this Better Auth version after verifying it in code/docs

Output requirement:
- print a clear success line on success
- print usage on bad args
- exit non-zero on failure

- [ ] **Step 4: Add scripts**

Modify `services/api/package.json` to add:
```json
"admin:set-password": "tsx src/admin/set-password.ts"
```

Modify root `package.json` to add:
```json
"admin:set-password": "pnpm -F @lwa/api admin:set-password --"
```

- [ ] **Step 5: Verify the CLI test and typecheck**

Run:
```bash
pnpm -F @lwa/api test -- test/set-password.test.ts
pnpm -F @lwa/api typecheck
```

Expected:
- PASS
- exit 0

---

## Task 5: Add `phase1:gate` automation script

**TDD scenario:** New executable flow — verify by running the script against the local stack after implementation.

**Files:**
- Create: `scripts/phase1-gate.ts`
- Modify: `package.json`
- Create: `docs/runbooks/phase1-gate.md`

**Why this task exists:** Phase 1 is only operationally complete if a single reproducible script can verify the whole setup path from tenant creation to non-zero board tiles.

- [ ] **Step 1: Write the gate script skeleton**

Create `scripts/phase1-gate.ts` with clearly separated stages:
1. create tenant via CLI
2. set password via CLI
3. sign in as admin
4. create hierarchy via API
5. create/configure manual connectors and attach accounts if needed
6. submit one week of manual entries
7. trigger backfill for pull connectors (using fixture/test creds where available)
8. poll metrics board until non-zero or timeout
9. exit 0 on success, non-zero on any failure

- [ ] **Step 2: Add the root script**

Modify root `package.json` to add:
```json
"phase1:gate": "tsx scripts/phase1-gate.ts"
```

- [ ] **Step 3: Write the runbook**

Create `docs/runbooks/phase1-gate.md` covering:
- prerequisites
- required env vars / local services
- how to run locally
- what each stage validates
- how to debug failures

- [ ] **Step 4: Run the gate script locally and fix any discovered gaps**

Run:
```bash
pnpm phase1:gate
```

Expected:
- initially likely FAIL with a concrete missing integration detail
- iterate within the task until it exits 0

Important constraint:
- only add backend/API changes here if the gate exposes a real missing gap
- avoid speculative API surface expansion

- [ ] **Step 5: Re-run to verify success**

Run:
```bash
pnpm phase1:gate
```

Expected:
- exit 0

---

## Task 6: Wire the Phase 1 gate into CI

**TDD scenario:** Config change — verify locally as much as possible, then inspect workflow syntax carefully.

**Files:**
- Modify: `.github/workflows/ci.yml`

**Why this task exists:** Phase 1 is not really closed if the gate only works on one laptop. CI must execute it so regressions are caught automatically.

- [ ] **Step 1: Add a CI step or job for `phase1:gate`**

Modify `.github/workflows/ci.yml` to:
- run the standard stack boot needed for the gate
- run `pnpm phase1:gate`
- fail the workflow if the gate fails

Recommendation:
- put it after the existing core verification, reusing service containers where possible
- avoid duplicating unnecessary setup

- [ ] **Step 2: Validate workflow syntax and script availability**

Run locally:
```bash
pnpm typecheck
```

Then inspect the workflow diff carefully to ensure:
- Node 22
- API/web/worker services available to the script
- required env vars present

- [ ] **Step 3: Document CI expectation in the runbook**

Update `docs/runbooks/phase1-gate.md` if needed so local and CI behavior stay aligned.

---

## Task 7: Full verification and completion commit

**TDD scenario:** Verification-only task.

**Files:**
- No new product files

**Why this task exists:** This is the completion gate for Phase 1 remainder work. It proves the remaining operator UI, CLI, and automation all work together.

- [ ] **Step 1: Run targeted tests**

Run:
```bash
pnpm -F @lwa/ui test -- test/FormFromSchema.test.ts
pnpm -F @lwa/web test:e2e -- manual-entry.spec.ts source-health.spec.ts
pnpm -F @lwa/api test -- test/set-password.test.ts
```

Expected:
- all pass

- [ ] **Step 2: Run typechecks**

Run:
```bash
pnpm -F @lwa/ui typecheck
pnpm -F @lwa/web typecheck
pnpm -F @lwa/api typecheck
```

Expected:
- all exit 0

- [ ] **Step 3: Run workspace verification and gate**

Run:
```bash
pnpm -w turbo lint typecheck test
pnpm phase1:gate
```

Expected:
- green workspace run
- gate exits 0

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/lib/components/FormFromSchema.svelte packages/ui/src/lib/components/index.ts packages/ui/test/FormFromSchema.test.ts apps/web/src/routes/[tenant]/entry/+page.server.ts apps/web/src/routes/[tenant]/entry/+page.svelte apps/web/src/routes/[tenant]/sources/+page.server.ts apps/web/src/routes/[tenant]/sources/+page.svelte apps/web/src/routes/[tenant]/sources/[id]/+page.server.ts apps/web/src/routes/[tenant]/sources/[id]/+page.svelte apps/web/tests/manual-entry.spec.ts apps/web/tests/source-health.spec.ts services/api/src/admin/set-password.ts services/api/package.json services/api/test/set-password.test.ts scripts/phase1-gate.ts package.json .github/workflows/ci.yml docs/runbooks/phase1-gate.md
```

Commit message:
```bash
git commit -m "feat(phase1): add source ops UI, password CLI, and gate"
```

---

## Self-review

### Spec coverage
- schema-driven form component: covered
- manual entry UI: covered
- source health list and detail page: covered
- `admin:set-password`: covered
- `phase1:gate`: covered
- CI integration for gate: covered

### Placeholder scan
- no TBD/TODO placeholders remain
- no dependency on old assumptions about unfinished backend APIs

### Type consistency
- this plan depends on the web UI core plan being complete first
- only one likely backend change is planned (`admin:set-password`); other backend changes are explicitly constrained to concrete gate-discovered gaps

---

Plan complete and saved to `docs/plans/2026-04-21-phase-1-remainder-finish-gate.md`. Two execution options:

**1. Subagent-Driven (recommended, this session)** — Fresh subagent per task with two-stage review. Better for plans with many independent or moderately-coupled tasks.

**2. Parallel Session (separate)** — Execute in a separate session using checkpoints. Better when tasks are tightly coupled or you want stronger human review between batches.
