import type { EmailInterestCategory, EmailMessageRecord, EmailThreadRecord, EmailThreadSummary } from "../../lib/stubs";

type InterestFilterValue = "all" | EmailInterestCategory;

type InterestFilterOption = {
  value: InterestFilterValue;
  label: string;
  count: number;
};

type PendingEmailMessage = EmailMessageRecord & {
  idempotencyKey: string;
  deliveryState: "sending" | "failed";
};

function filterAndSortEmailThreads(
  threads: readonly EmailThreadSummary[],
  query: string,
  category: InterestFilterValue,
): EmailThreadSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  return threads
    .filter((thread) => category === "all" || getEmailInterestCategory(thread) === category)
    .filter((thread) => {
      if (!normalizedQuery) return true;
      return [thread.sender.name, thread.sender.address, thread.subject, thread.snippet, thread.workflowName]
        .some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => {
      if (left.unread !== right.unread) return left.unread ? -1 : 1;
      return Date.parse(right.lastMessageAt) - Date.parse(left.lastMessageAt);
    });
}

function classifyEmailInterest(value: string): EmailInterestCategory {
  const text = value.toLowerCase().replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(?:not interested|no thanks|no thank you|not a fit|not for (?:me|us)|please remove|remove me|unsubscribe|opt[ -]?out|do not contact|don't contact|declin(?:e|ed|ing)|we(?:'ll| will) pass|i(?:'ll| will) pass)\b/.test(text)) {
    return "Uninterested";
  }
  if (/\b(?:yes|interested|keen|tell me more|sounds good|i(?:'m| am) in|count me in|sign me up|register me|send (?:me )?(?:the )?(?:details|information|info|brochure|poster)|could you send|would like|love to|happy to|schedule|book (?:a )?(?:call|meeting))\b/.test(text)) {
    return "Interested";
  }
  return "Follow-up";
}

function getEmailInterestCategory(thread: EmailThreadSummary): EmailInterestCategory {
  return thread.category ?? classifyEmailInterest(thread.snippet);
}

function getInterestFilterOptions(threads: readonly EmailThreadSummary[]): InterestFilterOption[] {
  const categories: readonly EmailInterestCategory[] = ["Interested", "Follow-up", "Uninterested"];
  return [
    { value: "all", label: "All", count: threads.filter((thread) => thread.unread).length },
    ...categories.map((category) => ({
      value: category,
      label: category,
      count: threads.filter((thread) => thread.unread && getEmailInterestCategory(thread) === category).length,
    })),
  ];
}

function getEmailThreadHref(id: string): string {
  return `/hihunt/inbox/${encodeURIComponent(id)}`;
}

function getEmailThreadRequestDecision(
  lastRequest: string,
  threadId: string | undefined,
  retry: number,
): { nextRequest: string; shouldLoad: boolean } {
  if (!threadId) return { nextRequest: "", shouldLoad: false };
  const nextRequest = `${threadId}:${retry}`;
  return { nextRequest, shouldLoad: lastRequest !== nextRequest };
}

function isEmailThreadDetailRequestCurrent(
  request: number,
  latestRequest: number,
  replyGeneration: number,
  latestReplyGeneration: number | undefined,
): boolean {
  return request === latestRequest && (latestReplyGeneration ?? 0) === replyGeneration;
}

function toEmailThreadSummary(thread: EmailThreadRecord): EmailThreadSummary {
  const { messages: _messages, ...summary } = thread;
  return summary;
}

function upsertEmailThreadSummary(
  threads: readonly EmailThreadSummary[],
  next: EmailThreadSummary,
): EmailThreadSummary[] {
  if (!threads.some((thread) => thread.id === next.id)) return [next, ...threads];
  return threads.map((thread) => thread.id === next.id ? next : thread);
}

function upsertNewestEmailThreadSummary(
  threads: readonly EmailThreadSummary[],
  next: EmailThreadSummary,
): EmailThreadSummary[] {
  const current = threads.find((thread) => thread.id === next.id);
  if (!current) return [next, ...threads];
  const currentTime = Date.parse(current.lastMessageAt);
  const nextTime = Date.parse(next.lastMessageAt);
  if (!Number.isNaN(currentTime) && (Number.isNaN(nextTime) || currentTime > nextTime)) return [...threads];
  return threads.map((thread) => thread.id === next.id ? next : thread);
}

function reconcileSuccessfulEmailReply(
  thread: EmailThreadRecord,
  pending: PendingEmailMessage,
  messageId: string,
  sentAt: string,
): EmailThreadRecord {
  const { deliveryState: _deliveryState, idempotencyKey: _idempotencyKey, ...message } = pending;
  const sentMessage: EmailMessageRecord = { ...message, id: messageId, occurredAt: sentAt };
  const existingIndex = thread.messages.findIndex((item) => item.id === messageId);
  const messages = existingIndex >= 0
    ? thread.messages.map((item, index) => index === existingIndex ? sentMessage : item)
    : [...thread.messages, sentMessage];
  messages.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.id.localeCompare(right.id));

  const currentTime = Date.parse(thread.lastMessageAt);
  const sentTime = Date.parse(sentAt);
  const sentIsNewest = Number.isNaN(currentTime) || (!Number.isNaN(sentTime) && sentTime >= currentTime);
  return {
    ...thread,
    messages,
    snippet: sentIsNewest ? pending.body : thread.snippet,
    lastMessageAt: sentIsNewest ? sentAt : thread.lastMessageAt,
    unread: sentIsNewest ? false : thread.unread,
    status: sentIsNewest ? "replied" : thread.status,
  };
}

function removePendingEmail<T extends { id: string }>(
  pendingByThread: Readonly<Record<string, readonly T[]>>,
  threadId: string,
  pendingId: string,
): Record<string, T[]> {
  const next = Object.fromEntries(Object.entries(pendingByThread).map(([key, items]) => [key, [...items]])) as Record<string, T[]>;
  const remaining = next[threadId]?.filter((item) => item.id !== pendingId);
  if (!remaining || remaining.length === 0) delete next[threadId];
  else next[threadId] = remaining;
  return next;
}

export {
  classifyEmailInterest,
  filterAndSortEmailThreads,
  getEmailThreadHref,
  getEmailThreadRequestDecision,
  getInterestFilterOptions,
  isEmailThreadDetailRequestCurrent,
  reconcileSuccessfulEmailReply,
  removePendingEmail,
  toEmailThreadSummary,
  upsertEmailThreadSummary,
  upsertNewestEmailThreadSummary,
};
export type { InterestFilterOption, InterestFilterValue, PendingEmailMessage };
