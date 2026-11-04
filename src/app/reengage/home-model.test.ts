import assert from "node:assert/strict";
import test from "node:test";
import type { CampaignRecord, ReplyConversationRecord, WorkspaceSummary } from "../../lib/api";
import type { SendQueueItem } from "../../lib/stubs";
import {
  buildCampaignSnapshot,
  getQueueItemKeysForRecipients,
  getQueueItemKey,
  groupQueueByCampaign,
  hasQueueMessageChanges,
  summarizeHome,
} from "./home-model";

function queueItem(overrides: Partial<SendQueueItem> = {}): SendQueueItem {
  return {
    recipientId: "recipient-1",
    campaignId: "campaign-1",
    campaignTitle: "Welcome back",
    leadId: 1,
    name: "Avery Tan",
    phone: "+65 8123 4567",
    ageBand: "35-44",
    queuedAt: "2026-08-26T02:00:00.000Z",
    message: "Hi Avery, we would love to reconnect.",
    ...overrides,
  };
}

function campaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "campaign-1",
    title: "Welcome back",
    poster_name: null,
    poster_path: null,
    subject: "",
    message: "Hello",
    audience: { ageBands: [], statuses: [], topics: [], excludedLeadIds: [], includedLeadIds: [] },
    audience_count: 12,
    status: "sending",
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

function reply(overrides: Partial<ReplyConversationRecord> = {}): ReplyConversationRecord {
  return {
    id: 1,
    leadId: 1,
    campaignId: "campaign-1",
    leadName: "Avery Tan",
    initials: "AT",
    color: "",
    company: "",
    title: "",
    email: "avery@example.com",
    phone: "+65 8123 4567",
    campaign: "Welcome back",
    subject: "",
    preview: "Yes, please",
    occurredAt: "2026-08-25T00:00:00.000Z",
    read: false,
    starred: false,
    category: "Interested",
    thread: [],
    ...overrides,
  };
}

test("groups the actionable queue by campaign after removals and the daily cap", () => {
  const items = [
    queueItem(),
    queueItem({ recipientId: "recipient-2", leadId: 2, name: "Bea Lim" }),
    queueItem({ recipientId: "recipient-3", campaignId: "campaign-2", campaignTitle: "Renewals" }),
  ];

  const removed = new Set([getQueueItemKey(items[0])]);
  const groups = groupQueueByCampaign(items, removed, 1);

  assert.deepEqual(groups.map((group) => [group.id, group.items.map((item) => item.name)]), [
    ["campaign-1", ["Bea Lim"]],
  ]);
});

test("maps approved recipient ids back to composite UI queue keys", () => {
  const items = [
    queueItem(),
    queueItem({ recipientId: "recipient-2", campaignId: "campaign-2" }),
  ];

  assert.deepEqual(getQueueItemKeysForRecipients(items, ["recipient-2"]), ["campaign-2:recipient-2"]);
});

test("detects queue copy that cannot be persisted by the itemIds-only approval contract", () => {
  const item = queueItem();
  assert.equal(hasQueueMessageChanges([item], {}), false);
  assert.equal(hasQueueMessageChanges([item], { [getQueueItemKey(item)]: item.message }), false);
  assert.equal(hasQueueMessageChanges([item], { [getQueueItemKey(item)]: "Edited copy" }), true);
});

test("builds stable, explicitly-modelled campaign performance from live identity data", () => {
  const record = campaign();
  const replies = [reply(), reply({ id: 2, category: "Question" })];

  const first = buildCampaignSnapshot(record, replies);
  const second = buildCampaignSnapshot(record, replies);

  assert.deepEqual(first, second);
  assert.equal(first.total, 12);
  assert.equal(first.replies, 2);
  assert.equal(first.interested, 1);
  assert.equal(first.week.length, 7);
  assert.equal(first.performanceIsSample, true);
  assert.ok(first.sent >= 0 && first.sent <= first.total);
});

test("labels the rolling campaign week relative to today", () => {
  const snapshot = buildCampaignSnapshot(campaign(), [], new Date("2026-08-30T12:00:00.000Z"));

  assert.deepEqual(snapshot.week.map((point) => point.day), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Today"]);
});

test("distributes a modelled send total honestly across the week", () => {
  const snapshot = buildCampaignSnapshot(
    campaign({ audience_count: 3, status: "sent" }),
    [],
    new Date("2026-08-30T12:00:00.000Z"),
  );

  assert.equal(snapshot.week.reduce((total, point) => total + point.sent, 0), 3);
  assert.ok(snapshot.week.some((point) => point.sent === 0));
});

test("summarizes only replies from the current week and preserves live queue cap usage", () => {
  const summary: WorkspaceSummary = {
    total: 48,
    sendable: 39,
    ageBands: {},
    statuses: {},
    topics: [],
    assistant: { configured: true, mode: "rules", model: null, provider: null },
  };
  const replies = [
    reply({ id: 1, occurredAt: "2026-08-25T12:00:00.000Z", category: "Interested" }),
    reply({ id: 2, occurredAt: "2026-08-19T11:59:59.000Z", category: "Question" }),
  ];

  const result = summarizeHome({
    summary,
    campaigns: [campaign(), campaign({ id: "draft-1", status: "draft" })],
    replies,
    now: new Date("2026-08-26T12:00:00.000Z"),
  });

  assert.equal(result.totalLeads, 48);
  assert.equal(result.repliesThisWeek, 1);
  assert.deepEqual(result.replyCategories, [{ name: "Interested", value: 1 }]);
  assert.ok(result.messagesSentThisWeek > 0);
  assert.deepEqual(result.drafts.map((item) => item.id), ["draft-1"]);
});

test("keeps an unavailable send count distinct from a real zero", () => {
  const summary: WorkspaceSummary = {
    total: 0,
    sendable: 0,
    ageBands: {},
    statuses: {},
    topics: [],
    assistant: { configured: false, mode: "fallback", model: null, provider: null },
  };

  const result = summarizeHome({ summary, campaigns: [], replies: [] });

  assert.equal(result.messagesSentThisWeek, 0);
});

test("keeps campaign and reply summaries when the lead summary is unavailable", () => {
  const result = summarizeHome({
    summary: null,
    campaigns: [campaign(), campaign({ id: "draft-1", status: "draft" })],
    replies: [reply()],
    now: new Date("2026-08-26T12:00:00.000Z"),
  });

  assert.equal(result.totalLeads, null);
  assert.equal(result.repliesThisWeek, 1);
  assert.deepEqual(result.replyCategories, [{ name: "Interested", value: 1 }]);
  assert.ok(result.messagesSentThisWeek > 0);
  assert.deepEqual(result.drafts.map((item) => item.id), ["draft-1"]);
});
