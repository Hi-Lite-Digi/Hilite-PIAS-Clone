/**
 * Frontend stubs for capabilities the backend does not provide yet.
 *
 * Read functions first try the real endpoint documented in BACKEND_TODO.md,
 * then fall back to labelled sample data when a read is unavailable. Mutations
 * are deliberately stricter: network, service, and malformed-response failures
 * always throw. Older Hi-Hunt mutations may use a labelled local fallback only
 * when the backend definitively reports that an endpoint is missing (404/405).
 */
import {
  isHRProspectRecord,
  isLeadRecord,
  type CampaignRecord,
  type HRProspectRecord,
  type LeadRecord,
  type ReplyConversationRecord,
} from "./api";

type ApiAttempt<T> =
  | { kind: "live"; data: T }
  | { kind: "missing"; error: Error }
  | { kind: "failed"; error: Error };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normaliseCampaignAudience(value: Record<string, unknown>) {
  for (const key of ["ageBands", "topics", "statuses"] as const) {
    if (value[key] === undefined) value[key] = [];
    else if (!isStringArray(value[key])) return false;
  }
  if (value.delivery !== undefined) {
    if (!isRecord(value.delivery)
      || (value.delivery.channel !== "whatsapp" && value.delivery.channel !== "email")
      || (value.delivery.senderEmail !== null && typeof value.delivery.senderEmail !== "string")
      || (value.delivery.scheduledAt !== null && typeof value.delivery.scheduledAt !== "string")
      || (value.delivery.ctaUrl !== null && typeof value.delivery.ctaUrl !== "string")
      || !Array.isArray(value.delivery.reminderDates)
      || !value.delivery.reminderDates.every((item) => typeof item === "string")) return false;
  }
  return true;
}

function isThreadRecord(value: unknown): value is ReplyConversationRecord {
  if (!isRecord(value) || !Array.isArray(value.thread)) return false;
  return typeof value.id === "number"
    && (typeof value.leadId === "number" || value.leadId === null)
    && (typeof value.campaignId === "string" || value.campaignId === null)
    && typeof value.leadName === "string"
    && typeof value.initials === "string"
    && typeof value.color === "string"
    && typeof value.company === "string"
    && typeof value.title === "string"
    && typeof value.email === "string"
    && (typeof value.phone === "string" || value.phone === null)
    && typeof value.campaign === "string"
    && typeof value.subject === "string"
    && typeof value.preview === "string"
    && typeof value.occurredAt === "string"
    && typeof value.read === "boolean"
    && typeof value.starred === "boolean"
    && ["Interested", "Not Interested", "Question", "Out of Office", "Follow-up", "Unsubscribe"].includes(String(value.category))
    && value.thread.every((message) => isRecord(message)
      && typeof message.id === "string"
      && (message.from === "lead" || message.from === "us")
      && typeof message.senderName === "string"
      && typeof message.senderContact === "string"
      && typeof message.occurredAt === "string"
      && typeof message.body === "string"
      && (message.attachment === undefined || (isRecord(message.attachment)
        && (message.attachment.kind === "image" || message.attachment.kind === "sticker")
        && typeof message.attachment.name === "string"
        && (message.attachment.url === undefined || message.attachment.url === null || typeof message.attachment.url === "string")
        && (message.attachment.mimeType === undefined || message.attachment.mimeType === null || typeof message.attachment.mimeType === "string"))));
}

function isCampaignRecord(value: unknown): value is CampaignRecord {
  if (!isRecord(value) || !isRecord(value.audience)) return false;
  if (!normaliseCampaignAudience(value.audience)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && (typeof value.poster_name === "string" || value.poster_name === null)
    && (typeof value.poster_path === "string" || value.poster_path === null)
    && typeof value.subject === "string"
    && typeof value.message === "string"
    && typeof value.audience_count === "number"
    && ["draft", "queued", "sending", "sent", "paused"].includes(String(value.status))
    && typeof value.created_at === "string"
    && typeof value.updated_at === "string";
}

function responseError(payload: unknown, fallback: string) {
  if (isRecord(payload)) {
    if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  }
  return fallback;
}

async function attemptApi<T>(url: string, init?: RequestInit): Promise<ApiAttempt<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    return {
      kind: "failed",
      error: new Error("HiHunt could not reach its service. Refresh the app and try again."),
    };
  }

  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch {
    return {
      kind: "failed",
      error: new Error("HiHunt received an invalid service response. Please try again."),
    };
  }
  let payload: unknown = {};
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      if (response.status === 404 || response.status === 405) {
        return {
          kind: "missing",
          error: new Error("The request could not be completed."),
        };
      }
      return {
        kind: "failed",
        error: new Error(response.ok
          ? "HiHunt received an invalid service response. Please try again."
          : "HiHunt's service is temporarily unavailable. Please try again."),
      };
    }
  }

  if (!response.ok) {
    const error = new Error(responseError(payload, "The request could not be completed."));
    return response.status === 404 || response.status === 405
      ? { kind: "missing", error }
      : { kind: "failed", error };
  }

  if (!rawBody || !isRecord(payload)) {
    return {
      kind: "failed",
      error: new Error("HiHunt received an invalid service response. Please try again."),
    };
  }

  return { kind: "live", data: payload as T };
}

async function strictApi<T>(url: string, init?: RequestInit): Promise<T> {
  const attempt = await attemptApi<T>(url, init);
  if (attempt.kind === "live") return attempt.data;
  throw attempt.error;
}

// -- Hi-Hunt workflows (contract: GET/POST /api/workflows, GET/PATCH /:id) --

export type WorkflowDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type WorkflowSchedule = {
  days: WorkflowDay[];
  time: string;
  timezone: "Asia/Singapore";
};

export type WorkflowScrapeRecipe = {
  roles: string[];
  seniorities: string[];
  location: string;
  companyDomain: string | null;
  volumePerRun: number;
  source: "apollo" | "multi_provider";
};

export type WorkflowEmailTemplate = { subject: string; body: string };

export type WorkflowSendingRules = {
  dailyLimit: number;
  spacingMinutes: number;
  window: { start: string; end: string; timezone: "Asia/Singapore" };
};

export type WorkflowRunSummary = {
  id: string;
  status: "running" | "completed" | "failed";
  found: number;
  skippedDuplicates: number;
  drafted: number;
  startedAt: string;
  completedAt: string | null;
};

export type WorkflowDefinition = {
  name: string;
  schedule: WorkflowSchedule;
  scrapeRecipe: WorkflowScrapeRecipe;
  emailTemplate: WorkflowEmailTemplate;
  sendingRules: WorkflowSendingRules;
};

export type CreateWorkflowInput = WorkflowDefinition & { enabled?: boolean };
export type UpdateWorkflowInput = Partial<WorkflowDefinition & { enabled: boolean }>;

export type WorkflowRecord = WorkflowDefinition & {
  id: string;
  enabled: boolean;
  lastRun: WorkflowRunSummary | null;
  nextRunAt: string | null;
  draftedToday: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowsResult = { sample: boolean; data: WorkflowRecord[] };
export type WorkflowDetailResult = { sample: boolean; data: WorkflowRecord | null };
export type WorkflowMutationResult = { sample: false; data: WorkflowRecord };

const WORKFLOW_DAYS = new Set<WorkflowDay>(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isWorkflowSchedule(value: unknown): value is WorkflowSchedule {
  if (!isRecord(value) || !Array.isArray(value.days)) return false;
  return value.days.length > 0
    && value.days.every((day) => typeof day === "string" && WORKFLOW_DAYS.has(day as WorkflowDay))
    && new Set(value.days).size === value.days.length
    && typeof value.time === "string"
    && CLOCK_TIME.test(value.time)
    && value.timezone === "Asia/Singapore";
}

function isWorkflowScrapeRecipe(value: unknown): value is WorkflowScrapeRecipe {
  if (!isRecord(value)) return false;
  return isStringArray(value.roles)
    && isStringArray(value.seniorities)
    && typeof value.location === "string"
    && (value.companyDomain === null || typeof value.companyDomain === "string")
    && typeof value.volumePerRun === "number"
    && Number.isInteger(value.volumePerRun)
    && value.volumePerRun > 0
    && ["apollo", "multi_provider"].includes(String(value.source));
}

function isWorkflowEmailTemplate(value: unknown): value is WorkflowEmailTemplate {
  return isRecord(value) && typeof value.subject === "string" && typeof value.body === "string";
}

function isWorkflowSendingRules(value: unknown): value is WorkflowSendingRules {
  if (!isRecord(value) || !isRecord(value.window)) return false;
  return typeof value.dailyLimit === "number"
    && Number.isInteger(value.dailyLimit)
    && value.dailyLimit > 0
    && isNonNegativeInteger(value.spacingMinutes)
    && typeof value.window.start === "string"
    && CLOCK_TIME.test(value.window.start)
    && typeof value.window.end === "string"
    && CLOCK_TIME.test(value.window.end)
    && value.window.start !== value.window.end
    && value.window.timezone === "Asia/Singapore";
}

function isWorkflowRunSummary(value: unknown): value is WorkflowRunSummary {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && ["running", "completed", "failed"].includes(String(value.status))
    && isNonNegativeInteger(value.found)
    && isNonNegativeInteger(value.skippedDuplicates)
    && isNonNegativeInteger(value.drafted)
    && isTimestamp(value.startedAt)
    && (value.completedAt === null || isTimestamp(value.completedAt));
}

function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
  return isRecord(value)
    && isNonEmptyString(value.name)
    && isWorkflowSchedule(value.schedule)
    && isWorkflowScrapeRecipe(value.scrapeRecipe)
    && isWorkflowEmailTemplate(value.emailTemplate)
    && isWorkflowSendingRules(value.sendingRules);
}

function enabledWorkflowIsReady(value: {
  enabled: boolean;
  scrapeRecipe: WorkflowScrapeRecipe;
  emailTemplate: WorkflowEmailTemplate;
}) {
  return !value.enabled
    || (value.scrapeRecipe.seniorities.some((seniority) => seniority.trim().length > 0)
      && value.emailTemplate.subject.trim().length > 0
      && value.emailTemplate.body.trim().length > 0);
}

function isWorkflowRecord(value: unknown): value is WorkflowRecord {
  if (!isRecord(value)) return false;
  const record = value;
  if (!isWorkflowDefinition(record)) return false;
  return isNonEmptyString(value.id)
    && typeof value.enabled === "boolean"
    && enabledWorkflowIsReady(record as unknown as WorkflowRecord)
    && (value.lastRun === null || isWorkflowRunSummary(value.lastRun))
    && (value.nextRunAt === null || isTimestamp(value.nextRunAt))
    && isNonNegativeInteger(value.draftedToday)
    && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt);
}

const SAMPLE_WORKFLOWS: WorkflowRecord[] = [
  {
    id: "workflow-hr-leaders",
    name: "Singapore HR leaders",
    enabled: true,
    schedule: { days: ["mon", "tue", "wed", "thu", "fri"], time: "08:00", timezone: "Asia/Singapore" },
    scrapeRecipe: {
      roles: ["Human Resources", "People & Culture"],
      seniorities: ["head", "director", "manager"],
      location: "Singapore",
      companyDomain: null,
      volumePerRun: 25,
      source: "multi_provider",
    },
    emailTemplate: {
      subject: "A practical employee benefit for {{company_name}}",
      body: "Hi {{first_name}},\n\nWould a short introduction to our workplace financial-wellness sessions be useful?",
    },
    sendingRules: {
      dailyLimit: 50,
      spacingMinutes: 8,
      window: { start: "09:00", end: "17:00", timezone: "Asia/Singapore" },
    },
    lastRun: {
      id: "sample-run-hr-leaders",
      status: "completed",
      found: 18,
      skippedDuplicates: 3,
      drafted: 15,
      startedAt: "2026-08-26T00:00:00.000Z",
      completedAt: "2026-08-26T00:03:00.000Z",
    },
    nextRunAt: "2026-08-27T00:00:00.000Z",
    draftedToday: 15,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-26T00:03:00.000Z",
  },
  {
    id: "workflow-people-ops",
    name: "People operations leads",
    enabled: false,
    schedule: { days: ["tue", "thu"], time: "10:30", timezone: "Asia/Singapore" },
    scrapeRecipe: {
      roles: ["People Operations", "Talent & Culture"],
      seniorities: ["vp", "head"],
      location: "Singapore",
      companyDomain: null,
      volumePerRun: 15,
      source: "multi_provider",
    },
    emailTemplate: {
      subject: "Supporting {{company_name}}'s people team",
      body: "Hi {{first_name}},\n\nCould I share a short overview of our workplace seminars?",
    },
    sendingRules: {
      dailyLimit: 30,
      spacingMinutes: 12,
      window: { start: "10:00", end: "16:30", timezone: "Asia/Singapore" },
    },
    lastRun: null,
    nextRunAt: null,
    draftedToday: 0,
    createdAt: "2026-08-24T02:00:00.000Z",
    updatedAt: "2026-08-24T02:00:00.000Z",
  },
];

function cloneWorkflow(workflow: WorkflowRecord): WorkflowRecord {
  return {
    ...workflow,
    schedule: { ...workflow.schedule, days: [...workflow.schedule.days] },
    scrapeRecipe: {
      ...workflow.scrapeRecipe,
      roles: [...workflow.scrapeRecipe.roles],
      seniorities: [...workflow.scrapeRecipe.seniorities],
    },
    emailTemplate: { ...workflow.emailTemplate },
    sendingRules: { ...workflow.sendingRules, window: { ...workflow.sendingRules.window } },
    lastRun: workflow.lastRun ? { ...workflow.lastRun } : null,
  };
}

function assertWorkflowCreateInput(input: CreateWorkflowInput) {
  if (!isWorkflowDefinition(input)) throw new Error("Enter a valid workflow name, schedule, scrape recipe, template, and sending rules.");
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("The workflow enabled value is invalid.");
  if (!enabledWorkflowIsReady({ ...input, enabled: input.enabled ?? false })) {
    throw new Error("An enabled workflow needs at least one seniority and a complete email template.");
  }
}

function assertWorkflowUpdateInput(input: UpdateWorkflowInput) {
  if (!isRecord(input)) throw new Error("Choose at least one workflow field to update.");
  const entries = Object.entries(input);
  if (entries.length === 0 || !entries.some(([, value]) => value !== undefined)) {
    throw new Error("Choose at least one workflow field to update.");
  }
  if (entries.some(([, value]) => value === undefined)) {
    throw new Error("The workflow update contains an undefined field.");
  }
  const allowed = new Set(["name", "enabled", "schedule", "scrapeRecipe", "emailTemplate", "sendingRules"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error("The workflow update contains an unsupported field.");
  if (input.name !== undefined && !isNonEmptyString(input.name)) throw new Error("Enter a workflow name.");
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("The workflow enabled value is invalid.");
  if (input.schedule !== undefined && !isWorkflowSchedule(input.schedule)) throw new Error("Enter a valid workflow schedule.");
  if (input.scrapeRecipe !== undefined && !isWorkflowScrapeRecipe(input.scrapeRecipe)) throw new Error("Enter a valid scrape recipe.");
  if (input.emailTemplate !== undefined && !isWorkflowEmailTemplate(input.emailTemplate)) throw new Error("Enter a valid email template.");
  if (input.sendingRules !== undefined && !isWorkflowSendingRules(input.sendingRules)) throw new Error("Enter valid sending rules.");
  if (input.enabled === true
    && ((input.scrapeRecipe !== undefined && input.scrapeRecipe.seniorities.length === 0)
      || (input.emailTemplate !== undefined
        && (!input.emailTemplate.subject.trim() || !input.emailTemplate.body.trim())))) {
    throw new Error("An enabled workflow needs at least one seniority and a complete email template.");
  }
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => structurallyEqual(item, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && structurallyEqual(left[key], right[key]));
}

function workflowMatchesUpdate(workflow: WorkflowRecord, input: UpdateWorkflowInput) {
  return Object.entries(input).every(([key, value]) => (
    structurallyEqual(workflow[key as keyof WorkflowRecord], value)
  ));
}

export async function getWorkflows(): Promise<WorkflowsResult> {
  const attempt = await attemptApi<{ data?: unknown }>("/api/workflows");
  if (attempt.kind === "live") {
    if (!Array.isArray(attempt.data.data) || !attempt.data.data.every(isWorkflowRecord)) {
      throw new Error("The workflow list returned an invalid response.");
    }
    return { sample: false, data: attempt.data.data };
  }
  if (attempt.kind === "failed") throw attempt.error;
  return { sample: true, data: SAMPLE_WORKFLOWS.map(cloneWorkflow) };
}

export async function getWorkflow(id: string): Promise<WorkflowDetailResult> {
  if (!isNonEmptyString(id)) throw new Error("Choose a workflow to open.");
  const attempt = await attemptApi<{ data?: unknown }>(`/api/workflows/${encodeURIComponent(id)}`);
  if (attempt.kind === "live") {
    if (!isWorkflowRecord(attempt.data.data) || attempt.data.data.id !== id) {
      throw new Error("The workflow detail returned an invalid response.");
    }
    return { sample: false, data: attempt.data.data };
  }
  if (attempt.kind === "failed") throw attempt.error;
  const collection = await getWorkflows();
  if (!collection.sample) return { sample: false, data: null };
  const workflow = SAMPLE_WORKFLOWS.find((item) => item.id === id);
  return { sample: true, data: workflow ? cloneWorkflow(workflow) : null };
}

export async function createWorkflow(input: CreateWorkflowInput): Promise<WorkflowMutationResult> {
  assertWorkflowCreateInput(input);
  const payload = await strictApi<{ data?: unknown }>("/api/workflows", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!isWorkflowRecord(payload.data)
    || payload.data.enabled !== (input.enabled ?? false)
    || !workflowMatchesUpdate(payload.data, input)) {
    throw new Error("The workflow create returned an invalid response.");
  }
  return { sample: false, data: payload.data };
}

export async function updateWorkflow(id: string, input: UpdateWorkflowInput): Promise<WorkflowMutationResult> {
  if (!isNonEmptyString(id)) throw new Error("Choose a workflow to update.");
  assertWorkflowUpdateInput(input);
  const payload = await strictApi<{ data?: unknown }>(`/api/workflows/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!isWorkflowRecord(payload.data) || payload.data.id !== id || !workflowMatchesUpdate(payload.data, input)) {
    throw new Error("The workflow update returned an invalid response.");
  }
  return { sample: false, data: payload.data };
}

// ── Send queue (contract: GET /api/send-queue) ────────────────────────────

export type SendQueueItem = {
  recipientId: string;
  campaignId: string;
  campaignTitle: string;
  leadId: number;
  name: string;
  phone: string;
  ageBand: string | null;
  queuedAt: string;
  message: string;
};

export type SendQueueResult = {
  cap: {
    limit: number;
    used: number;
    scheduled: number;
    remaining: number;
    windowHours: number;
    resetsAt: string;
  };
  totalQueued: number;
  batch: SendQueueItem[];
};

function isSendQueueItem(value: unknown): value is SendQueueItem {
  if (!isRecord(value)) return false;
  return typeof value.recipientId === "string"
    && value.recipientId.trim().length > 0
    && typeof value.campaignId === "string"
    && value.campaignId.trim().length > 0
    && typeof value.campaignTitle === "string"
    && isNonNegativeInteger(value.leadId)
    && typeof value.name === "string"
    && typeof value.phone === "string"
    && (typeof value.ageBand === "string" || value.ageBand === null)
    && typeof value.queuedAt === "string"
    && typeof value.message === "string";
}

export async function getSendQueue(): Promise<SendQueueResult> {
  const payload = await strictApi<Partial<SendQueueResult>>("/api/send-queue", {
    headers: { accept: "application/json" },
  });

  const cap = payload.cap;
  if (!Array.isArray(payload.batch)
    || !payload.batch.every(isSendQueueItem)
    || !isRecord(cap)
    || !isNonNegativeInteger(cap.limit)
    || !isNonNegativeFiniteNumber(cap.used)
    || !isNonNegativeInteger(cap.scheduled)
    || cap.scheduled > cap.used
    || !isNonNegativeInteger(cap.remaining)
    || cap.windowHours !== 12
    || typeof cap.resetsAt !== "string"
    || !Number.isFinite(Date.parse(cap.resetsAt))
    || cap.remaining !== Math.floor(Math.max(0, cap.limit - cap.used))
    || !isNonNegativeInteger(payload.totalQueued)
    || payload.totalQueued < payload.batch.length
    || payload.batch.length > cap.remaining) {
    throw new Error("The live WhatsApp queue returned an invalid response.");
  }

  return payload as SendQueueResult;
}

export type BatchApprovalResult = {
  approved: number;
  itemIds: string[];
  retryableItemIds: string[];
  intervalSeconds: number;
  firstScheduledAt: string;
  lastScheduledAt: string;
};

export async function approveSendBatch(itemIds: string[]): Promise<BatchApprovalResult> {
  if (itemIds.length === 0
    || itemIds.some((itemId) => !itemId.trim())
    || new Set(itemIds).size !== itemIds.length) {
    throw new Error("Choose at least one queued item before approving the batch.");
  }

  const payload = await strictApi<Partial<BatchApprovalResult>>("/api/send-queue/approve-batch", {
    method: "POST",
    body: JSON.stringify({ itemIds, consentConfirmed: true }),
  });
  if (!isNonNegativeInteger(payload.approved) || payload.approved > itemIds.length) {
    throw new Error("The live batch approval returned an invalid response.");
  }
  const approved = payload.approved;

  let approvedItemIds: string[];
  if (payload.itemIds === undefined) {
    if (approved !== itemIds.length) {
      throw new Error("The live batch approval returned an invalid response.");
    }
    approvedItemIds = [...itemIds];
  } else {
    if (!Array.isArray(payload.itemIds)
      || payload.itemIds.length !== approved
      || !payload.itemIds.every((itemId) => typeof itemId === "string" && itemIds.includes(itemId))
      || new Set(payload.itemIds).size !== payload.itemIds.length) {
      throw new Error("The live batch approval returned an invalid response.");
    }
    approvedItemIds = payload.itemIds;
  }
  const approvedItemIdSet = new Set(approvedItemIds);
  if (payload.intervalSeconds !== 60
    || typeof payload.firstScheduledAt !== "string"
    || !Number.isFinite(Date.parse(payload.firstScheduledAt))
    || typeof payload.lastScheduledAt !== "string"
    || !Number.isFinite(Date.parse(payload.lastScheduledAt))
    || Date.parse(payload.lastScheduledAt) < Date.parse(payload.firstScheduledAt)) {
    throw new Error("The live batch approval returned an invalid response.");
  }

  return {
    approved,
    itemIds: approvedItemIds,
    retryableItemIds: itemIds.filter((itemId) => !approvedItemIdSet.has(itemId)),
    intervalSeconds: payload.intervalSeconds,
    firstScheduledAt: payload.firstScheduledAt,
    lastScheduledAt: payload.lastScheduledAt,
  };
}

export type OutreachBatchApprovalResult = {
  approved: number;
  draftIds: string[];
  retryableDraftIds: string[];
};

export async function approveOutreachBatch(draftIds: string[]): Promise<OutreachBatchApprovalResult> {
  if (draftIds.length === 0
    || draftIds.some((draftId) => !draftId.trim())
    || new Set(draftIds).size !== draftIds.length) {
    throw new Error("Choose at least one outreach draft before approving the batch.");
  }

  const payload = await strictApi<Partial<OutreachBatchApprovalResult>>("/api/outreach/approve-batch", {
    method: "POST",
    body: JSON.stringify({ draftIds }),
  });
  if (!isNonNegativeInteger(payload.approved) || payload.approved > draftIds.length) {
    throw new Error("The live outreach approval returned an invalid response.");
  }

  let approvedDraftIds: string[];
  if (payload.draftIds === undefined) {
    if (payload.approved !== draftIds.length) {
      throw new Error("The live outreach approval returned an invalid response.");
    }
    approvedDraftIds = [...draftIds];
  } else {
    if (!Array.isArray(payload.draftIds)
      || payload.draftIds.length !== payload.approved
      || !payload.draftIds.every((draftId) => typeof draftId === "string" && draftIds.includes(draftId))
      || new Set(payload.draftIds).size !== payload.draftIds.length) {
      throw new Error("The live outreach approval returned an invalid response.");
    }
    approvedDraftIds = payload.draftIds;
  }
  const approvedDraftIdSet = new Set(approvedDraftIds);
  return {
    approved: payload.approved,
    draftIds: approvedDraftIds,
    retryableDraftIds: draftIds.filter((draftId) => !approvedDraftIdSet.has(draftId)),
  };
}

// -- WhatsApp threads (contract: GET /api/threads, GET /api/threads/:id) --

const SAMPLE_THREADS: ReplyConversationRecord[] = [
  {
    id: 101,
    leadId: 101,
    campaignId: "campaign-june-seminar",
    leadName: "Aisha Rahman",
    initials: "AR",
    color: "mint",
    company: "WhatsApp",
    title: "WhatsApp reply",
    email: "aisha.rahman@example.com",
    phone: "+65 9123 4478",
    campaign: "June Seminar",
    subject: "June Seminar",
    preview: "Yes, I would like to know more.",
    occurredAt: "2026-08-26T04:18:00.000Z",
    read: false,
    starred: true,
    category: "Interested",
    thread: [
      { id: "101-1", from: "us", senderName: "Hilite", senderContact: "+65 8000 0000", occurredAt: "2026-08-25T06:05:00.000Z", body: "Hi Aisha, would you like a seat at our June planning seminar?" },
      { id: "101-2", from: "lead", senderName: "Aisha Rahman", senderContact: "+65 9123 4478", occurredAt: "2026-08-26T04:18:00.000Z", body: "Yes, I would like to know more." },
    ],
  },
  {
    id: 102,
    leadId: 102,
    campaignId: "campaign-june-seminar",
    leadName: "Marcus Teo",
    initials: "MT",
    color: "cyan",
    company: "WhatsApp",
    title: "WhatsApp reply",
    email: "marcus.teo@example.com",
    phone: "+65 9876 1120",
    campaign: "June Seminar",
    subject: "June Seminar",
    preview: "Is there an evening session?",
    occurredAt: "2026-08-26T02:42:00.000Z",
    read: false,
    starred: false,
    category: "Question",
    thread: [
      { id: "102-1", from: "us", senderName: "Hilite", senderContact: "+65 8000 0000", occurredAt: "2026-08-25T05:45:00.000Z", body: "Hi Marcus, we are opening registration for our June planning seminar." },
      { id: "102-2", from: "lead", senderName: "Marcus Teo", senderContact: "+65 9876 1120", occurredAt: "2026-08-26T02:42:00.000Z", body: "Is there an evening session?" },
    ],
  },
  {
    id: 103,
    leadId: 103,
    campaignId: "campaign-retirement-check-in",
    leadName: "Elena Wong",
    initials: "EW",
    color: "lavender",
    company: "WhatsApp",
    title: "WhatsApp reply",
    email: "elena.wong@example.com",
    phone: "+65 8771 2044",
    campaign: "Retirement check-in",
    subject: "Retirement check-in",
    preview: "Please follow up next month.",
    occurredAt: "2026-08-25T09:10:00.000Z",
    read: true,
    starred: false,
    category: "Follow-up",
    thread: [
      { id: "103-1", from: "us", senderName: "Hilite", senderContact: "+65 8000 0000", occurredAt: "2026-08-24T03:15:00.000Z", body: "Hi Elena, is now a good time for a retirement-plan review?" },
      { id: "103-2", from: "lead", senderName: "Elena Wong", senderContact: "+65 8771 2044", occurredAt: "2026-08-25T09:10:00.000Z", body: "Please follow up next month." },
    ],
  },
];

export type ThreadListResult = {
  sample: boolean;
  data: ReplyConversationRecord[];
  total: number;
  unread: number;
};

export type ThreadDetailResult = {
  sample: boolean;
  data: ReplyConversationRecord | null;
};

function filterThreads(
  threads: ReplyConversationRecord[],
  campaignId?: string,
  campaignTitle?: string,
) {
  if (!campaignId && !campaignTitle) return threads;
  return threads.filter((thread) => (
    (campaignId !== undefined && thread.campaignId === campaignId)
    || (campaignTitle !== undefined && thread.campaign === campaignTitle)
  ));
}

function threadListResult(data: ReplyConversationRecord[], sample: boolean): ThreadListResult {
  return {
    sample,
    data,
    total: data.length,
    unread: data.filter((thread) => !thread.read).length,
  };
}

async function getLegacyThreads(campaignId?: string, campaignTitle?: string): Promise<{
  result: ThreadListResult | null;
  failure: Error | null;
}> {
  const attempt = await attemptApi<{ data?: unknown }>("/api/replies");
  if (attempt.kind === "failed") return { result: null, failure: attempt.error };
  if (attempt.kind !== "live") return { result: null, failure: null };
  const data = attempt.data.data;
  if (!Array.isArray(data) || !data.every(isThreadRecord)) {
    return { result: null, failure: new Error("The conversation list returned an invalid response.") };
  }
  return {
    result: threadListResult(filterThreads(data, campaignId, campaignTitle), false),
    failure: null,
  };
}

export async function getThreads(campaignId?: string, campaignTitle?: string): Promise<ThreadListResult> {
  const search = new URLSearchParams();
  if (campaignId) search.set("campaign", campaignId);
  const suffix = search.size > 0 ? `?${search}` : "";
  const attempt = await attemptApi<Partial<ThreadListResult>>(`/api/threads${suffix}`);

  if (attempt.kind === "live") {
    const payload = attempt.data;
    const data = payload.data;
    if (!Array.isArray(data)
      || !data.every(isThreadRecord)
      || (campaignId && !data.every((thread) => thread.campaignId === campaignId))
      || !Number.isInteger(payload.total)
      || Number(payload.total) !== data.length
      || !Number.isInteger(payload.unread)
      || Number(payload.unread) !== data.filter((thread) => !thread.read).length) {
      throw new Error("The conversation list returned an invalid response.");
    }
    return {
      sample: false,
      data,
      total: Number(payload.total),
      unread: Number(payload.unread),
    };
  }
  if (attempt.kind === "failed") throw attempt.error;

  const legacy = await getLegacyThreads(campaignId, campaignTitle);
  if (legacy.result) return legacy.result;
  if (legacy.failure) throw legacy.failure;
  return threadListResult(filterThreads(SAMPLE_THREADS, campaignId, campaignTitle), true);
}

export async function getThread(id: string | number): Promise<ThreadDetailResult> {
  const threadId = String(id);
  const attempt = await attemptApi<{ data?: ReplyConversationRecord }>(
    `/api/threads/${encodeURIComponent(threadId)}`,
  );
  if (attempt.kind === "live") {
    if (!isThreadRecord(attempt.data.data) || String(attempt.data.data.id) !== threadId) {
      throw new Error("The conversation detail returned an invalid response.");
    }
    return { sample: false, data: attempt.data.data };
  }
  if (attempt.kind === "failed") throw attempt.error;

  const legacy = await getLegacyThreads();
  const legacyThread = legacy.result?.data.find((thread) => String(thread.id) === threadId);
  if (legacyThread) return { sample: false, data: legacyThread };
  if (legacy.failure) throw legacy.failure;

  return {
    sample: true,
    data: SAMPLE_THREADS.find((thread) => String(thread.id) === threadId) || null,
  };
}

// -- Lead import (contract: POST /api/leads/import) ---------------------------

export type LeadImportRow = Record<string, unknown>;

export type LeadImportField =
  | "name"
  | "email"
  | "phone"
  | "dob"
  | "age"
  | "status"
  | "topics"
  | "source"
  | "remarks";

export type LeadImportMapping = Partial<Record<LeadImportField, string>>;

export type LeadImportDuplicate = {
  row: number;
  reason: string;
};

export type LeadImportError = {
  row: number;
  field?: string;
  message: string;
};

export type LeadImportResult = {
  sample: false;
  added: number;
  skippedDuplicates: LeadImportDuplicate[];
  errors: LeadImportError[];
  data?: LeadRecord[];
};

function isImportRowNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function normaliseImportErrors(errors: unknown[]): LeadImportError[] | null {
  const normalized: LeadImportError[] = [];
  for (const error of errors) {
    if (!isRecord(error)
      || !isImportRowNumber(error.row)
      || typeof error.message !== "string"
      || !error.message.trim()
      || (error.field !== undefined && (typeof error.field !== "string" || !error.field.trim()))) return null;
    normalized.push({
      row: error.row,
      ...(typeof error.field === "string" ? { field: error.field } : {}),
      message: error.message,
    });
  }
  return normalized;
}

function normaliseImportDuplicates(duplicates: unknown[]): LeadImportDuplicate[] | null {
  const normalized: LeadImportDuplicate[] = [];
  for (const duplicate of duplicates) {
    if (!isRecord(duplicate)
      || !isImportRowNumber(duplicate.row)
      || typeof duplicate.reason !== "string"
      || !duplicate.reason.trim()) return null;
    normalized.push({
      row: duplicate.row,
      reason: duplicate.reason,
    });
  }
  return normalized;
}

async function requestLeadImport(
  endpoint: "/api/leads/import" | "/api/leads/import-check",
  rows: LeadImportRow[],
  mapping: LeadImportMapping,
): Promise<LeadImportResult> {
  const payload = await strictApi<Partial<LeadImportResult>>(endpoint, {
    method: "POST",
    body: JSON.stringify({ rows, mapping }),
  });
  const errors = payload.errors === undefined
    ? []
    : Array.isArray(payload.errors)
      ? normaliseImportErrors(payload.errors)
      : null;
  const skippedDuplicates = payload.skippedDuplicates === undefined
    ? []
    : Array.isArray(payload.skippedDuplicates)
      ? normaliseImportDuplicates(payload.skippedDuplicates)
      : null;
  const data = payload.data === undefined
    ? undefined
    : Array.isArray(payload.data) && payload.data.every(isLeadRecord)
      ? payload.data
      : null;
  const added = Number(payload.added);
  if (!Number.isInteger(payload.added)
    || added < 0
    || !skippedDuplicates
    || !errors
    || data === null) {
    throw new Error("The live lead import returned an invalid response.");
  }

  return {
    sample: false,
    added,
    skippedDuplicates,
    errors,
    ...(data ? { data } : {}),
  };
}

export function checkLeadImport(rows: LeadImportRow[], mapping: LeadImportMapping): Promise<LeadImportResult> {
  return requestLeadImport("/api/leads/import-check", rows, mapping);
}

export function importLeads(rows: LeadImportRow[], mapping: LeadImportMapping): Promise<LeadImportResult> {
  return requestLeadImport("/api/leads/import", rows, mapping);
}

// -- Campaign detail (contract: GET /api/campaigns/:id) ----------------------

const SAMPLE_CAMPAIGNS: CampaignRecord[] = [
  {
    id: "campaign-june-seminar",
    title: "June Seminar",
    poster_name: "June seminar invitation.png",
    poster_path: null,
    subject: "A practical planning seminar for June",
    message: "Hi {{first_name}}, we saved you a place at our June financial-planning seminar. Would you like the details?",
    audience: { ageBands: ["35-44", "45-54"], topics: ["Retirement"], statuses: ["active"] },
    audience_count: 48,
    status: "sending",
    created_at: "2026-08-18T01:00:00.000Z",
    updated_at: "2026-08-26T04:00:00.000Z",
  },
  {
    id: "campaign-retirement-check-in",
    title: "Retirement check-in",
    poster_name: null,
    poster_path: null,
    subject: "A quick retirement check-in",
    message: "Hi {{first_name}}, would a short retirement-plan check-in be useful this month?",
    audience: { ageBands: ["45-54", "55-64"], topics: ["Retirement"], statuses: ["active"] },
    audience_count: 31,
    status: "queued",
    created_at: "2026-08-21T02:00:00.000Z",
    updated_at: "2026-08-25T07:30:00.000Z",
  },
];

export type CampaignDetailResult = {
  sample: boolean;
  data: CampaignRecord | null;
};

export async function getCampaignDetail(id: string): Promise<CampaignDetailResult> {
  const attempt = await attemptApi<{ data?: CampaignRecord }>(
    `/api/campaigns/${encodeURIComponent(id)}`,
  );
  if (attempt.kind === "live") {
    if (!isCampaignRecord(attempt.data.data) || attempt.data.data.id !== id) {
      throw new Error("The campaign detail returned an invalid response.");
    }
    return { sample: false, data: attempt.data.data };
  }
  if (attempt.kind === "failed") throw attempt.error;

  const legacy = await attemptApi<{ data?: unknown }>("/api/campaigns");
  if (legacy.kind === "failed") throw legacy.error;
  if (legacy.kind === "live") {
    if (!Array.isArray(legacy.data.data) || !legacy.data.data.every(isCampaignRecord)) {
      throw new Error("The campaign list returned an invalid response.");
    }
    const campaign = legacy.data.data.find((item) => item.id === id);
    if (campaign) return { sample: false, data: campaign };
  }

  return {
    sample: true,
    data: SAMPLE_CAMPAIGNS.find((campaign) => campaign.id === id) || null,
  };
}

// -- Prospect review (contract: PATCH /api/hr-prospects/:id) -----------------

export type ProspectReviewInput = {
  review_status?: HRProspectRecord["review_status"];
  suppressed?: boolean;
};

function isProspectRecord(value: unknown): value is HRProspectRecord {
  return isHRProspectRecord(value);
}

export async function updateProspectReview(id: string, input: ProspectReviewInput): Promise<{ sample: boolean }> {
  const attempt = await attemptApi<{ data?: unknown }>(`/api/hr-prospects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (attempt.kind === "missing") return { sample: true };
  if (attempt.kind === "failed") throw attempt.error;
  if (!isProspectRecord(attempt.data.data) || attempt.data.data.id !== id) {
    throw new Error("The prospect update returned an invalid response.");
  }
  return { sample: false };
}

export type HiHuntLeadStatus = NonNullable<HRProspectRecord["status"]>;

export type HiHuntLeadStatusRecord = {
  id: string;
  status: HiHuntLeadStatus;
};

export async function updateHiHuntLeadStatus(
  id: string,
  status: HiHuntLeadStatus,
): Promise<{ sample: false; data: HiHuntLeadStatusRecord }> {
  if (!isNonEmptyString(id)) throw new Error("Choose a Hi-Hunt lead to update.");
  if (!["new", "queued", "contacted", "replied", "suppressed"].includes(status)) {
    throw new Error("Choose a valid Hi-Hunt lead status.");
  }
  const payload = await strictApi<{ data?: unknown }>(`/api/hr-prospects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!isRecord(payload.data) || payload.data.id !== id || payload.data.status !== status) {
    throw new Error("The Hi-Hunt lead update returned an invalid response.");
  }
  return { sample: false, data: { id, status } };
}

// ── Outreach drafts (contract: GET/POST /api/hr-outreach-drafts, PATCH /:id)

export type OutreachDraftStatus = "draft" | "approved" | "copied" | "contacted";

export type OutreachDraft = {
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

function isOutreachDraft(value: unknown): value is OutreachDraft {
  if (!isRecord(value) || !isRecord(value.prospect)) return false;
  const hasWorkflowId = value.workflowId !== undefined;
  const hasWorkflowName = value.workflowName !== undefined;
  return isNonEmptyString(value.id)
    && hasWorkflowId === hasWorkflowName
    && (!hasWorkflowId || (isNonEmptyString(value.workflowId) && isNonEmptyString(value.workflowName)))
    && isNonEmptyString(value.prospect.id)
    && typeof value.prospect.full_name === "string"
    && (value.prospect.first_name === null || typeof value.prospect.first_name === "string")
    && typeof value.prospect.job_title === "string"
    && (value.prospect.company_name === null || typeof value.prospect.company_name === "string")
    && typeof value.prospect.work_email === "string"
    && (value.prospect.linkedin_url === null || typeof value.prospect.linkedin_url === "string")
    && (value.prospect.location === null || typeof value.prospect.location === "string")
    && typeof value.subject === "string"
    && typeof value.body === "string"
    && ["draft", "approved", "copied", "contacted"].includes(String(value.status))
    && ["gpt", "fallback"].includes(String(value.generation_mode))
    && (value.edited_at === null || isTimestamp(value.edited_at))
    && isTimestamp(value.created_at);
}

const SAMPLE_DRAFTS: OutreachDraft[] = [
  {
    id: "d1",
    workflowId: "workflow-hr-leaders",
    workflowName: "Singapore HR leaders",
    prospect: { id: "p1", full_name: "Rachel Tan", first_name: "Rachel", job_title: "HR Director", company_name: "Vertex Logistics", work_email: "rachel.tan@vertexlogistics.example", linkedin_url: null, location: "Singapore" },
    subject: "Supporting Vertex Logistics' HR team",
    body: "Hi Rachel,\n\nI noticed you lead HR at Vertex Logistics. We run practical financial-wellness seminars that HR teams in Singapore use as an employee benefit — zero cost to the company.\n\nWould a 15-minute intro call next week be worth your time?\n\nWarm regards,\nHilite",
    status: "draft", generation_mode: "fallback", edited_at: null, created_at: "2026-08-26T00:04:00.000Z",
  },
  {
    id: "d2",
    workflowId: "workflow-hr-leaders",
    workflowName: "Singapore HR leaders",
    prospect: { id: "p2", full_name: "Daniel Koh", first_name: "Daniel", job_title: "Head of People", company_name: "Nimbus Health", work_email: "daniel.koh@nimbushealth.example", linkedin_url: null, location: "Singapore" },
    subject: "Employee financial wellness at Nimbus Health",
    body: "Hi Daniel,\n\nAs Head of People at Nimbus Health, you may be exploring low-cost benefits that employees actually use. Our CPF and retirement-planning lunch talks consistently rate highly with staff.\n\nOpen to a quick chat?\n\nWarm regards,\nHilite",
    status: "draft", generation_mode: "fallback", edited_at: null, created_at: "2026-08-26T00:05:00.000Z",
  },
  {
    id: "d3",
    workflowId: "workflow-people-ops",
    workflowName: "People operations leads",
    prospect: { id: "p3", full_name: "Priya Nair", first_name: "Priya", job_title: "Talent & Culture Lead", company_name: "Solstice Retail", work_email: "priya.nair@solsticeretail.example", linkedin_url: null, location: "Singapore" },
    subject: "A benefit your retail teams will actually use",
    body: "Hi Priya,\n\nRetail teams rarely get time for financial planning. We bring short, practical money talks to the workplace — CPF, insurance, retirement — at no cost.\n\nCould I send over a one-pager?\n\nWarm regards,\nHilite",
    status: "approved", generation_mode: "fallback", edited_at: null, created_at: "2026-08-25T02:00:00.000Z",
  },
];

export type OutreachDraftsResult = {
  sample: boolean;
  data: OutreachDraft[];
  summary: Record<OutreachDraftStatus, number>;
};

export type OutreachDraftUpdateInput = {
  subject?: string;
  body?: string;
  status?: OutreachDraftStatus;
};

function summarise(drafts: OutreachDraft[]): Record<OutreachDraftStatus, number> {
  return drafts.reduce(
    (acc, draft) => ({ ...acc, [draft.status]: acc[draft.status] + 1 }),
    { draft: 0, approved: 0, copied: 0, contacted: 0 } as Record<OutreachDraftStatus, number>,
  );
}

function isOutreachSummary(
  value: unknown,
  drafts: OutreachDraft[],
): value is Record<OutreachDraftStatus, number> {
  if (!isRecord(value)) return false;
  const expected = summarise(drafts);
  return (["draft", "approved", "copied", "contacted"] as const)
    .every((status) => isNonNegativeInteger(value[status]) && value[status] === expected[status]);
}

export async function getOutreachDrafts(): Promise<OutreachDraftsResult> {
  const attempt = await attemptApi<{ data?: unknown; summary?: unknown }>("/api/hr-outreach-drafts");
  if (attempt.kind === "live") {
    if (!Array.isArray(attempt.data.data)
      || !attempt.data.data.every(isOutreachDraft)
      || !isOutreachSummary(attempt.data.summary, attempt.data.data)) {
      throw new Error("The outreach draft list returned an invalid response.");
    }
    return { sample: false, data: attempt.data.data, summary: attempt.data.summary };
  }
  if (attempt.kind === "failed") throw attempt.error;
  const data = SAMPLE_DRAFTS.map((draft) => ({ ...draft, prospect: { ...draft.prospect } }));
  return { sample: true, data, summary: summarise(data) };
}

export async function updateOutreachDraft(
  id: string,
  input: OutreachDraftUpdateInput,
): Promise<{ sample: false; data: OutreachDraft }> {
  if (!isNonEmptyString(id)) throw new Error("Choose an outreach draft to update.");
  if (!isRecord(input)) {
    throw new Error("Choose at least one draft field to update.");
  }
  const entries = Object.entries(input);
  if (entries.length === 0 || !entries.some(([, value]) => value !== undefined)) {
    throw new Error("Choose at least one draft field to update.");
  }
  if (entries.some(([, value]) => value === undefined)) {
    throw new Error("The outreach draft update contains an undefined field.");
  }
  const allowed = new Set(["subject", "body", "status"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new Error("The outreach draft update contains an unsupported field.");
  }
  if (input.subject !== undefined && !isNonEmptyString(input.subject)) {
    throw new Error("Enter an email subject before saving the draft.");
  }
  if (input.body !== undefined && !isNonEmptyString(input.body)) {
    throw new Error("Enter an email body before saving the draft.");
  }
  if (input.status !== undefined && !["draft", "approved", "copied", "contacted"].includes(input.status)) {
    throw new Error("Choose a valid outreach draft status.");
  }
  const payload = await strictApi<{ data?: unknown }>(`/api/hr-outreach-drafts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!isOutreachDraft(payload.data)
    || payload.data.id !== id
    || (input.subject !== undefined && payload.data.subject !== input.subject)
    || (input.body !== undefined && payload.data.body !== input.body)
    || (input.status !== undefined && payload.data.status !== input.status)) {
    throw new Error("The outreach draft update returned an invalid response.");
  }
  return { sample: false, data: payload.data };
}

export async function generateOutreachDraft(prospect: HRProspectRecord): Promise<{ sample: false; data: OutreachDraft }> {
  const payload = await strictApi<{ data?: unknown }>("/api/hr-outreach-drafts", {
    method: "POST",
    body: JSON.stringify({ prospectId: prospect.id }),
  });
  if (!isOutreachDraft(payload.data) || payload.data.prospect.id !== prospect.id) {
    throw new Error("The outreach draft generator returned an invalid response.");
  }
  return { sample: false, data: payload.data };
}

// -- Hi-Hunt email threads (contract: GET /api/email-threads, GET/POST /:id) --

export type EmailParty = { name: string | null; address: string };
export type EmailThreadStatus = "needs_reply" | "replied";
export type EmailInterestCategory = "Interested" | "Follow-up" | "Uninterested";
export type EmailMessageRecord = {
  id: string;
  direction: "inbound" | "outbound";
  from: EmailParty;
  to: EmailParty[];
  occurredAt: string;
  body: string;
};
export type EmailThreadSummary = {
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
  category?: EmailInterestCategory;
};
export type EmailThreadRecord = EmailThreadSummary & { messages: EmailMessageRecord[] };
export type EmailThreadsResult = { sample: boolean; data: EmailThreadSummary[]; total: number; unread: number };
export type EmailThreadDetailResult = { sample: boolean; data: EmailThreadRecord | null };
export type EmailReplyResult = {
  sample: false;
  sent: true;
  threadId: string;
  messageId: string;
  sentAt: string;
};

function isEmailParty(value: unknown): value is EmailParty {
  return isRecord(value)
    && (value.name === null || typeof value.name === "string")
    && isNonEmptyString(value.address);
}

function isEmailThreadSummary(value: unknown): value is EmailThreadSummary {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && (value.prospectId === null || isNonEmptyString(value.prospectId))
    && (value.workflowId === null || isNonEmptyString(value.workflowId))
    && typeof value.workflowName === "string"
    && isEmailParty(value.sender)
    && typeof value.subject === "string"
    && typeof value.snippet === "string"
    && isTimestamp(value.lastMessageAt)
    && typeof value.unread === "boolean"
    && ["needs_reply", "replied"].includes(String(value.status))
    && (value.category === undefined || ["Interested", "Follow-up", "Uninterested"].includes(String(value.category)));
}

function isEmailMessageRecord(value: unknown): value is EmailMessageRecord {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && (value.direction === "inbound" || value.direction === "outbound")
    && isEmailParty(value.from)
    && Array.isArray(value.to)
    && value.to.length > 0
    && value.to.every(isEmailParty)
    && isTimestamp(value.occurredAt)
    && typeof value.body === "string";
}

function isEmailThreadRecord(value: unknown): value is EmailThreadRecord {
  if (!isRecord(value)) return false;
  const record = value;
  return isEmailThreadSummary(record)
    && Array.isArray(value.messages)
    && value.messages.every(isEmailMessageRecord);
}

const SAMPLE_EMAIL_THREADS: EmailThreadRecord[] = [
  {
    id: "email-thread-1",
    prospectId: "p1",
    workflowId: "workflow-hr-leaders",
    workflowName: "Singapore HR leaders",
    sender: { name: "Rachel Tan", address: "rachel.tan@vertexlogistics.example" },
    subject: "Re: Supporting Vertex Logistics' HR team",
    snippet: "Could you send the one-pager?",
    lastMessageAt: "2026-08-26T04:18:00.000Z",
    unread: true,
    status: "needs_reply",
    category: "Interested",
    messages: [
      {
        id: "email-message-1", direction: "outbound",
        from: { name: "Hilite", address: "jj@hilite.example" },
        to: [{ name: "Rachel Tan", address: "rachel.tan@vertexlogistics.example" }],
        occurredAt: "2026-08-25T03:00:00.000Z",
        body: "Hi Rachel, could I share a short overview of our workplace seminars?",
      },
      {
        id: "email-message-2", direction: "inbound",
        from: { name: "Rachel Tan", address: "rachel.tan@vertexlogistics.example" },
        to: [{ name: "Hilite", address: "jj@hilite.example" }],
        occurredAt: "2026-08-26T04:18:00.000Z", body: "Could you send the one-pager?",
      },
    ],
  },
  {
    id: "email-thread-2",
    prospectId: "p2",
    workflowId: "workflow-hr-leaders",
    workflowName: "Singapore HR leaders",
    sender: { name: "Daniel Koh", address: "daniel.koh@nimbushealth.example" },
    subject: "Re: Employee financial wellness at Nimbus Health",
    snippet: "Thanks, we have what we need for now.",
    lastMessageAt: "2026-08-25T09:10:00.000Z",
    unread: false,
    status: "replied",
    category: "Uninterested",
    messages: [
      {
        id: "email-message-3", direction: "outbound",
        from: { name: "Hilite", address: "jj@hilite.example" },
        to: [{ name: "Daniel Koh", address: "daniel.koh@nimbushealth.example" }],
        occurredAt: "2026-08-24T02:30:00.000Z", body: "Hi Daniel, would a short introduction be useful?",
      },
      {
        id: "email-message-4", direction: "inbound",
        from: { name: "Daniel Koh", address: "daniel.koh@nimbushealth.example" },
        to: [{ name: "Hilite", address: "jj@hilite.example" }],
        occurredAt: "2026-08-25T09:10:00.000Z", body: "Thanks, we have what we need for now.",
      },
    ],
  },
];

function cloneEmailThread(thread: EmailThreadRecord): EmailThreadRecord {
  return {
    ...thread,
    sender: { ...thread.sender },
    messages: thread.messages.map((message) => ({
      ...message,
      from: { ...message.from },
      to: message.to.map((recipient) => ({ ...recipient })),
    })),
  };
}

function emailThreadSummary(thread: EmailThreadRecord): EmailThreadSummary {
  const { messages: _messages, ...summary } = thread;
  return summary;
}

export async function getEmailThreads(): Promise<EmailThreadsResult> {
  const attempt = await attemptApi<{ data?: unknown; total?: unknown; unread?: unknown }>("/api/email-threads");
  if (attempt.kind === "live") {
    const data = attempt.data.data;
    if (!Array.isArray(data)
      || !data.every(isEmailThreadSummary)
      || !isNonNegativeInteger(attempt.data.total)
      || attempt.data.total !== data.length
      || !isNonNegativeInteger(attempt.data.unread)
      || attempt.data.unread !== data.filter((thread) => thread.unread).length) {
      throw new Error("The email thread list returned an invalid response.");
    }
    return { sample: false, data, total: attempt.data.total, unread: attempt.data.unread };
  }
  if (attempt.kind === "failed") throw attempt.error;
  const data = SAMPLE_EMAIL_THREADS.map(cloneEmailThread).map(emailThreadSummary);
  return { sample: true, data, total: data.length, unread: data.filter((thread) => thread.unread).length };
}

export async function getEmailThread(id: string): Promise<EmailThreadDetailResult> {
  if (!isNonEmptyString(id)) throw new Error("Choose an email thread to open.");
  const attempt = await attemptApi<{ data?: unknown }>(`/api/email-threads/${encodeURIComponent(id)}`);
  if (attempt.kind === "live") {
    if (!isEmailThreadRecord(attempt.data.data) || attempt.data.data.id !== id) {
      throw new Error("The email thread detail returned an invalid response.");
    }
    return { sample: false, data: attempt.data.data };
  }
  if (attempt.kind === "failed") throw attempt.error;
  const collection = await getEmailThreads();
  if (!collection.sample) return { sample: false, data: null };
  const thread = SAMPLE_EMAIL_THREADS.find((item) => item.id === id);
  return { sample: true, data: thread ? cloneEmailThread(thread) : null };
}

export async function replyToEmailThread(
  id: string,
  body: string,
  idempotencyKey: string,
): Promise<EmailReplyResult> {
  if (!isNonEmptyString(id)) throw new Error("Choose an email thread to reply to.");
  if (!isNonEmptyString(body)) throw new Error("Write a reply before sending.");
  if (!isNonEmptyString(idempotencyKey)) throw new Error("The email reply needs an idempotency key.");
  const payload = await strictApi<Partial<EmailReplyResult>>(
    `/api/email-threads/${encodeURIComponent(id)}/reply`,
    { method: "POST", body: JSON.stringify({ body, idempotencyKey }) },
  );
  if (payload.sent !== true || payload.threadId !== id || !isNonEmptyString(payload.messageId) || !isTimestamp(payload.sentAt)) {
    throw new Error("The email reply returned an invalid response.");
  }
  return { sample: false, sent: true, threadId: id, messageId: payload.messageId, sentAt: payload.sentAt };
}

// -- Connected email account (contract: GET/POST /api/email-account) --------

export type EmailProvider = "google" | "microsoft";
export type EmailSendingCap = { limit: number; used: number; remaining: number };
export type EmailAccountRecord = {
  status: "disconnected" | "connecting" | "connected" | "error";
  provider: EmailProvider | null;
  address: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  error: string | null;
  cap: EmailSendingCap;
};
export type EmailAccountResult = { sample: boolean; data: EmailAccountRecord };
export type EmailAccountConnectAction = { action: "connect"; provider: EmailProvider };
export type EmailAccountDisconnectAction = { action: "disconnect" };
export type EmailAccountSendTestAction = { action: "send-test" };
export type EmailAccountAction = EmailAccountConnectAction | EmailAccountDisconnectAction | EmailAccountSendTestAction;
export type EmailAccountConnectResult = { sample: false; action: "connect"; authorizationUrl: string };
export type EmailAccountDisconnectResult = { sample: false; action: "disconnect"; data: EmailAccountRecord };
export type EmailAccountSendTestResult = { sample: false; action: "send-test"; sent: true; messageId: string };
export type EmailAccountMutationResult = EmailAccountConnectResult | EmailAccountDisconnectResult | EmailAccountSendTestResult;

function isEmailSendingCap(value: unknown): value is EmailSendingCap {
  return isRecord(value)
    && isNonNegativeInteger(value.limit)
    && isNonNegativeInteger(value.used)
    && isNonNegativeInteger(value.remaining)
    && value.remaining === Math.max(0, value.limit - value.used);
}

function isEmailAccountRecord(value: unknown): value is EmailAccountRecord {
  if (!isRecord(value) || !isEmailSendingCap(value.cap)) return false;
  const commonFieldsAreValid = (value.provider === null || value.provider === "google" || value.provider === "microsoft")
    && (value.address === null || isNonEmptyString(value.address))
    && (value.displayName === null || typeof value.displayName === "string")
    && (value.connectedAt === null || isTimestamp(value.connectedAt))
    && (value.lastSyncAt === null || isTimestamp(value.lastSyncAt))
    && (value.error === null || isNonEmptyString(value.error));
  if (!commonFieldsAreValid) return false;
  if (value.status === "connected") {
    return (value.provider === "google" || value.provider === "microsoft")
      && isNonEmptyString(value.address)
      && isTimestamp(value.connectedAt)
      && value.error === null;
  }
  if (value.status === "connecting") {
    return (value.provider === "google" || value.provider === "microsoft")
      && value.address === null
      && value.displayName === null
      && value.connectedAt === null
      && value.lastSyncAt === null
      && value.error === null;
  }
  if (value.status === "error") {
    return isNonEmptyString(value.error);
  }
  return value.status === "disconnected"
    && value.provider === null
    && value.address === null
    && value.displayName === null
    && value.connectedAt === null
    && value.lastSyncAt === null
    && value.error === null;
}

const SAMPLE_EMAIL_ACCOUNT: EmailAccountRecord = {
  status: "connected",
  provider: "google",
  address: "jj@hilite.example",
  displayName: "JJ",
  connectedAt: "2026-08-20T03:00:00.000Z",
  lastSyncAt: "2026-08-26T01:00:00.000Z",
  error: null,
  cap: { limit: 50, used: 12, remaining: 38 },
};

function isAuthorizationUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function getEmailAccount(): Promise<EmailAccountResult> {
  const attempt = await attemptApi<{ data?: unknown }>("/api/email-account");
  if (attempt.kind === "live") {
    if (!isEmailAccountRecord(attempt.data.data)) {
      throw new Error("The email account returned an invalid response.");
    }
    return { sample: false, data: attempt.data.data };
  }
  if (attempt.kind === "failed") throw attempt.error;
  return { sample: true, data: { ...SAMPLE_EMAIL_ACCOUNT, cap: { ...SAMPLE_EMAIL_ACCOUNT.cap } } };
}

export function updateEmailAccount(input: EmailAccountConnectAction): Promise<EmailAccountConnectResult>;
export function updateEmailAccount(input: EmailAccountDisconnectAction): Promise<EmailAccountDisconnectResult>;
export function updateEmailAccount(input: EmailAccountSendTestAction): Promise<EmailAccountSendTestResult>;
export async function updateEmailAccount(input: EmailAccountAction): Promise<EmailAccountMutationResult> {
  if (!isRecord(input)) throw new Error("Choose a valid email account action.");
  const keys = Object.keys(input);
  if ((input.action === "connect"
    && (keys.length !== 2 || !("provider" in input) || (input.provider !== "google" && input.provider !== "microsoft")))
    || ((input.action === "disconnect" || input.action === "send-test") && keys.length !== 1)
    || !["connect", "disconnect", "send-test"].includes(String(input.action))) {
    throw new Error("Choose a valid email account action.");
  }
  const payload = await strictApi<Record<string, unknown>>("/api/email-account", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (input.action === "connect") {
    if (!isAuthorizationUrl(payload.authorizationUrl)) {
      throw new Error("The email account connection returned an invalid response.");
    }
    return { sample: false, action: "connect", authorizationUrl: payload.authorizationUrl };
  }
  if (input.action === "disconnect") {
    if (!isEmailAccountRecord(payload.data) || payload.data.status !== "disconnected") {
      throw new Error("The email account disconnect returned an invalid response.");
    }
    return { sample: false, action: "disconnect", data: payload.data };
  }
  if (payload.sent !== true || !isNonEmptyString(payload.messageId)) {
    throw new Error("The test email returned an invalid response.");
  }
  return { sample: false, action: "send-test", sent: true, messageId: payload.messageId };
}

// ── Settings (contract: GET/PUT /api/hihunt-settings) ─────────────────────

export type HiHuntSettings = {
  discovery: { location: string; companyDomain: string; seniorities: string[]; dailyLimit: number; autoRunEnabled: boolean };
  outreach: { valueProp: string; senderName: string; signoff: string };
};
export type HiHuntSettingsResult = { sample: boolean; data: HiHuntSettings };

const SETTINGS_KEY = "hihunt-settings-v1";

export const DEFAULT_SETTINGS: HiHuntSettings = {
  discovery: { location: "Singapore", companyDomain: "", seniorities: ["vp", "head", "director", "manager"], dailyLimit: 300, autoRunEnabled: true },
  outreach: { valueProp: "We run practical financial-wellness seminars that HR teams in Singapore offer as a free employee benefit.", senderName: "Hilite", signoff: "Warm regards" },
};

function isHiHuntSettings(value: unknown): value is HiHuntSettings {
  return isRecord(value)
    && isRecord(value.discovery)
    && isRecord(value.outreach)
    && typeof value.discovery.location === "string"
    && typeof value.discovery.companyDomain === "string"
    && isStringArray(value.discovery.seniorities)
    && isNonNegativeInteger(value.discovery.dailyLimit)
    && typeof value.discovery.autoRunEnabled === "boolean"
    && typeof value.outreach.valueProp === "string"
    && typeof value.outreach.senderName === "string"
    && typeof value.outreach.signoff === "string";
}

function cloneHiHuntSettings(settings: HiHuntSettings): HiHuntSettings {
  return {
    discovery: { ...settings.discovery, seniorities: [...settings.discovery.seniorities] },
    outreach: { ...settings.outreach },
  };
}

function hiHuntSettingsMatch(left: HiHuntSettings, right: HiHuntSettings) {
  return left.discovery.location === right.discovery.location
    && left.discovery.companyDomain === right.discovery.companyDomain
    && left.discovery.dailyLimit === right.discovery.dailyLimit
    && left.discovery.autoRunEnabled === right.discovery.autoRunEnabled
    && left.discovery.seniorities.length === right.discovery.seniorities.length
    && left.discovery.seniorities.every((value, index) => value === right.discovery.seniorities[index])
    && left.outreach.valueProp === right.outreach.valueProp
    && left.outreach.senderName === right.outreach.senderName
    && left.outreach.signoff === right.outreach.signoff;
}

export async function getSettings(): Promise<HiHuntSettingsResult> {
  const attempt = await attemptApi<{ data?: unknown }>("/api/hihunt-settings");
  if (attempt.kind === "live") {
    if (!isHiHuntSettings(attempt.data.data)) {
      throw new Error("The Hi-Hunt settings returned an invalid response.");
    }
    return { sample: false, data: attempt.data.data };
  }
  if (attempt.kind === "failed") throw attempt.error;
  return { sample: true, data: cloneHiHuntSettings(DEFAULT_SETTINGS) };
}

export function loadSettings(): HiHuntSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<HiHuntSettings>;
    return {
      discovery: { ...DEFAULT_SETTINGS.discovery, ...(parsed.discovery || {}) },
      outreach: { ...DEFAULT_SETTINGS.outreach, ...(parsed.outreach || {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: HiHuntSettings): Promise<{ sample: false }> {
  if (!isHiHuntSettings(settings)) throw new Error("Enter valid Hi-Hunt settings before saving.");
  const payload = await strictApi<{ data?: unknown }>("/api/hihunt-settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  if (!isHiHuntSettings(payload.data) || !hiHuntSettingsMatch(payload.data, settings)) {
    throw new Error("The settings update returned an invalid response.");
  }
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Local persistence is best-effort; the settings still apply this session.
  }
  return { sample: false };
}
