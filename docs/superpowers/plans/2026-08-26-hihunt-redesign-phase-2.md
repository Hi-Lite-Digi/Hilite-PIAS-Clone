# HiHunt v2 Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan. Keep all work uncommitted on `redesign/v2`.

**Goal:** Deliver the complete RE-engage Phase 2 experience: Home, Leads, Campaigns/detail/wizard, Inbox, Settings, and the four missing frontend API contracts, without touching Phase 3 or Phase 4 scope.

**Architecture:** New route-level screens live under `src/app/reengage/` and compose the Phase 1 system kit. Missing read endpoints may fall back to deterministic data carrying `sample: true`; live mutations always parse and surface failures and never turn a failed request into a local success. Existing real API functions remain the source for supported lead, campaign, reply, and gateway operations. Pure view-model helpers hold sorting, filtering, import mapping/dedupe, connection state, and chart derivation so the existing Node/Vite SSR test harness can cover behavior without a DOM library.

**Tech stack:** React 18, TypeScript, React Router 7, Tailwind CSS 4, Phase 1 system components, Radix primitives, Recharts 2, SheetJS CE, Sonner, Node test runner, and Vite SSR transforms.

---

## File map

**Modify**

- `package.json`, `package-lock.json`: add the official SheetJS CE package.
- `src/lib/stubs.ts`: typed read fallbacks, strict mutation helper, approve-batch, threads, lead-import, and campaign-detail contracts; remove silent fake success.
- `src/app/routes.tsx`: mount all new RE-engage screens and split campaign detail from the wizard.
- `src/app/reengage/CampaignWizardPage.tsx`: keep four steps/upload behavior while adopting per-step errors, dirty guards, and the shared audience surface.
- `src/app/reengage/CampaignEditorFields.tsx`: tokenized message editor/preview used by wizard and detail.
- `src/app/components/ProspectReviewQueue.tsx`, `src/app/hihunt/OutreachDraftEditor.tsx`, `src/app/SettingsPage.tsx`: surface strict stub mutation failures in their existing callers.
- `BACKEND_TODO.md`: mirror the four Phase 2 contracts and live-mutation error rule.

**Create**

- `src/lib/stubs.test.ts`: request shape, fallback, not-found, and fail-loud mutation tests.
- `src/app/reengage/HomePage.tsx`, `BatchApprovalPanel.tsx`, `CampaignBentoGrid.tsx`, `home-model.ts`, `home-model.test.ts`: Home queue, campaign bento/charts, stats, actions, drafts, and pure metrics/grouping.
- `src/app/reengage/LeadsPage.tsx`, `LeadDetailDrawer.tsx`, `LeadFormDrawer.tsx`, `LeadImportDrawer.tsx`, `lead-import.ts`, `lead-import.test.ts`: lead table/detail/create/delete and complete SheetJS mapping/dedupe/import/report flow.
- `src/app/reengage/CampaignsPage.tsx`, `CampaignDetailPage.tsx`, `AudiencePanel.tsx`, `campaign-view.ts`, `campaign-view.test.ts`: list/detail/tabs/shared audience editing/recipient and reply views.
- `src/app/reengage/InboxPage.tsx`, `inbox-model.ts`, `inbox-model.test.ts`: URL-addressable responsive two-pane inbox and optimistic mutation behavior.
- `src/app/reengage/SettingsPage.tsx`, `settings-model.ts`, `settings-model.test.ts`: RE-engage gateway/sending settings, dirty save bar, validation, and guards.

Legacy root pages stay untouched and become intentionally orphaned until the Phase 4 cleanup, except the three narrow caller fixes required to surface stub errors.

### Task 1: Stabilize the dependency and data contract boundary with TDD

- [x] Add failing `stubs.test.ts` coverage for the four exact endpoint paths/bodies, encoded identifiers and campaign filters, deterministic read fallback, unknown deep links, response validation, empty mutation rejection, and backend/network error propagation.
- [x] Add SheetJS CE and verify the lockfile resolves it. Use the locally available 0.18.5 package in this restricted workspace; the current official tarball host is not reachable from the shell.
- [x] Replace the nullable `tryApi` mutation behavior with tagged reads and strict mutations. Keep `getSendQueue` and `approveSendBatch` live-only so no sample recipient can be presented as sent.
- [x] Add the four frontend contracts and types; mirror them in `BACKEND_TODO.md`.
- [x] Update existing strict-stub callers to catch and visibly surface errors.
- [x] Run the focused data tests and typecheck to green.

### Task 2: Build and verify Home

- [x] Add failing helper/SSR tests for campaign grouping, approve count, three actions, queue empty/error/disconnected states, and tokenized chart data.
- [x] Build the full-width grouped batch panel with inline expansion/editing, five-second removal undo, cap indicator, one consent confirmation, strict batch approval, and calm success state.
- [x] Build active campaign bento cards with Recharts mini-bars, honest/labelled metrics, the stat trio/donut, and the draft strip.
- [x] Wire Home actions to campaign creation and query-addressed Leads add/import flows.
- [x] Run focused Home tests to green.

### Task 3: Build and verify Leads and Excel import

- [x] Add failing pure tests for header alias detection, editable mapping, normalization, intra-file duplicate detection, preview rows, and downloadable CSV report output.
- [x] Build the searchable/filterable/sortable lead `DataTable`, responsive stat trio, active-filter empty state, and clear-filters action.
- [x] Build the row detail `Drawer` with contact details, age, campaign/thread history, edit state, and the existing two-phase deletion impact inside `ConfirmDialog`.
- [x] Restyle add-lead as a system drawer with inline field validation.
- [x] Build the SheetJS `.xlsx`/`.csv` import flow: drop/browse, map, dedupe preview, strict import request, result report, toast, and error download.
- [x] Run focused Leads/import tests to green.

### Task 4: Build and verify Campaigns, detail, and wizard

- [x] Add failing pure/SSR tests for status normalization, audience summaries, detail routing, tabs, and manual-pick reset safeguards.
- [x] Build the campaign list `DataTable` with status, audience, progress, replies, and detail navigation.
- [x] Build the detail page with header actions and Message/Audience/Recipients/Replies tabs; fetch by URL id and never depend on route state.
- [x] Build one shared `AudiencePanel` that owns rules and included/excluded leads, with a Browse drawer and confirmation before rule changes clear manual picks.
- [x] Rework the wizard around that panel while preserving four steps, drag/paste/browse upload, progress, and AI banner; use per-step errors and dirty Back/unload guards.
- [x] Run focused campaign tests to green.

### Task 5: Build and verify Inbox and RE-engage Settings

- [x] Add failing pure tests for unread/latest thread ordering, campaign chip counts, search, day grouping, category mapping, connection states, dirty detection, and send-window validation.
- [x] Build the 360px/two-pane desktop inbox and route-driven mobile stack. Use deep links, campaign chips, accessible unread state, grouped bubbles, and campaign context.
- [x] Make send confirm-free with an optimistic sending bubble and retry toast; rollback star/read/category changes on failure.
- [x] Build RE-engage-only Settings with all four gateway states, semantic requirement list, live cap display, send-window inputs, dirty-only save bar, validation, and unload/internal navigation guards.
- [x] Keep `/hihunt/settings` on the legacy screen until Phase 3.
- [x] Run focused Inbox/Settings tests to green.

### Task 6: Integrate, review, and verify

- [x] Update canonical routes and ensure Home query actions open the matching Leads flow.
- [x] Run the entire test suite and fix all regressions.
- [x] Run typecheck and production build; no lint command exists in this project.
- [x] Scan changed/new TSX for raw hex utilities and font sizes below 12px.
- [x] Perform code/spec review across all five screens, four contracts, responsive states, and fake-success behavior; fix every Critical or Important finding.
- [x] Confirm the branch remains `redesign/v2`, HEAD remains `d8ebffa`, no commits were created, and unrelated `AGENTS.md` remains untouched.

## Explicit backend boundaries

- Inline queue copy can be edited for review, but the approved backend request is exactly `{ itemIds[] }`; no undocumented message-override field is invented. Approval is blocked until edited preview copy is reset, and the UI explains this boundary.
- Lead edits and campaign pause/resume use strict, validated PATCH/queue handlers added to the local worker. Labelled sample records remain read-only.
- `CampaignRecord` lacks per-recipient status and weekly metrics. These surfaces derive only what existing live records/threads can support, and any deterministic supplement is visibly marked sample data.
- Definitively missing read endpoints may activate a labelled sample view. Transport/server failures surface a stable error with manual retry; approve/import and other live mutations never fall through to simulated success.
