type WorkflowDigestSource = {
  id: string;
  name: string;
  lastRun: {
    id: string;
    status: "running" | "completed" | "failed";
    found: number;
    skippedDuplicates: number;
    drafted: number;
    startedAt: string;
    completedAt: string | null;
  } | null;
  nextRunAt: string | null;
};

type PendingEmailDraft = {
  id: string;
  workflowId?: string | null;
  workflowName?: string | null;
  prospect: { full_name: string };
  subject: string;
  body: string;
  status: string;
};

type EmailThreadSummary = {
  id: string;
  workflowId: string | null;
  workflowName: string;
  sender: { name: string | null; address: string };
  subject: string;
  snippet: string;
  lastMessageAt: string;
  status: "needs_reply" | "replied";
};

type EmailCap = {
  limit: number;
  used: number;
  remaining: number;
};

type WorkflowDigest = {
  id: string;
  name: string;
  found: number | null;
  skippedDuplicates: number | null;
  drafted: number | null;
  runStatus: "running" | "completed" | "failed" | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  nextRunCountdown: string;
};

type PendingEmailGroup<T extends PendingEmailDraft = PendingEmailDraft> = {
  id: string;
  title: string;
  items: T[];
};

type PendingEmailQueue<T extends PendingEmailDraft = PendingEmailDraft> = {
  groups: PendingEmailGroup<T>[];
  actionableItems: T[];
  deferredCount: number;
};

type DraftEdits = Record<string, { subject: string; body: string }>;

type OutreachApprovalResult = {
  approved: number;
  draftIds: string[];
  retryableDraftIds: string[];
};

type OutreachApprovalUpdate = {
  approvedDraftIds: string[];
  approvedCount: number;
  retryableCount: number;
  retryableMessage: string | null;
};

type HiHuntHomeSummary = {
  foundOvernight: number | null;
  pendingEmails: number;
  repliesThisWeek: number;
  replyRate: number | null;
  repliesReceived: number;
  emailsWithoutReply: number;
  needsReplyThreads: number;
};

type ReplyHighlight = {
  id: string;
  senderName: string;
  senderAddress: string;
  subject: string;
  snippet: string;
  workflowName: string;
  lastMessageAt: string;
  status: EmailThreadSummary["status"];
  href: string;
};

function formatNextRunCountdown(nextRunAt: string | null, now = new Date()) {
  if (!nextRunAt) return "Not scheduled";
  const nextTime = new Date(nextRunAt).getTime();
  const nowTime = now.getTime();
  if (!Number.isFinite(nextTime) || !Number.isFinite(nowTime)) return "Not scheduled";
  const remainingMinutes = Math.ceil((nextTime - nowTime) / 60_000);
  if (remainingMinutes <= 0) return "Due now";
  const days = Math.floor(remainingMinutes / (24 * 60));
  const hours = Math.floor((remainingMinutes % (24 * 60)) / 60);
  const minutes = remainingMinutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  return `in ${minutes}m`;
}

function projectWorkflowDigests(
  workflows: readonly WorkflowDigestSource[],
  now = new Date(),
): WorkflowDigest[] {
  return workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name.trim() || "Untitled workflow",
    found: workflow.lastRun?.found ?? null,
    skippedDuplicates: workflow.lastRun?.skippedDuplicates ?? null,
    drafted: workflow.lastRun?.drafted ?? null,
    runStatus: workflow.lastRun?.status ?? null,
    lastRunAt: workflow.lastRun?.completedAt ?? workflow.lastRun?.startedAt ?? null,
    nextRunAt: workflow.nextRunAt,
    nextRunCountdown: formatNextRunCountdown(workflow.nextRunAt, now),
  }));
}

function groupPendingEmails<T extends PendingEmailDraft>(drafts: readonly T[]): PendingEmailGroup<T>[] {
  const groups = new Map<string, PendingEmailGroup<T>>();
  for (const draft of drafts) {
    if (draft.status !== "draft") continue;
    const workflowId = draft.workflowId?.trim() || "unassigned";
    const workflowName = draft.workflowName?.trim() || "Unassigned workflow";
    const existing = groups.get(workflowId);
    if (existing) existing.items.push(draft);
    else groups.set(workflowId, { id: workflowId, title: workflowName, items: [draft] });
  }
  return [...groups.values()];
}

function buildPendingEmailQueue<T extends PendingEmailDraft>(
  drafts: readonly T[],
  hiddenDraftIds: ReadonlySet<string>,
  allowance: number,
): PendingEmailQueue<T> {
  const visible = drafts.filter((draft) => draft.status === "draft" && !hiddenDraftIds.has(draft.id));
  const safeAllowance = Math.max(0, Math.floor(allowance));
  const actionableItems = visible.slice(0, safeAllowance);
  return {
    groups: groupPendingEmails(actionableItems),
    actionableItems,
    deferredCount: Math.max(0, visible.length - actionableItems.length),
  };
}

function getEmailCapDisplay(cap: EmailCap | null, approvedCount: number): EmailCap {
  const limit = Math.max(0, Math.floor(cap?.limit ?? 0));
  const used = Math.min(limit, Math.max(0, (cap?.used ?? 0) + approvedCount));
  return {
    limit,
    used,
    remaining: Math.floor(Math.max(0, limit - used)),
  };
}

function hasDraftEdits<T extends Pick<PendingEmailDraft, "id" | "subject" | "body">>(
  drafts: readonly T[],
  edits: Readonly<DraftEdits>,
) {
  return drafts.some((draft) => {
    const edit = edits[draft.id];
    return edit !== undefined && (edit.subject !== draft.subject || edit.body !== draft.body);
  });
}

function getOutreachApprovalUpdate<T extends Pick<PendingEmailDraft, "id">>(
  drafts: readonly T[],
  result: OutreachApprovalResult,
): OutreachApprovalUpdate {
  const requestedIds = new Set(drafts.map((draft) => draft.id));
  const approvedDraftIds = result.draftIds.filter((draftId) => requestedIds.has(draftId));
  const approvedCount = approvedDraftIds.length;
  const retryableCount = result.retryableDraftIds.filter((draftId) => requestedIds.has(draftId)).length;
  const sentLabel = `${approvedCount} ${approvedCount === 1 ? "email was" : "emails were"} sent.`;
  const retryLabel = `${retryableCount} ${retryableCount === 1 ? "email remains" : "emails remain"} queued and can be retried.`;
  return {
    approvedDraftIds,
    approvedCount,
    retryableCount,
    retryableMessage: retryableCount > 0 ? `${sentLabel} ${retryLabel}` : null,
  };
}

function summarizeHiHuntHome({
  digests,
  drafts,
  threads,
  now = new Date(),
}: {
  digests: readonly WorkflowDigest[];
  drafts: readonly PendingEmailDraft[];
  threads: readonly EmailThreadSummary[];
  now?: Date;
}): HiHuntHomeSummary {
  const knownFoundCounts = digests.flatMap((digest) => digest.found === null ? [] : [digest.found]);
  const weekCutoff = now.getTime() - 7 * 24 * 60 * 60 * 1_000;
  const repliesThisWeek = threads.filter((thread) => {
    const timestamp = new Date(thread.lastMessageAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= weekCutoff && timestamp <= now.getTime();
  }).length;
  const sentEmails = drafts.filter((draft) => draft.status !== "draft").length;
  const repliesReceived = threads.length;
  const needsReplyThreads = threads.filter((thread) => thread.status === "needs_reply").length;
  return {
    foundOvernight: knownFoundCounts.length
      ? knownFoundCounts.reduce((total, count) => total + count, 0)
      : null,
    pendingEmails: drafts.filter((draft) => draft.status === "draft").length,
    repliesThisWeek,
    replyRate: sentEmails === 0 ? null : Math.min(100, Math.round((repliesReceived / sentEmails) * 100)),
    repliesReceived,
    emailsWithoutReply: Math.max(0, sentEmails - repliesReceived),
    needsReplyThreads,
  };
}

function buildReplyHighlights<T extends EmailThreadSummary>(threads: readonly T[], limit = 4): ReplyHighlight[] {
  return [...threads]
    .sort((left, right) => {
      const rightTime = new Date(right.lastMessageAt).getTime();
      const leftTime = new Date(left.lastMessageAt).getTime();
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    })
    .slice(0, Math.max(0, limit))
    .map((thread) => ({
      id: thread.id,
      senderName: thread.sender.name?.trim() || thread.sender.address,
      senderAddress: thread.sender.address,
      subject: thread.subject,
      snippet: thread.snippet,
      workflowName: thread.workflowName || "Unassigned",
      lastMessageAt: thread.lastMessageAt,
      status: thread.status,
      href: `/hihunt/inbox/${encodeURIComponent(thread.id)}`,
    }));
}

export {
  buildPendingEmailQueue,
  buildReplyHighlights,
  formatNextRunCountdown,
  getEmailCapDisplay,
  getOutreachApprovalUpdate,
  groupPendingEmails,
  hasDraftEdits,
  projectWorkflowDigests,
  summarizeHiHuntHome,
};
export type {
  DraftEdits,
  EmailCap,
  EmailThreadSummary,
  HiHuntHomeSummary,
  OutreachApprovalResult,
  OutreachApprovalUpdate,
  PendingEmailDraft,
  PendingEmailGroup,
  PendingEmailQueue,
  ReplyHighlight,
  WorkflowDigest,
  WorkflowDigestSource,
};
