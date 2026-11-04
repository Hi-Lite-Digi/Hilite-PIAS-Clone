# HiHunt v2 — UX/UI Redesign Spec

Date: 2026-08-26 · Status: approved direction, build starting
Owner: JJ · Built by: Claude (plan/review) + Codex (code)

## 1. Overview

Full redesign of the HiHunt frontend (Vite + React 18 + Tailwind v4). The app becomes **two parallel workspaces** — RE-engage (WhatsApp re-engagement) and Hi-Hunt (email prospecting) — with an identical five-tab skeleton, a shared "prepare → approve → send" daily rhythm, and a new visual system modelled closely on the approved reference (light fintech dashboard: lavender-grey canvas, floating white container, black pill nav, pastel data accents).

The rebuild reuses the existing data layer (`src/lib/api.ts` + `src/lib/stubs.ts` sample-data fallback) so the app keeps working locally without a `.env` and the dev's backend wiring stays intact. New backend needs are specified as stub contracts (§9).

### Decisions already made (with JJ)

1. **Workspace switcher** — two focused mini-apps, not one long sidebar.
2. **One-tap batch approve** for daily WhatsApp sends (replaces per-message confirm; human gate stays).
3. **Inbox = one conversation list + campaign filter chips** (labels per chat; "All" catches non-campaign replies).
4. **Hi-Hunt emails: batch approve before send** (same rhythm as RE-engage).
5. **Hi-Hunt gets a Home too** — both workspaces share the identical structure.
6. **Fully responsive** — phone-usable everywhere (batch approve + inbox especially).
7. **Execution: new design system, rebuilt screens** — keep `api.ts` contracts working.
8. **Visual direction: the approved reference image** (§4). Fonts/colours below follow it closely; JJ may still swap fonts/icons — tokens make that a one-file change.

## 2. Information architecture

```
Topbar: [Logo] [RE-engage | Hi-Hunt switcher]   [tab pills]   [inbox icon · avatar]

RE-engage                          Hi-Hunt
  /reengage            Home          /hihunt             Home
  /reengage/leads      Leads         /hihunt/leads       Leads
  /reengage/campaigns  Campaigns     /hihunt/workflows   Workflows
  /reengage/inbox      Inbox         /hihunt/inbox       Inbox
  /reengage/settings   Settings      /hihunt/settings    Settings

Sub-routes:
  /reengage/campaigns/new        creation wizard (poster upload flow)
  /reengage/campaigns/:id        campaign detail (edit, recipients, replies)
  /reengage/inbox/:threadId      deep-linkable conversation
  /hihunt/workflows/:id          workflow editor
  /hihunt/inbox/:threadId        deep-linkable email thread
  /                              redirect → last-used workspace (localStorage), default /reengage
  *                              redirect → /
```

- Workspace switcher: segmented pill control next to the logo (active segment = ink pill). Switching remembers which tab you were on per workspace.
- The global "New campaign" topbar button is removed — actions live on each Home.
- Old routes (`/reengage/replies`, `/hihunt/prospects`, `/hihunt/outreach`, `/settings`) 301-style redirect to their new homes so old links/bookmarks don't break.

## 3. The signature pattern: prepare → approve → send

Both workspaces run the same loop, visually identical:

1. Automation prepares work (queued WhatsApp batch / drafted outreach emails).
2. Home shows it as **one queue, grouped by campaign/workflow**: each item expandable to edit, removable (with undo, not instant-vanish), a count in the approve button.
3. One primary action: **"Approve batch (N)"** → single confirm dialog summarising (N messages, cap remaining) → sends.
4. Success state: calm check + count-up of sent number (no per-item modals).

Consent/compliance copy appears **once per batch** in the confirm dialog, not per message.

## 4. Visual system (from the reference image)

### 4.1 Canvas & containers

- Page background: `--bg #EFEEF3` (cool lavender-grey).
- The whole app lives in a **floating white container**: `--surface #FFFFFF`, radius 28px, margin 16–24px from viewport edges, shadow `0 8px 40px rgba(20,20,25,0.06)`. On mobile the container goes edge-to-edge (radius 0, no margin).
- Nested/secondary surfaces (chart tracks, sub-cards, input fills): `--surface-2 #F6F5F8`.
- Hairlines: `--line rgba(20,20,22,0.08)`. Cards are flat (no shadow) — separation comes from surface-2 vs white + hairlines, exactly like the reference.

### 4.2 Colour tokens (`src/styles/theme.css` is the ONLY place colours live)

```css
--bg:        #EFEEF3;   /* page canvas */
--surface:   #FFFFFF;   /* container + cards */
--surface-2: #F6F5F8;   /* nested cards, tracks, input fill */
--ink:       #141416;   /* primary text, black pills/buttons */
--ink-2:     #6E6E76;   /* secondary text, labels */
--ink-3:     #A6A6AE;   /* faint labels, axis text, placeholders */
--line:      rgba(20,20,22,0.08);

--accent:    #D9F04A;   /* lime — data highlights, "today" markers, live/running */
--mint:      #DEEADF;   /* soft green — positive surfaces, done/success tints */
--cyan:      #C3E7EB;   /* soft cyan — info surfaces, chart segments */
--lavender:  #DCD8F0;   /* soft violet — chart segments, decorative */
--danger:    #E5484D;   /* errors, destructive */
--warn:      #E9A23B;   /* attention (WhatsApp disconnected etc.) */
```

Rules:
- **Black is the action colour** (primary buttons, active nav pill). Lime is a *data/status* accent, never a button colour — matches the reference.
- Status language (both workspaces, one vocabulary): running/live = lime dot; paused = ink-3; draft = surface-2 pill w/ ink-2 text; done = mint tint; error/failed = danger tint; queued = cyan tint.
- Every colour reference in components uses the token (Tailwind theme vars), **zero raw hex in TSX**. Delete the per-file `const P = "#2563EB"` pattern entirely. The old blue #2563EB is retired.
- Dark mode: out of scope (remove the orphaned `.dark` palette; keep structure single-theme).

### 4.3 Typography

- Font: **DM Sans (variable)**, self-hosted like the current Manrope setup — closest free match to the reference grotesque. `--font-sans`. JetBrains Mono stays for code-ish values only (phone numbers optional). If JJ later picks another font it's one `@font-face` + one token swap.
- Weights: **400/500 do the work** (like the reference). 600 only for small emphasis (pill labels, table headers). The current font-black-everywhere is gone.
- Scale (px, desktop): display-num 30/400 (big stats, tabular-nums), page-title 28/500 (letter-spacing −0.01em), section-title 18/500, card-title 15/500, body 14/400, label 12.5/400 `--ink-2`, chip/badge 12/500. **Floor is 12px** — nothing smaller, ever.
- Base html font-size 16px; the scale above maps to rem.

### 4.4 Shape, spacing, iconography

- Radii: container 28, card 20, sub-card/input 14, pills & buttons 9999 (full). No other values.
- Spacing: 4px grid. Card padding 24 (16 mobile), grid gaps 16–20, page padding 28 inside the container, section gaps 28.
- Icons: lucide-react, stroke 1.75, sizes 18 (default) / 20 (nav) / 16 (dense). Icon-only buttons are 36px circles (`--surface-2` idle, ink hover→ink bg white icon for primary contexts) — like the reference's circular controls.
- Buttons: Primary = ink pill (white text, 38px height, px-20); Secondary = white pill w/ hairline border; Ghost = text-only ink-2→ink; Destructive = danger text or danger-filled for confirms. All rounded-full.
- Nav tab pills: active = ink pill with white text + leading icon; inactive = transparent w/ ink-2 text, hover surface-2. Badge counts as small ink pill (or lime when >0 and actionable).

### 4.5 Charts (recharts, already installed — use `ui/chart.tsx` wrapper)

- Bars: `--surface-2` fill for the track/idle bars, active/today bar `--accent` lime with a lime value chip above (reference's "16:30h" chip style).
- Lines: ink dotted stroke, soft grey area fill, value chips lime.
- Donut/rings: pastel family (cyan/mint/lavender), center stat display-num.
- Axis/labels: 12px `--ink-3`. No gridlines heavier than hairline.

### 4.6 Motion (Framer Motion — installed, currently unused)

Calm, 150–250ms, ease-out. Workspace/tab change: 4px rise + fade of page content. Drawer: slide from right (spring, no bounce). Dialogs: fade + 2% scale. List items: settle-in stagger ≤ 40ms/item, capped. Batch approve success: button morphs to check + sent-count counts up. Respect `prefers-reduced-motion`. No confetti.

### 4.7 Brand / logo

- **Current brand: Hilite**, per the user's clone rebranding request on 4 November 2026. This supersedes the original PIAS logo direction in the historical implementation plans.
- Use the shared text wordmark in `src/app/components/system/brand-logo.tsx` for the app header, privacy page, and unsubscribe page. Keep the full name visible on mobile.
- Preserve the existing UI tokens, typography, workspace names (RE-engage and Hi-Hunt), routes, and behavior. The browser title is **Hilite**; the favicon is a monochrome H monogram generated by `scripts/generate-favicon.ps1`.
- Default sender names, campaign templates, assistant prompts, reminders, and sample data use Hilite. Existing deployment addresses, integration identifiers, and stored user content are unchanged.
- Verified on 4 November 2026: production build and TypeScript checks pass; all 434 existing tests pass. Browser checks pass for both workspace home pages, privacy, and unsubscribe at 1440px, 390px, and 320px, including title, favicon, visible branding, and header fit. The local preview has no configured live database or WhatsApp connection, so live sending was not exercised.

## 5. Component kit (`src/app/components/system/`)

Build ONE of each on the tokens; every screen consumes these. Wrap/restyle the existing shadcn primitives (`components/ui/`) where they help (dialog, alert-dialog, dropdown, tabs, tooltip, sonner toaster); delete-nothing-else for now.

`AppShell` (container + topbar + outlet + bottom-nav), `WorkspaceSwitcher`, `NavPills`, `Button`, `IconButton`, `Card` (title/action slot/children), `StatCard` (label + display-num + trend/mini-chart slot), `StatusDot`/`StatusPill` (one status vocabulary, §4.2), `DataTable` (sortable headers, row-click, 12px+ text, responsive card-collapse), `Drawer` (right sheet), `ConfirmDialog`, `Toast` (mount sonner ONCE in shell; all inline notice banners are replaced by toasts except persistent connection warnings), `SearchInput`, `FilterChips`, `EmptyState` (icon + one line + optional CTA), `Skeleton` rows (replace text-only "Loading…" strings), `PageHeader` (title + actions), `SampleDataPill` (unchanged concept — marks stubbed data).

## 6. RE-engage screens

### 6.1 Home (`/reengage`)

- `PageHeader`: "Home" + date · actions: **New campaign** (primary), **Upload leads**, **Add lead** (secondary).
- **Today's batch panel** (full-width card, top): grouped by campaign; collapsed rows = avatar initials, name, first line of message, campaign chip; expand to edit message inline; remove with 5s undo toast. Footer: cap indicator ("14 of 20 daily sends used") + **Approve batch (N)** → ConfirmDialog (summary + single consent line) → success morph. Empty: "Nothing queued today" EmptyState. WhatsApp-disconnected: warn banner pinned here (persistent, not a toast).
- **Campaign bento grid** below (reference-style): one card per active campaign — name, StatusDot, progress bar (sent/total), stat row (sent · replies · interested), weekly bar mini-chart with today in lime. Click → campaign detail. Plus one `StatCard` trio: total leads, replies this week (donut of reply categories), messages sent this week.
- Draft campaigns strip: small cards → wizard/detail.

### 6.2 Leads (`/reengage/leads`)

- `PageHeader` + stat trio (total / reachable on WhatsApp / added this month).
- `DataTable`: search, filter chips (status, age band, campaign), sortable. **Rows click open a Drawer**: contact info, age, campaign history, link to their inbox thread, edit + delete (existing two-phase delete impact flow, restyled into ConfirmDialog).
- **Upload leads (Excel)**: dialog flow — drop `.xlsx/.csv` → parse client-side (new dep: `xlsx`/SheetJS) → column-mapping step (auto-detected, editable selects per column) → preview table with duplicate detection (match on phone/email) → import → result toast + report (added / skipped dupes / errors downloadable). 
- **Add lead**: the existing dialog, restyled, validation inline per-field.
- Empty table with active filters → "No matches" + **Clear filters** action (fixes current dead end).

### 6.3 Campaigns (`/reengage/campaigns`)

- List: `DataTable`-style rows (name, StatusPill, audience summary, sent/total progress, replies) → click = **detail page** (new): 
  - Header: name, status, **Pause/Resume**, Edit buttons.
  - Tabs within: Message (edit copy + poster, WhatsApp bubble preview), Audience (rules + included/excluded list on ONE surface — the chips/list/modal triple-surface is collapsed into a single editable panel with a "Browse all leads" drawer; rule changes that would wipe manual picks warn first), Recipients (per-lead send status), Replies (filtered inbox embed, links out).
- **Wizard** (`/new`) keeps 4 steps + poster upload (drag/paste/browse, progress, AI-draft banner) but: single generic error state per step (not one shared string), unsaved-changes guard on Back, audience step uses the same single-surface panel as detail.

### 6.4 Inbox (`/reengage/inbox`)

- Two-pane on desktop (list 360px / thread), stacked WhatsApp-style on mobile.
- List: search, **campaign FilterChips** (All + per campaign, unread counts; zero-count chips hidden), rows = avatar, name, snippet, campaign label, time, unread dot. Sort: unread first, then latest.
- Thread (`/inbox/:threadId` — URL-addressable): chat bubbles (outgoing = ink text on `--mint`; incoming = white card with hairline), day separators, campaign context line at top ("Replied to: June Seminar"), composer (expandable textarea + send → confirm-free; sending state on the bubble). Star + mark-unread actions. Category badge (interested/question/stop) shown as StatusPill; recategorise via dropdown (fixes read-only categories).
- Errors surface as toasts next to their action (send failure = retry toast on the composer, not a far-away panel).

### 6.5 Settings (`/reengage/settings`)

- Connections card: WhatsApp/Hermes status tile (states: connected / checking / needs attention / not configured — distinct copy each), requirements as a list not comma-joined strings, "Check connection".
- Sending rules card: daily cap display, send window.
- Save bar appears only when dirty; unsaved-changes guard.

## 7. Hi-Hunt screens

### 7.1 Home (`/hihunt`)

- "What happened overnight" digest card: last run per workflow (found N, skipped M dupes, drafted K emails) + next-run countdown.
- **Pending emails queue**: same batch panel as RE-engage (grouped by workflow, expandable to edit subject/body, remove w/ undo, **Approve batch (N)**, sending limits shown).
- Stat trio + reply-rate donut. Reply highlights strip → inbox threads.

### 7.2 Leads (`/hihunt/leads`)

- Scraped contacts `DataTable`: name, role, company, work email + verification StatusPill (real semantics — never fake-verified), status (new / queued / contacted / replied / suppressed), source workflow, LinkedIn link.
- Row drawer: full profile, email history (which outreach they got, opens thread), **Suppress** = labeled button + ConfirmDialog + undo toast (fixes silent icon-button).
- The old separate "review queue" is gone: scrapes land here as `new`; drafting is the workflow's job; approval happens on Home.

### 7.3 Workflows (`/hihunt/workflows`)

- List of workflow cards: name, on/off Switch, schedule summary ("Mon–Sun · 8:00 SGT · 300 contacts"), last/next run, drafted-today count.
- Editor (`/:id`): four sections on one page —
  1. **Schedule**: day pills (Mon–Sun multi-select), time, timezone label (SGT).
  2. **Scrape recipe**: role/seniority chips, location, volume per run, source (Apollo).
  3. **Email template**: subject + body with `{{first_name}}`-style variable chips, live preview pane with a sample contact.
  4. **Sending rules**: daily send limit, spacing between sends, sending window.
- Validation: can't enable with empty seniorities/template. Save bar when dirty.

### 7.4 Inbox (`/hihunt/inbox`)

- Same two-pane pattern as RE-engage inbox but email-shaped: list rows = sender, subject, snippet, workflow label; thread = stacked email cards (from/to/time, body), reply composer sending from the connected account. Status chip on thread (replied / needs reply).

### 7.5 Settings (`/hihunt/settings`)

- **Email account connect** card (provider connect status; the actual OAuth is backend/dev work — UI shows connected address, disconnect, send-test).
- Apollo key status tile (with actionable copy for JJ: "Ask your developer to add APOLLO_API_KEY", plus a copyable instruction — not a dead end).
- Defaults card (default sender name, sign-off).

## 8. Responsive rules

- Breakpoints: ≥1200 full bento; 768–1199 two-col, icon labels trim; <768 phone: white container edge-to-edge, topbar = logo + switcher + avatar, **bottom nav with the 5 tabs** (safe-area padded), tables collapse to stacked cards (`DataTable` handles this once), inbox stacks list→thread with back button, drawers become full-height sheets, batch panel rows stay one-hand tappable (≥44px targets).
- No page ever scrolls horizontally; wide tables scroll inside their card.

## 9. Data layer & backend contracts (for the dev)

Keep: `src/lib/api.ts` (real calls), `src/lib/stubs.ts` (tryApi + sample fallback + `SampleDataPill` labeling). **Fix the silent-fake-success bug class**: stub fallbacks must return `{ sample: true }` and mutations against live API that fail must surface an error toast — never pretend saved.

New/changed contracts (implement as stubs now; document mirrors into BACKEND_TODO.md):

- `POST /api/send-queue/approve-batch` `{ itemIds[] }` — batch approve (replaces per-item confirm).
- `GET /api/threads?campaign=` / `GET /api/threads/:id` — WhatsApp threads addressable by id, filterable by campaign (backs deep-linking).
- `POST /api/leads/import` `{ rows[], mapping }` — Excel import w/ dedupe report response.
- `GET/POST/PATCH /api/workflows` — workflow CRUD + enable/disable; scheduler is backend's (cron) job.
- `POST /api/outreach/approve-batch` `{ draftIds[] }` — email batch approve/send.
- `GET /api/email-threads`, `POST /api/email-threads/:id/reply` — Hi-Hunt inbox.
- `GET/POST /api/email-account` — connected email status/connect/disconnect.
- Campaign detail: `GET /api/campaigns/:id` (currently missing — edit mode fetches the whole list).

## 10. Build phases (Codex codes, Claude reviews each phase)

- **P1 — Foundation & shell**: theme.css rewrite (tokens §4), DM Sans self-host, system components (§5), new AppShell + WorkspaceSwitcher + routing skeleton (§2) with placeholder pages, redirects from old routes. Old pages keep rendering under the new shell until replaced. Verify: `npm run dev` on :5199 clean, both workspaces navigable, responsive shell works.
- **P2 — RE-engage**: Home (batch panel + bento), Leads (+ Excel import, new dep `xlsx`), Campaigns (list/detail/wizard rework), Inbox, Settings.
- **P3 — Hi-Hunt**: Home, Leads, Workflows, Inbox, Settings + new stub contracts (§9).
- **P4 — Polish**: motion pass (§4.6), responsive QA on every screen, empty/error/loading sweep (skeletons everywhere), delete replaced pages + orphaned components, update BACKEND_TODO.md.

Each phase = its own commit(s) on branch `redesign/v2`. No pushes until JJ says so.

## 11. Non-goals

- No auth/login (single operator; unchanged).
- No dark mode.
- No backend implementation (contracts + stubs only; Hermes relay, Apollo, cron, email OAuth are the dev's).
- No removal of currently-dead deps beyond what P4 lists (MUI etc. flagged separately to the dev).
- Old blue #2563EB brand is retired by decision, not preserved.
