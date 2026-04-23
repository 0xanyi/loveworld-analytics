# Loveworld Analytics — Design Document

| | |
|---|---|
| **Status** | Design approved; ready for implementation planning |
| **Date** | 2026-04-20 |
| **Scope** | Analytics rollup platform v1 (Product 1 only). 10 weeks of work spanning five rollout phases — expected to translate into **one implementation plan per phase**, not a single monolithic plan. |
| **Owner** | Platform owner (primary stakeholder — this doc's requester). Post-GA ops ownership is tracked in Open Item O-06. |
| **Related docs** | `/Users/0xanyi/workspace/lwe-one/` (sibling product), `/Users/0xanyi/workspace/lweurope/chanelops/` (CastNet — existing channel ops tool) |

---

## 1. Summary

Loveworld Analytics is a **multi-tenant, cross-platform analytics rollup platform** for TV channel networks. It ingests viewership and engagement data from broadcast (satellite, Freeview), web (GA4, Cloudflare, internal player events), streaming (YouTube, Smart TV apps), and social (Meta/Facebook & Instagram, TikTok, X) sources — plus manual entries for platforms with no API (satellite, Freeview) — and presents **board-ready category KPIs with drill-down to source mix**.

It is explicitly **not** a content publishing or ad-management tool; that is a separate follow-up project (Product 2) that will consume this platform's API.

### Primary users

| User | Needs |
|---|---|
| Board members | Quarterly clean dashboard + exportable PDF board pack |
| Network admins | Connector configuration, user management, overrides, audit |
| Station managers | Daily/weekly manual entries, value overrides with audit, anomaly investigation |
| Analysts | Read-only access to records + CSV export |

### Core guarantees

- **Honest numbers.** No fake single "total reach" — the board sees five category KPI tiles (`tv_households`, `web_visitors`, `streaming`, `social_reach`, `engagement`), none of which mix non-comparable units. A composite chart lives one click deep.
- **Auditable overrides.** Station managers can correct any ingested value. Raw connector data is never destroyed; corrections are separate records with reason, author, reversibility.
- **Tenant isolation.** Sister stations share infrastructure but never each other's data.
- **Pluggable sources.** Adding a new source (e.g. TikTok) is a self-contained connector module; no platform changes required.

---

## 2. Problem & Context

A TV network today distributes content across satellite, DTT (Freeview), its own websites, YouTube, Facebook, Instagram, TikTok, X, and smart-TV apps. Each platform has its own analytics surface in its own units with its own caveats. Board reporting involves manual spreadsheet stitching; station managers spend hours reconciling numbers that don't agree; corrections happen in email threads with no audit trail.

### Ecosystem context (surveyed at design time)

- **CastNet** (`lweurope/chanelops`) — existing Next.js admin tool managing 60+ language channel microsites. Uses Cloudflare for DNS/SSL, has GA4 per-channel analytics. Single-tenant by design.
- **LWE One** (`lwe-one`) — pre-development unified viewer portal. Will replace the 63 microsites. Different audience (viewers), different tenancy model (single tenant).
- **LW Group stations** (LW Europe, LW UK, LW Mongolia, …) — separate legal/operational entities, each managing their own channels across platforms.

Loveworld Analytics is **a new, standalone product** with a different audience (boards + managers across sister stations) and a different tenancy model (multi-tenant) to either existing product.

---

## 3. Scope

### In scope for v1

- Ingestion from: manual satellite, manual Freeview, GA4, Cloudflare, YouTube Data API, Meta Graph (FB + IG), Smart-TV telemetry
- Connector framework supporting plug-in addition of future sources
- Multi-tenant with roles: `network_admin`, `station_manager`, `board_viewer`, `analyst`
- Hierarchy: Tenant → Station → Broadcast Channel → Language Channel
- Dashboards: board view (5 KPI tiles, no composite total), drill-down with source mix, records table, PDF export
- Manual entry and manual override of any value, with audit trail and reversibility
- Scheduled connector pulls + explicit backfill up to 12 months per connector
- Authentication: email + password + TOTP + magic links (via Better Auth)

### Deferred to v1.1+

- TikTok and X connectors (post-app-review)
- SSO (Google Workspace / Microsoft 365)
- Postgres Row-Level Security (defence in depth)
- Support impersonation grants
- File attachment uploads (evidence on adjustments; URLs only in v1)
- Content-level attribution (deduplication across platforms where cross-posting grows)
- Chaos engineering

### Out of scope (separate follow-up project)

- **Product 2** — content scheduling, ad distribution, campaign management. Will consume this platform's API.

---

## 4. Architecture Overview

### Services — three deployable units, one monorepo

```
apps/web              SvelteKit 2 + Svelte 5 + Tailwind + shadcn-svelte
                      All human-facing UI. Calls the API only.

services/api          Hono + @hono/zod-openapi
                      REST + typed RPC. Auth, query layer, manual-entry writes,
                      connector config CRUD. No scheduled jobs.

services/ingestion    Node worker + BullMQ consumers
                      Scheduled connector pulls, retries, normalisation,
                      idempotent writes, rollup refreshes.
```

### Shared packages

| Package | Contents |
|---|---|
| `packages/contracts` | Zod schemas for every entity + ingestion payload. `drizzle-zod` generates schemas from Drizzle tables. Platform's source of truth. |
| `packages/connectors` | One module per source implementing `SourceConnector`. |
| `packages/db` | Drizzle schema, migrations, repositories. |
| `packages/auth` | Better Auth setup, role/permission checks, tenant-scoping middleware. |
| `packages/ui` | Shared shadcn-svelte components, chart primitives (Layerchart wrappers). |

### Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | SvelteKit 2 + Svelte 5 + Tailwind + shadcn-svelte |
| Charts | Layerchart (primary) + D3 for custom viz |
| API | Hono + `@hono/zod-openapi` |
| Ingestion | Node + BullMQ |
| DB | Postgres (plain; TimescaleDB not adopted for v1 — revisit when scale demands) |
| ORM | Drizzle + `drizzle-zod` |
| Queue | BullMQ on Redis |
| Auth | Better Auth |
| Validation | Zod, everywhere |
| Deploy | Dokploy Swarm, Cloudflare in front |
| Observability | OpenTelemetry → Loki (logs) + Prometheus (metrics) + Tempo (traces), Grafana dashboards |

### Data flow — three main paths

**Automated pull**
```
BullMQ cron → ingestion worker → connector.pull(period)
  → returns normalised MetricRecord drafts
  → validate against Zod → upsert Postgres (idempotent) → emit audit log
  → enqueue rollup.refresh for affected buckets
```

**Manual entry / override**
```
User submits form in SvelteKit → API validates against Zod entry/adjustment schema
  → writes metric_record (manual) or metric_adjustment (override)
  → audit_log → trigger rollup refresh
  → visible in dashboards < 10s
```

**Dashboard read**
```
SvelteKit page → Hono RPC → API checks tenant scope → reads metric_rollup (pre-aggregated)
  → returns KPI tiles + source_breakdown JSONB for drill-down
  → 5-min Redis cache per (tenant, period, hierarchy, comparison)
```

### Design rationale

- **API and ingestion separated** — different failure modes, different scaling needs. One bad connector never takes down the dashboard.
- **Contracts as a shared package** — makes "pluggable connectors" actually pluggable.
- **Read path uses pre-aggregated rollups** — dashboards never touch the fact table. Sub-second p95 even on long ranges.
- **All writes are idempotent on (tenant, source, period, dimensions)** — re-running yesterday's pull produces no duplicates. Critical for retries, backfill, and overrides.

---

## 5. Data Model

### Hierarchy — self-referencing single table

```ts
hierarchy_node
  id              uuid pk
  tenant_id       uuid fk → tenant
  type            enum('station' | 'broadcast_channel' | 'language_channel')
  parent_id       uuid fk → hierarchy_node (nullable; null for station)
  name            text
  slug            text
  metadata        jsonb        -- country, language code, BARB ID, etc.
  created_at      timestamptz
  archived_at     timestamptz   -- soft delete; metrics preserved
  UNIQUE(tenant_id, slug)
```

Rollups traverse the tree with recursive CTEs. Easy to extend if a new level is ever needed (e.g. `region` between station and broadcast channel).

### Platform accounts

```ts
platform_account
  id                   uuid pk
  tenant_id            uuid fk
  hierarchy_node_id    uuid fk → hierarchy_node   -- 1:1 attribution for v1
  source_id            uuid fk → source
  external_id          text                        -- YT channel ID, FB page ID, …
  display_name         text
  config               jsonb                       -- OAuth tokens (encrypted), region
  status               enum('active' | 'paused' | 'error')
  last_synced_at       timestamptz
  UNIQUE(tenant_id, source_id, external_id)
```

1:1 attribution is sufficient for v1 (verified with LW Europe: English YouTube → English language channel; 59 other language channels are website-only). Many-to-many join table added in v1.1+ only if cross-attribution becomes real.

### Connector registry

```ts
source                -- catalog of available connector types (seed data)
  id                  uuid pk
  key                 text unique     -- 'youtube', 'ga4', 'meta_graph', 'manual_satellite', …
  name                text
  category            enum('tv_broadcast' | 'web' | 'streaming' | 'social' | 'app')
  auth_method         enum('oauth2' | 'api_key' | 'service_account' | 'none')
  schema_version      int

connector_config      -- per-tenant instance with credentials + schedule
  id                  uuid pk
  tenant_id           uuid fk
  source_id           uuid fk
  credentials         jsonb encrypted (AES-256-GCM, per-tenant DEK)
  schedule            text              -- cron
  enabled             boolean
  status              enum('active' | 'error' | 'paused')
  last_run_at         timestamptz
  last_error          text
```

### Metrics — the fact table (immutable, append-only)

```ts
metric_record
  id                    uuid pk
  tenant_id             uuid fk
  source_id             uuid fk
  connector_config_id   uuid fk
  platform_account_id   uuid fk (nullable)     -- null for sat/Freeview/broadcast-level manual
  hierarchy_node_id     uuid fk
  metric_type           text                    -- 'views', 'unique_visitors', 'households', …
  metric_category       enum                    -- tv_households | web_visitors | streaming
                                                --   | social_reach | engagement
  dimensions            jsonb                    -- { country, device, content_id, … }
  dimensions_hash       text                     -- BLAKE3 of canonical-JSON(dimensions)
  period_start          timestamptz
  period_end            timestamptz
  granularity           enum('hour' | 'day' | 'week' | 'month' | 'quarter')
  raw_value             numeric
  unit                  text                     -- 'count', 'seconds', 'households'
  provenance            text                     -- 'connector:<id>' | 'manual:user:<id>'
  ingested_at           timestamptz
  UNIQUE(tenant_id, source_id, hierarchy_node_id, metric_type,
         period_start, period_end, dimensions_hash)
```

The UNIQUE constraint is the entire idempotency story. Re-pulling yesterday's data upserts onto the same row — no duplicates, no orphans, no manual dedup logic.

### Adjustments — the manual override primitive

```ts
metric_adjustment
  id                    uuid pk
  metric_record_id      uuid fk → metric_record
  tenant_id             uuid fk                  -- denormalised for fast filtering
  adjustment_type       enum('replace' | 'delta')
  adjusted_value        numeric
  reason                text NOT NULL             -- required, human-readable
  evidence_url          text                      -- optional context link
  author_user_id        uuid fk → user
  status                enum('draft' | 'applied' | 'reversed' | 'superseded')
  approved_by_user_id   uuid fk → user (nullable)
  approved_at           timestamptz (nullable)
  effective_from        timestamptz (nullable)   -- defaults to metric's period
  effective_to          timestamptz (nullable)
  batch_id              uuid fk → adjustment_batch (nullable)
  created_at            timestamptz
  reversed_at           timestamptz (nullable)
  reversed_reason       text (nullable)

adjustment_batch        -- groups related adjustments for bulk review/reversal
  id                    uuid pk
  tenant_id             uuid fk
  author_user_id        uuid fk
  reason                text
  created_at            timestamptz
```

**Read path:** a view `effective_metric` joins `metric_record` with its latest applied adjustment and produces `effective_value`. Dashboards always query via this view (or the derived rollup); the fact table is never read by UI.

### Rollup table

```ts
metric_rollup
  tenant_id             uuid
  hierarchy_node_id     uuid
  metric_category       enum
  granularity           enum('day' | 'week' | 'month' | 'quarter')
  bucket_start          timestamptz
  effective_total       numeric        -- sum of effective_values
  raw_total             numeric        -- sum of raw_values (for "what changed due to corrections")
  record_count          int
  source_breakdown      jsonb          -- { youtube: 12000, ga4: 3400, … } powers drill-down
  has_adjustments       boolean        -- drives "adjusted" badge in UI
  computed_at           timestamptz
  PRIMARY KEY (tenant_id, hierarchy_node_id, metric_category, granularity, bucket_start)
```

Refreshed incrementally on every ingestion write, debounced to coalesce bursts. Dashboard queries read from this table — p95 well under 200ms.

### Auth entities

```ts
user                 -- Better Auth schema
tenant               id, name, slug, settings (branding, retention overrides)
tenant_membership
  user_id, tenant_id,
  role             enum('network_admin' | 'station_manager' | 'board_viewer' | 'analyst')
  scope_node_ids   uuid[]    -- for station_manager; null/empty for tenant-wide roles
  invited_by       uuid fk
  created_at       timestamptz
  last_seen_at     timestamptz
```

### Audit log

```ts
audit_log
  id, tenant_id, actor_user_id, action, entity_type, entity_id,
  before_json, after_json, occurred_at, ip, user_agent
```

Records every write to `connector_config`, `metric_adjustment`, `platform_account`, `hierarchy_node`, `tenant_membership`, `metric_record` direct edits, and tenant settings. Append-only; no UI to edit or delete.

### Ingestion tracking

```ts
ingestion_run
  id, connector_config_id, period_start, period_end, started_at, finished_at,
  status enum('pending' | 'running' | 'success' | 'failed' | 'skipped'),
  records_written int, duration_ms int,
  error_code text, error_message text, warnings jsonb,
  bullmq_job_id text

backfill_run
  id, connector_config_id, range_start, range_end, chunk_size_days,
  chunks_total int, chunks_completed int,
  last_checkpoint timestamptz,
  status enum('queued' | 'running' | 'paused' | 'completed' | 'failed'),
  started_by_user_id, started_at, completed_at
```

---

## 6. Connector Framework

### The contract

```ts
// packages/contracts/src/connectors.ts

export interface SourceConnector {
  readonly key: string
  readonly name: string
  readonly category: MetricCategory
  readonly authMethod: AuthMethod
  readonly credentialsSchema: ZodSchema
  readonly supportedGranularities: Granularity[]
  readonly kind: 'pull' | 'manual'

  validateCredentials(creds: unknown): Promise<Result<void, ConnectorError>>

  // 'pull' connectors — automated ingestion
  pull?: (input: PullInput) => Promise<Result<PullResult, ConnectorError>>
  listAccounts?: (creds: unknown) => Promise<PlatformAccountCandidate[]>
  backfill?: (input: BackfillInput) => Promise<Result<PullResult, ConnectorError>>

  // 'manual' connectors — form-driven entry
  entrySchema?: ZodSchema
}

export type PullInput = {
  config:  ConnectorConfig
  account: PlatformAccount | null
  period:  { start: Date; end: Date; granularity: Granularity }
  context: { tenantId: string; logger: Logger; rateLimiter: RateLimiter }
}

export type PullResult = {
  records:     MetricRecordDraft[]
  nextCursor?: string
  warnings?:   string[]
}

export type MetricRecordDraft = {
  hierarchyNodeId: string
  metricType:      string
  metricCategory:  MetricCategory
  dimensions:      Record<string, string>
  periodStart:     Date
  periodEnd:       Date
  granularity:     Granularity
  value:           number
  unit:            string
}
```

### Key properties

- **Connectors never touch the DB.** They return drafts; the ingestion worker does idempotent upserts.
- **`Result<T, E>`, not throws.** Errors are typed and routed by code.
- **`listAccounts` is optional.** Supports "pick which YouTube channel(s) to attach" after OAuth.
- **`backfill` is separate from `pull`.** Different semantics (long-running, paginated, checkpointed).
- **Manual is a first-class kind.** Same tables, same audit, same provenance — just drives a form instead of a schedule.

### Error taxonomy

| Code | Meaning | Worker action |
|---|---|---|
| `AUTH_EXPIRED` | Token invalid | Mark config errored, notify admin, stop retrying |
| `AUTH_INVALID` | Credentials wrong from the start | Same |
| `RATE_LIMITED` | 429; respect Retry-After | Requeue with backoff |
| `TRANSIENT` | 5xx, network blip | Exponential backoff, max 5 tries |
| `UPSTREAM_UNAVAILABLE` | Sustained outage | Circuit-break 30min, resume on schedule |
| `CONFIG_INVALID` | Account deleted, scope missing | Pause config, notify admin |
| `NO_DATA` | Empty but successful period | Write zero records, mark success |

### Account discovery flow (OAuth)

```
Admin clicks "Add YouTube"
  → API redirects to YouTube OAuth consent
  → callback stores encrypted refresh token (no account yet)
  → API calls connector.listAccounts(creds) → [{ externalId, displayName, thumbnail }]
  → Admin picks channels + hierarchy node(s) to attach each to
  → Creates platform_account rows
  → Scheduler begins pulls on the configured cron
```

One OAuth grant → many `platform_account` rows — important for stations managing several channels under one Google account.

### Launch connector priorities

| Priority | Connector | Kind | Effort | Blockers |
|---|---|---|---|---|
| **P0** | `manual_satellite` | manual | 1d | none |
| **P0** | `manual_freeview` | manual | 1d | none |
| **P0** | `cloudflare_analytics` | pull | 2d | API token |
| **P0** | `ga4` | pull | 4d | service account credentials |
| **P1** | `youtube` | pull | 5d | OAuth app verification |
| **P2** | `meta_graph` (FB + IG) | pull | 8d | **Meta app review — submit Week 1** |
| **P2** | `smart_tv_telemetry` | pull | varies | depends on existing telemetry stack |
| **P3 (post-GA)** | `tiktok` | pull | 6d | app review |
| **P3 (post-GA)** | `x` | pull | 4d | paid tier access |

P0 alone gives the board a meaningful first dashboard by Week 4.

`castnet_events` was removed from Phase 1 because CastNet is being retired in favour of the Love World Europe One platform. The replacement integration should land as a new connector when that platform exposes stable analytics data.

### Adding a new connector later — developer flow

1. Create `packages/connectors/src/<name>.ts` implementing `SourceConnector`
2. Register in `connectorRegistry`
3. Add a seed row for the `source` table
4. Drop fixtures into `packages/connectors/test/fixtures/<name>/`
5. Run the contract test suite — passes automatically if the contract is satisfied

No platform changes. No deployments other than the connector package.

---

## 7. Ingestion Pipeline

### Queue topology (BullMQ on Redis)

| Queue | Purpose | Concurrency |
|---|---|---|
| `connector.pull` | Scheduled periodic pulls | High, parallelised per connector |
| `connector.backfill` | Explicit historical backfills | Low, sequential per config |
| `rollup.refresh` | Refresh pre-aggregated rollups after writes | High, debounced |
| `connector.health` | Periodic health pings | Low |

Each queue has a dead-letter queue with a daily digest to network admins.

### Idempotency

All writes upsert on `UNIQUE(tenant_id, source_id, hierarchy_node_id, metric_type, period_start, period_end, dimensions_hash)`. Re-runs overwrite `raw_value`; adjustments are untouched (they reference `metric_record_id`, which is stable).

### Retry policy (driven by error code)

| Error | Retry? | Backoff | Max attempts |
|---|---|---|---|
| `AUTH_EXPIRED` / `AUTH_INVALID` | No | — | 0 |
| `CONFIG_INVALID` | No | — | 0 |
| `RATE_LIMITED` | Yes | Respect `Retry-After` header, else 60s | Unlimited (within schedule) |
| `TRANSIENT` | Yes | Exponential (30s → 1m → 5m → 15m → 1h) | 5 then DLQ |
| `UPSTREAM_UNAVAILABLE` | Yes | Circuit break 30min then resume | n/a |
| `NO_DATA` | No | — | 0 |

### Scheduling defaults

| Source | Default cron | Reason |
|---|---|---|
| YouTube | `0 3 * * *` (daily 03:00 UTC) | Analytics data stabilises ~24h after period end |
| Meta Graph | `0 4 * * *` | Insights firm up after ~24h |
| GA4 | `0 2 * * *` + `30 * * * *` hourly top-up | Real-time available, less stable; daily re-run corrects |
| Cloudflare | `0 * * * *` (hourly) | Near-real-time, cheap to pull |
| Smart TV telemetry | `0 * * * *` | Default hourly |
| Manual | No schedule | User-driven |

Schedules are dynamically reconciled when `connector_config` rows change — no worker restart required.

### Backfill

User-initiated from admin UI ("backfill last 12 months"). Chunked (one week or month per chunk), sequential per config, checkpointed, resumable after worker bounce, pausable. Default backfill depth for v1: **12 months**.

### Rollup refresh

After every ingestion write, a `rollup.refresh` job is enqueued for `(tenant, hierarchy_node, metric_category, granularity, bucket)`. Debounced (coalesces bursts within 30s). Climbs the hierarchy tree from writing node to station. Uses `INSERT ... ON CONFLICT DO UPDATE` on `metric_rollup` — surgical, not full rebuild.

When an adjustment targets an old period, the worker enqueues refreshes for every (day/week/month/quarter) bucket that includes the affected date.

### Observability hooks

- Structured logs with `tenant_id`, `connector_key`, `period`, OTel trace context
- Metrics: `ingestion_jobs_total{connector,status}`, `ingestion_records_written_total`, `ingestion_duration_seconds{connector}`, `rollup_refresh_lag_seconds`
- Connector health (exposed via API, shown in admin UI): `last_success_at`, `last_error`, `success_rate_7d`, `median_duration_7d`

---

## 8. Manual Entry & Override Workflows

### Flow A — Manual entry (no upstream connector exists)

```
Manager opens manager console
  → "Log new entry" card per enabled manual source
  → Picks a source → form renders dynamically from entrySchema
  → Fills, submits → API validates with Zod → anomaly checks
  → Writes metric_record(provenance='manual:user:<id>')
  → audit_log → rollup.refresh
  → Visible on dashboard < 10s
```

Manual connector example:

```ts
export const manualSatelliteConnector: SourceConnector = {
  key: 'manual_satellite',
  name: 'Satellite Viewership (Manual)',
  category: 'tv_households',
  kind: 'manual',
  authMethod: 'none',
  credentialsSchema: z.object({}),
  supportedGranularities: ['week', 'month'],
  entrySchema: z.object({
    hierarchyNodeId: z.string().uuid(),
    period: z.object({ start: z.date(), end: z.date() }),
    householdsReached: z.number().int().positive(),
    estimationMethod: z.enum(['panel', 'operator_report', 'internal_estimate']),
    sourceDocumentUrl: z.string().url().optional(),
    notes: z.string().optional(),
  }),
  validateCredentials: async () => ok(),
}
```

### Flow B — Manual override of an ingested value

```
Manager drills into a KPI tile → sees underlying records
  → clicks "Override this value" on a row
  → modal: current raw value + override type (replace | delta) + new value +
    required reason + optional evidence URL
  → submits → creates metric_adjustment(status='applied')
  → notifies network admin → rollup.refresh
  → "adjusted" badge appears on tile; reversible with one click for 30 days
```

### Dynamic form generation

A single shared `<FormFromSchema>` component renders any `entrySchema`:

```svelte
<FormFromSchema
  schema={manualSatelliteConnector.entrySchema}
  defaults={lastPeriodValues}
  labels={connectorLabels}
  onSubmit={handleSubmit}
/>
```

Add a new manual source → its form appears automatically. Per-source UX polish (labels, grouping, help text) lives in a tiny companion module next to the connector.

### Anomaly detection — soft, not blocking

| Check | Severity | Example |
|---|---|---|
| Outside typical range | warning | "This entry is 5× the rolling 4-week median. Confirm?" |
| Duplicate period | warning | "You already logged this period. Replace?" |
| Missing adjacent periods | info | "You haven't logged the last 3 weeks. Log them too?" |
| Format mismatch | **error** | "Households must be a positive integer" |

Warnings confirm; errors block. Never block on "seems high" alone — the goal is catching typos, not second-guessing real data. The same logic runs on automated pulls; anomalies surface as soft flags in drill-down.

### Edit vs adjust — the 24-hour rule

- **Within 24h of creation + by original author** → direct edit allowed. `metric_record` is mutated in place; `audit_log` captures before/after.
- **After 24h** or **by another user** → must create a `metric_adjustment`. Original stays.

### Reminders & nudges

- **Weekly digest email** (Mondays 09:00 local) to station managers listing missing manual entries for last week, links to pre-filled forms.
- **Dashboard banner** — soft amber banner when manual entries are missing past their expected day.
- **Graceful dashboard degradation** — if a source is missing, the tile shows "partial (N/M sources)" instead of a wrong number.

No hard enforcement; reminders are opt-out per user.

### Bulk operations

- **CSV paste/upload** — 12 months of weekly data validated row-by-row with per-row error report before any writes commit.
- **Bulk override** — select rows in drill-down table → "Apply adjustment to N records" → single reason, single batch.

Both produce an `adjustment_batch` for grouped review/reversal.

### Approval & reversal

- All manual entries and overrides **apply immediately**.
- Network admin gets a digest notification for significant events (overrides > 10% of tile value, large batches, out-of-range entries).
- Any adjustment is **reversible for 30 days** with one click — creates a `reversed` record restoring the raw value.
- After 30 days, still reversible but logs a `superseded` record for tamper-evidence.

### Audit trail surfacing in UI

- Small adjustment dot on any tile including corrections; hover reveals: *"Adjusted by <name> on <date>: <reason>."*
- Dedicated `/corrections` page per tenant — all adjustments filterable by station/source/date/author.
- `audit_log` is the low-level store; UI reads a summarised `adjustment_history` view for performance.

---

## 9. Dashboard & Drill-Down UX

### Three views

| View | Audience | Interaction |
|---|---|---|
| Board view | Board members, CEO | Low — glance, click one tile at most |
| Manager console | Station managers | High — daily use, task rail, entry CTAs |
| Analyst view | Analysts | Records table + filters + CSV export |

### Board view — five KPI tiles

Each tile exposes exactly six things:

1. **Category name** (the five categories)
2. **The number** — large, honest, no fake composite total
3. **Comparison delta** (YoY default; selector changes to QoQ/MoM/None/Custom)
4. **Sparkline** — 12-point shape for chosen granularity
5. **Source chips** — subtle line showing which sources contributed (not per-source numbers)
6. **Adjustment dot** — appears only if the tile includes corrected records

```
┌─ TV HOUSEHOLDS ──┐ ┌─ WEB VISITORS ──┐ ┌─ STREAMING ────────┐
│  2.4M            │ │   486K          │ │  1.12M             │
│  ↑ 12% YoY       │ │   ↑ 28% YoY     │ │  ↑ 41% YoY         │
│  ▂▃▄▅▆▇█         │ │   ▃▃▄▅▆▇█       │ │  ▂▃▅▇██            │
│  sat · Freeview  │ │   60 sites      │ │  YouTube · SmartTV │
└──────────────────┘ └─────────────────┘ └────────────────────┘
┌─ SOCIAL REACH ───┐ ┌─ ENGAGEMENT ────┐
│  890K            │ │   4.2% avg      │
│  ↓ 5% YoY        │ │   ↑ 1.1 pt YoY  │
│  ▆▇▇██▇▇         │ │   ▃▄▄▅▅▅        │
│  FB · IG · TikTok│ │   weighted      │
└──────────────────┘ └─────────────────┘
```

### Global controls

- **Hierarchy selector** — searchable tree picker: Station → Broadcast Channel → Language Channel. Breadcrumb shows current scope.
- **Period selector** — presets (Week / Month / Quarter / Year / YTD) + custom. Granularity auto-picks sensibly.
- **Comparison selector** — YoY / QoQ / MoM / None / Custom.
- **Source health indicator** — `● N/N sources` top-right; amber if anything stale/errored.

### Drill-down — clicking a tile

Shows the composite source-mix (Flavour A from design):

- Stacked area chart by source, daily/weekly/monthly buckets
- Explicit caveat header: *"Gross cross-platform exposure (non-unique). See breakdown below."*
- Anomaly markers on the chart (with Investigate / Override CTAs)
- Records table at the bottom (filterable, sortable, CSV export, bulk override CTA)

### Manager console — adds a left task rail

- **Missing entries** (manual sources not yet logged for this period)
- **Source issues** (errored/auth-expired connectors)
- **Drafts** (in-progress manual entries)
- **[+ Log entry]** and **[+ Add connector]** CTAs

Board viewers never see the task rail.

### Shared components (`packages/ui`)

| Component | Responsibility |
|---|---|
| `<KpiTile>` | Number + delta + sparkline + source chips + adjustment badge |
| `<HierarchyPicker>` | Tree selector with search, breadcrumb output |
| `<PeriodPicker>` | Presets + custom range + auto-granularity |
| `<ComparisonPicker>` | YoY/QoQ/MoM/None/Custom |
| `<SourceMixChart>` | Stacked area with anomaly markers |
| `<RecordsTable>` | Virtualised, filter/sort, server-paginated |
| `<AdjustmentBadge>` | Dot + popover showing adjustment history |
| `<SourceHealthIndicator>` | Compact `● N/N` with drill-down |
| `<FormFromSchema>` | Dynamic form from Zod entrySchema |

### Information architecture

```
/                              Tenant switcher (if memberships > 1)
/[tenant]                      Board dashboard
/[tenant]/node/[id]            Drill into hierarchy node
/[tenant]/sources              Connector health overview
/[tenant]/sources/[id]         Connector runs, config, backfill
/[tenant]/entry                Manual entry console
/[tenant]/corrections          Adjustment history + notifications
/[tenant]/team                 Members, roles, invites
/[tenant]/settings             Tenant settings, branding, export schedules
/[tenant]/export               On-demand PDF export + scheduled reports
```

### PDF export — "Generate board pack"

Server-rendered via headless Chromium (Playwright) running the same SvelteKit routes with a print stylesheet:

- Page 1: cover (tenant, period, generation date)
- Page 2: board summary (five KPI tiles + trend)
- Page 3+: drill-down per category
- Footer: caveats about gross vs unique + generation metadata

Scheduled PDF exports: network admins can schedule quarterly packs to auto-generate and email on a fixed date.

### Performance targets

| View | Target p95 TTI | Caching |
|---|---|---|
| Board dashboard | < 1.5s on tablet over 4G | 5min Redis per `(tenant, period, hierarchy, comparison)`, invalidated by rollup.refresh |
| Drill-down | < 400ms | Same key; source_breakdown served from JSONB in `metric_rollup` |
| Records table | < 800ms paginated | No cache, virtualised, server paginated (keyset) |
| PDF generation | < 10s | On-demand; scheduled renders async |

All main dashboard queries hit `metric_rollup`, never the fact table.

### Accessibility & theming

- WCAG AA minimum (colour contrast, keyboard navigation, ARIA for charts)
- Tablet + desktop first-class; phone polish deferred to v1.1
- Print stylesheet first-class — PDF reuses it
- Light mode default (board-friendly); dark mode toggle in user menu
- Per-tenant accent colour configurable in `/settings`

---

## 10. Auth, Tenancy & RBAC

### Tenancy model

A tenant is an organisation subscribing to the platform. Two patterns both fit:

| Pattern | Hierarchy |
|---|---|
| Single-station tenant | Tenant → Broadcast Channel → Language Channel |
| Multi-station tenant (group view) | Tenant → Station → Broadcast Channel → Language Channel |

Every tenant-scoped row carries `tenant_id`. No cross-tenant reads, ever — enforced at middleware, query layer, and (v1.1) row-level security.

### Roles

```
network_admin     Everything in the tenant
station_manager   Operational (entries, overrides, backfills); SCOPED to specific nodes
board_viewer      Read-only dashboard + PDF; no records table
analyst           Read-only + records table + CSV export; all stations
```

### Permission matrix

| Capability | `network_admin` | `station_manager` (scoped) | `board_viewer` | `analyst` |
|---|:---:|:---:|:---:|:---:|
| View board dashboards | ✓ all | ✓ their nodes | ✓ all | ✓ all |
| View drill-down & source mix | ✓ | ✓ their nodes | ✓ | ✓ |
| View records table | ✓ | ✓ their nodes | — | ✓ |
| Export CSV | ✓ | ✓ their nodes | — | ✓ |
| Export PDF board pack | ✓ | ✓ their nodes | ✓ | ✓ |
| Log manual entry | ✓ | ✓ their nodes | — | — |
| Override metric value | ✓ | ✓ their nodes | — | — |
| Reverse an override | ✓ | ✓ their own + nodes | — | — |
| Add/edit/pause connector | ✓ | — | — | — |
| Trigger backfill | ✓ | ✓ their nodes | — | — |
| Invite users, change roles | ✓ | — | — | — |
| Edit hierarchy | ✓ | — | — | — |
| Change tenant settings | ✓ | — | — | — |
| View audit log | ✓ | ✓ their nodes | — | ✓ all |
| Impersonate / platform support | — | — | — | — |

Enforced in two layers:

1. **API middleware** — every Hono route declares required capabilities; middleware checks session → membership → role → scope.
2. **Query-layer guards** — Drizzle repositories accept a `TenantContext` and inject `tenant_id` + scope filters. No route handler writes raw SQL against tenant tables.

### Auth mechanism — Better Auth

- Email + password (argon2id via Better Auth defaults)
- Magic link (one-click for board viewers who log in once a quarter)
- TOTP 2FA — required for `network_admin`, optional for others
- Sessions — HTTP-only, secure, SameSite=lax cookies. 1-hour TTL with sliding refresh. Revokable from `/team`.
- Password reset via email token, 15-minute expiry, single use

### Deferred from v1

- **SSO** (Google Workspace / Microsoft 365) — v1.1. Magic link covers most needs in v1.
- **Self-serve signup** — not a use case. Tenants created by platform owner via `pnpm admin:create-tenant`.
- **Support impersonation** — v1.1, via short-lived `support_grant` rows logged to audit.

### Secret storage

- `connector_config.credentials` encrypted at rest: AES-256-GCM with per-tenant DEK, DEK wrapped by platform KEK.
- KEK in environment (dev/staging) or Dokploy secrets + managed KMS (production). KEK rotation supported — credentials carry the KEK version used.
- Decrypted only during ingestion runs; never logged, never serialised.
- UI shows masked values (`sk-...abc4`) with a "Rotate credential" action.
- OAuth token refresh handled by connector; worker provides callback to persist new token.

### Tenant isolation — defence in depth

| Layer | v1 | v1.1+ |
|---|---|---|
| API middleware | Required | Same |
| Query layer (repositories inject tenant_id) | Required | Same |
| Postgres RLS | Deferred | Enabled on tenant-scoped tables as belt-and-braces |

`tenant_id` is denormalised onto every tenant-scoped table even when derivable via joins — enables partial indexes, simplifies RLS policies when added, keeps audit queries fast.

### Tenant lifecycle

- **Create**: `pnpm admin:create-tenant --name <name> --admin-email <email>` (platform owner).
- **Invite user**: `network_admin` sends invite from `/team`.
- **Remove user**: membership deleted, sessions revoked immediately, audit history preserved.
- **Archive**: soft via CLI, data retained per retention policy, inaccessible.
- **Hard delete**: separate manual process with 30-day grace window.

### Audit coverage

Every non-read action in the permission matrix writes to `audit_log` with `actor_user_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `ip`, `user_agent`. Append-only; no UI to edit or delete.

---

## 11. Failure Modes & Observability

Principle: **every failure degrades a slice, never the whole dashboard.**

### Observability stack

| Signal | Tool | Source |
|---|---|---|
| Logs | Loki | Structured JSON from API + ingestion + connectors |
| Metrics | Prometheus | `/metrics` on API + worker; 15s scrape |
| Traces | OpenTelemetry → Tempo | Auto-instrumented Hono + BullMQ + Drizzle |
| Dashboards | Grafana | Pre-built boards: system, ingestion, per-connector, per-tenant |
| Uptime | Cloudflare health checks | External probes |

Every log line carries `tenant_id`, `trace_id`, `connector_key` where applicable.

### Key metrics

```
# Ingestion
ingestion_jobs_total{connector, status}
ingestion_duration_seconds{connector}              histogram
ingestion_records_written_total{connector, tenant}
ingestion_last_success_timestamp{connector_config}

# Rollups
rollup_refresh_lag_seconds                         histogram
rollup_refresh_failures_total

# API
api_request_duration_seconds{route, status}        histogram
api_requests_total{route, status, tenant}
api_5xx_rate

# Infra
db_pool_connections_in_use
redis_queue_depth{queue}
redis_memory_bytes

# Security
failed_login_total{tenant}
oauth_refresh_failures_total{source}
```

### SLOs

| SLO | Target | Window |
|---|---|---|
| Dashboard availability | 99.5% | Monthly |
| Dashboard p95 TTI (tablet, 4G) | < 1.5s | Monthly |
| Ingestion freshness (active connectors reporting < 25h) | 95% | Rolling 7d |
| Rollup refresh lag p99 | < 15min after ingest | Rolling 24h |
| Override write → visible on dashboard | < 10s | p95 |
| PDF export completion | < 10s p95, < 30s p99 | Per request |

### Alerts

| Alert | Severity | Condition | Route |
|---|---|---|---|
| Connector red | Warn | `success_rate_7d < 0.5` | In-app banner + daily digest email |
| Ingestion stalled | **Crit** | No successful runs for 4h | On-call email/SMS + in-app |
| Rollup lag | Warn | `lag_p99 > 15min for 10min` | Digest |
| API p95 latency | Warn | `> 1s for 10min` | Digest |
| API 5xx rate | **Crit** | `> 1% for 5min` | On-call |
| DB pool saturated | Warn | `> 80% in use for 10min` | Digest |
| DB disk | **Crit** | `free < 15%` | On-call |
| Redis queue backed up | Warn | `depth > 10_000 for 15min` | Digest |
| Auth failures spike | Warn | `> 5/s for 2min` | Security channel |
| Cross-tenant leakage test failure | **Crit** | CI or canary flags it | On-call + block deploys |

Alert channel (Slack / Teams / PagerDuty / email) to be configured at rollout; design is channel-agnostic.

### Graceful degradation

The UI is designed to "show something useful" rather than "show nothing when anything breaks":

| Failure | Board user sees | Manager sees |
|---|---|---|
| One connector errored | Tile unchanged (other sources backfill); subtle source chip dot | Amber "1 source needs attention" banner; task list shows which |
| Ingestion worker paused | Last rollup served with "Data as of {timestamp}" caption | Same + prominent banner |
| Rollup lag > 30min | Yellow tint on timestamp + tooltip | Same |
| Redis down | API serves from 5-min cache; no new writes accepted | "Maintenance mode" banner |
| DB slow queries | Query timeout → cached response | Same |
| Chart library error | Render fallback: raw number + "Chart unavailable" | Same |
| PDF export timeout | "Taking longer than usual — we'll email it when ready" | Same |

Key pattern: **every tile and chart binds to `metric_rollup` (last-known-good)**. Ingestion can be offline for hours and dashboards keep serving truthful-but-stale numbers with clear timestamps. No blank screens.

### Data quality failures (not quite errors)

| Class | Example | UI treatment |
|---|---|---|
| Missing data | Manual Freeview entry not submitted for Week 16 | Tile shows "partial (3/4 sources)"; hover names missing source |
| Anomalous data | YouTube returned 10× below rolling median | Anomaly marker on drill-down chart; "Investigate" CTA |
| Stale data | Connector hasn't run in 36h | Source chip grey; health indicator amber |

None block the dashboard; all are discoverable one click in.

### Backup & disaster recovery

| Asset | Strategy | RPO | RTO |
|---|---|---|---|
| Postgres | `pg_dump` nightly + continuous WAL archive to S3-compatible storage (R2 / MinIO) | 5 min | 1 h |
| Redis | Queue state transient; jobs re-enqueue from DB on recovery. Hourly snapshot as belt-and-braces. | 1 h (queue only) | 5 min |
| Connector credentials | In Postgres backup (encrypted at rest); KEK in Dokploy secrets + off-box copy | 5 min | 10 min |
| Object storage (v1.1) | Cross-region replication + lifecycle rules | 0 | 1 h |

**Monthly CI-run restore drill** — restore last night's backup to an ephemeral DB, run known-row-count assertions, tear down. Untested backups don't count.

### Cross-tenant isolation testing

Non-negotiable. A dedicated test class in CI pokes at boundaries on every PR:

```ts
// packages/tests/integration/tenant-isolation.test.ts
test('user from tenant A cannot read metrics from tenant B')
test('adjustment targeting metric in tenant B is rejected')
test('OAuth callback for tenant A cannot write credentials on tenant B')
test('CSV export respects scope_node_ids on station_manager')
test('direct SQL bypass via audit_log API is rejected by middleware')
```

Failure blocks merge.

### Runbooks (stored in `docs/runbooks/`)

| # | Title |
|---|---|
| R-01 | Connector stuck in `AUTH_EXPIRED` |
| R-02 | Ingestion lag > 1h |
| R-03 | Rollup refresh failures |
| R-04 | Redis memory pressure / queue saturation |
| R-05 | Postgres slow queries |
| R-06 | Suspicious authentication activity |
| R-07 | Tenant data recovery from backup |
| R-08 | Emergency stop of a runaway backfill |
| R-09 | Suspected cross-tenant leak |
| R-10 | Meta / YouTube / TikTok app review rejected |

### Data retention

| Data | Retention |
|---|---|
| `metric_record` | Forever |
| `metric_adjustment` | Forever |
| `audit_log` | 7 years (compliance-safe default; revisit with legal) |
| `ingestion_run` | 90 days detail; aggregated summary forever |
| Session records | 30 days post-expiry |
| PDF exports | 30 days then purged (regeneratable on demand) |

---

## 12. Testing Strategy

Release gates: **cross-tenant isolation suite + connector contract suite + E2E smoke must all pass on every PR.** Coverage percentage is a lagging indicator.

### Layers

| Layer | Tool | Runs in | Proves |
|---|---|---|---|
| Unit | Vitest | PR + pre-commit | Pure functions, Zod schemas, permission checks |
| Contract (connectors) | Vitest + MSW fixtures | PR | Every connector obeys the interface identically |
| Integration | Vitest + testcontainers (Postgres + Redis) | PR | Full ingestion loop, adjustment lifecycle, backfill resume |
| Cross-tenant isolation | Vitest integration | PR + release canary | No tenant can read, write, or trigger work in another |
| E2E | Playwright | PR (smoke) + nightly (full) | Critical user journeys end-to-end |
| Visual regression | Playwright screenshots | PR | Chart/KPI tile regressions |
| Performance | k6 | Nightly + pre-release | Dashboard p95 TTI under load; rollup under write bursts |

### The connector contract suite

Every connector module ships paired with fixtures; a single shared test suite exercises all of them:

```ts
for (const connector of connectorRegistry) {
  describe(`contract: ${connector.key}`, () => {
    test('validateCredentials rejects malformed creds')
    test('validateCredentials returns Ok on valid creds')
    test('pull returns typed drafts for a known period')
    test('pull is idempotent — two runs produce identical drafts')
    test('empty period returns Ok with NO_DATA warning, not error')
    test('expired auth returns AUTH_EXPIRED (not throw)')
    test('rate limit returns RATE_LIMITED with retry hint')
    test('drafts validate against MetricRecordDraft Zod schema')
    test('every metric_category emitted is a valid enum')
  })
}
```

Writing a new connector = implementing the interface + dropping fixtures into `packages/connectors/test/fixtures/<key>/`. Contract suite picks it up automatically.

Fixtures are recorded locally via `pnpm connectors:record <key>` against sandbox APIs where available; CI only replays.

### The adjustment lifecycle integration test

Non-negotiable. Demonstrates the override guarantees hold:

```ts
test('adjustment lifecycle preserves audit chain', async () => {
  await ingestMetric({ source: 'youtube', value: 43_200, period: DAY })
  expect(await dashboardValue()).toBe(43_200)

  const adj = await applyAdjustment({ type: 'replace', value: 98_500, reason: 'API outage' })
  expect(await dashboardValue()).toBe(98_500)
  expect(await rawValue()).toBe(43_200)       // raw preserved

  await rerunIngestion({ period: DAY })       // simulate next day's pull
  expect(await dashboardValue()).toBe(98_500) // override survives
  expect(await rawValue()).toBe(43_200)

  await reverseAdjustment(adj.id, 'mistake')
  expect(await dashboardValue()).toBe(43_200)
  expect(await auditLog()).toContainAction('adjustment.reversed')
})
```

### E2E user-journey guardrails

| # | Journey |
|---|---|
| E-01 | Board viewer logs in via magic link → sees dashboard → exports PDF |
| E-02 | Station manager logs satellite entry → appears on dashboard < 10s |
| E-03 | Station manager overrides a YouTube value → badge appears → reverse → badge clears |
| E-04 | Network admin adds YouTube connector → OAuth → picks channels → first pull succeeds |
| E-05 | Network admin invites new station manager → invitee sets password → lands scoped correctly |
| E-06 | Analyst runs CSV export for Q1 → downloads valid file with expected row count |
| E-07 | Network admin triggers 12-month backfill → progress visible → pause/resume |
| E-08 | Station manager without admin permissions cannot access `/sources` |
| E-09 | Cross-tenant: user from tenant A attempts URL into tenant B → 403 |

Smoke (E-01, E-02, E-03, E-09) on every PR (~2 min); full suite nightly against staging.

### Performance benchmarks — golden queries

| Benchmark | Baseline target |
|---|---|
| `GET /dashboard?period=quarter&hierarchy=station` cold | < 400ms p95 |
| Same, warm (cached) | < 50ms p95 |
| `GET /drill-down?tile=streaming&period=quarter` | < 400ms p95 |
| Rollup refresh for 1000-record ingestion | < 3s |
| Record table export, 50k rows | < 5s |
| PDF board pack generation | < 10s |

Regression-gated — CI fails if p95 drifts > 20% from committed baseline.

### Test environments

| Env | Postgres | Redis | External APIs | Data |
|---|---|---|---|---|
| `local` | docker-compose | docker-compose | MSW fixtures | Dev seed |
| `ci` | testcontainers | testcontainers | MSW fixtures | Generated per test |
| `staging` | Dokploy Swarm | Dokploy Swarm | OAuth sandbox where available | Synthetic tenant with realistic volume |
| `production` | Dokploy Swarm | Dokploy Swarm | Real | Real |

Before any prod release: deploy to staging → full E2E → perf benchmarks → alert-firing verification → manual approval → prod deploy.

### CI pipeline

```
on: pull_request
  ├─ lint + typecheck           (30s)
  ├─ unit                       (1m)
  ├─ contract (all connectors)  (2m)
  ├─ integration                (3m)
  ├─ cross-tenant isolation     (1m)
  ├─ E2E smoke (4 journeys)     (2m)
  ├─ visual regression          (2m)
  └─ build all packages         (1m)

on: merge to main
  └─ deploy to staging + smoke

nightly:
  ├─ full E2E (all 9 journeys)
  ├─ perf benchmarks
  ├─ backup restore drill
  └─ dependency audit

pre-prod-release:
  ├─ deploy to staging
  ├─ full E2E against staging
  ├─ perf benchmarks against staging
  └─ manual approval gate
```

Total PR gate: ~10–12 min.

### Explicitly NOT tested in v1

- 100% line coverage (chase "every bug gets a regression test" instead)
- Every UI component in Storybook (critical tiles only)
- Chaos engineering (v1.1)
- Load testing beyond golden queries
- Mutation testing

---

## 13. Rollout & Migration

### Phased rollout — 10 weeks to v1 GA

| Phase | Weeks | Deliverable | Gate |
|---|---|---|---|
| **0 — Foundations** | 1–2 | Monorepo scaffold, schema migrations, Better Auth, Dokploy staging + prod, CI pipeline, **Meta app review submitted** | Staging URL reachable, first tenant seeded, login works |
| **1 — P0 connectors** | 3–4 | Manual sat+Freeview, Cloudflare, GA4. TV-households + Web tiles live. | LW Europe staff log a real week end-to-end |
| **2 — Streaming coverage** | 5–6 | YouTube + Smart TV telemetry. Streaming tile live. PDF export. Adjustment UX + reminders. | Board member opens dashboard on iPad, exports PDF |
| **3 — Social coverage** | 7–8 | Meta Graph (FB + IG) assuming review clears. All 5 KPI tiles complete. Second tenant onboarded. | Real board meeting uses dashboard; cross-tenant canaries green |
| **4 — v1 GA** | 9–10 | Full E2E suite green, runbooks published, backup restore drill verified, docs complete, handoff to operations | v1 release announcement |

**Critical path item:** Meta app review — submitted Week 1, typically 2–6 weeks calendar. If review stalls beyond Week 8, Social tile ships partial and FB/IG backfill when cleared.

### Milestones

- **M1 (end Week 2):** First tenant created, first user logged in, first manual entry end-to-end
- **M2 (end Week 4):** First dashboard render with real data for LW Europe
- **M3 (end Week 6):** First PDF board pack generated from real quarterly data
- **M4 (end Week 8):** Multi-tenant production — second tenant live, cross-tenant tests green
- **M5 (end Week 10):** v1 GA — all acceptance criteria met, operations handoff complete

### Deployment

| Concern | Approach |
|---|---|
| Orchestration | Dokploy Swarm — rolling updates, health-check-gated, zero-downtime for web + API |
| Schema migrations | Drizzle-kit on deploy behind guard; destructive changes two-phase (add-new → deploy → backfill → drop-old next release) |
| Image strategy | Tagged by short commit SHA + semver; previous 5 tags retained for rollback |
| Deployed together | Web + API (schema-bound) |
| Deployed independently | Ingestion worker (can lag API, never lead) |
| Secrets | Dokploy secrets for KEK + infra; connector creds encrypted in DB |
| Blue/green | Not needed at v1 scale; revisit at 3+ tenants or > 99.5% SLO |

### Rollback

- **Container-level** — < 1 min via image tag revert. Primary mechanism.
- **Schema** — never. Forward-only migrations; fix-forward if a migration misbehaves. Two-phase destructive pattern makes this safe.
- **Full state** — restore from backup per runbook R-07. RTO 1h, RPO 5min. Catastrophic-only.

### Feature flags

No LaunchDarkly. Two flavours:

1. **Build-time flags** (env vars) — global toggles, set in Dokploy env
2. **Per-tenant toggles** (`tenant_features` table) — gradual rollouts

Every flag has a removal date tracked in `docs/feature-flags.md`. Flags > 6 months old are code smell and cleaned up.

### Tenant onboarding runbook

Documented in `docs/runbooks/onboarding.md`:

1. `pnpm admin:create-tenant --name <name> --admin-email <email>`
2. Seed hierarchy (CLI YAML import, or tenant admin builds in `/settings/hierarchy`)
3. Tenant admin invite → password + 2FA → empty dashboard
4. Add connectors one by one (OAuth flows / API key paste / manual enable)
5. Trigger initial 12-month backfill per connector (overnight)
6. Invite users with appropriate roles + scope
7. First board meeting: walk-through + PDF export

Target: operational within one working day once credentials are in hand.

### Decommissioning the current reporting surface

| Current surface | Replaced by | Cutover |
|---|---|---|
| Ad-hoc spreadsheets for board packs | PDF export from `/export` | After M3; keep spreadsheet as shadow for one reporting cycle then retire |
| Per-platform native dashboards (YT Studio, Meta Business Suite) | Drill-down view + platform deep-links | Never fully — natives stay for creative ops; this replaces rollup reporting |
| Email threads reconciling numbers | Adjustment log + audit trail | After Phase 2 |

Running both surfaces in parallel for **one full reporting cycle** (≈ 1 quarter) before retirement is strongly recommended.

### Post-launch cadence

- **Monthly releases** as default — features, new connectors, UI polish
- **Patch releases** — data-correctness bugs same-day; else on the monthly train
- **Connector deprecation** — 90-day notice; parallel new version, opt-in migration, retire old

### Documentation deliverables shipped with v1

| Audience | Doc | Location |
|---|---|---|
| Platform owner | Platform operations guide + runbooks | `docs/ops/` |
| Network admin | Connector config, user management, audit reading | `docs/admin/` |
| Station manager | Manual entries, overrides, anomaly investigation | `docs/manager/` |
| Board viewer | One-pager ("log in, read, export") | `docs/board/` |
| API consumer | OpenAPI reference (auto-generated) | `/api/docs` |
| Connector developer | How to add a new source | `docs/connectors/adding.md` |

All six exist before v1 GA.

### Post-v1 backlog

| Item | Reason parked | Target |
|---|---|---|
| Content & ad-push product (Product 2) | Different product scope | Follow-up project; consumes this platform's API |
| Content-level attribution (cross-platform dedup) | Not needed for v1 attribution model | v1.1 if cross-posting grows |
| SSO (Google Workspace / M365) | Per-tenant IdP config complexity | v1.1 |
| Postgres RLS | App-layer sufficient for v1 | v1.1 |
| Support impersonation grants | Operational need not yet real | v1.1 |
| TikTok + X connectors | App-review-gated | Post-GA |
| File uploads for evidence | URL-only sufficient for v1 | v1.1 |
| Chaos engineering | Degradation matrix + integration tests cover v1 needs | v1.1 |
| Phone-responsive polish | Tablet-first for board use | v1.1 |

---

## 14. Open Items (known at design time)

These were raised during brainstorming but didn't change the design; flagged for implementation planning:

| # | Item | Resolution path |
|---|---|---|
| O-01 | Smart-TV app currently emits which analytics (Firebase? GA4? custom)? | Discovery task in Phase 0; determines whether Smart-TV connector is 2d or 2w |
| O-02 | Do the 59 non-English LW Europe language channels have their own social accounts (FB/IG/TikTok)? | Discovery task; answers whether v1 attribution stays 1:1 clean |
| O-03 | Alert channel (Slack / Teams / PagerDuty / email) | Decided at Phase 0 setup; no design impact |
| O-04 | Existing Meta / Google developer accounts for LW Group? | Platform-owner input at Phase 0 |
| O-05 | Single full-time developer vs split team — affects 10-week timeline feasibility | Resource plan at implementation planning stage |
| O-06 | Ops ownership post-GA (platform owner vs shared ops team)? | Affects runbook tone & escalation paths; decide before M5 |
| O-07 | Cloudflare plan tier — affects Cloudflare Analytics backfill depth available | Confirm at Phase 0 |

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Tenant** | An organisation subscribing to the platform. All data is tenant-scoped. |
| **Hierarchy node** | A row in `hierarchy_node` — a station, broadcast channel, or language channel. |
| **Source** | A connector type in the registry (e.g. `youtube`, `manual_satellite`). |
| **Connector config** | A per-tenant instance of a source with credentials + schedule. |
| **Platform account** | A specific external account (a YouTube channel, an FB page) attached to a hierarchy node. |
| **Metric record** | One immutable ingested fact (value + dimensions + period). |
| **Metric adjustment** | A correction over a metric record; preserves the raw value, renders as the effective value. |
| **Effective value** | `metric_record.raw_value` optionally modified by the latest applied `metric_adjustment`. |
| **Rollup** | Pre-aggregated value in `metric_rollup`, keyed by (tenant, node, category, granularity, bucket). |
| **KPI category** | One of the five board tiles: `tv_households`, `web_visitors`, `streaming`, `social_reach`, `engagement`. |
| **Provenance** | String on `metric_record` tracing origin: `connector:<id>` or `manual:user:<id>`. |
| **Dimensions hash** | BLAKE3 of canonical-JSON dimensions; part of the idempotency key. |
| **Board pack** | Generated PDF snapshot of the current dashboard view, suitable for board distribution. |

---

## 16. Design Decisions Log

Key decisions taken during brainstorming, for future reference:

| # | Decision | Rationale |
|---|---|---|
| D-01 | Scope: analytics rollup only (Product 1); content/ad distribution deferred | Different users, different UX, different risk profile |
| D-02 | Multi-tenant from day one | Covers LW Group sister stations under one platform |
| D-03 | Full hierarchy with drill-down: Tenant → Station → Broadcast Channel → Language Channel | Board wants rollup; managers want detail |
| D-04 | Board view: 5 category KPI tiles, no composite total. Drill-down shows source mix with honest caveat. | Adding non-comparable units produces meaningless totals |
| D-05 | 1:1 platform-account-to-hierarchy-node attribution for v1 | LW Europe has clean mapping; cross-attribution deferred |
| D-06 | Standalone repo `loveworld-analytics` | Independent tenancy + release cadence from LWE One / CastNet |
| D-07 | SvelteKit + Hono (not Next.js) | API-first, shared Zod contracts, Svelte 5 + Layerchart fit dashboards well |
| D-08 | Drizzle (not Prisma) | User preference, type-first, performance |
| D-09 | Plain Postgres (not TimescaleDB) for v1 | Volumes modest; YAGNI on extension ops |
| D-10 | Manual override = separate `metric_adjustment` record (accounting-style), never destroys raw | Audit, reversibility, re-pull safety |
| D-11 | Apply overrides immediately, notify, reversible (not approve-before-apply) | Avoid making the feature unusable via bureaucracy |
| D-12 | 24-hour rule: direct edit by original author within 24h; otherwise adjustment | Matches accounting conventions, simple UX |
| D-13 | `hierarchy_node` as single self-referencing table (not three typed tables) | Extensible if new levels appear; recursive CTEs are clean |
| D-14 | Idempotency via UNIQUE constraint on `(tenant, source, node, type, period, dim_hash)` | Re-runs upsert; overrides untouched |
| D-15 | Four roles: `network_admin`, `station_manager`, `board_viewer`, `analyst` | Clear jobs, no role sprawl |
| D-16 | Better Auth + magic link + TOTP (required for admins); SSO deferred to v1.1 | Covers 95% of v1 needs without IdP complexity |
| D-17 | Postgres RLS deferred; app-layer tenant scoping sufficient for v1 | Belt-and-braces welcome later, not blocking |
| D-18 | 12-month backfill default depth | YoY comparisons work; Meta caps near here anyway |
| D-19 | PDF export is v1 (not deferred) | Boards ask for it in week 1 |
| D-20 | Submit Meta app review in Week 1 of development | Review is outside our control; starts the clock early |
| D-21 | Release gate: cross-tenant isolation + contract + E2E smoke must pass | Catches the classes of bug that matter most |
| D-22 | Run old reporting surface in parallel for one cycle before retirement | Trust is earned via reconciliation |

---

## 17. Acceptance Criteria for v1 GA (M5)

The platform ships when:

- [ ] All 9 E2E journeys pass in staging and production canary
- [ ] Cross-tenant isolation suite passes on every PR for 30 consecutive days
- [ ] Connector contract suite green for every launch connector (P0 + P1 + P2 as available)
- [ ] Performance benchmarks within 20% of committed baselines
- [ ] At least two tenants running in production with real data
- [ ] At least one full reporting cycle reconciled against the legacy surface
- [ ] All six documentation deliverables published
- [ ] All 10 runbooks written and reviewed
- [ ] Backup restore drill has passed at least twice, independently
- [ ] Alert routing verified via synthetic failure injection
- [ ] Meta / YouTube OAuth apps in verified production status (or platform ships with those connectors disabled and post-GA enablement plan)

---

*End of design document.*
