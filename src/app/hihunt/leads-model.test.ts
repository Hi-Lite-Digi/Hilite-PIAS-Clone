import assert from "node:assert/strict";
import test from "node:test";
import type { HRProspectRecord } from "../../lib/api";
import {
  buildHiHuntLeadRows,
  filterHiHuntLeadRows,
  getEmailVerification,
  getLeadHistoryPresentation,
  getLeadLifecycleStats,
  type HiHuntLeadRow,
} from "./leads-model";

const prospect: HRProspectRecord = {
  id: "prospect-1",
  full_name: "Rachel Tan",
  first_name: "Rachel",
  last_name: "Tan",
  job_title: "HR Director",
  seniority: "director",
  company_name: "Vertex Logistics",
  company_domain: "vertex.example",
  work_email: "rachel@vertex.example",
  email_status: "verified",
  linkedin_url: "https://www.linkedin.com/in/rachel-tan",
  location: "Singapore",
  hr_match_reason: "Matches the HR leadership recipe",
  status: "new",
  review_status: "new",
  provider: "apollo",
  discovered_at: "2026-08-26T01:00:00.000Z",
  updated_at: "2026-08-26T01:00:00.000Z",
};

test("email verification only calls the explicit verified state verified", () => {
  assert.deepEqual(getEmailVerification("verified"), { label: "Verified", tone: "done" });
  assert.deepEqual(getEmailVerification("deliverable"), { label: "Not verified", tone: "draft" });
  assert.deepEqual(getEmailVerification(null), { label: "Not checked", tone: "draft" });
  assert.deepEqual(getEmailVerification("invalid"), { label: "Invalid", tone: "error" });
});

test("lead lifecycle uses the backend's explicit Phase 3 status semantics", () => {
  const drafts = [{
    id: "draft-1",
    prospect: { id: prospect.id },
    subject: "Hello Rachel",
    status: "approved" as const,
    workflowId: "workflow-1",
    workflowName: "HR leaders",
    created_at: "2026-08-26T02:00:00.000Z",
  }];
  const contacted = buildHiHuntLeadRows([{ ...prospect, status: "contacted" }], drafts, []);
  assert.equal(contacted[0].status, "contacted");

  const queued = buildHiHuntLeadRows([{ ...prospect, status: "queued" }], [{ ...drafts[0], status: "draft" }], []);
  assert.equal(queued[0].status, "queued");

  const replied = buildHiHuntLeadRows([{ ...prospect, status: "replied" }], drafts, [{
    id: "thread-1",
    prospectId: prospect.id,
    workflowId: "workflow-1",
    workflowName: "HR leaders",
    subject: "Re: Hello Rachel",
    lastMessageAt: "2026-08-26T03:00:00.000Z",
  }]);
  assert.equal(replied[0].status, "replied");
  assert.equal(replied[0].history[0].threadId, "thread-1");

  const suppressed = buildHiHuntLeadRows([{ ...prospect, status: "suppressed" }], drafts, []);
  assert.equal(suppressed[0].status, "suppressed");
});

test("legacy live rows derive honest lifecycle from real draft and reply activity", () => {
  const legacy = { ...prospect, status: undefined };
  const pendingDraft = [{
    id: "draft-legacy",
    prospect: { id: prospect.id },
    subject: "Hello Rachel",
    status: "draft" as const,
    workflowId: "workflow-1",
    workflowName: "HR leaders",
    created_at: "2026-08-26T02:00:00.000Z",
  }];
  assert.equal(buildHiHuntLeadRows([legacy], pendingDraft, [])[0].status, "queued");
  assert.equal(buildHiHuntLeadRows([legacy], [{ ...pendingDraft[0], status: "approved" }], [])[0].status, "contacted");
  assert.equal(buildHiHuntLeadRows([legacy], pendingDraft, [{ id: "thread", prospectId: prospect.id, workflowId: "workflow-1", workflowName: "HR leaders", subject: "Re: hello", lastMessageAt: "2026-08-26T03:00:00.000Z" }])[0].status, "replied");
});

test("legacy rows never invent a lifecycle when auxiliary evidence is unavailable", () => {
  const legacy = { ...prospect, status: undefined };
  const [row] = buildHiHuntLeadRows([legacy], [], [], { draftsAvailable: false, threadsAvailable: false });

  assert.equal(row.status, null);
});

test("lead filtering covers text, lifecycle, and verification", () => {
  const row: HiHuntLeadRow = {
    prospect,
    status: "new",
    verification: { label: "Verified", tone: "done" },
    history: [],
  };
  assert.deepEqual(filterHiHuntLeadRows([row], { search: "vertex", status: "all", verification: "all" }), [row]);
  assert.deepEqual(filterHiHuntLeadRows([row], { search: "", status: "queued", verification: "all" }), []);
  assert.deepEqual(filterHiHuntLeadRows([row], { search: "", status: "all", verification: "verified" }), [row]);
});

test("history is newest first and keeps URL-addressable thread ids", () => {
  const rows = buildHiHuntLeadRows([prospect], [], [
    { id: "older", prospectId: prospect.id, workflowId: null, workflowName: "Workflow A", subject: "First", lastMessageAt: "2026-08-25T01:00:00.000Z" },
    { id: "newer", prospectId: prospect.id, workflowId: null, workflowName: "Workflow A", subject: "Second", lastMessageAt: "2026-08-26T01:00:00.000Z" },
  ]);
  assert.deepEqual(rows[0].history.map((item) => item.threadId), ["newer", "older"]);
});

test("lifecycle stats prefer authoritative totals and never undercount a capped collection", () => {
  const loadedRows = [{ status: "new" as const }, { status: "replied" as const }];
  const authoritative = { new: 47, queued: 5, contacted: 12, replied: 9, suppressed: 2 };

  assert.deepEqual(getLeadLifecycleStats(loadedRows, authoritative, true), {
    newCount: 47,
    repliedCount: 9,
    source: "authoritative",
  });
  assert.deepEqual(getLeadLifecycleStats(loadedRows, null, true), {
    newCount: null,
    repliedCount: null,
    source: "incomplete",
  });
  assert.deepEqual(getLeadLifecycleStats(loadedRows, null, false), {
    newCount: 1,
    repliedCount: 1,
    source: "loaded",
  });
});

test("history presentation distinguishes live empty, sample, error, and current source transitions", () => {
  assert.deepEqual(getLeadHistoryPresentation({ drafts: "live", threads: "live" }), {
    complete: true,
    loading: false,
    showSample: false,
    state: "complete",
  });
  assert.deepEqual(getLeadHistoryPresentation({ drafts: "sample", threads: "live" }), {
    complete: false,
    loading: false,
    showSample: true,
    state: "sample",
  });
  assert.deepEqual(getLeadHistoryPresentation({ drafts: "live", threads: "error" }), {
    complete: false,
    loading: false,
    showSample: false,
    state: "error",
  });
  assert.equal(getLeadHistoryPresentation({ drafts: "live", threads: "live" }).showSample, false, "a live refresh clears a prior sample label");
  assert.equal(getLeadHistoryPresentation({ drafts: "sample", threads: "live" }).showSample, true, "a later sample response restores the label");
});
