import assert from "node:assert/strict";
import test from "node:test";
import type { ReplyConversationRecord, ReplyMessageRecord } from "../../lib/api";
import {
  filterAndSortThreads,
  findMatchingThread,
  getCampaignFilterOptions,
  getCategoryPresentation,
  getThreadHref,
  groupMessagesByDay,
  isAwayFromLatestMessage,
  reconcileSuccessfulReply,
  removePendingReply,
  upsertThread,
} from "./inbox-model";
import * as inboxModel from "./inbox-model";

function thread(overrides: Partial<ReplyConversationRecord>): ReplyConversationRecord {
  return {
    id: 1,
    leadId: 1,
    campaignId: "campaign-one",
    leadName: "Aisha Rahman",
    initials: "AR",
    color: "mint",
    company: "",
    title: "",
    email: "aisha@example.com",
    phone: "+65 8123 4567",
    campaign: "June Seminar",
    subject: "",
    preview: "Could you share the venue?",
    occurredAt: "2026-08-26T08:30:00.000Z",
    read: false,
    starred: false,
    category: "Question",
    thread: [],
    ...overrides,
  };
}

test("the latest-message shortcut appears only when the thread is away from the bottom", () => {
  assert.equal(isAwayFromLatestMessage({ scrollHeight: 1200, scrollTop: 300, clientHeight: 500 }), true);
  assert.equal(isAwayFromLatestMessage({ scrollHeight: 1200, scrollTop: 620, clientHeight: 500 }), false);
});

test("inbox threads are filtered by search and campaign before unread-first latest sorting", () => {
  const rows = [
    thread({ id: 1, leadName: "Aisha Rahman", read: true, occurredAt: "2026-08-26T10:00:00.000Z" }),
    thread({ id: 2, leadName: "Ben Lim", read: false, occurredAt: "2026-08-25T10:00:00.000Z" }),
    thread({ id: 3, leadName: "Carla Wong", campaignId: "campaign-two", campaign: "CPF Clinic", read: false, occurredAt: "2026-08-26T09:00:00.000Z" }),
  ];

  assert.deepEqual(filterAndSortThreads(rows, "", "all").map((row) => row.id), [3, 2, 1]);
  assert.deepEqual(filterAndSortThreads(rows, "venue", "campaign-one").map((row) => row.id), [2, 1]);
  assert.deepEqual(filterAndSortThreads(rows, "carla", "campaign-two").map((row) => row.id), [3]);
});

test("campaign filters report unread counts and omit campaigns with zero unread threads", () => {
  const options = getCampaignFilterOptions([
    thread({ id: 1, campaignId: "campaign-one", campaign: "June Seminar", read: false }),
    thread({ id: 2, campaignId: "campaign-one", campaign: "June Seminar", read: true }),
    thread({ id: 3, campaignId: "campaign-two", campaign: "CPF Clinic", read: true }),
    thread({ id: 4, campaignId: null, campaign: "Direct WhatsApp conversation", read: false }),
  ]);

  assert.deepEqual(options, [
    { value: "all", label: "All", count: 2 },
    { value: "campaign-one", label: "June Seminar", count: 1 },
  ]);
});

test("thread links safely encode route ids and category presentation uses the shared status vocabulary", () => {
  assert.equal(getThreadHref("thread / 42"), "/reengage/inbox/thread%20%2F%2042");
  assert.deepEqual(getCategoryPresentation("Interested"), { label: "Interested", status: "done" });
  assert.deepEqual(getCategoryPresentation("Question"), { label: "Question", status: "queued" });
  assert.deepEqual(getCategoryPresentation("Unsubscribe"), { label: "Stop", status: "error" });
  assert.deepEqual(getCategoryPresentation("Not Interested"), { label: "Maybe next time", status: "paused" });
});

test("a live refresh follows the same conversation when its latest inbound id changes", () => {
  const current = thread({ id: 18, leadId: 4817, phone: "+65 9867 1537" });
  const refreshed = thread({ id: 20, leadId: 4817, phone: "+65 9867 1537", preview: "more testing" });
  const other = thread({ id: 14, leadId: 4822, phone: "+65 8999 4751" });

  assert.deepEqual(findMatchingThread([other, refreshed], current), refreshed);
});

test("messages are grouped into chronological calendar days", () => {
  const messages: ReplyMessageRecord[] = [
    { id: "later", from: "lead", senderName: "Aisha", senderContact: "", occurredAt: "2026-08-26T09:00:00.000Z", body: "Later" },
    { id: "first", from: "us", senderName: "Hilite", senderContact: "", occurredAt: "2026-08-25T09:00:00.000Z", body: "First" },
    { id: "second", from: "lead", senderName: "Aisha", senderContact: "", occurredAt: "2026-08-25T10:00:00.000Z", body: "Second" },
  ];

  const groups = groupMessagesByDay(messages);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].messages.map((message) => message.id), ["first", "second"]);
  assert.deepEqual(groups[1].messages.map((message) => message.id), ["later"]);
});

test("a directly loaded thread is added to the list before optimistic updates use it", () => {
  const directThread = thread({ id: 99, leadName: "Deep Link" });
  assert.deepEqual(upsertThread([thread({ id: 1 })], directThread).map((row) => row.id), [99, 1]);

  const updated = { ...directThread, starred: true };
  assert.deepEqual(upsertThread([directThread], updated), [updated]);
});

test("leaving a failed thread route releases its request key for a later manual load", () => {
  const decide = (inboxModel as unknown as {
    getThreadRequestDecision?: (
      lastRequest: string,
      threadId: string | undefined,
      retry: number,
    ) => { nextRequest: string; shouldLoad: boolean };
  }).getThreadRequestDecision;

  assert.equal(typeof decide, "function");
  if (!decide) return;

  const first = decide("", "42", 0);
  assert.deepEqual(first, { nextRequest: "42:0", shouldLoad: true });
  assert.deepEqual(decide(first.nextRequest, "42", 0), {
    nextRequest: "42:0",
    shouldLoad: false,
  });

  const listRoute = decide(first.nextRequest, undefined, 0);
  assert.deepEqual(listRoute, { nextRequest: "", shouldLoad: false });
  assert.deepEqual(decide(listRoute.nextRequest, "42", 0), {
    nextRequest: "42:0",
    shouldLoad: true,
  });
});

test("successful reply reconciliation removes its optimistic entry and never duplicates the server message", () => {
  const pending = {
    id: "pending-one",
    idempotencyKey: "idempotency-one",
    deliveryState: "sending" as const,
    from: "us" as const,
    senderName: "Hilite",
    senderContact: "WhatsApp",
    occurredAt: "2026-08-26T10:00:00.000Z",
    body: "Here are the details.",
  };
  const pendingByThread = { "42": [pending] };
  const selected = thread({ id: 42, thread: [] });

  const reconciled = reconcileSuccessfulReply(selected, pending, "server-message-one");
  assert.deepEqual(reconciled.thread.map((message) => message.id), ["server-message-one"]);
  assert.equal(reconciled.thread[0].body, pending.body);
  assert.deepEqual(
    reconcileSuccessfulReply({ ...selected, thread: reconciled.thread }, pending, "server-message-one").thread,
    reconciled.thread,
  );
  assert.deepEqual(removePendingReply(pendingByThread, 42, pending.id), {});
});

test("successful image reconciliation keeps the visible attachment and removes private upload fields", () => {
  const pending = {
    id: "pending-image",
    idempotencyKey: "idempotency-image",
    attachmentPath: "drafts/11111111-1111-4111-8111-111111111111.png",
    attachmentMimeType: "image/png",
    attachment: { kind: "image" as const, name: "venue.png" },
    caption: "Venue map",
    from: "us" as const,
    senderName: "Hilite",
    senderContact: "WhatsApp",
    occurredAt: "2026-08-26T10:00:00.000Z",
    body: "Venue map",
  };
  const reconciled = reconcileSuccessfulReply(thread({ id: 42, thread: [] }), pending, "server-image");
  assert.deepEqual(reconciled.thread[0].attachment, { kind: "image", name: "venue.png" });
  assert.equal("attachmentPath" in reconciled.thread[0], false);
  assert.equal("attachmentMimeType" in reconciled.thread[0], false);
  assert.equal("caption" in reconciled.thread[0], false);
});

test("successful reply reconciliation keeps the newest preview regardless of completion order", () => {
  const older = {
    id: "pending-older",
    idempotencyKey: "idempotency-older",
    from: "us" as const,
    senderName: "Hilite",
    senderContact: "WhatsApp",
    occurredAt: "2026-08-26T10:00:00.000Z",
    body: "Older reply",
  };
  const newer = {
    ...older,
    id: "pending-newer",
    idempotencyKey: "idempotency-newer",
    occurredAt: "2026-08-26T10:01:00.000Z",
    body: "Newer reply",
  };
  const selected = thread({ id: 42, thread: [] });

  const newerThenOlder = reconcileSuccessfulReply(
    reconcileSuccessfulReply(selected, newer, "server-newer"),
    older,
    "server-older",
  );
  const olderThenNewer = reconcileSuccessfulReply(
    reconcileSuccessfulReply(selected, older, "server-older"),
    newer,
    "server-newer",
  );

  for (const reconciled of [newerThenOlder, olderThenNewer]) {
    assert.equal(reconciled.preview, newer.body);
    assert.equal(reconciled.occurredAt, newer.occurredAt);
  }
});

test("successful reply reconciliation uses a stable id tie-break for equal timestamps", () => {
  const first = {
    id: "pending-first",
    idempotencyKey: "idempotency-first",
    from: "us" as const,
    senderName: "Hilite",
    senderContact: "WhatsApp",
    occurredAt: "2026-08-26T10:00:00.000Z",
    body: "First tie",
  };
  const second = {
    ...first,
    id: "pending-second",
    idempotencyKey: "idempotency-second",
    body: "Second tie",
  };
  const selected = thread({ id: 42, thread: [] });
  const firstThenSecond = reconcileSuccessfulReply(
    reconcileSuccessfulReply(selected, first, "server-a"),
    second,
    "server-b",
  );
  const secondThenFirst = reconcileSuccessfulReply(
    reconcileSuccessfulReply(selected, second, "server-b"),
    first,
    "server-a",
  );

  assert.equal(firstThenSecond.preview, secondThenFirst.preview);
  assert.equal(firstThenSecond.occurredAt, secondThenFirst.occurredAt);
});
