# HiHunt v2 Phase 4 Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` and test-driven development while executing this plan. Keep all work uncommitted on `redesign/v2`.

**Goal:** Complete the v2 redesign with calm accessible motion, responsive and state QA fixes, proven legacy cleanup, PIAS favicon metadata, and a final coherent backend handoff.

**Architecture:** Motion is centralized in lightweight `motion/react` system primitives and applied at the shell, overlay, list, and batch-success boundaries. Existing Phase 1 system components remain the visual contract. Screen edits are limited to verified responsive/state stragglers. Legacy files are deleted only after repository-wide import/reference checks. The favicon is a reproducible raster crop from the checked-in PIAS logo.

**Tech stack:** React 18, TypeScript, React Router 7, Tailwind CSS 4, Motion 12 (`motion/react`), Radix primitives, Node/Vite SSR tests, Vite 6, PowerShell/.NET raster tooling, and in-app browser QA.

---

## Task 1: Establish Phase 4 regressions and shared motion primitives

- [ ] Add failing tests for reduced-motion-safe page/list/overlay transitions, capped item staggering, and animated sent-count presentation.
- [ ] Add a small exported system motion module using only `motion/react`, 150–250ms ease-out timing, and user reduced-motion preference.
- [ ] Key shell page transitions by workspace/tab, not detail IDs, so tab changes rise 4px and fade without animating every data refresh.
- [ ] Replace drawer/dialog CSS entrance transforms with Motion variants: right-side spring with no bounce and 2% dialog scale/fade.
- [ ] Apply capped settle-in motion to reusable table/list surfaces without breaking native table or reduced-motion semantics.
- [ ] Morph both batch approval buttons to a check and count the sent total after success; never add confetti.

## Task 2: Responsive and state sweep

- [ ] Audit every canonical screen at 390px, 768px, and at least 1200px against spec section 8.
- [ ] Fix only demonstrated horizontal overflow, mobile touch targets below 44px, non-collapsing tables, non-full-height drawers, and inbox stacking/back-navigation issues.
- [ ] Replace any mounted text-only loading state with system Skeleton rows.
- [ ] Replace mounted ad-hoc empty states with system EmptyState and a useful CTA.
- [ ] Ensure every mounted error state has a nearby retry or recovery action.
- [ ] Add focused source/model/SSR regressions for each straggler before changing production code.

## Task 3: Verified cleanup and favicon metadata

- [ ] Prove each named legacy page/component/layout/Figma artifact is unreferenced with repository-wide import and asset searches.
- [ ] Delete only proven orphaned files; retain and report any named survivor that is still mounted.
- [ ] Leave package dependencies installed and document packages that are unused after cleanup for the developer.
- [ ] Add a reproducible raster-crop script that takes the 620px PIAS emblem region from `src/assets/pias-logo.png` and produces the checked-in PNG favicon.
- [ ] Add a failing metadata/file regression, generate the favicon, and wire it in `index.html` with title `PIAS HiHunt` and theme color matching `--bg`.

## Task 4: Backend handoff tidy

- [ ] Restructure `BACKEND_TODO.md` into one coherent implementation list without weakening the exact Phase 2/3 contracts.
- [ ] Explicitly preserve the edited-copy approval limitation and fail-closed behavior until the backend accepts edited payloads.
- [ ] Add the requested unused-dependencies note; do not change `package.json` for dependency cleanup.

## Task 5: Integration, review, and verification

- [ ] Run focused tests after each implementation slice, then request independent review and repair Critical/Important findings.
- [ ] Scan changed code for raw colors, sub-12px text, confetti usage, heavyweight Motion imports, stale legacy references, and diff whitespace errors.
- [ ] Run `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` to green.
- [ ] Start the development server and verify both workspaces in the browser at 390px, 768px, and 1200px+, including canonical home, table, drawer/dialog, inbox, editor, and settings flows.
- [ ] Leave every Phase 4 change uncommitted and preserve the pre-existing untracked `AGENTS.md`.

## Safety and scope boundaries

- Do not redesign Phase 1–3 screens or implement backend services.
- Do not delete a file or asset without a repository-wide reference check.
- Do not remove dependencies, commit, push, add raw color values to application components, or use text below the 12px floor.
- Respect `prefers-reduced-motion`; do not use confetti or decorative high-energy motion.
