# Meta App Review Checklist

**Purpose:** Submit the Meta (Facebook + Instagram) Graph API app for review so that the `meta_graph` connector can access Page Insights and IG Business Account metrics in Phase 3.

**Timing:** **Submit in Phase 0 Week 1.** Review typically takes 2–6 weeks of calendar time and is entirely outside our control.

**Owner:** Platform owner, in coordination with the Loveworld digital team.

## Prerequisites

- Meta for Developers account with admin access to the Loveworld business portfolio
- Existing Facebook Page(s) and Instagram Business Account(s) for the first tenant
- Hosted privacy policy URL (can be a static page under the staging domain for submission; finalise before Phase 3 go-live)
- Data Deletion Instructions URL

## Pre-submission

- [ ] Create a new Meta App in the Meta for Developers console
- [ ] App type: **Business**
- [ ] Product: **Facebook Login for Business** + **Graph API**
- [ ] Permissions requested:
  - `pages_read_engagement` — read post engagement metrics on owned Pages
  - `pages_show_list` — list Pages the admin manages
  - `read_insights` — read Page Insights (reach, views, impressions)
  - `instagram_basic` — link IG Business Account
  - `instagram_manage_insights` — read IG Insights
  - `business_management` — access business-managed assets
- [ ] OAuth redirect URIs registered (Better Auth mounts at `/api/auth/*`,
      so callback path is `/api/auth/callback/meta`):
  - `https://api.staging.loveworld-analytics.example/api/auth/callback/meta`
  - `https://api.loveworld-analytics.example/api/auth/callback/meta`

  > **Note**: Replace `.example` TLD (RFC 2606 placeholder) with the
  > registered production domains before submission to Meta.
- [ ] Privacy policy URL live and linked
- [ ] Data deletion URL live and linked
- [ ] App icon (1024×1024 PNG) uploaded

## Submission materials

For each permission above, the reviewer requires:

- [ ] A **screencast** showing the exact user flow:
  1. Admin logs into Loveworld Analytics
  2. Navigates to `/<tenant>/sources/new`
  3. Selects "Meta (Facebook + Instagram)"
  4. Completes Meta OAuth consent
  5. Selects Pages / IG accounts to attach
  6. Attaches them to hierarchy nodes
  7. Dashboard updates with Meta-sourced metrics after first pull

- [ ] A **written rationale** for each permission — reference this doc's context: multi-tenant analytics rollup for TV networks; numbers shown only to authenticated tenant members with `view_dashboard`; data not shared beyond the tenant.

- [ ] **Test credentials** for a sandbox Page and IG account that reviewers can use to reproduce the flow.

## Post-submission

- [ ] Review status checked weekly in Meta for Developers console
- [ ] Questions / rejections tracked in `docs/ops/meta-app-review-log.md` (create if reviewer asks for changes)
- [ ] **Do not start building the Meta connector before Phase 2 closes** — submission-while-building avoids rework if requirements change during review

## If review is rejected

See Runbook R-10 (created in Phase 4). Common fixes:

- Screencast too fast / unclear — re-record with narration and zoomed cursor
- Privacy policy missing required disclosures — update and re-submit (no new review cycle for policy-only changes)
- Permission scope too broad — remove unused scopes and resubmit
