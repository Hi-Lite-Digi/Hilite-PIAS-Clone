import type { ReplyCategory, ReplyConversationRecord, ReplyMessageRecord } from "../../lib/api";
import type { Status } from "../components/system";

export type CampaignFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type MessageDayGroup = {
  key: string;
  label: string;
  messages: ReplyMessageRecord[];
};

export type PendingReplyMessage = ReplyMessageRecord & {
  deliveryState?: "sending" | "failed";
  idempotencyKey: string;
  caption?: string;
  attachmentPath?: string;
  attachmentMimeType?: string;
};

type ScrollMetrics = Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">;

export function isAwayFromLatestMessage(metrics: ScrollMetrics, threshold = 96): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight > threshold;
}

export function filterAndSortThreads(
  threads: readonly ReplyConversationRecord[],
  query: string,
  campaignId: string,
): ReplyConversationRecord[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return threads
    .filter((thread) => campaignId === "all" || thread.campaignId === campaignId)
    .filter((thread) => {
      if (!normalizedQuery) return true;
      return [
        thread.leadName,
        thread.preview,
        thread.campaign,
        thread.subject,
        thread.phone,
        thread.email,
      ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => {
      if (left.read !== right.read) return left.read ? 1 : -1;
      return Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    });
}

export function getCampaignFilterOptions(
  threads: readonly ReplyConversationRecord[],
): CampaignFilterOption[] {
  const campaigns = new Map<string, { label: string; count: number }>();
  for (const thread of threads) {
    if (!thread.campaignId || thread.read) continue;
    const current = campaigns.get(thread.campaignId);
    campaigns.set(thread.campaignId, {
      label: thread.campaign,
      count: (current?.count ?? 0) + 1,
    });
  }

  const campaignOptions = [...campaigns.entries()]
    .map(([value, campaign]) => ({ value, label: campaign.label, count: campaign.count }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [
    { value: "all", label: "All", count: threads.filter((thread) => !thread.read).length },
    ...campaignOptions,
  ];
}

export function getThreadHref(id: string | number): string {
  return `/reengage/inbox/${encodeURIComponent(String(id))}`;
}

export function getThreadIdentity(thread: ReplyConversationRecord): string {
  if (thread.leadId !== null) return `lead:${thread.leadId}`;
  const phone = thread.phone?.replace(/\D/g, "") ?? "";
  return phone ? `phone:${phone}` : `thread:${thread.id}`;
}

export function findMatchingThread(
  threads: readonly ReplyConversationRecord[],
  current: ReplyConversationRecord,
): ReplyConversationRecord | null {
  const identity = getThreadIdentity(current);
  return threads.find((thread) => getThreadIdentity(thread) === identity) ?? null;
}

export function getThreadRequestDecision(
  lastRequest: string,
  threadId: string | undefined,
  retry: number,
): { nextRequest: string; shouldLoad: boolean } {
  if (!threadId) return { nextRequest: "", shouldLoad: false };
  const nextRequest = `${threadId}:${retry}`;
  return { nextRequest, shouldLoad: lastRequest !== nextRequest };
}

export function upsertThread(
  threads: readonly ReplyConversationRecord[],
  next: ReplyConversationRecord,
): ReplyConversationRecord[] {
  if (!threads.some((thread) => thread.id === next.id)) return [next, ...threads];
  return threads.map((thread) => (thread.id === next.id ? next : thread));
}

export function reconcileSuccessfulReply(
  thread: ReplyConversationRecord,
  pending: PendingReplyMessage,
  messageId: string | null,
): ReplyConversationRecord {
  const {
    deliveryState: _deliveryState,
    idempotencyKey: _idempotencyKey,
    caption: _caption,
    attachmentPath: _attachmentPath,
    attachmentMimeType: _attachmentMimeType,
    ...optimisticMessage
  } = pending;
  const sentMessage: ReplyMessageRecord = {
    ...optimisticMessage,
    id: messageId ?? pending.id,
  };
  const messages = thread.thread.some((message) => message.id === sentMessage.id)
    ? thread.thread
    : [...thread.thread, sentMessage];
  const latestMessage = messages.reduce((latest, message) => {
    const latestTime = Date.parse(latest.occurredAt);
    const messageTime = Date.parse(message.occurredAt);
    const normalizedLatestTime = Number.isNaN(latestTime) ? Number.NEGATIVE_INFINITY : latestTime;
    const normalizedMessageTime = Number.isNaN(messageTime) ? Number.NEGATIVE_INFINITY : messageTime;
    if (normalizedMessageTime !== normalizedLatestTime) {
      return normalizedMessageTime > normalizedLatestTime ? message : latest;
    }
    return String(message.id).localeCompare(String(latest.id)) > 0 ? message : latest;
  });
  const currentTime = Date.parse(thread.occurredAt);
  const latestTime = Date.parse(latestMessage.occurredAt);
  const keepCurrentPreview = !Number.isNaN(currentTime)
    && (Number.isNaN(latestTime) || currentTime > latestTime);
  return {
    ...thread,
    preview: keepCurrentPreview ? thread.preview : latestMessage.body,
    occurredAt: keepCurrentPreview ? thread.occurredAt : latestMessage.occurredAt,
    thread: messages,
  };
}

export function removePendingReply<T extends { id: string }>(
  pendingByThread: Readonly<Record<string, readonly T[]>>,
  conversationId: number,
  pendingId: string,
): Record<string, T[]> {
  const key = String(conversationId);
  const messages = pendingByThread[key];
  if (!messages?.some((message) => message.id === pendingId)) {
    return Object.fromEntries(
      Object.entries(pendingByThread).map(([threadKey, pending]) => [threadKey, [...pending]]),
    );
  }
  const remaining = messages.filter((message) => message.id !== pendingId);
  const next = Object.fromEntries(
    Object.entries(pendingByThread).map(([threadKey, pending]) => [threadKey, [...pending]]),
  ) as Record<string, T[]>;
  if (remaining.length === 0) delete next[key];
  else next[key] = remaining;
  return next;
}

export function getCategoryPresentation(
  category: ReplyCategory,
): { label: string; status: Status } {
  switch (category) {
    case "Interested":
      return { label: "Interested", status: "done" };
    case "Unsubscribe":
      return { label: "Stop", status: "error" };
    case "Not Interested":
      return { label: "Maybe next time", status: "paused" };
    case "Question":
      return { label: "Question", status: "queued" };
    case "Follow-up":
      return { label: "Follow-up", status: "running" };
    case "Out of Office":
      return { label: "Away", status: "paused" };
  }
}

export function groupMessagesByDay(messages: readonly ReplyMessageRecord[]): MessageDayGroup[] {
  const sorted = [...messages].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  const groups = new Map<string, ReplyMessageRecord[]>();

  for (const message of sorted) {
    const date = new Date(message.occurredAt);
    const key = Number.isNaN(date.getTime())
      ? "unknown"
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    groups.set(key, [...(groups.get(key) ?? []), message]);
  }

  return [...groups.entries()].map(([key, dayMessages]) => {
    const date = new Date(dayMessages[0]?.occurredAt ?? "");
    return {
      key,
      label: Number.isNaN(date.getTime())
        ? "Earlier"
        : new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(date),
      messages: dayMessages,
    };
  });
}
