import type { CampaignRecord, ReplyCategory, ReplyConversationRecord, WorkspaceSummary } from "../../lib/api";
import type { BatchApprovalResult, SendQueueItem, SendQueueResult } from "../../lib/stubs";

type QueueCampaignGroup = {
  id: string;
  title: string;
  items: SendQueueItem[];
};

type CampaignWeekPoint = {
  day: string;
  sent: number;
  today: boolean;
};

type CampaignSnapshot = {
  campaign: CampaignRecord;
  total: number;
  sent: number;
  replies: number;
  interested: number;
  week: CampaignWeekPoint[];
  performanceIsSample: true;
};

type HomeSummary = {
  totalLeads: number | null;
  repliesThisWeek: number;
  replyCategories: { name: ReplyCategory; value: number }[];
  messagesSentThisWeek: number;
  drafts: CampaignRecord[];
};

type BatchApprovalUpdate = {
  approvedItemKeys: string[];
  approvedCount: number;
  retryableCount: number;
  retryableMessage: string | null;
};

type QueueCapDisplay = {
  limit: number;
  used: number;
  remaining: number;
};

const REPLY_CATEGORY_ORDER: ReplyCategory[] = [
  "Interested",
  "Question",
  "Follow-up",
  "Not Interested",
  "Out of Office",
  "Unsubscribe",
];

function getQueueItemKey(item: Pick<SendQueueItem, "campaignId" | "recipientId">) {
  return `${item.campaignId}:${item.recipientId}`;
}

function getQueueItemKeysForRecipients(items: SendQueueItem[], recipientIds: string[]) {
  const approvedRecipientIds = new Set(recipientIds);
  return items
    .filter((item) => approvedRecipientIds.has(item.recipientId))
    .map(getQueueItemKey);
}

function getBatchApprovalUpdate(
  items: SendQueueItem[],
  result: BatchApprovalResult,
): BatchApprovalUpdate {
  const approvedItemKeys = getQueueItemKeysForRecipients(items, result.itemIds);
  const approvedCount = result.itemIds.length;
  const retryableCount = result.retryableItemIds.length;
  const approvedLabel = `${approvedCount} ${approvedCount === 1 ? "message was" : "messages were"} scheduled one minute apart.`;
  const retryableLabel = `${retryableCount} ${retryableCount === 1 ? "message remains" : "messages remain"} queued and can be retried.`;

  return {
    approvedItemKeys,
    approvedCount,
    retryableCount,
    retryableMessage: retryableCount > 0 ? `${approvedLabel} ${retryableLabel}` : null,
  };
}

function getQueueCapDisplay(
  cap: Pick<SendQueueResult["cap"], "limit" | "used"> | null,
  approvedCount: number,
): QueueCapDisplay {
  const limit = cap?.limit ?? 20;
  const used = Math.min(limit, Math.max(0, (cap?.used ?? 0) + approvedCount));
  return {
    limit,
    used,
    remaining: Math.floor(Math.max(0, limit - used)),
  };
}

function groupQueueByCampaign(
  items: SendQueueItem[],
  removedItemKeys: ReadonlySet<string>,
  allowance: number,
): QueueCampaignGroup[] {
  const groups = new Map<string, QueueCampaignGroup>();
  const actionableItems = items
    .filter((item) => !removedItemKeys.has(getQueueItemKey(item)))
    .slice(0, Math.max(0, allowance));

  for (const item of actionableItems) {
    const existing = groups.get(item.campaignId);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(item.campaignId, {
      id: item.campaignId,
      title: item.campaignTitle.trim() || "Untitled campaign",
      items: [item],
    });
  }

  return [...groups.values()];
}

function hasQueueMessageChanges(items: readonly SendQueueItem[], messages: Readonly<Record<string, string>>) {
  return items.some((item) => {
    const edited = messages[getQueueItemKey(item)];
    return edited !== undefined && edited !== item.message;
  });
}

function stableNumber(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

function modelSentCount(campaign: CampaignRecord, total: number, seed: number) {
  if (campaign.status === "sent") return total;
  if (campaign.status === "draft" || campaign.status === "queued") return 0;
  const ratio = campaign.status === "paused" ? 0.42 : 0.38 + (seed % 42) / 100;
  return Math.min(total, Math.round(total * ratio));
}

function getWeekLabels(now: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    if (index === 6) return "Today";
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - index));
    return date.toLocaleDateString("en-SG", { weekday: "short" });
  });
}

function buildModelledWeek(sent: number, seed: number, now: Date): CampaignWeekPoint[] {
  const weekLabels = getWeekLabels(now);
  if (sent === 0) return weekLabels.map((day, index) => ({ day, sent: 0, today: index === 6 }));

  const weights = weekLabels.map((_, index) => 1 + ((seed >> (index * 3)) & 7));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const exactValues = weights.map((weight) => (sent * weight) / totalWeight);
  const sentByDay = exactValues.map(Math.floor);
  const remainder = sent - sentByDay.reduce((sum, value) => sum + value, 0);
  const remainderOrder = exactValues
    .map((value, index) => ({ fraction: value - sentByDay[index], index }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < remainder; index += 1) {
    sentByDay[remainderOrder[index].index] += 1;
  }

  return weekLabels.map((day, index) => ({
    day,
    sent: sentByDay[index],
    today: index === 6,
  }));
}

function buildCampaignSnapshot(
  campaign: CampaignRecord,
  replies: ReplyConversationRecord[],
  now = new Date(),
): CampaignSnapshot {
  const total = Math.max(0, Math.floor(Number(campaign.audience_count) || 0));
  const campaignReplies = replies.filter((reply) => reply.campaignId === campaign.id);
  const seed = stableNumber(campaign.id);
  const sent = modelSentCount(campaign, total, seed);

  return {
    campaign,
    total,
    sent,
    replies: campaignReplies.length,
    interested: campaignReplies.filter((reply) => reply.category === "Interested").length,
    week: buildModelledWeek(sent, seed, now),
    performanceIsSample: true,
  };
}

function summarizeHome({
  summary,
  campaigns,
  replies,
  now = new Date(),
}: {
  summary: WorkspaceSummary | null;
  campaigns: CampaignRecord[];
  replies: ReplyConversationRecord[];
  now?: Date;
}): HomeSummary {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1_000;
  const recentReplies = replies.filter((reply) => {
    const occurredAt = new Date(reply.occurredAt).getTime();
    return Number.isFinite(occurredAt) && occurredAt >= cutoff && occurredAt <= now.getTime();
  });

  const replyCategories = REPLY_CATEGORY_ORDER.map((name) => ({
    name,
    value: recentReplies.filter((reply) => reply.category === name).length,
  })).filter(({ value }) => value > 0);

  return {
    totalLeads: summary?.total ?? null,
    repliesThisWeek: recentReplies.length,
    replyCategories,
    messagesSentThisWeek: campaigns
      .filter((campaign) => campaign.status !== "draft")
      .reduce((total, campaign) => (
        total + buildCampaignSnapshot(campaign, replies, now).week.reduce((weekTotal, point) => weekTotal + point.sent, 0)
      ), 0),
    drafts: campaigns.filter((campaign) => campaign.status === "draft"),
  };
}

export {
  buildCampaignSnapshot,
  getBatchApprovalUpdate,
  getQueueCapDisplay,
  getQueueItemKeysForRecipients,
  getQueueItemKey,
  groupQueueByCampaign,
  hasQueueMessageChanges,
  summarizeHome,
};
export type {
  BatchApprovalUpdate,
  CampaignSnapshot,
  CampaignWeekPoint,
  HomeSummary,
  QueueCampaignGroup,
  QueueCapDisplay,
};
