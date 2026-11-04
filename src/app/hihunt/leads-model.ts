import type { HRProspectRecord } from "../../lib/api";
import type { Status } from "../components/system";

type HiHuntLeadStatus = "new" | "queued" | "contacted" | "replied" | "suppressed";
type LeadLifecycleSummary = Record<HiHuntLeadStatus, number>;

type LeadLifecycleStats = {
  newCount: number | null;
  repliedCount: number | null;
  source: "authoritative" | "loaded" | "incomplete";
};

type LeadHistorySourceStatus = "loading" | "live" | "sample" | "error";
type LeadHistorySources = {
  drafts: LeadHistorySourceStatus;
  threads: LeadHistorySourceStatus;
};

type LeadHistoryPresentation = {
  complete: boolean;
  loading: boolean;
  showSample: boolean;
  state: "complete" | "loading" | "sample" | "error";
};

type VerificationPresentation = {
  label: "Verified" | "Public listing" | "Not verified" | "Not checked" | "Invalid";
  tone: Status;
};

type OutreachDraftLike = {
  id: string;
  prospect: { id: string };
  subject: string;
  status: "draft" | "approved" | "copied" | "contacted";
  workflowId?: string | null;
  workflowName?: string | null;
  created_at: string;
};

type EmailThreadLike = {
  id: string;
  prospectId: string | null;
  workflowId: string | null;
  workflowName: string;
  subject: string;
  lastMessageAt: string;
};

type LeadHistoryItem = {
  id: string;
  subject: string;
  workflowName: string;
  occurredAt: string;
  threadId: string | null;
  status: "drafted" | "queued" | "contacted" | "replied";
};

type HiHuntLeadRow = {
  prospect: HRProspectRecord;
  status: HiHuntLeadStatus | null;
  verification: VerificationPresentation;
  history: LeadHistoryItem[];
};

type LifecycleEvidence = {
  draftsAvailable: boolean;
  threadsAvailable: boolean;
};

type LeadFilters = {
  search: string;
  status: HiHuntLeadStatus | "all";
  verification: "verified" | "unverified" | "all";
};

function getEmailVerification(emailStatus: string | null, provider?: HRProspectRecord["provider"]): VerificationPresentation {
  if (emailStatus === "verified") return { label: "Verified", tone: "done" };
  if (emailStatus === "public" && provider === "public_web") return { label: "Public listing", tone: "queued" };
  if (["invalid", "undeliverable", "bounced"].includes(String(emailStatus).toLowerCase())) {
    return { label: "Invalid", tone: "error" };
  }
  if (!emailStatus) return { label: "Not checked", tone: "draft" };
  return { label: "Not verified", tone: "draft" };
}

function getLeadLifecycleStats(
  rows: readonly Pick<HiHuntLeadRow, "status">[],
  lifecycle: LeadLifecycleSummary | null,
  capReached: boolean,
): LeadLifecycleStats {
  if (lifecycle) {
    return { newCount: lifecycle.new, repliedCount: lifecycle.replied, source: "authoritative" };
  }
  if (capReached || rows.some((row) => row.status === null)) {
    return { newCount: null, repliedCount: null, source: "incomplete" };
  }
  return {
    newCount: rows.filter((row) => row.status === "new").length,
    repliedCount: rows.filter((row) => row.status === "replied").length,
    source: "loaded",
  };
}

function getLeadHistoryPresentation(sources: LeadHistorySources): LeadHistoryPresentation {
  const values = [sources.drafts, sources.threads];
  const loading = values.includes("loading");
  const showSample = values.includes("sample");
  const complete = values.every((value) => value === "live");
  const state = loading
    ? "loading"
    : values.includes("error")
      ? "error"
      : showSample
        ? "sample"
        : "complete";
  return { complete, loading, showSample, state };
}

function getLifecycleStatus(
  prospect: HRProspectRecord,
  drafts: readonly OutreachDraftLike[],
  threads: readonly EmailThreadLike[],
  evidence: LifecycleEvidence = { draftsAvailable: true, threadsAvailable: true },
): HiHuntLeadStatus | null {
  if (prospect.status) return prospect.status;
  if (evidence.threadsAvailable && threads.length > 0) return "replied";
  if (evidence.draftsAvailable && drafts.some((draft) => draft.status === "approved" || draft.status === "contacted" || draft.status === "copied")) return "contacted";
  if (evidence.draftsAvailable && drafts.some((draft) => draft.status === "draft")) return "queued";
  if (!evidence.draftsAvailable || !evidence.threadsAvailable) return null;
  return "new";
}

function sortByNewest<T extends { occurredAt: string }>(items: T[]): T[] {
  return items.sort((left, right) => {
    const delta = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    return Number.isFinite(delta) ? delta : 0;
  });
}

function buildHiHuntLeadRows(
  prospects: readonly HRProspectRecord[],
  drafts: readonly OutreachDraftLike[],
  threads: readonly EmailThreadLike[],
  evidence: LifecycleEvidence = { draftsAvailable: true, threadsAvailable: true },
): HiHuntLeadRow[] {
  return prospects.map((prospect) => {
    const prospectDrafts = drafts.filter((draft) => draft.prospect.id === prospect.id);
    const prospectThreads = threads.filter((thread) => thread.prospectId === prospect.id);
    const threadSubjects = new Set(prospectThreads.map((thread) => thread.subject.trim().toLowerCase()));
    const history: LeadHistoryItem[] = sortByNewest([
      ...prospectThreads.map((thread) => ({
        id: `thread:${thread.id}`,
        subject: thread.subject,
        workflowName: thread.workflowName || "Unassigned",
        occurredAt: thread.lastMessageAt,
        threadId: thread.id,
        status: "replied" as const,
      })),
      ...prospectDrafts
        .filter((draft) => !threadSubjects.has(draft.subject.trim().toLowerCase()))
        .map((draft) => ({
          id: `draft:${draft.id}`,
          subject: draft.subject,
          workflowName: draft.workflowName || "Unassigned",
          occurredAt: draft.created_at,
          threadId: null,
          status: draft.status === "draft" ? "queued" as const : "contacted" as const,
        })),
    ]);
    return {
      prospect,
      status: getLifecycleStatus(prospect, prospectDrafts, prospectThreads, evidence),
      verification: getEmailVerification(prospect.email_status, prospect.provider),
      history,
    };
  });
}

function filterHiHuntLeadRows(rows: readonly HiHuntLeadRow[], filters: LeadFilters): HiHuntLeadRow[] {
  const query = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.verification === "verified" && row.verification.label !== "Verified") return false;
    if (filters.verification === "unverified" && row.verification.label === "Verified") return false;
    if (!query) return true;
    return [
      row.prospect.full_name,
      row.prospect.job_title,
      row.prospect.company_name,
      row.prospect.work_email,
    ].some((value) => String(value ?? "").toLowerCase().includes(query));
  });
}

const leadStatusTone: Record<HiHuntLeadStatus, Status> = {
  new: "draft",
  queued: "queued",
  contacted: "running",
  replied: "done",
  suppressed: "paused",
};

const leadStatusLabel: Record<HiHuntLeadStatus, string> = {
  new: "New",
  queued: "Queued",
  contacted: "Contacted",
  replied: "Replied",
  suppressed: "Unsubscribed",
};

export {
  buildHiHuntLeadRows,
  filterHiHuntLeadRows,
  getEmailVerification,
  getLeadHistoryPresentation,
  getLeadLifecycleStats,
  getLifecycleStatus,
  leadStatusLabel,
  leadStatusTone,
};
export type {
  EmailThreadLike,
  HiHuntLeadRow,
  HiHuntLeadStatus,
  LifecycleEvidence,
  LeadHistoryPresentation,
  LeadHistorySources,
  LeadHistorySourceStatus,
  LeadLifecycleStats,
  LeadLifecycleSummary,
  LeadFilters,
  LeadHistoryItem,
  OutreachDraftLike,
  VerificationPresentation,
};
