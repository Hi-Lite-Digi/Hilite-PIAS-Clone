# HiHunt v2 Phase 3 Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` and test-driven development while executing this plan. Keep all work uncommitted on `redesign/v2`.

**Goal:** Deliver the complete Hi-Hunt Phase 3 experience: Home, Leads, Workflows/editor, Inbox, Settings, and the Phase 3 frontend API contracts, without deleting legacy screens or implementing backend services.

**Architecture:** New route-level screens live under `src/app/hihunt/` and compose the Phase 1 system kit. Pure model helpers own grouping, metrics, validation, filtering, interpolation, optimistic reconciliation, and dirty comparisons so the existing Node/Vite SSR runner can test behavior without a browser DOM. Missing reads may fall back to deterministic data carrying `sample: true`; live mutations validate their documented response shape, propagate backend/network errors, and never turn a failed request into local success. `BACKEND_TODO.md` mirrors every accepted request/response constraint exactly.

**Tech stack:** React 18, TypeScript, React Router 7 data routers and blockers, Tailwind CSS 4, Phase 1 system components, Radix primitives, Recharts 2, Sonner, Node test runner, and Vite SSR transforms.

---

## File map

**Modify**

- `src/lib/stubs.ts`, `src/lib/stubs.test.ts`: workflow, outreach batch, email thread/reply, and email account contracts with deterministic read fallbacks and strict live mutations.
- `BACKEND_TODO.md`: exact Phase 3 request, response, validation, fallback, and partial-approval contract mirror.
- `src/app/routes.tsx`, route tests: replace only the canonical Hi-Hunt route elements while retaining legacy redirects and files.
- `src/app/App.tsx`, `src/app/components/system/app-shell.tsx` and focused tests as needed: expose Hi-Hunt unread email counts and refresh Phase 3 badges without changing Phase 1 navigation semantics.
- `src/app/components/system/index.ts`: export any narrowly required tokenized system control wrapper.

**Create**

- `src/app/hihunt/HomePage.tsx`, `PendingEmailBatchPanel.tsx`, `home-model.ts`, and tests.
- `src/app/hihunt/LeadsPage.tsx`, `LeadDetailDrawer.tsx`, `leads-model.ts`, and tests.
- `src/app/hihunt/WorkflowsPage.tsx`, `WorkflowEditorPage.tsx`, `workflow-model.ts`, and tests.
- `src/app/hihunt/InboxPage.tsx`, `inbox-model.ts`, and tests.
- `src/app/hihunt/SettingsPage.tsx`, `settings-model.ts`, and tests.
- `src/app/components/system/switch.tsx` and a focused test if the existing primitive needs a Phase 1-kit wrapper.

Legacy `HRDiscoveryPage`, `OutreachPage`, root `SettingsPage`, review queue, and outreach editor remain in the tree for Phase 4 cleanup.

### Task 1: Define and verify the Phase 3 contract boundary

- [ ] Add failing tests for exact workflow list/detail/create/patch paths, bodies, validation, deterministic sample reads, and fail-loud live writes.
- [ ] Add failing tests for outreach batch approval, including exact returned IDs, partial approval, retryable remainder, malformed success bodies, and network/non-2xx propagation.
- [ ] Add failing tests for email thread list/detail filtering/deep links, reply request/response validation, sample read-only behavior, and fail-loud replies.
- [ ] Add failing tests for email-account status and connect/disconnect/send-test actions, including OAuth handoff data and strict response validation.
- [ ] Implement the typed contracts in `stubs.ts`; label every fallback `sample: true`; never synthesize success for a mutation.
- [ ] Mirror every validation rule and optional field in `BACKEND_TODO.md` so a conforming backend cannot be rejected by undocumented frontend checks.
- [ ] Run focused contract tests and typecheck to green.

### Task 2: Build and verify Hi-Hunt Home

- [ ] Add failing pure/SSR tests for workflow digest projection, next-run countdown, queue grouping, sending-limit math, remove/undo, edits, partial approval reconciliation, stats, donut categories, and reply highlight links.
- [ ] Build the overnight digest per workflow with found/skipped/drafted counts and next-run countdown; label sample/modelled data honestly.
- [ ] Build the pending email approval panel with expandable subject/body editing, five-second undo removal, one consent confirm, cap summary, strict live draft persistence, partial approval, and calm success state.
- [ ] Build the stat trio, tokenized reply-rate donut, and reply highlights linking to URL-addressable email threads.
- [ ] Run Home tests and typecheck to green.

### Task 3: Build and verify scraped Leads

- [ ] Add failing pure/SSR tests for search/filter/sort, lifecycle and verification semantics, LinkedIn/source presentation, history links, suppression confirmation, optimistic undo, rollback, and sample read-only behavior.
- [ ] Build the responsive system `DataTable` with full pagination rather than silent API truncation and clear capped/error/empty states.
- [ ] Build the profile drawer with full source/profile details and email history linking to inbox threads.
- [ ] Implement labelled Suppress plus `ConfirmDialog`, strict live mutation, five-second undo, and rollback on error. Never infer verified from a non-empty address.
- [ ] Run Leads tests and typecheck to green.

### Task 4: Build and verify Workflows

- [ ] Add failing contract/model/SSR tests for cards, schedule summaries, workflow validation, variable interpolation, clean initial state, dirty comparisons, enabling, save/discard, and unsaved navigation blocking.
- [ ] Build workflow cards with enabled switch, schedule, last/next run, and drafted-today count; optimistic strict toggle with rollback.
- [ ] Build the one-page editor sections for Schedule, Apollo scrape recipe, email template/live sample preview, and sending rules.
- [ ] Prevent enabling without seniorities or subject/body; show inline errors and a dirty-only save bar.
- [ ] Guard all React Router navigation with `useBlocker` and hard unload with `beforeunload`, with confirm proceed/reset handling.
- [ ] Run workflow tests and typecheck to green.

### Task 5: Build and verify the Hi-Hunt Inbox

- [ ] Add failing pure/SSR tests for search/workflow filters, unread/status counts, URL deep links, list/detail independent errors and manual retries, mobile list/thread mode, optimistic reply, reconciliation, and request-race guards.
- [ ] Build the email-shaped two-pane layout with sender/subject/snippet/workflow rows and stacked from/to/time/body cards.
- [ ] Build the connected-account composer; disable sample/disconnected sends; send through the strict live reply contract; reconcile pending messages without duplicates.
- [ ] Surface replied/needs-reply chips and update shell badges immediately from loaded/optimistic counts.
- [ ] Run Inbox tests and typecheck to green.

### Task 6: Build and verify Hi-Hunt Settings

- [ ] Add failing model/SSR tests for account states, connect/disconnect/send-test actions, Apollo instruction copy, defaults validation/dirty state, and all-navigation guards.
- [ ] Build the email account card with connected address, strict live disconnect/send-test, and clearly labelled developer-owned OAuth handoff.
- [ ] Build the Apollo status tile with the exact actionable instruction and copy affordance.
- [ ] Build sender-name/sign-off defaults with dirty-only save/discard and honest local/sample persistence if no live contract exists.
- [ ] Apply the proven `useBlocker` plus `beforeunload` guard and run Settings tests/typecheck to green.

### Task 7: Integrate, review, and verify

- [ ] Replace the seven canonical Hi-Hunt route elements only; preserve route IDs, paths, redirects, and legacy files.
- [ ] Wire Hi-Hunt Home/Leads/Inbox counts into the shell and refresh context after successful batch, suppression, workflow, and inbox mutations.
- [ ] Run a Phase 3 constraint scan for raw colour literals, arbitrary sub-12px text, accidental legacy-route rendering, and undocumented contract validation.
- [ ] Request independent code review, address Critical/Important findings, and rerun focused regressions.
- [ ] Run `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build`; fix all introduced failures and leave the working tree uncommitted.

### Task 8: Resolve the adversarial-review regressions

- [ ] Add focused regressions for the Hi-Hunt inbox first-detail request, stale request rejection, zero-unread workflow filters, and account refresh/disconnect ordering.
- [ ] Reconcile both workspace batch panels against each fresh server cap and render an unavailable reply rate when tracked sends are zero.
- [ ] Keep capped Leads statistics honest, clear stale lifecycle overrides on reload, and distinguish unavailable/sample email history from a true empty history.
- [ ] Always expose the create-workflow save bar and align every editor validation rule and inline error with the documented workflow contract.
- [ ] Probe collection availability before treating a workflow or email-thread detail 404 as an endpoint-missing sample fallback.
- [ ] Rerun focused tests, independent review, the full test suite, typecheck, build, diff checks, and leave all fixes uncommitted.

## Safety and scope boundaries

- Do not implement Apollo scraping, cron scheduling, OAuth, or email delivery backend behavior.
- Do not delete legacy pages/components or refactor unrelated Phase 1/2 code.
- Do not silently mutate sample data, claim a failed write succeeded, or enable a send control against fallback records.
- Do not add raw colour values outside the existing token definitions, arbitrary font sizes below 12px, or horizontal page overflow.
- Do not commit or push.
