# Feature Flags

Loveworld Analytics uses lightweight feature flags (env vars for global toggles; `tenant_features` for per-tenant). Every flag has a **removal date** tracked here. Flags older than 6 months without a removal plan are a code smell and should be cleaned up.

| Flag | Type | Purpose | Added | Target removal |
|---|---|---|---|---|
| `CONNECTOR_META_ENABLED` | env | Dark-ship the Meta connector until app review clears | 2026-04 | Phase 3 GA (~2026-06) |
| `ENABLE_PDF_EXPORT` | env | Dark-ship PDF export until Phase 2 | 2026-04 | Phase 2 GA (~2026-05) |

## Adding a flag

1. Add a row to this table with a removal plan
2. Implement: read the env var once at boot; or write to `tenant_features` with a `tenant_id`
3. Wrap the feature in a simple check
4. Set a calendar reminder for the removal date

## Removing a flag

1. Delete the flag check
2. Delete the config
3. Delete the row in this table
4. Commit with message `chore: remove <flag> feature flag`
