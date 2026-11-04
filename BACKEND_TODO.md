# Backend TODO — wiring the rebuilt frontend

The UI was rebuilt around two workspaces (RE-engage WhatsApp campaigns, Hi-Hunt HR email prospecting)
with a "Today" action-queue home. All data access goes through `src/lib/api.ts` (existing endpoints)
and `src/lib/stubs.ts` (**contracts for endpoints that do not exist yet**). Read stubs try the real
endpoint first and can fall back to data labelled "Sample data" in the UI — implement the endpoint and
the screen goes live with **no frontend change**. Mutations are strict: network, non-2xx (other than a
definitively missing legacy 404/405 endpoint), and malformed-response failures must be shown to the user
and must never be converted into a simulated success.

All server code lives in `worker/supabase-api.js` (one `handleApiRequest` router; adding an endpoint =
one `if` branch). The Vercel catch-all `api/[...path].js` already routes any new `/api/*` path —
**do not add new shim files**: the project deploys 11 serverless functions and Vercel Hobby caps at 12.

## 0. Two pre-existing bugs to fix first

1. **Inbound WhatsApp replies are lost** for any lead that has `campaign_recipients` rows.
   `worker/supabase-api.js` L180 (`recentCampaignForLead`) selects `queued_at,sent_at` — columns that
   don't exist on `campaign_recipients` → PostgREST 400 → the webhook 500s (the Hermes plugin spools
   the payload to disk on the droplet). Fix the select and add `sent_at` (migration below — the send
   queue needs it anyway).
2. **Phone-only leads can never be targeted.** `matchesAudienceRules` (L1337) hard-requires a valid
   email, and `sendCampaignWhatsApp` re-checks membership — backwards for a WhatsApp channel. Make the
   contact gate channel-aware (audience jsonb gains `channel: "whatsapp"` default; WhatsApp requires a
   normalisable phone via the logic in `src/lib/whatsapp.ts`). Requires `campaign_recipients.email`
   → nullable and a new `phone` column.

## 1. Migrations (2 files, `supabase/migrations/`)

**drip queue** — `campaign_recipients`: add `sent_at timestamptz`, add `phone text`, drop NOT NULL on
`email`, extend the status check with `'skipped'`, backfill `sent_at = created_at where status='sent'`,
partial index on `(created_at) where status='queued'`.

**hihunt outreach** —
- `hr_outreach_drafts`: `id uuid pk`, `prospect_id uuid unique references hr_prospects on delete cascade`,
  `subject text`, `body text`, `status check in (draft|approved|copied|contacted)`, `generation_mode
  check in (gpt|fallback)`, `edited_at timestamptz`, timestamps. RLS same pattern as existing tables.
- `hihunt_settings`: single row (`id smallint pk default 1 check (id=1)`), `discovery jsonb`
  (`{location, companyDomain, seniorities[], dailyLimit, autoRunEnabled}`), `outreach jsonb`
  (`{valueProp, senderName, signoff}`), `updated_at`.
- `hr_discovery_runs`: add `triggered_by text default 'manual' check in (manual|cron)`.

## 2. Endpoint contracts the frontend already calls (see `src/lib/stubs.ts` for exact types)

### RE-engage v2 Phase 2

| Endpoint | Contract |
|---|---|
| `POST /api/send-queue/approve-batch` | Body `{itemIds: string[]}`; non-empty, unique ids only. Approve/send the reviewed queue recipients subject to the shared daily WhatsApp cap. Return `{approved: number, itemIds?: string[]}`. A full success may omit `itemIds` (all requested ids are then complete). A partial 2xx must include the exact unique completed `itemIds`, with `itemIds.length === approved` and every returned id drawn from the request; omitted request ids remain retryable. Return non-2xx when the service cannot report a reliable per-item outcome. This mutation is live-only. |
| `GET /api/threads?campaign=` | Return `{data: ReplyConversationRecord[], total: number, unread: number}`. The optional `campaign` query value filters by campaign id. Use the same conversation/message shape currently returned by `/api/replies`; sort policy remains a frontend concern. |
| `GET /api/threads/:id` | Return `{data: ReplyConversationRecord}` for the stable URL-addressable thread id, or 404 for an unknown id. |
| `POST /api/leads/import` | Body `{rows: Record<string, unknown>[], mapping: Partial<Record<name|email|phone|dob|age|status|topics|source|remarks, string>>}`. The backend owns mapping/row validation and dedupes against normalized phone/email. Return `{added: number, skippedDuplicates?: Array<{row: number, reason: string}>, errors?: Array<{row: number, field?: string, message: string}>, data?: LeadRecord[]}`. `added` is a non-negative integer. Missing report arrays mean `[]`; present reports require integer `row` values and non-empty `reason`/`message` (and non-empty `field` when supplied). Present `data` must contain valid `LeadRecord` values. Reports need not exhaust submitted rows, be disjoint or unique, or match `added`/`data.length`; the frontend does not impose undocumented input or accounting rules. This mutation is live-only; validation/service failures are non-2xx and are never treated as imported. |
| `GET /api/campaigns/:id` | Return `{data: CampaignRecord}` or 404. This is the read contract used by campaign detail/edit routes so they no longer fetch the entire campaign list to locate one record. |

Until these reads land, `/api/threads*` and campaign detail can use labelled deterministic read data (and
the existing `/api/replies` or `/api/campaigns` reads where available). Batch approval and lead import
have no simulated write path. When adapting legacy `/api/replies`, a campaign-scoped read matches either
the stable campaign id or the exact campaign title supplied by the campaign record; this is the same
id/title equivalence used by the campaign list.

### Hi-Hunt v2 Phase 3

`src/lib/stubs.ts` is the canonical frontend contract. Phase 3 JSON uses camelCase except for the
existing outreach-draft fields noted below. These are the exact shared records:

```ts
type WorkflowDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type WorkflowSchedule = { days: WorkflowDay[]; time: string; timezone: "Asia/Singapore" };
type WorkflowScrapeRecipe = {
  roles: string[];
  seniorities: string[];
  location: string;
  companyDomain: string | null;
  volumePerRun: number;
  source: "apollo";
};
type WorkflowEmailTemplate = { subject: string; body: string };
type WorkflowSendingRules = {
  dailyLimit: number;
  spacingMinutes: number;
  window: { start: string; end: string; timezone: "Asia/Singapore" };
};
type WorkflowRunSummary = {
  id: string;
  status: "running" | "completed" | "failed";
  found: number;
  skippedDuplicates: number;
  drafted: number;
  startedAt: string;
  completedAt: string | null;
};
type WorkflowDefinition = {
  name: string;
  schedule: WorkflowSchedule;
  scrapeRecipe: WorkflowScrapeRecipe;
  emailTemplate: WorkflowEmailTemplate;
  sendingRules: WorkflowSendingRules;
};
type CreateWorkflowInput = WorkflowDefinition & { enabled?: boolean };
type UpdateWorkflowInput = Partial<WorkflowDefinition & { enabled: boolean }>;
type WorkflowRecord = WorkflowDefinition & {
  id: string;
  enabled: boolean;
  lastRun: WorkflowRunSummary | null;
  nextRunAt: string | null;
  draftedToday: number;
  createdAt: string;
  updatedAt: string;
};

type HiHuntLeadStatus = "new" | "queued" | "contacted" | "replied" | "suppressed";
type HRProspectRecord = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string;
  seniority: string | null;
  company_name: string | null;
  company_domain: string | null;
  work_email: string | null;
  email_status: string | null;
  linkedin_url: string | null;
  location: string | null;
  hr_match_reason: string;
  review_status: "new" | "reviewed" | "qualified" | "rejected" | "converted";
  status?: HiHuntLeadStatus; // compatibility with the checked-in worker; Phase 3 backend must supply it
  workflow_id?: string; // compatibility with the checked-in worker; Phase 3 scrapes must supply both workflow fields
  workflow_name?: string;
  provider: "apollo";
  discovered_at: string;
  updated_at: string;
};

type OutreachDraftStatus = "draft" | "approved" | "copied" | "contacted";
type OutreachDraft = {
  id: string;
  workflowId?: string;
  workflowName?: string;
  prospect: {
    id: string;
    full_name: string;
    first_name: string | null;
    job_title: string;
    company_name: string | null;
    work_email: string;
    linkedin_url: string | null;
    location: string | null;
  };
  subject: string;
  body: string;
  status: OutreachDraftStatus;
  generation_mode: "gpt" | "fallback";
  edited_at: string | null;
  created_at: string;
};

type EmailParty = { name: string | null; address: string };
type EmailThreadStatus = "needs_reply" | "replied";
type EmailMessageRecord = {
  id: string;
  direction: "inbound" | "outbound";
  from: EmailParty;
  to: EmailParty[];
  occurredAt: string;
  body: string;
};
type EmailThreadSummary = {
  id: string;
  prospectId: string | null;
  workflowId: string | null;
  workflowName: string;
  sender: EmailParty;
  subject: string;
  snippet: string;
  lastMessageAt: string;
  unread: boolean;
  status: EmailThreadStatus;
};
type EmailThreadRecord = EmailThreadSummary & { messages: EmailMessageRecord[] };

type EmailProvider = "google" | "microsoft";
type EmailAccountRecord = {
  status: "disconnected" | "connecting" | "connected" | "error";
  provider: EmailProvider | null;
  address: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  error: string | null;
  cap: { limit: number; used: number; remaining: number };
};

type HiHuntSettings = {
  discovery: {
    location: string;
    companyDomain: string;
    seniorities: string[];
    dailyLimit: number;
    autoRunEnabled: boolean;
  };
  outreach: { valueProp: string; senderName: string; signoff: string };
};
```

Workflow names are non-blank. For workflow clocks use `HH:mm`. Days must be non-empty and unique; counts are non-negative integers;
`volumePerRun` and `dailyLimit` are positive integers; `spacingMinutes` is a non-negative integer; and
window start/end must differ. All timestamps are parseable date strings. An enabled workflow must have
at least one non-blank seniority and non-blank subject/body. Role/seniority arrays otherwise contain strings
and are not required to be unique; `companyDomain` may be `null` or any string, including an empty string.
`workflowId` and `workflowName` on an outreach draft
must either both be present as non-empty strings or both be absent. Email-account cap values are
non-negative integers and `remaining === max(0, limit - used)`. Email-thread, message, party-address,
and non-null prospect/workflow identifiers are non-blank; every message has at least one `to` recipient.
An empty email-thread `workflowName` means unassigned and is valid. Settings `discovery.dailyLimit` is a
non-negative integer.

| Endpoint | Exact request/response and validation contract |
|---|---|
| `GET /api/workflows` | Return `{data: WorkflowRecord[]}`. |
| `GET /api/workflows/:id` | Return `{data: WorkflowRecord}` with `data.id` equal to the path id, or 404. This detail endpoint is required for direct editor URLs. On a detail 404 the frontend probes `GET /api/workflows`: a live collection means record-not-found and never sample data; only a missing collection endpoint permits the labelled sample fallback. |
| `POST /api/workflows` | Body `CreateWorkflowInput`; omitted `enabled` means `false`. Return `{data: WorkflowRecord}` whose `enabled` and every supplied definition field equal the request. Live-only. |
| `PATCH /api/workflows/:id` | Body is a non-empty `UpdateWorkflowInput` containing only `name`, `enabled`, `schedule`, `scrapeRecipe`, `emailTemplate`, and/or `sendingRules`. Return `{data: WorkflowRecord}` with the path id and every requested field reflected exactly. Live-only. |
| `GET /api/hr-outreach-drafts` | Return `{data: OutreachDraft[], summary:{draft:number,approved:number,copied:number,contacted:number}}`. Each summary count must exactly equal the corresponding records in `data`; embed `prospect:hr_prospects(...)`. For compatibility the client accepts legacy rows with both workflow fields absent, but every Phase 3-produced draft must supply non-blank `workflowId` and `workflowName` so Home can group approval by workflow. |
| `POST /api/hr-outreach-drafts` | Body exactly `{prospectId:string}`. Generate subject/body via `createOpenAIResponse` with deterministic server fallback when `OPENAI_API_KEY` is unset, and upsert on `prospect_id`. Return `{data: OutreachDraft}` whose `prospect.id` equals `prospectId`. Live-only. |
| `PATCH /api/hr-outreach-drafts/:id` | Body is a non-empty subset of `{subject:string, body:string, status:OutreachDraftStatus}` with no other keys. Supplied subject/body must be non-blank. Set `edited_at` for copy changes. Return `{data: OutreachDraft}` with the path id and every supplied field reflected exactly; an ignored/stale patch is an invalid success. Live-only. |
| `POST /api/outreach/approve-batch` | Body exactly `{draftIds:string[]}` with at least one unique non-blank id. Return `{approved:number,draftIds?:string[]}`. Full success may omit `draftIds`; partial success must return the exact unique completed ids, all drawn from the request, with `draftIds.length === approved`. Omitted request ids are retryable in original request order. If exact per-id outcome is unavailable, return non-2xx. Live-only. |
| `GET /api/hr-prospects?includeSuppressed=true` | Return the existing paged envelope `{data:HRProspectRecord[],total,limit,offset,summary,provider}`. `summary` may add `lifecycle:{new,queued,contacted,replied,suppressed}` with non-negative integer counts; the shell uses only this authoritative lifecycle summary for its New badge and never substitutes legacy `summary.new` (which tracks `review_status`). The checked-in worker may temporarily omit `status`, `workflow_id`, `workflow_name`, and `summary.lifecycle`; the frontend accepts that for backward compatibility and truthfully derives only from available live evidence. The Phase 3 backend must supply authoritative `status`, non-blank paired `workflow_id`/`workflow_name`, and the lifecycle summary for every Phase 3 scrape. With `includeSuppressed=true`, do not apply the worker's current `suppressed=eq.false` filter: return every lifecycle state, including `suppressed`. Without the flag, the legacy exclusion may remain. The frontend validates all present prospect fields, any present lifecycle/source-workflow value, non-negative pagination/summary counts, the last-run shape, and the exact Apollo provider shape; malformed 2xx responses fail. |
| `PATCH /api/hr-prospects/:id` (Phase 3 lifecycle) | Body exactly `{status:"new"|"queued"|"contacted"|"replied"|"suppressed"}`. Return `{data:{id:string,status:HiHuntLeadStatus}}` with both values exactly matching the request/path. `suppressed` must set suppression; any other lifecycle value is the explicit undo and must clear suppression. Keep `review_status` independent for the existing review UI; never infer this lifecycle field from it. Live-only. |
| `GET /api/email-threads` | Return `{data:EmailThreadSummary[],total:number,unread:number}` where `total === data.length` and `unread === data.filter(thread => thread.unread).length`. |
| `GET /api/email-threads/:id` | Return `{data:EmailThreadRecord}` with the path id, or 404. This detail endpoint is required for direct inbox URLs. On a detail 404 the frontend probes `GET /api/email-threads`: a live collection means record-not-found and never sample data; only a missing collection endpoint permits the labelled sample fallback. |
| `POST /api/email-threads/:id/reply` | Body exactly `{body:string,idempotencyKey:string}` with both values non-blank. The key must make retries safe. Return `{sent:true,threadId:string,messageId:string,sentAt:string}` with `threadId` equal to the path id and a parseable `sentAt`. Live-only. |
| `GET /api/email-account` | Return `{data:EmailAccountRecord}`. `connected` requires provider/address/connectedAt and `error:null`; `connecting` requires a provider with account/timestamp/error fields null; `disconnected` requires provider/account/timestamp/error fields null; `error` requires a non-blank `error`. |
| `POST /api/email-account` | Discriminated actions, with exact bodies/responses: `{action:"connect",provider:EmailProvider}` -> `{authorizationUrl:string}` (absolute HTTP(S) OAuth handoff); `{action:"disconnect"}` -> `{data:EmailAccountRecord}` with status `disconnected`; `{action:"send-test"}` -> `{sent:true,messageId:string}`. All actions are live-only; 404/405 is failure. |
| `GET /api/hihunt-settings` | Return `{data:HiHuntSettings}`. The frontend validates every field. |
| `PUT /api/hihunt-settings` | Body is the complete `HiHuntSettings` object. Return `{data:HiHuntSettings}` echoing every persisted field exactly. The page must complete GET before enabling save, so a partial defaults edit cannot overwrite unseen live discovery/outreach values. Local storage is updated only after this live acknowledgement. Live-only. |

Phase 3 read fallbacks are deliberately narrow: only a definitive 404/405 may return fixed,
deterministic data with `sample:true`. This applies to workflows, workflow detail, outreach drafts,
email-thread list/detail, email account, and settings. Unknown sample detail ids return `data:null`.
Network failures, 5xx responses, invalid JSON, and malformed 2xx bodies throw instead of hiding live-data
problems. Every mutation above is live-only, including when its endpoint returns 404/405; sample records
must remain read-only in the UI.

### Existing shell / Hi-Hunt infrastructure contracts

| Endpoint | Contract |
|---|---|
| `GET /api/send-queue` | `{cap:{limit,used,remaining}, totalQueued, batch:[{recipientId,campaignId,campaignTitle,leadId,name,phone,ageBand,queuedAt,message}]}` — FIFO oldest-queued across all `campaigns.status='queued'`, batch length ≤ remaining. `used` is any finite non-negative number, must count **all** outbound `whatsapp_messages` today (campaign sends + reply sends share the relay's 20/day cap), and may truthfully exceed `limit`; return `remaining = floor(max(0, limit - used))` without clamping `used`. `limit`, `remaining`, and `totalQueued` remain non-negative integers. "Today" = Asia/Singapore day start. `message` = personalised (`{{first_name}}` substituted). |
| `GET /api/cron/hr-discovery` | Daily discovery trigger. Auth: `Authorization: Bearer ${CRON_SECRET}` (fail closed, 503 when unset). Return 200-with-skip for: already ran in last 20h (`triggered_by='cron'`), Apollo unconfigured, `autoRunEnabled=false`. Cap `requestedCount ≤ 25` (30s Vercel budget; enrichment runs in batches of 5). |

Also worth doing while in `runHRDiscovery`: remove `suppressed: false` from the upsert payload in
`normaliseHRProspect` (L835) — otherwise the daily cron **un-suppresses** prospects the owner
suppressed — and dedupe already-known `provider_person_id`s **before** the enrichment loop to stop
the cron re-spending Apollo credits on the same people every day.

`POST /api/campaigns/:id/send-whatsapp` (exists) needs two tweaks for the send queue: write `phone`/`sent_at`
on the recipient row, and replace the "mark campaign sent only when audience_count===1" logic with
"sent when no queued recipients remain".

The Phase 2 batch contract intentionally accepts only `{itemIds}`. Inline queue copy is preview-only and
approval stays blocked until edited copy is reset; add a documented message-override contract before making
those edits sendable.

## 3. vercel.json

```json
"crons": [{ "path": "/api/cron/hr-discovery", "schedule": "0 23 * * *" }]
```
(23:00 UTC = 07:00 SGT.) Add `CRON_SECRET` to the Vercel project env and local `.env`.

## 4. Removed from the frontend (backend cleanup optional)

The AI chat UI is gone. `/api/assistant` and `/api/chat-threads*` (and their `api/` shims) have no
callers left — removing them frees function slots. `/api/poster-draft` **is still used** (wizard step 1).
Keep the chat tables; no destructive migration.

## 5. Full design detail

Three line-verified implementation plans (shell/Today, RE-engage drip queue, Hi-Hunt cron/drafts) are in
`C:\Users\User\.claude\plans\velvet-wondering-valiant*.md` — endpoint semantics, edge cases, and a
no-credentials verification recipe (local Hermes relay stub, seeded prospects, curl checks for the cron).

## 6. Deferred dependency cleanup

Do not remove packages as part of the redesign release. A repository-wide source scan found no direct
imports or runtime references for the following dependency candidates; the developer should confirm
deployment and tooling requirements, then prune them in a dedicated dependency change:

- runtime: `@emotion/react`, `@emotion/styled`, `@mui/icons-material`, `@mui/material`,
  `@popperjs/core`, `@supabase/supabase-js`, `ai`, `canvas-confetti`, `date-fns`, `nanoid`,
  `next-themes`, `react-dnd`, `react-dnd-html5-backend`, `react-popper`,
  `react-responsive-masonry`, `react-slick`, `streamdown`, and `use-stick-to-bottom`;
- development: `pg`.

The generated `components/ui/` library also references packages from files that are not currently
reachable from a mounted route. Audit that component reachability before removing individual Radix or
utility packages. Keep `motion`: Phase 4 uses its lightweight `motion/react` entry point.
