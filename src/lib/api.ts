export type LeadRecord = {
  id: number;
  source_row: number;
  name: string;
  age: number | null;
  age_band: string | null;
  phone: string | null;
  email: string | null;
  dob: string | null;
  topics: string[];
  status: string | null;
  struck: boolean;
  subscribed: boolean;
  unsubscribed_at: string | null;
  first_captured: string | null;
  remarks: string | null;
  source_tabs: string | null;
};

export type CreateLeadInput = {
  name: string;
  email?: string;
  phone?: string;
  dob?: string;
  topics?: string[];
  status?: string;
  source?: string;
  remarks?: string;
};

export type UpdateLeadInput = Partial<CreateLeadInput>;

export type LeadDeletionImpact = {
  lead: Pick<LeadRecord, "id" | "name" | "email" | "phone">;
  campaignRecipients: number;
  whatsappMessages: number;
};

export type WorkspaceSummary = {
  total: number;
  sendable: number;
  whatsappReachable?: number;
  addedThisMonth?: number;
  ageBands: Record<string, number>;
  statuses: Record<string, number>;
  topics: { name: string; count: number }[];
  assistant: AssistantStatus;
};

export type AssistantStatus = {
  configured: boolean;
  mode: "gpt" | "rules" | "fallback";
  model: string | null;
  provider: "OpenAI" | null;
};

export type CampaignAudience = {
  template?: string;
  ageBands: string[];
  minAge?: number | null;
  maxAge?: number | null;
  topics: string[];
  statuses: string[];
  includedLeadIds?: number[];
  excludedLeadIds?: number[];
  delivery?: CampaignDelivery;
};

export type CampaignDelivery = {
  channel: "whatsapp" | "email";
  senderEmail: string | null;
  scheduledAt: string | null;
  ctaUrl: string | null;
  reminderDates: string[];
};

export type EmailSenderStatus = {
  configured: boolean;
  provider: "Gmail";
  address: string | null;
  displayName: string | null;
  requirement: string | null;
  clientConfigured?: boolean;
  sendingEnabled?: boolean;
};

export type EmailCampaignSendResult = {
  sent: number;
  failed: number;
  senderEmail: string;
  data: CampaignRecord;
};

export type CampaignRecord = {
  id: string;
  title: string;
  poster_name: string | null;
  poster_path: string | null;
  subject: string;
  message: string;
  audience: CampaignAudience;
  audience_count: number;
  delivery_total?: number;
  delivery_sent?: number;
  status: "draft" | "queued" | "sending" | "sent" | "paused";
  created_at: string;
  updated_at: string;
};

export type TemplateDelivery = {
  id: string;
  campaign_id: string;
  lead_id: number;
  phone: string;
  status: "draft" | "sending" | "accepted" | "sent" | "delivered" | "read" | "failed" | "unknown" | "suppressed";
  failure_reason: string | null;
  lead: Pick<LeadRecord, "id" | "name" | "phone" | "subscribed" | "struck">;
};

export type OutreachActivity = {
  campaigns: CampaignRecord[];
  activity: Array<{ id: string; campaign_id: string | null; name: string; campaignTitle: string; phone: string; status: TemplateDelivery["status"]; occurred_at: string; status_at?: string; failure_reason: string | null }>;
  truncated: boolean;
};
export function getOutreachActivity() { return api<OutreachActivity>("/api/outreach-activity"); }
export function checkOutreachConnection() { return api<{ ready: boolean; requirements: string[] }>("/api/meta-whatsapp", { method: "POST", body: JSON.stringify({ action: "status" }) }); }

export function getTemplateCampaign(id: string) {
  return api<{ data: CampaignRecord; deliveries: TemplateDelivery[]; leads: Pick<LeadRecord, "id" | "name" | "phone" | "email" | "subscribed" | "struck">[]; fixedTemplate: boolean }>(`/api/campaigns/${encodeURIComponent(id)}/template`);
}

export function startTemplateCampaign(id: string) {
  return api<{ deliveries: TemplateDelivery[] }>(`/api/campaigns/${encodeURIComponent(id)}/start-template`, { method: "POST", body: JSON.stringify({ confirmed: true }) });
}

export function sendTemplateCampaignRecipient(id: string, deliveryId: string) {
  return api<{ accepted: boolean; trackingSaved: boolean; deliveryConfirmed: boolean }>(`/api/campaigns/${encodeURIComponent(id)}/send-template`, { method: "POST", body: JSON.stringify({ deliveryId, confirmed: true }) });
}

export type AssistantLeadPreview = {
  id: number;
  name: string;
  age: number | null;
  age_band: string | null;
  phone: string | null;
  email: string;
  topics: string[];
  status: string | null;
  selected?: boolean;
  autoMatched?: boolean;
  manuallyAdded?: boolean;
};

export type AudiencePreviewFilters = {
  search?: string;
  ageBand?: string;
  topic?: string;
  status?: string;
  browseAll?: boolean;
};

export type PosterDraftReply = {
  draft: { title: string; subject: string; message: string };
  audience: CampaignAudience;
  eventStartsAt: string | null;
  count: number;
  rationale: string;
  warning?: string;
  ai: AssistantStatus;
};

export type HRPosterDraftReply = {
  draft: { title: string; subject: string; body: string };
  rationale: string;
  warning?: string;
  ai: AssistantStatus;
};

export type PosterUploadTicket = {
  uploadUrl: string;
  path: string;
  maxBytes: number;
};

export type WhatsAppGatewayStatus = {
  configured: boolean;
  connected: boolean;
  provider: "Hermes";
  channel: "WhatsApp";
  accountName: string | null;
  deliveryReady: boolean;
  bridgeStatus?: "connected" | "disconnected" | "unavailable" | "unknown";
  diagnosticCode?: "bridge_unavailable" | "whatsapp_disconnected" | null;
  requirements: string[];
};

export type WhatsAppSendResult = {
  sent: true;
  deliveryMode: "hermes_direct";
  messageId?: string | null;
  recipient: { id: number; name: string; phone: string };
  data: CampaignRecord;
  warning: string | null;
};

export type WhatsAppDryRunResult = {
  ready: boolean;
  connected: boolean;
  provider: "Hermes";
  recipient: { id: number; name: string; phone: string };
  requirement: string | null;
};

export type ReplyCategory = "Interested" | "Not Interested" | "Question" | "Out of Office" | "Follow-up" | "Unsubscribe";

export type ReplyMessageRecord = {
  id: string;
  from: "lead" | "us";
  senderName: string;
  senderContact: string;
  occurredAt: string;
  body: string;
  attachment?: {
    kind: "image" | "sticker";
    name: string;
    url?: string | null;
    mimeType?: string | null;
  };
};

export type ReplyConversationRecord = {
  id: number;
  leadId: number | null;
  campaignId: string | null;
  leadName: string;
  initials: string;
  color: string;
  company: string;
  title: string;
  email: string;
  phone: string | null;
  campaign: string;
  subject: string;
  preview: string;
  occurredAt: string;
  read: boolean;
  starred: boolean;
  category: ReplyCategory;
  thread: ReplyMessageRecord[];
};

export type HiHuntLeadStatus = "new" | "queued" | "contacted" | "replied" | "suppressed";
export type HRProspectProvider = "apollo" | "hunter" | "pdl" | "rocketreach" | "lusha" | "cognism" | "public_web";

export type HRProspectRecord = {
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
  status?: HiHuntLeadStatus;
  provider: HRProspectProvider;
  source_url?: string | null;
  name_source?: string | null;
  discovered_at: string;
  updated_at: string;
};

export type HRDiscoverySummary = {
  total: number;
  verified: number;
  new: number;
  lifecycle?: Record<HiHuntLeadStatus, number>;
  lastRun: {
    id: string;
    status: "running" | "completed" | "failed";
    provider?: "apollo" | "multi_provider";
    triggered_by?: "manual" | "cron";
    requested_count?: number;
    searched_count?: number;
    saved_count: number;
    verified_count: number;
    filters?: {
      perProviderLimit?: number;
      configuredCapacity?: number;
      providers?: HRProspectProvider[];
      providersUsed?: HRProspectProvider[];
      providerResults?: Array<{
        provider: HRProspectProvider;
        limit: number;
        searched: number;
        enriched: number;
        saved: number;
      }>;
      providerErrors?: Array<{
        provider: HRProspectProvider;
        message: string;
        limitReached?: boolean;
      }>;
    };
    error_message?: string | null;
    started_at: string;
    completed_at: string | null;
  } | null;
};

export type HRDiscoveryProvider = {
  name: "Multi-provider waterfall";
  configured: boolean;
  mode: "licensed-data-provider";
  personalEmails: false;
  personalPhones: false;
  dailyTarget?: number;
  perProviderLimit?: number;
  configuredCapacity?: number;
  providers: Array<{
    id: HRProspectProvider | "linkedin";
    name: string;
    configured: boolean;
    mode: "automated" | "manual-only";
  }>;
};

export type HRDiscoveryInput = {
  location: string;
  companyDomain?: string;
  seniorities: string[];
  limit: number;
};

export type HRProspectQuery = {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
  includeSuppressed?: boolean;
};

export type HRProspectsResult = {
  data: HRProspectRecord[];
  total: number;
  limit: number;
  offset: number;
  summary: HRDiscoverySummary;
  provider: HRDiscoveryProvider;
};

export type HRCampaignStatus = "draft" | "sending" | "sent" | "partial" | "failed";

export type HRCampaignRecord = {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: HRCampaignStatus;
  sender_email: string;
  audience_count: number;
  sent_count: number;
  failed_count: number;
  poster_name: string | null;
  poster_path: string | null;
  poster_mime_type: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HRCampaignDetail = HRCampaignRecord & {
  recipient_ids: string[];
};

export type CreateHRCampaignInput = {
  name: string;
  subject: string;
  body: string;
  recipientIds: string[];
  posterName?: string | null;
  posterPath?: string | null;
  posterMimeType?: string | null;
};

export type SendHRCampaignResult = {
  sent: number;
  failed: number;
  skipped: number;
  data: HRCampaignRecord;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw new Error("HiHunt could not reach its service. Refresh the app and try again");
  }

  const rawBody = await response.text();
  let body: { error?: string } & Partial<T> = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as { error?: string } & Partial<T>;
    } catch {
      if (!response.ok) throw new Error("HiHunt's service is temporarily unavailable. Please try again");
      throw new Error("HiHunt received an invalid service response. Please try again");
    }
  }
  if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("hilite-session-expired"));
  if (!response.ok) throw new Error(body.error || "The request could not be completed");
  return body as T;
}

export function configureGmailClient(clientId: string, clientSecret: string) {
  return api<{ saved: boolean }>("/api/gmail/client", { method: "POST", body: JSON.stringify({ clientId, clientSecret }) });
}

export function startGmailConnection() {
  return api<{ url: string }>("/api/gmail/start", { method: "POST", body: "{}" });
}

export type PublicHRDiscoveryResult = { saved: number; pages: number; details: Array<{ domain: string; found: number; saved: number; note: string | null }> };
export function discoverPublicHR(domains: string) {
  return api<PublicHRDiscoveryResult>("/api/public-hr-discovery", { method: "POST", body: JSON.stringify({ domains }) });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

export function isHRProspectRecord(value: unknown): value is HRProspectRecord {
  if (!isObject(value)) return false;
  return isNonEmptyString(value.id)
    && typeof value.full_name === "string"
    && (typeof value.first_name === "string" || value.first_name === null)
    && (typeof value.last_name === "string" || value.last_name === null)
    && typeof value.job_title === "string"
    && (typeof value.seniority === "string" || value.seniority === null)
    && (typeof value.company_name === "string" || value.company_name === null)
    && (typeof value.company_domain === "string" || value.company_domain === null)
    && (typeof value.work_email === "string" || value.work_email === null)
    && (typeof value.email_status === "string" || value.email_status === null)
    && (typeof value.linkedin_url === "string" || value.linkedin_url === null)
    && (typeof value.location === "string" || value.location === null)
    && typeof value.hr_match_reason === "string"
    && ["new", "reviewed", "qualified", "rejected", "converted"].includes(String(value.review_status))
    && (value.status === undefined
      || ["new", "queued", "contacted", "replied", "suppressed"].includes(String(value.status)))
    && ["apollo", "hunter", "pdl", "rocketreach", "lusha", "cognism", "public_web"].includes(String(value.provider))
    && isTimestamp(value.discovered_at)
    && isTimestamp(value.updated_at);
}

function isHRDiscoverySummary(value: unknown): value is HRDiscoverySummary {
  if (!isObject(value)
    || !isNonNegativeInteger(value.total)
    || !isNonNegativeInteger(value.verified)
    || !isNonNegativeInteger(value.new)) return false;
  if (value.lifecycle !== undefined) {
    const lifecycle = value.lifecycle;
    if (!isObject(lifecycle)
      || !(["new", "queued", "contacted", "replied", "suppressed"] as const)
        .every((status) => isNonNegativeInteger(lifecycle[status]))) return false;
  }
  if (value.lastRun === null) return true;
  return isObject(value.lastRun)
    && typeof value.lastRun.id === "string"
    && ["running", "completed", "failed"].includes(String(value.lastRun.status))
    && isNonNegativeInteger(value.lastRun.saved_count)
    && isNonNegativeInteger(value.lastRun.verified_count)
    && (value.lastRun.requested_count === undefined || isNonNegativeInteger(value.lastRun.requested_count))
    && (value.lastRun.searched_count === undefined || isNonNegativeInteger(value.lastRun.searched_count))
    && (value.lastRun.error_message === undefined || value.lastRun.error_message === null || typeof value.lastRun.error_message === "string")
    && isTimestamp(value.lastRun.started_at)
    && (isTimestamp(value.lastRun.completed_at) || value.lastRun.completed_at === null);
}

function isHRDiscoveryProvider(value: unknown): value is HRDiscoveryProvider {
  return isObject(value)
    && value.name === "Multi-provider waterfall"
    && typeof value.configured === "boolean"
    && value.mode === "licensed-data-provider"
    && value.personalEmails === false
    && value.personalPhones === false
    && (value.dailyTarget === undefined || isNonNegativeInteger(value.dailyTarget))
    && (value.perProviderLimit === undefined || isNonNegativeInteger(value.perProviderLimit))
    && (value.configuredCapacity === undefined || isNonNegativeInteger(value.configuredCapacity))
    && Array.isArray(value.providers)
    && value.providers.every((provider) => isObject(provider)
      && ["apollo", "hunter", "pdl", "rocketreach", "lusha", "cognism", "linkedin"].includes(String(provider.id))
      && isNonEmptyString(provider.name)
      && typeof provider.configured === "boolean"
      && ["automated", "manual-only"].includes(String(provider.mode)));
}

function isHRProspectsResult(value: unknown): value is HRProspectsResult {
  return isObject(value)
    && Array.isArray(value.data)
    && value.data.every(isHRProspectRecord)
    && isNonNegativeInteger(value.total)
    && value.total >= value.data.length
    && isNonNegativeInteger(value.limit)
    && value.data.length <= value.limit
    && isNonNegativeInteger(value.offset)
    && isHRDiscoverySummary(value.summary)
    && isHRDiscoveryProvider(value.provider);
}

function isHRCampaignRecord(value: unknown): value is HRCampaignRecord {
  return isObject(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.name)
    && isNonEmptyString(value.subject)
    && isNonEmptyString(value.body)
    && ["draft", "sending", "sent", "partial", "failed"].includes(String(value.status))
    && isNonEmptyString(value.sender_email)
    && isNonNegativeInteger(value.audience_count)
    && isNonNegativeInteger(value.sent_count)
    && isNonNegativeInteger(value.failed_count)
    && value.sent_count + value.failed_count <= value.audience_count
    && (typeof value.poster_name === "string" || value.poster_name === null)
    && (typeof value.poster_path === "string" || value.poster_path === null)
    && (typeof value.poster_mime_type === "string" || value.poster_mime_type === null)
    && (value.sent_at === null || isTimestamp(value.sent_at))
    && isTimestamp(value.created_at)
    && isTimestamp(value.updated_at);
}

function isHRCampaignDetail(value: unknown): value is HRCampaignDetail {
  if (!isHRCampaignRecord(value)) return false;
  const recipientIds = (value as HRCampaignRecord & { recipient_ids?: unknown }).recipient_ids;
  return Array.isArray(recipientIds)
    && recipientIds.every(isNonEmptyString)
    && new Set(recipientIds).size === recipientIds.length;
}

export function isLeadRecord(value: unknown): value is LeadRecord {
  return isObject(value)
    && typeof value.id === "number"
    && Number.isInteger(value.id)
    && typeof value.source_row === "number"
    && Number.isInteger(value.source_row)
    && typeof value.name === "string"
    && ((typeof value.age === "number" && Number.isFinite(value.age)) || value.age === null)
    && (typeof value.age_band === "string" || value.age_band === null)
    && (typeof value.phone === "string" || value.phone === null)
    && (typeof value.email === "string" || value.email === null)
    && (typeof value.dob === "string" || value.dob === null)
    && Array.isArray(value.topics)
    && value.topics.every((topic) => typeof topic === "string")
    && (typeof value.status === "string" || value.status === null)
    && typeof value.struck === "boolean"
    && typeof value.subscribed === "boolean"
    && (typeof value.unsubscribed_at === "string" || value.unsubscribed_at === null)
    && (typeof value.first_captured === "string" || value.first_captured === null)
    && (typeof value.remarks === "string" || value.remarks === null)
    && (typeof value.source_tabs === "string" || value.source_tabs === null);
}

function normaliseCampaignAudience(value: Record<string, unknown>) {
  for (const key of ["ageBands", "topics", "statuses"] as const) {
    if (value[key] === undefined) value[key] = [];
    else if (!Array.isArray(value[key]) || !value[key].every((item) => typeof item === "string")) return false;
  }
  if (value.delivery !== undefined) {
    if (!isObject(value.delivery)
      || (value.delivery.channel !== "whatsapp" && value.delivery.channel !== "email")
      || (value.delivery.senderEmail !== null && typeof value.delivery.senderEmail !== "string")
      || (value.delivery.scheduledAt !== null && typeof value.delivery.scheduledAt !== "string")
      || (value.delivery.ctaUrl !== null && typeof value.delivery.ctaUrl !== "string")
      || !Array.isArray(value.delivery.reminderDates)
      || !value.delivery.reminderDates.every((item) => typeof item === "string")) return false;
  }
  return true;
}

function isCampaignRecord(value: unknown): value is CampaignRecord {
  if (!isObject(value) || !isObject(value.audience) || !normaliseCampaignAudience(value.audience)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && (typeof value.poster_name === "string" || value.poster_name === null)
    && (typeof value.poster_path === "string" || value.poster_path === null)
    && typeof value.subject === "string"
    && typeof value.message === "string"
    && typeof value.audience_count === "number"
    && (value.delivery_total === undefined || typeof value.delivery_total === "number")
    && (value.delivery_sent === undefined || typeof value.delivery_sent === "number")
    && ["draft", "queued", "sending", "sent", "paused"].includes(String(value.status))
    && typeof value.created_at === "string"
    && typeof value.updated_at === "string";
}

export function getSummary() {
  return api<WorkspaceSummary>("/api/summary");
}

export function getLeads(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  return api<{ data: LeadRecord[]; total: number; limit: number; offset: number }>(`/api/leads?${search}`);
}

export async function createLead(input: CreateLeadInput) {
  const result = await api<{ data?: unknown }>("/api/leads", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!isLeadRecord(result.data)) throw new Error("The lead create returned an invalid response.");
  return { data: result.data };
}

export async function updateLead(id: number, input: UpdateLeadInput) {
  const result = await api<{ data?: unknown }>(`/api/leads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!isLeadRecord(result.data) || result.data.id !== id) {
    throw new Error("The lead update returned an invalid response.");
  }
  return { data: result.data };
}

export function getLeadDeletionImpact(id: number) {
  return api<{ data: LeadDeletionImpact }>(`/api/leads/${encodeURIComponent(id)}/deletion-impact`);
}

export async function deleteLead(id: number) {
  const result = await api<{ deleted?: unknown; id?: unknown }>(`/api/leads/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (result.deleted !== true || result.id !== id) throw new Error("The lead delete returned an invalid response.");
  return { deleted: true as const, id };
}

export function getCampaigns() {
  return api<{ data: CampaignRecord[] }>("/api/campaigns");
}

export async function deleteCampaign(id: string) {
  const result = await api<{ deleted?: unknown; id?: unknown }>(`/api/campaigns/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (result.deleted !== true || result.id !== id) throw new Error("The campaign delete returned an invalid response.");
  return { deleted: true as const, id };
}

export async function getHRProspects(params: HRProspectQuery = {}): Promise<HRProspectsResult> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const result = await api<unknown>(`/api/hr-prospects?${search}`);
  if (!isHRProspectsResult(result)) throw new Error("The HR prospect list returned an invalid response.");
  return result;
}

export function runHRDiscovery(input: HRDiscoveryInput) {
  return api<{
    runId: string;
    searched: number;
    enriched: number;
    saved: number;
    verified: number;
    provider: "Multi-provider waterfall";
    providers: HRProspectProvider[];
    providerResults: Array<{
      provider: HRProspectProvider;
      limit: number;
      searched: number;
      enriched: number;
      saved: number;
    }>;
    providerErrors: Array<{ provider: HRProspectProvider; message: string; limitReached: boolean }>;
    requested: number;
    capacity: number;
    shortfall: number;
    searchPage: number;
  }>("/api/hr-discovery", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getHRCampaigns(): Promise<{ data: HRCampaignRecord[] }> {
  const result = await api<{ data?: unknown }>("/api/hr-campaigns");
  if (!Array.isArray(result.data) || !result.data.every(isHRCampaignRecord)) {
    throw new Error("The Hi-Hunt campaign list returned an invalid response.");
  }
  return { data: result.data };
}

export async function getHRCampaign(id: string): Promise<{ data: HRCampaignDetail }> {
  const result = await api<{ data?: unknown }>(`/api/hr-campaigns/${encodeURIComponent(id)}`);
  if (!isHRCampaignDetail(result.data) || result.data.id !== id) {
    throw new Error("The Hi-Hunt campaign details returned an invalid response.");
  }
  return { data: result.data };
}

export async function createHRCampaign(input: CreateHRCampaignInput): Promise<{ data: HRCampaignRecord }> {
  const result = await api<{ data?: unknown }>("/api/hr-campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!isHRCampaignRecord(result.data)) {
    throw new Error("The Hi-Hunt campaign create returned an invalid response.");
  }
  return { data: result.data };
}

export async function updateHRCampaign(id: string, input: CreateHRCampaignInput): Promise<{ data: HRCampaignDetail }> {
  const result = await api<{ data?: unknown }>(`/api/hr-campaigns/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!isHRCampaignDetail(result.data) || result.data.id !== id) {
    throw new Error("The Hi-Hunt campaign update returned an invalid response.");
  }
  return { data: result.data };
}

export async function sendHRCampaign(id: string): Promise<SendHRCampaignResult> {
  const result = await api<Partial<SendHRCampaignResult>>(`/api/hr-campaigns/${encodeURIComponent(id)}/send`, {
    method: "POST",
    body: JSON.stringify({ consentConfirmed: true }),
  });
  if (!isNonNegativeInteger(result.sent)
    || !isNonNegativeInteger(result.failed)
    || !isNonNegativeInteger(result.skipped)
    || !isHRCampaignRecord(result.data)
    || result.data.id !== id) {
    throw new Error("The Hi-Hunt campaign send returned an invalid response.");
  }
  return result as SendHRCampaignResult;
}

export async function deleteHRCampaign(id: string) {
  const result = await api<{ deleted?: unknown; id?: unknown }>(`/api/hr-campaigns/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (result.deleted !== true || result.id !== id) {
    throw new Error("The Hi-Hunt campaign delete returned an invalid response.");
  }
  return { deleted: true as const, id };
}

export function getWhatsAppStatus() {
  return api<WhatsAppGatewayStatus>("/api/integrations/whatsapp");
}

export async function getEmailSenderStatus(preferredAddress?: string | null) {
  const search = new URLSearchParams();
  if (preferredAddress?.trim()) search.set("address", preferredAddress.trim());
  const result = await api<Partial<EmailSenderStatus>>(`/api/email-sender${search.size ? `?${search}` : ""}`);
  if (typeof result.configured !== "boolean"
    || result.provider !== "Gmail"
    || (result.address !== null && typeof result.address !== "string")
    || (result.displayName !== null && typeof result.displayName !== "string")
    || (result.requirement !== null && typeof result.requirement !== "string")) {
    throw new Error("The email sender service returned an invalid response.");
  }
  return result as EmailSenderStatus;
}

export function getReplies() {
  return api<{ data: ReplyConversationRecord[]; total: number; unread: number }>("/api/replies");
}

export function updateReply(id: number, input: { read?: boolean; starred?: boolean; category?: ReplyCategory }) {
  return api<{ data?: unknown }>(`/api/replies/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((result) => {
    if (!isObject(result.data)
      || String(result.data.id) !== String(id)
      || (input.starred !== undefined && result.data.starred !== input.starred)
      || (input.category !== undefined && result.data.category !== input.category)
      || (input.read !== undefined
        && (input.read
          ? typeof result.data.read_at !== "string"
          : result.data.read_at !== null))) {
      throw new Error("The conversation update returned an invalid response.");
    }
    return { data: result.data };
  });
}

export function sendReply(
  id: number,
  message: string,
  idempotencyKey: string,
  image?: { path: string; name: string; mimeType: string },
) {
  return api<{ sent?: unknown; messageId?: unknown }>(`/api/replies/${encodeURIComponent(id)}/send`, {
    method: "POST",
    body: JSON.stringify({ message, idempotencyKey, image }),
  }).then((result) => {
    if (result.sent !== true || (typeof result.messageId !== "string" && result.messageId !== null)) {
      throw new Error("The WhatsApp send returned an invalid response.");
    }
    return { sent: true as const, messageId: result.messageId };
  });
}

export async function createCampaign(input: {
  title: string;
  posterName?: string;
  posterPath?: string;
  subject: string;
  message: string;
  audience: CampaignAudience;
}) {
  const result = await api<{ data?: unknown }>("/api/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!isCampaignRecord(result.data)) throw new Error("The campaign create returned an invalid response.");
  return { data: result.data };
}

export async function updateCampaign(id: string, input: {
  title: string;
  subject: string;
  message: string;
  audience: CampaignAudience;
  posterName?: string;
  posterPath?: string;
}) {
  const result = await api<{ data?: unknown; audienceReset?: unknown }>(`/api/campaigns/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!isCampaignRecord(result.data) || result.data.id !== id || (result.audienceReset !== undefined && typeof result.audienceReset !== "boolean")) {
    throw new Error("The campaign update returned an invalid response.");
  }
  return { data: result.data, ...(typeof result.audienceReset === "boolean" ? { audienceReset: result.audienceReset } : {}) };
}

export async function setCampaignStatus(id: string, status: "paused" | "queued") {
  const result = await api<{ data?: unknown }>(`/api/campaigns/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!isCampaignRecord(result.data) || result.data.id !== id || result.data.status !== status) {
    throw new Error("The campaign status update returned an invalid response.");
  }
  return { data: result.data };
}

export function getAudienceCount(audience: CampaignAudience) {
  return api<{ count: number }>("/api/audience-count", {
    method: "POST",
    body: JSON.stringify({ audience }),
  });
}

export function getAudiencePreview(audience: CampaignAudience, limit = 50, offset = 0, filters: AudiencePreviewFilters = {}, includeExcluded = false) {
  return api<{ data: AssistantLeadPreview[]; total: number; matchingTotal: number; limit: number; offset: number }>("/api/audience-preview", {
    method: "POST",
    body: JSON.stringify({ audience, limit, offset, filters, includeExcluded }),
  });
}

export async function queueCampaign(id: string) {
  const result = await api<{ data?: unknown; queued?: unknown }>(`/api/campaigns/${encodeURIComponent(id)}/queue`, {
    method: "POST",
    body: "{}",
  });
  if (!isCampaignRecord(result.data)
    || result.data.id !== id
    || result.data.status !== "queued"
    || typeof result.queued !== "number"
    || !Number.isInteger(result.queued)
    || result.queued < 0) {
    throw new Error("The campaign queue returned an invalid response.");
  }
  return { data: result.data, queued: result.queued };
}

export function sendCampaignWhatsApp(id: string, leadId: number, consentConfirmed: boolean, message?: string) {
  return api<WhatsAppSendResult>(`/api/campaigns/${id}/send-whatsapp`, {
    method: "POST",
    body: JSON.stringify({ leadId, consentConfirmed, ...(message?.trim() ? { message: message.trim() } : {}) }),
  });
}

export function checkCampaignWhatsApp(id: string, leadId: number) {
  return api<WhatsAppDryRunResult>(`/api/campaigns/${id}/send-whatsapp`, {
    method: "POST",
    body: JSON.stringify({ leadId, dryRun: true }),
  });
}

export async function sendCampaignEmail(id: string, consentConfirmed: boolean) {
  const result = await api<Partial<EmailCampaignSendResult>>(`/api/campaigns/${encodeURIComponent(id)}/send-email`, {
    method: "POST",
    body: JSON.stringify({ consentConfirmed }),
  });
  if (!Number.isInteger(result.sent) || Number(result.sent) < 0
    || !Number.isInteger(result.failed) || Number(result.failed) < 0
    || typeof result.senderEmail !== "string"
    || !isCampaignRecord(result.data)
    || result.data.id !== id) throw new Error("The email campaign send returned an invalid response.");
  return result as EmailCampaignSendResult;
}

export function getPosterUploadTicket(file: File) {
  return api<PosterUploadTicket>("/api/poster-upload-ticket", {
    method: "POST",
    body: JSON.stringify({ posterName: file.name, mimeType: file.type, bytes: file.size }),
  });
}

export function uploadPosterFile(file: File, ticket: PosterUploadTicket, onProgress?: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);

    request.open("PUT", ticket.uploadUrl);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("The poster upload could not reach storage"));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }

      let message = `The poster upload failed (${request.status})`;
      try {
        const payload = JSON.parse(request.responseText) as { error?: string; message?: string };
        message = payload.message || payload.error || message;
      } catch {
        if (request.responseText) message = request.responseText;
      }
      reject(new Error(message));
    };
    request.send(body);
  });
}

export function analyzePoster(input: { posterName: string; posterPath: string; posterMimeType: string }) {
  return api<PosterDraftReply>("/api/poster-draft", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function analyzeHRPoster(input: { posterName: string; posterPath: string; posterMimeType: string }) {
  return api<HRPosterDraftReply>("/api/hr-poster-draft", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
