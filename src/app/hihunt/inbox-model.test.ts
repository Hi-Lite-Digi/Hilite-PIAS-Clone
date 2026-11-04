import assert from "node:assert/strict";
import test from "node:test";
import type { EmailThreadRecord, EmailThreadSummary } from "../../lib/stubs";
import {
  classifyEmailInterest,
  filterAndSortEmailThreads,
  getEmailThreadHref,
  getEmailThreadRequestDecision,
  getInterestFilterOptions,
  isEmailThreadDetailRequestCurrent,
  reconcileSuccessfulEmailReply,
  removePendingEmail,
  upsertNewestEmailThreadSummary,
} from "./inbox-model";

const thread = (overrides: Partial<EmailThreadSummary> = {}): EmailThreadSummary => ({
  id: "thread-1",
  prospectId: "prospect-1",
  workflowId: "workflow-1",
  workflowName: "HR leaders",
  sender: { name: "Rachel Tan", address: "rachel@example.com" },
  subject: "Re: Financial wellness",
  snippet: "Could you send details?",
  lastMessageAt: "2026-08-26T03:00:00.000Z",
  unread: true,
  status: "needs_reply",
  ...overrides,
});

test("email thread filtering is interest-aware and unread-first", () => {
  const rows = [
    thread({ id: "read-new", category: "Interested", unread: false, lastMessageAt: "2026-08-26T04:00:00.000Z" }),
    thread({ id: "unread-old", category: "Interested", unread: true, lastMessageAt: "2026-08-25T04:00:00.000Z" }),
    thread({ id: "other", category: "Follow-up", workflowId: "workflow-2", workflowName: "People ops", subject: "Hello" }),
  ];
  assert.deepEqual(filterAndSortEmailThreads(rows, "", "Interested").map((item) => item.id), ["unread-old", "read-new"]);
  assert.deepEqual(filterAndSortEmailThreads(rows, "people", "all").map((item) => item.id), ["other"]);
});

test("interest filters expose all plus the three requested categories with unread counts", () => {
  const options = getInterestFilterOptions([
    thread({ category: "Interested" }),
    thread({ id: "thread-2", category: "Follow-up", unread: true }),
    thread({ id: "thread-3", category: "Interested", unread: false }),
    thread({ id: "thread-4", category: "Uninterested", unread: false }),
  ]);
  assert.deepEqual(options, [
    { value: "all", label: "All", count: 2 },
    { value: "Interested", label: "Interested", count: 1 },
    { value: "Follow-up", label: "Follow-up", count: 1 },
    { value: "Uninterested", label: "Uninterested", count: 0 },
  ]);
});

test("email interest classification prefers explicit rejection and sends ambiguous replies to follow-up", () => {
  assert.equal(classifyEmailInterest("Yes, I am in. Please send the details."), "Interested");
  assert.equal(classifyEmailInterest("No thanks, we are not interested."), "Uninterested");
  assert.equal(classifyEmailInterest("Can you clarify what this covers?"), "Follow-up");
});

test("email inbox links and request keys are URL-safe and manual-retry based", () => {
  assert.equal(getEmailThreadHref("a/b"), "/hihunt/inbox/a%2Fb");
  assert.deepEqual(getEmailThreadRequestDecision("", "thread-1", 0), { nextRequest: "thread-1:0", shouldLoad: true });
  assert.deepEqual(getEmailThreadRequestDecision("thread-1:0", "thread-1", 0), { nextRequest: "thread-1:0", shouldLoad: false });
  assert.deepEqual(getEmailThreadRequestDecision("thread-1:0", "thread-1", 1), { nextRequest: "thread-1:1", shouldLoad: true });
});

test("the first detail response settles while stale requests and pre-reply responses are discarded", () => {
  assert.equal(isEmailThreadDetailRequestCurrent(1, 1, 0, undefined), true);
  assert.equal(isEmailThreadDetailRequestCurrent(1, 2, 0, undefined), false);
  assert.equal(isEmailThreadDetailRequestCurrent(1, 1, 0, 1), false);
});

test("successful email replies reconcile the optimistic card and never duplicate it", () => {
  const detail: EmailThreadRecord = {
    ...thread(),
    messages: [{ id: "inbound-1", direction: "inbound", from: { name: "Rachel", address: "rachel@example.com" }, to: [{ name: "JJ", address: "jj@example.com" }], occurredAt: "2026-08-26T03:00:00.000Z", body: "Could you send details?" }],
  };
  const pending = { id: "pending:key-1", direction: "outbound" as const, from: { name: "JJ", address: "jj@example.com" }, to: [{ name: "Rachel", address: "rachel@example.com" }], occurredAt: "2026-08-26T04:00:00.000Z", body: "Absolutely.", idempotencyKey: "key-1", deliveryState: "sending" as const };
  const next = reconcileSuccessfulEmailReply(detail, pending, "sent-1", "2026-08-26T04:01:00.000Z");
  assert.equal(next.messages.length, 2);
  assert.equal(next.messages[1].id, "sent-1");
  assert.equal(next.messages[1].occurredAt, "2026-08-26T04:01:00.000Z");
  assert.equal(next.status, "replied");
  assert.equal(next.unread, false);
  assert.equal(next.snippet, "Absolutely.");

  assert.deepEqual(removePendingEmail({ "thread-1": [pending] }, "thread-1", pending.id), {});
});

test("a late older reply response cannot regress the list preview", () => {
  const current = thread({ id: "thread-1", snippet: "Newer reply", lastMessageAt: "2026-08-26T05:00:00.000Z", status: "replied", unread: false });
  const older = thread({ id: "thread-1", snippet: "Older reply", lastMessageAt: "2026-08-26T04:00:00.000Z", status: "replied", unread: false });
  assert.deepEqual(upsertNewestEmailThreadSummary([current], older), [current]);
});
