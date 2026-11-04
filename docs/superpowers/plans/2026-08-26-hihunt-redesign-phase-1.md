# HiHunt v2 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved HiHunt v2 visual foundation, reusable component kit, responsive two-workspace shell, canonical routing skeleton, and compatibility redirects without implementing Phase 2–4 screens.

**Architecture:** CSS variables in `theme.css` are the only colour source for new Phase 1 UI. Focused system components wrap the existing Radix/shadcn primitives, while a route metadata module drives desktop pills, mobile bottom navigation, workspace switching, and localStorage memory. The shell consumes the supplied official PIAS logo without deriving UI colours from it. Existing screens remain mounted at the closest canonical routes; one placeholder component covers screens that do not exist yet.

**Tech Stack:** React 18, TypeScript, React Router 7, Tailwind CSS 4, Radix/shadcn primitives, Lucide, Sonner, Node's test runner, and Vite 6's in-process SSR module runner.

---

## File map

**Modify**

- `package.json`: add minimal test/typecheck commands without new dependencies.
- `vite.config.ts`: bind development to port 5199 and strict-port mode.
- `src/styles/fonts.css`, `src/styles/theme.css`: self-host DM Sans and define the approved single-theme token system.
- `src/app/components/ui/sonner.tsx`: make the existing toaster explicitly single-theme and token-based.
- `src/app/App.tsx`: mount canonical routes, interim legacy screens, placeholder routes, and compatibility redirects beneath the new shell.
- `ATTRIBUTIONS.md`: record the vendored DM Sans source and OFL license.

**Create**

- `scripts/run-tests.mjs`: discover TypeScript/TSX tests and load them through Vite's in-process SSR runner for Node's test runner.
- `src/styles/theme.test.ts`: exact token, typography, and font-source contract tests.
- `src/assets/fonts/DMSans-Variable.ttf`, `src/assets/fonts/OFL-DMSans.txt`: official Google Fonts variable asset and license.
- `src/assets/pias-logo.png`: supplied official PIAS brand mark used by the shell.
- `src/app/navigation.ts`, `src/app/navigation.test.ts`: workspace/tab metadata and safe storage/path helpers.
- `src/app/components/system/button.tsx`: `Button` and accessible 36px `IconButton`.
- `src/app/components/system/card.tsx`: `Card` and `StatCard`.
- `src/app/components/system/status.tsx`: canonical `StatusDot` and `StatusPill` vocabulary.
- `src/app/components/system/data-table.tsx`: generic sortable desktop table plus mobile card collapse.
- `src/app/components/system/drawer.tsx`: right sheet that becomes full-width on phones.
- `src/app/components/system/confirm-dialog.tsx`: alert-dialog wrapper with pending/destructive states.
- `src/app/components/system/toast.tsx`: the single mountable Sonner viewport plus imperative `toast` export.
- `src/app/components/system/search-input.tsx`, `filter-chips.tsx`: tokenized filtering controls.
- `src/app/components/system/empty-state.tsx`, `skeleton.tsx`: accessible empty/loading states.
- `src/app/components/system/page-header.tsx`, `sample-data-pill.tsx`: shared screen chrome and sample marker.
- `src/app/components/system/workspace-switcher.tsx`, `nav-pills.tsx`: accessible workspace and five-tab navigation.
- `src/app/components/system/app-shell.tsx`: floating responsive container, topbar, outlet, mobile nav, badge polling, and single toast mount.
- `src/app/components/system/index.ts`: stable named exports for the kit.
- `src/app/components/system/system.test.tsx`: render, interaction, sorting, accessibility, and responsive-structure tests.
- `src/app/PlaceholderPage.tsx`: intentional Phase 1 placeholder for missing later-phase screens.
- `src/app/routes.tsx`, `src/app/routes.test.tsx`: canonical route tree, retained-screen adapters, deep routes, compatibility redirects, and fallback coverage.
- `src/app/dev-config.test.ts`: acceptance-port and sandbox-compatible Vite command coverage.

The old `src/app/layout/Sidebar.tsx` and `Topbar.tsx` remain untouched and unused until the Phase 4 cleanup. Legacy page colours/typography also remain until their scheduled P2/P3 rebuilds.

### Task 1: Establish the test and verification harness

- [ ] **Step 1: Confirm the no-network fallback**

The preferred Vitest/Testing Library install cannot complete in the restricted environment and must leave `package.json`/`package-lock.json` unchanged. Use only packages already installed by the project.

- [ ] **Step 2: Add a deterministic zero-dependency harness**

Add `test` and `typecheck` scripts. `scripts/run-tests.mjs` must recursively discover `src/**/*.test.ts(x)`, accept explicit test paths, transform TypeScript/TSX with automatic JSX through Vite's SSR module runner, and let Node's test runner own TAP reporting and the process exit code. Dependency optimization stays disabled so the harness works inside the restricted Windows workspace.

- [ ] **Step 3: Verify the empty harness**

Run:

```powershell
npm.cmd run test
```

Expected: exit 0 with no tests found.

### Task 2: Implement the visual tokens and self-hosted font with TDD

- [ ] **Step 1: Write exact failing theme tests**

Tests must read `theme.css`/`fonts.css` and assert the exact approved values:

```ts
const requiredTokens = {
  bg: "#EFEEF3",
  surface: "#FFFFFF",
  "surface-2": "#F6F5F8",
  ink: "#141416",
  "ink-2": "#6E6E76",
  "ink-3": "#A6A6AE",
  accent: "#D9F04A",
  mint: "#DEEADF",
  cyan: "#C3E7EB",
  lavender: "#DCD8F0",
  danger: "#E5484D",
  warn: "#E9A23B",
};
```

Also assert `--line`, the four approved radii, 16px root size, DM Sans as `--font-sans`, no `.dark {` palette, no retired blue in `theme.css`, a local DM Sans URL, and that the referenced font file exists.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd run test -- src/styles/theme.test.ts`

Expected: assertion failures for the old palette/font.

- [ ] **Step 3: Vendor and wire DM Sans**

Use the official Google Fonts `ofl/dmsans/DMSans[opsz,wght].ttf` and matching OFL text. Define a normal variable face at weights 100–1000 with `font-display: swap`. Keep JetBrains Mono for mono values and keep the existing Manrope files until Phase 4 cleanup.

- [ ] **Step 4: Rewrite the theme**

Define the approved tokens plus shadcn compatibility aliases, Tailwind colour/radius/font variables, 1200px `xl`, the floating-container shadow, base 16px typography, normal 400/500 typography, and tokenized focus treatment. Remove only the `.dark` palette; retain the class-based dark custom variant so dormant `dark:*` utilities do not react to OS dark mode.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm.cmd run test -- src/styles/theme.test.ts`

Expected: all theme tests pass.

### Task 3: Build the reusable system kit with TDD

- [ ] **Step 1: Write failing component contract tests**

Cover every named export from section 5. Assertions must include:

- Primary buttons use the ink action colour and icon buttons have an accessible label.
- Status aliases map to the canonical live/paused/draft/done/error/queued presentation.
- Cards expose title/action/footer slots; stat values use tabular display typography.
- DataTable sorts by a declared accessor, exposes semantic headers, renders a mobile card representation, and supports keyboard row activation.
- Drawer and ConfirmDialog expose accessible triggers/titles and correct pending/variant markup; live open/cancel/confirm/focus restoration moves to browser QA because no DOM test library can be installed.
- SearchInput semantics, pure FilterChips selection helpers, empty-state CTA, skeleton row count, page actions, and sample pill render correctly.
- The Sonner viewport is light/tokenized.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd run test -- src/app/components/system/system.test.tsx`

Expected: failure because the system barrel/components do not exist.

- [ ] **Step 3: Implement minimal tokenized components**

Use only semantic token utilities (`bg-ink`, `text-ink-2`, `border-line`, etc.) in new TSX—no raw hex. Wrap existing primitives where appropriate and keep each file focused. Use 44px minimum touch targets where a control can appear on mobile; the compact desktop icon button remains the specified 36px circle with an expanded mobile hit area where needed.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd run test -- src/app/components/system/system.test.tsx`

Expected: all system component tests pass with no React accessibility warnings.

### Task 4: Deliver the navigation model and first meaningful shell slice with TDD

- [ ] **Step 1: Write failing navigation tests**

The pure helpers must prove:

```ts
getWorkspaceFromPath("/reengage/campaigns/new") === "reengage";
getActiveTab("/hihunt/workflows/42", "hihunt")?.id === "workflows";
getWorkspaceRoot(undefined) === "/reengage";
getSwitchTarget("hihunt", storageWithInbox) === "/hihunt/inbox";
```

Also assert exactly five tabs per workspace, invalid storage fallback, separate per-workspace tab keys, and tab-root—not stale detail URL—memory.

- [ ] **Step 2: Run navigation tests and verify RED**

Run: `npm.cmd run test -- src/app/navigation.test.ts`

Expected: failure because `navigation.ts` does not exist.

- [ ] **Step 3: Implement navigation metadata and the shell**

The topbar must show the official PIAS logo at 28–32px high + workspace switcher, desktop/tablet pills, workspace-specific inbox control, and avatar. Keep the full logo on mobile and crop to the leaf emblem only below 360px where space is tight. Hide pill labels from 768–1199px. Below 768px show only logo + switcher + avatar in the topbar and render a five-item safe-area-padded bottom nav. The outer app uses the lavender canvas and a white 28px floating container at 16–24px margins; phones are edge-to-edge with no radius/shadow. Preserve the existing `BadgesProvider`, polling cleanup, outlet flex/overflow behavior, and mount one toast viewport.

- [ ] **Step 4: Set the required development port**

Set Vite `server.port` to `5199` and `strictPort` to `true` so plain `npm run dev` satisfies the spec.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npm.cmd run test -- src/app/navigation.test.ts src/app/components/system/system.test.tsx
npm.cmd run typecheck
```

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 6: First meaningful preview handoff**

Start `npm.cmd run dev`, require port 5199, make one HTTP request to `/reengage`, then inspect the rendered shell in a browser. If the in-app browser service is unavailable, use installed headless Chrome through the DevTools protocol and record that verification fallback.

### Task 5: Implement canonical routes and compatibility redirects with TDD

- [ ] **Step 1: Write failing routing tests**

Cover:

- `/` → stored workspace root, default `/reengage`.
- RE-engage: Home, Leads, Campaigns, new/detail, Inbox/thread, Settings.
- Hi-Hunt: Home, Leads, Workflows/detail, Inbox/thread, Settings.
- `/reengage/replies` → `/reengage/inbox`.
- `/hihunt/prospects` → `/hihunt/leads`.
- `/hihunt/outreach` → `/hihunt` because outreach drafts move to the new Home queue.
- `/settings` → last workspace’s settings, default `/reengage/settings`.
- `/reengage/campaigns/:id/edit` → canonical `/reengage/campaigns/:id`, preserving route state.
- Unknown paths → `/` with replace semantics.

- [ ] **Step 2: Run the routing test and verify RED**

Run: `npm.cmd run test -- src/app/routes.test.tsx`

Expected: failures against the old route table.

- [ ] **Step 3: Implement only the Phase 1 route skeleton**

Interim content mapping:

| Route | Phase 1 content |
|---|---|
| `/reengage` | Existing `TodayPage` |
| `/reengage/leads` | Existing `LeadsPage` route adapter |
| `/reengage/campaigns` | Existing `CampaignsPage` route adapter |
| `/reengage/campaigns/new`, `/:id` | Existing `CampaignWizardPage` |
| `/reengage/inbox`, `/:threadId` | Existing `RepliesPage` (deep-link selection lands in P2) |
| `/reengage/settings` | Existing combined `SettingsPage` |
| `/hihunt` | Existing `OutreachPage`, closest to the future pending-email Home |
| `/hihunt/leads` | Existing `HRDiscoveryPage` |
| `/hihunt/workflows`, `/:id` | Intentional placeholder |
| `/hihunt/inbox`, `/:threadId` | Intentional placeholder |
| `/hihunt/settings` | Existing combined `SettingsPage` |

Do not implement workflow editing, inboxes, batch queues, data contracts, uploads, motion, or other P2–P4 behavior.

- [ ] **Step 4: Run routing and full automated tests**

Run:

```powershell
npm.cmd run test -- src/app/routes.test.tsx
npm.cmd run test
```

Expected: all tests pass.

### Task 6: Final verification and review

- [ ] **Step 1: Run fresh automated gates**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

Expected: all exit 0; the build includes the locally served DM Sans asset.

- [ ] **Step 2: Run browser QA on the retained dev server**

At 360×800, 768×1024, 1199×800, and 1440×900, verify shell structure, no document-level horizontal overflow, 44px phone targets, mobile safe-area bottom nav, tablet label trimming, desktop margins/radius/shadow, and correct content scrolling. Exercise both workspace switches, all ten tab routes, browser back/forward, a deep route, all specified old redirects, reload, and unknown-route recovery. Check the console/network for runtime errors, failed font requests, or external DM Sans requests.

- [ ] **Step 3: Audit scope and token compliance**

Confirm all new/reworked Phase 1 TSX uses tokens and contains no raw hex. Confirm later-phase contracts/dependencies (`xlsx`, new API stubs, motion pass) were not added. Record legacy screens as the explicit temporary styling exemption required by the P1 “keep rendering” clause.

- [ ] **Step 4: Request independent spec and code-quality review**

Provide reviewers the Phase 1 spec, this plan, and working-tree diff. Fix every Critical/Important finding, rerun the affected focused tests, then rerun all fresh gates before reporting completion.
