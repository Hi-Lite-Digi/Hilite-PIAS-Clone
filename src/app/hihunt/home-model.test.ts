import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPendingEmailQueue,
  buildReplyHighlights,
  formatNextRunCountdown,
  getEmailCapDisplay,
  getOutreachApprovalUpdate,
  groupPendingEmails,
  hasDraftEdits,
  projectWorkflowDigests,
  summarizeHiHuntHome,
  type EmailThreadSummary,
  type WorkflowDigestSource,
} from "./home-model";

function workflow(overrides: Partial<WorkflowDigestSource> = {}): WorkflowDigestSource {
  return {
    id: "workflow-people-leaders",
    name: "People leaders · Singapore",
    nextRunAt: "2026-08-27T00:00:00.000Z",
    lastRun: {
      id: "run-1",
      status: "completed",
      found: 24,
      skippedDuplicates: 7,
      drafted: 12,
      startedAt: "2026-08-25T23:55:00.000Z",
      completedAt: "2026-08-26T00:00:00.000Z",
    },
    ...overrides,
  };
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    workflowId: "workflow-people-leaders",
    workflowName: "People leaders · Singapore",
    prospect: {
      id: "prospect-1",
      full_name: "Avery Tan",
      first_name: "Avery",
      job_title: "People Director",
      company_name: "Northstar",
      work_email: "avery@northstar.example",
      linkedin_url: null,
      location: "Singapore",
    },
    subject: "A practical employee benefit",
    body: "Hi Avery,\n\nWould a short introduction help?",
    status: "draft",
    generation_mode: "fallback",
    edited_at: null,
    created_at: "2026-08-26T00:15:00.000Z",
    ...overrides,
  };
}

function thread(overrides: Partial<EmailThreadSummary> = {}): EmailThreadSummary {
  return {
    id: "email-thread-1",
    workflowId: "workflow-people-leaders",
    workflowName: "People leaders · Singapore",
    sender: { name: "Avery Tan", address: "avery@northstar.example" },
    subject: "Re: A practical employee benefit",
    snippet: "Tuesday works well for me.",
    status: "needs_reply",
    lastMessageAt: "2026-08-26T03:00:00.000Z",
    ...overrides,
  };
}

test("projects each workflow's truthful overnight digest and countdown", () => {
  const digests = projectWorkflowDigests(
    [workflow(), workflow({ id: "workflow-hr", name: "HR heads", lastRun: null, nextRunAt: null })],
    new Date("2026-08-26T22:30:00.000Z"),
  );

  assert.deepEqual(digests[0], {
    id: "workflow-people-leaders",
    name: "People leaders · Singapore",
    found: 24,
    skippedDuplicates: 7,
    drafted: 12,
    runStatus: "completed",
    lastRunAt: "2026-08-26T00:00:00.000Z",
    nextRunAt: "2026-08-27T00:00:00.000Z",
    nextRunCountdown: "in 1h 30m",
  });
  assert.equal(digests[1].found, null);
  assert.equal(digests[1].nextRunCountdown, "Not scheduled");
});

test("countdown handles due and malformed schedules without inventing a time", () => {
  const now = new Date("2026-08-26T04:00:00.000Z");
  assert.equal(formatNextRunCountdown("2026-08-26T03:59:00.000Z", now), "Due now");
  assert.equal(formatNextRunCountdown("not-a-date", now), "Not scheduled");
  assert.equal(formatNextRunCountdown(null, now), "Not scheduled");
});

test("groups only pending drafts by workflow and labels legacy unassigned records", () => {
  const groups = groupPendingEmails([
    draft(),
    draft({ id: "draft-2", prospect: { ...draft().prospect, full_name: "Bea Lim" } }),
    draft({ id: "draft-3", workflowId: undefined, workflowName: undefined }),
    draft({ id: "approved", status: "approved" }),
  ]);

  assert.deepEqual(groups.map((group) => [group.id, group.title, group.items.map((item) => item.id)]), [
    ["workflow-people-leaders", "People leaders · Singapore", ["draft-1", "draft-2"]],
    ["unassigned", "Unassigned workflow", ["draft-3"]],
  ]);
});

test("honours the connected-account allowance and reports emails deferred by the cap", () => {
  const result = buildPendingEmailQueue(
    [draft(), draft({ id: "draft-2" }), draft({ id: "draft-3" })],
    new Set(["draft-1"]),
    1,
  );

  assert.deepEqual(result.actionableItems.map((item) => item.id), ["draft-2"]);
  assert.equal(result.deferredCount, 1);
  assert.deepEqual(result.groups.flatMap((group) => group.items.map((item) => item.id)), ["draft-2"]);
});

test("clamps truthful over-cap account use and accounts for approvals in this session", () => {
  assert.deepEqual(getEmailCapDisplay({ limit: 25, used: 8, remaining: 17 }, 3), {
    limit: 25,
    used: 11,
    remaining: 14,
  });
  assert.deepEqual(getEmailCapDisplay({ limit: 25, used: 29, remaining: 0 }, 0), {
    limit: 25,
    used: 25,
    remaining: 0,
  });
});

test("detects subject and body edits that still need strict live persistence", () => {
  const item = draft();
  assert.equal(hasDraftEdits([item], {}), false);
  assert.equal(hasDraftEdits([item], { [item.id]: { subject: item.subject, body: item.body } }), false);
  assert.equal(hasDraftEdits([item], { [item.id]: { subject: "Edited", body: item.body } }), true);
});

test("partial approval hides only exact returned IDs and keeps the remainder retryable", () => {
  const items = [draft(), draft({ id: "draft-2" })];
  assert.deepEqual(getOutreachApprovalUpdate(items, {
    approved: 1,
    draftIds: ["draft-2"],
    retryableDraftIds: ["draft-1"],
  }), {
    approvedDraftIds: ["draft-2"],
    approvedCount: 1,
    retryableCount: 1,
    retryableMessage: "1 email was sent. 1 email remains queued and can be retried.",
  });
});

test("summarizes Hi-Hunt without modelling unavailable backend totals", () => {
  const result = summarizeHiHuntHome({
    digests: projectWorkflowDigests([workflow()], new Date("2026-08-26T12:00:00.000Z")),
    drafts: [
      draft(),
      draft({ id: "approved-1", status: "approved" }),
      draft({ id: "approved-2", status: "approved" }),
      draft({ id: "contacted", status: "contacted" }),
      draft({ id: "copied", status: "copied" }),
    ],
    threads: [thread(), thread({ id: "thread-2", status: "replied", lastMessageAt: "2026-08-19T11:59:59.000Z" })],
    now: new Date("2026-08-26T12:00:00.000Z"),
  });

  assert.deepEqual(result, {
    foundOvernight: 24,
    pendingEmails: 1,
    repliesThisWeek: 1,
    replyRate: 50,
    repliesReceived: 2,
    emailsWithoutReply: 2,
    needsReplyThreads: 1,
  });
});

test("leaves reply rate uncomputed when no sent-email total is tracked", () => {
  const result = summarizeHiHuntHome({
    digests: [],
    drafts: [draft()],
    threads: [thread()],
    now: new Date("2026-08-26T12:00:00.000Z"),
  });

  assert.equal(result.replyRate, null);
  assert.equal(result.repliesReceived, 1);
  assert.equal(result.emailsWithoutReply, 0);
});

test("reply highlights sort newest first and deep-link to addressable inbox threads", () => {
  const highlights = buildReplyHighlights([
    thread({ id: "older", lastMessageAt: "2026-08-25T03:00:00.000Z" }),
    thread({ id: "newer", lastMessageAt: "2026-08-26T03:00:00.000Z" }),
  ]);

  assert.deepEqual(highlights.map((item) => [item.id, item.href]), [
    ["newer", "/hihunt/inbox/newer"],
    ["older", "/hihunt/inbox/older"],
  ]);
});
