import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as phase3 from "./stubs";
import { getHRProspects } from "./api";
import {
  approveSendBatch,
  getCampaignDetail,
  getSettings,
  getSendQueue,
  getThread,
  getThreads,
  importLeads,
  saveSettings,
  updateOutreachDraft,
  updateProspectReview,
  type HiHuntSettings,
} from "./stubs";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function captureFetch(response: Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return response.clone();
  }) as typeof fetch;
  return calls;
}

function captureFetchSequence(responses: Response[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let index = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const response = responses[index++];
    if (!response) throw new Error("Unexpected fetch call");
    return response.clone();
  }) as typeof fetch;
  return calls;
}

function threadRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    leadId: 3,
    campaignId: "campaign-1",
    leadName: "Jamie Lim",
    initials: "JL",
    color: "mint",
    company: "WhatsApp",
    title: "WhatsApp reply",
    email: "jamie@example.com",
    phone: "+6591234567",
    campaign: "June Seminar",
    subject: "June Seminar",
    preview: "Interested",
    occurredAt: "2026-08-26T02:00:00.000Z",
    read: false,
    starred: false,
    category: "Interested",
    thread: [],
    ...overrides,
  };
}

function workflowRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "workflow-hr-leaders",
    name: "Singapore HR leaders",
    enabled: true,
    schedule: { days: ["mon", "tue", "wed", "thu", "fri"], time: "08:00", timezone: "Asia/Singapore" },
    scrapeRecipe: {
      roles: ["Human Resources"],
      seniorities: ["head", "director"],
      location: "Singapore",
      companyDomain: null,
      volumePerRun: 25,
      source: "apollo",
    },
    emailTemplate: { subject: "A practical employee benefit for {{company_name}}", body: "Hi {{first_name}},\n\nWould a short introduction be useful?" },
    sendingRules: {
      dailyLimit: 50,
      spacingMinutes: 8,
      window: { start: "09:00", end: "17:00", timezone: "Asia/Singapore" },
    },
    lastRun: {
      id: "run-1",
      status: "completed",
      found: 18,
      skippedDuplicates: 3,
      drafted: 15,
      startedAt: "2026-08-26T00:00:00.000Z",
      completedAt: "2026-08-26T00:03:00.000Z",
    },
    nextRunAt: "2026-08-27T00:00:00.000Z",
    draftedToday: 15,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-26T00:03:00.000Z",
    ...overrides,
  };
}

function emailThreadSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: "email-thread-1",
    prospectId: "p1",
    workflowId: "workflow-hr-leaders",
    workflowName: "Singapore HR leaders",
    sender: { name: "Rachel Tan", address: "rachel.tan@vertexlogistics.example" },
    subject: "Re: Supporting Vertex Logistics' HR team",
    snippet: "Could you send the one-pager?",
    lastMessageAt: "2026-08-26T04:18:00.000Z",
    unread: true,
    status: "needs_reply",
    ...overrides,
  };
}

function emailThreadRecord(overrides: Record<string, unknown> = {}) {
  return {
    ...emailThreadSummary(),
    messages: [
      {
        id: "email-message-1",
        direction: "outbound",
        from: { name: "Hilite", address: "jj@hilite.example" },
        to: [{ name: "Rachel Tan", address: "rachel.tan@vertexlogistics.example" }],
        occurredAt: "2026-08-25T03:00:00.000Z",
        body: "Hi Rachel, could I share a short overview?",
      },
      {
        id: "email-message-2",
        direction: "inbound",
        from: { name: "Rachel Tan", address: "rachel.tan@vertexlogistics.example" },
        to: [{ name: "Hilite", address: "jj@hilite.example" }],
        occurredAt: "2026-08-26T04:18:00.000Z",
        body: "Could you send the one-pager?",
      },
    ],
    ...overrides,
  };
}

function emailAccount(overrides: Record<string, unknown> = {}) {
  return {
    status: "connected",
    provider: "google",
    address: "jj@hilite.example",
    displayName: "JJ",
    connectedAt: "2026-08-20T03:00:00.000Z",
    lastSyncAt: "2026-08-26T01:00:00.000Z",
    error: null,
    cap: { limit: 50, used: 12, remaining: 38 },
    ...overrides,
  };
}

function outreachDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    workflowId: "workflow-hr-leaders",
    workflowName: "Singapore HR leaders",
    prospect: {
      id: "p1",
      full_name: "Rachel Tan",
      first_name: "Rachel",
      job_title: "HR Director",
      company_name: "Vertex Logistics",
      work_email: "rachel@vertex.example",
      linkedin_url: null,
      location: "Singapore",
    },
    subject: "Supporting Vertex Logistics' HR team",
    body: "Would a short introduction be useful?",
    status: "draft",
    generation_mode: "fallback",
    edited_at: null,
    created_at: "2026-08-26T00:04:00.000Z",
    ...overrides,
  };
}

test("workflow reads return validated live data and label only missing-endpoint samples", async (context) => {
  const getWorkflows = (phase3 as typeof phase3 & { getWorkflows: () => Promise<any> }).getWorkflows;
  const getWorkflow = (phase3 as typeof phase3 & { getWorkflow: (id: string) => Promise<any> }).getWorkflow;

  await context.test("live list", async () => {
    const workflow = workflowRecord();
    const calls = captureFetch(jsonResponse({ data: [workflow] }));
    assert.deepEqual(await getWorkflows(), { sample: false, data: [workflow] });
    assert.equal(calls[0]?.url, "/api/workflows");
  });

  await context.test("deterministic missing-endpoint list and detail", async () => {
    const calls = captureFetch(jsonResponse({ error: "Not found" }, 404));
    const firstList = await getWorkflows();
    const secondList = await getWorkflows();
    assert.equal(firstList.sample, true);
    assert.deepEqual(secondList, firstList);
    const detail = await getWorkflow(firstList.data[0].id);
    assert.deepEqual(detail, { sample: true, data: firstList.data[0] });
    assert.equal(calls[2]?.url, `/api/workflows/${firstList.data[0].id}`);
  });

  await context.test("a record 404 never becomes a sample when the collection endpoint is live", async () => {
    const calls = captureFetchSequence([
      jsonResponse({ error: "Workflow not found" }, 404),
      jsonResponse({ data: [] }),
    ]);

    assert.deepEqual(await getWorkflow("workflow-hr-leaders"), { sample: false, data: null });
    assert.deepEqual(calls.map((call) => call.url), [
      "/api/workflows/workflow-hr-leaders",
      "/api/workflows",
    ]);
  });

  await context.test("malformed live data is not replaced by samples", async () => {
    captureFetch(jsonResponse({ data: [workflowRecord({ enabled: "yes" })] }));
    await assert.rejects(() => getWorkflows(), /invalid response/i);
  });

  await context.test("documented optional and string-array recipe values are accepted", async () => {
    const base = workflowRecord();
    const workflow = workflowRecord({
      enabled: false,
      scrapeRecipe: {
        ...(base.scrapeRecipe as Record<string, unknown>),
        roles: ["Human Resources", "Human Resources"],
        seniorities: [""],
        companyDomain: "",
      },
    });
    captureFetch(jsonResponse({ data: [workflow] }));
    assert.deepEqual(await getWorkflows(), { sample: false, data: [workflow] });
  });
});

test("workflow create and update are strict live mutations with exact request bodies", async (context) => {
  const createWorkflow = (phase3 as typeof phase3 & { createWorkflow: (input: any) => Promise<any> }).createWorkflow;
  const updateWorkflow = (phase3 as typeof phase3 & { updateWorkflow: (id: string, input: any) => Promise<any> }).updateWorkflow;
  const record = workflowRecord();
  const createInput = {
    name: record.name,
    enabled: record.enabled,
    schedule: record.schedule,
    scrapeRecipe: record.scrapeRecipe,
    emailTemplate: record.emailTemplate,
    sendingRules: record.sendingRules,
  };

  await context.test("create", async () => {
    const calls = captureFetch(jsonResponse({ data: record }));
    assert.deepEqual(await createWorkflow(createInput), { sample: false, data: record });
    assert.equal(calls[0]?.url, "/api/workflows");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), createInput);
  });

  await context.test("update", async () => {
    const changed = workflowRecord({ name: "People leaders" });
    const calls = captureFetch(jsonResponse({ data: changed }));
    assert.deepEqual(await updateWorkflow(record.id, { name: "People leaders" }), { sample: false, data: changed });
    assert.equal(calls[0]?.url, `/api/workflows/${record.id}`);
    assert.equal(calls[0]?.init?.method, "PATCH");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { name: "People leaders" });
  });

  await context.test("structurally equal nested fields may use a different object-key order", async () => {
    const reorderedSchedule = {
      timezone: record.schedule.timezone,
      time: record.schedule.time,
      days: record.schedule.days,
    };
    const returned = workflowRecord({ schedule: reorderedSchedule });
    captureFetch(jsonResponse({ data: returned }));
    assert.deepEqual(await updateWorkflow(record.id, { schedule: record.schedule }), {
      sample: false,
      data: returned,
    });
  });

  await context.test("missing endpoint", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    await assert.rejects(() => updateWorkflow(record.id, { enabled: false }), /Not found/);
  });

  await context.test("enabled workflow cannot accept an empty template", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return jsonResponse({ data: record });
    }) as typeof fetch;
    await assert.rejects(
      () => createWorkflow({ ...createInput, emailTemplate: { subject: "", body: "" } }),
      /template/i,
    );
    assert.equal(called, false);
  });

  await context.test("undefined-only workflow patch", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return jsonResponse({ data: record });
    }) as typeof fetch;
    await assert.rejects(() => updateWorkflow(record.id, { name: undefined }), /at least one workflow field/i);
    assert.equal(called, false);
  });
});

test("outreach batch approval reports exact completed ids and retryable remainder", async () => {
  const approveOutreachBatch = (phase3 as typeof phase3 & {
    approveOutreachBatch: (draftIds: string[]) => Promise<any>;
  }).approveOutreachBatch;
  const calls = captureFetch(jsonResponse({ approved: 1, draftIds: ["draft-1"] }));

  assert.deepEqual(await approveOutreachBatch(["draft-1", "draft-2"]), {
    approved: 1,
    draftIds: ["draft-1"],
    retryableDraftIds: ["draft-2"],
  });
  assert.equal(calls[0]?.url, "/api/outreach/approve-batch");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { draftIds: ["draft-1", "draft-2"] });
});

test("outreach batch approval rejects ambiguous partial outcomes and missing endpoints", async (context) => {
  const approveOutreachBatch = (phase3 as typeof phase3 & {
    approveOutreachBatch: (draftIds: string[]) => Promise<any>;
  }).approveOutreachBatch;

  await context.test("partial response without exact ids", async () => {
    captureFetch(jsonResponse({ approved: 1 }));
    await assert.rejects(() => approveOutreachBatch(["draft-1", "draft-2"]), /invalid response/i);
  });

  await context.test("missing endpoint", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    await assert.rejects(() => approveOutreachBatch(["draft-1"]), /Not found/);
  });
});

test("outreach draft reads use deterministic missing-only samples and sample drafts are read-only", async (context) => {
  const getOutreachDrafts = phase3.getOutreachDrafts;

  await context.test("missing endpoint", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    const first = await getOutreachDrafts();
    const second = await getOutreachDrafts();
    assert.equal(first.sample, true);
    assert.deepEqual(second, first);
    assert.ok(first.data.every((draft) => Boolean(draft.workflowId && draft.workflowName)));
  });

  await context.test("network failure", async () => {
    globalThis.fetch = (async () => { throw new TypeError("offline"); }) as typeof fetch;
    await assert.rejects(() => getOutreachDrafts(), /could not reach/i);
  });

  await context.test("malformed live response", async () => {
    captureFetch(jsonResponse({ data: [{}], summary: { draft: 1, approved: 0, copied: 0, contacted: 0 } }));
    await assert.rejects(() => getOutreachDrafts(), /invalid response/i);
  });

  await context.test("malformed prospect fields and timestamps are rejected", async () => {
    const invalidProspect = outreachDraft({
      prospect: { ...outreachDraft().prospect, first_name: 42 },
    });
    captureFetch(jsonResponse({ data: [invalidProspect], summary: { draft: 1, approved: 0, copied: 0, contacted: 0 } }));
    await assert.rejects(() => getOutreachDrafts(), /invalid response/i);

    const invalidTimestamp = outreachDraft({ created_at: "not-a-date" });
    captureFetch(jsonResponse({ data: [invalidTimestamp], summary: { draft: 1, approved: 0, copied: 0, contacted: 0 } }));
    await assert.rejects(() => getOutreachDrafts(), /invalid response/i);

    const blankProspectId = outreachDraft({ prospect: { ...outreachDraft().prospect, id: "  " } });
    captureFetch(jsonResponse({ data: [blankProspectId], summary: { draft: 1, approved: 0, copied: 0, contacted: 0 } }));
    await assert.rejects(() => getOutreachDrafts(), /invalid response/i);
  });

  await context.test("sample edit is never reported as saved", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    await assert.rejects(() => updateOutreachDraft("d1", { subject: "Changed" }), /Not found/);
  });

  await context.test("sample generation is never reported as persisted", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    await assert.rejects(
      () => phase3.generateOutreachDraft({
        id: "prospect-1",
        full_name: "Jamie Lim",
        first_name: "Jamie",
        last_name: "Lim",
        job_title: "HR Director",
        seniority: "director",
        company_name: "Example Co",
        company_domain: "example.com",
        work_email: "jamie@example.com",
        email_status: "verified",
        linkedin_url: null,
        location: "Singapore",
        hr_match_reason: "HR title match",
        review_status: "new",
        status: "new",
        provider: "apollo",
        discovered_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:00:00.000Z",
      }),
      /Not found/,
    );
  });
});

test("outreach draft edits require a nonempty patch and an echoed saved value", async (context) => {
  const draft = {
    id: "d1",
    workflowId: "workflow-hr-leaders",
    workflowName: "Singapore HR leaders",
    prospect: {
      id: "p1", full_name: "Rachel Tan", first_name: "Rachel", job_title: "HR Director",
      company_name: "Vertex Logistics", work_email: "rachel@example.com", linkedin_url: null, location: "Singapore",
    },
    subject: "Original subject",
    body: "Original body",
    status: "draft",
    generation_mode: "fallback",
    edited_at: null,
    created_at: "2026-08-26T00:04:00.000Z",
  };

  await context.test("empty patch", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return jsonResponse({ data: draft });
    }) as typeof fetch;
    await assert.rejects(() => updateOutreachDraft("d1", {}), /at least one draft field/i);
    assert.equal(called, false);
  });

  await context.test("blank subject", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return jsonResponse({ data: draft });
    }) as typeof fetch;
    await assert.rejects(() => updateOutreachDraft("d1", { subject: "  " }), /subject/i);
    assert.equal(called, false);
  });

  await context.test("undefined-only patch", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return jsonResponse({ data: draft });
    }) as typeof fetch;
    await assert.rejects(() => updateOutreachDraft("d1", { subject: undefined }), /at least one draft field/i);
    assert.equal(called, false);
  });

  await context.test("ignored patch", async () => {
    captureFetch(jsonResponse({ data: draft }));
    await assert.rejects(() => updateOutreachDraft("d1", { subject: "Changed" }), /invalid response/i);
  });

  await context.test("echoed patch", async () => {
    const updated = { ...draft, subject: "Changed", edited_at: "2026-08-26T01:00:00.000Z" };
    captureFetch(jsonResponse({ data: updated }));
    assert.deepEqual(await updateOutreachDraft("d1", { subject: "Changed" }), { sample: false, data: updated });
  });
});

test("Hi-Hunt lead lifecycle updates are exact and live-only", async (context) => {
  const updateHiHuntLeadStatus = (phase3 as typeof phase3 & {
    updateHiHuntLeadStatus: (id: string, status: string) => Promise<any>;
  }).updateHiHuntLeadStatus;

  await context.test("suppression", async () => {
    const calls = captureFetch(jsonResponse({ data: { id: "prospect/1", status: "suppressed" } }));
    assert.deepEqual(await updateHiHuntLeadStatus("prospect/1", "suppressed"), {
      sample: false,
      data: { id: "prospect/1", status: "suppressed" },
    });
    assert.equal(calls[0]?.url, "/api/hr-prospects/prospect%2F1");
    assert.equal(calls[0]?.init?.method, "PATCH");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { status: "suppressed" });
  });

  await context.test("missing endpoint", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    await assert.rejects(() => updateHiHuntLeadStatus("prospect-1", "new"), /Not found/);
  });

  await context.test("mismatched lifecycle response", async () => {
    captureFetch(jsonResponse({ data: { id: "prospect-1", status: "contacted" } }));
    await assert.rejects(() => updateHiHuntLeadStatus("prospect-1", "replied"), /invalid response/i);
  });
});

test("Hi-Hunt prospect reads request and validate all lifecycle states", async (context) => {
  const prospect = {
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
    hr_match_reason: "HR title match",
    review_status: "new",
    status: "suppressed",
    provider: "apollo",
    discovered_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
  };
  const response = {
    data: [prospect],
    total: 1,
    limit: 25,
    offset: 0,
    summary: { total: 1, verified: 1, new: 0, lastRun: null },
    provider: {
      name: "Multi-provider waterfall",
      configured: true,
      mode: "licensed-data-provider",
      personalEmails: false,
      personalPhones: false,
      providers: [
        { id: "apollo", name: "Apollo", configured: true, mode: "automated" },
        { id: "linkedin", name: "LinkedIn Sales Navigator", configured: false, mode: "manual-only" },
      ],
    },
  };

  await context.test("include suppressed query", async () => {
    const calls = captureFetch(jsonResponse(response));
    assert.deepEqual(await getHRProspects({ includeSuppressed: true, limit: 25, offset: 0 }), response);
    assert.equal(calls[0]?.url, "/api/hr-prospects?includeSuppressed=true&limit=25&offset=0");
  });

  await context.test("legacy response without lifecycle status", async () => {
    const { status: _status, ...withoutStatus } = prospect;
    const legacyResponse = { ...response, data: [withoutStatus] };
    captureFetch(jsonResponse(legacyResponse));
    assert.deepEqual(await getHRProspects({ limit: 25 }), legacyResponse);
  });

  await context.test("authoritative lifecycle summary", async () => {
    const lifecycleResponse = {
      ...response,
      summary: {
        ...response.summary,
        lifecycle: { new: 0, queued: 0, contacted: 0, replied: 0, suppressed: 1 },
      },
    };
    captureFetch(jsonResponse(lifecycleResponse));
    assert.deepEqual(await getHRProspects({ includeSuppressed: true }), lifecycleResponse);
  });

  await context.test("malformed authoritative lifecycle summary", async () => {
    captureFetch(jsonResponse({
      ...response,
      summary: { ...response.summary, lifecycle: { new: -1, queued: 0, contacted: 0, replied: 0, suppressed: 1 } },
    }));
    await assert.rejects(() => getHRProspects({ includeSuppressed: true }), /invalid response/i);
  });

  await context.test("unknown lifecycle status", async () => {
    captureFetch(jsonResponse({ ...response, data: [{ ...prospect, status: "archived" }] }));
    await assert.rejects(() => getHRProspects({ includeSuppressed: true }), /invalid response/i);
  });

  await context.test("prospect and discovery-run timestamps must be parseable", async () => {
    captureFetch(jsonResponse({ ...response, data: [{ ...prospect, discovered_at: "not-a-date" }] }));
    await assert.rejects(() => getHRProspects({ includeSuppressed: true }), /invalid response/i);

    captureFetch(jsonResponse({
      ...response,
      summary: {
        ...response.summary,
        lastRun: {
          id: "run-1",
          status: "completed",
          saved_count: 1,
          verified_count: 1,
          started_at: "not-a-date",
          completed_at: "2026-08-26T00:05:00.000Z",
        },
      },
    }));
    await assert.rejects(() => getHRProspects({ includeSuppressed: true }), /invalid response/i);
  });

  await context.test("prospect identifiers must be non-blank", async () => {
    captureFetch(jsonResponse({ ...response, data: [{ ...prospect, id: "  " }] }));
    await assert.rejects(() => getHRProspects({ includeSuppressed: true }), /invalid response/i);
  });
});

test("email thread reads validate live summaries and use deterministic missing-only samples", async (context) => {
  const getEmailThreads = (phase3 as typeof phase3 & { getEmailThreads: () => Promise<any> }).getEmailThreads;
  const getEmailThread = (phase3 as typeof phase3 & { getEmailThread: (id: string) => Promise<any> }).getEmailThread;

  await context.test("live list", async () => {
    const summary = emailThreadSummary();
    const calls = captureFetch(jsonResponse({ data: [summary], total: 1, unread: 1 }));
    assert.deepEqual(await getEmailThreads(), { sample: false, data: [summary], total: 1, unread: 1 });
    assert.equal(calls[0]?.url, "/api/email-threads");
  });

  await context.test("an unassigned thread may have a blank workflow label", async () => {
    const summary = emailThreadSummary({ workflowId: null, workflowName: "" });
    captureFetch(jsonResponse({ data: [summary], total: 1, unread: 1 }));
    assert.deepEqual(await getEmailThreads(), { sample: false, data: [summary], total: 1, unread: 1 });
  });

  await context.test("live detail", async () => {
    const thread = emailThreadRecord({ id: "email/thread 1" });
    const calls = captureFetch(jsonResponse({ data: thread }));
    assert.deepEqual(await getEmailThread("email/thread 1"), { sample: false, data: thread });
    assert.equal(calls[0]?.url, "/api/email-threads/email%2Fthread%201");
  });

  await context.test("deterministic samples", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    const first = await getEmailThreads();
    const second = await getEmailThreads();
    assert.equal(first.sample, true);
    assert.deepEqual(second, first);
    assert.deepEqual(await getEmailThread("unknown"), { sample: true, data: null });
  });

  await context.test("a record 404 never becomes a sample when the collection endpoint is live", async () => {
    const calls = captureFetchSequence([
      jsonResponse({ error: "Email thread not found" }, 404),
      jsonResponse({ data: [], total: 0, unread: 0 }),
    ]);

    assert.deepEqual(await getEmailThread("email-thread-1"), { sample: false, data: null });
    assert.deepEqual(calls.map((call) => call.url), [
      "/api/email-threads/email-thread-1",
      "/api/email-threads",
    ]);
  });

  await context.test("malformed totals", async () => {
    captureFetch(jsonResponse({ data: [emailThreadSummary()], total: 2, unread: 0 }));
    await assert.rejects(() => getEmailThreads(), /invalid response/i);
  });

  await context.test("network failure", async () => {
    globalThis.fetch = (async () => { throw new TypeError("offline"); }) as typeof fetch;
    await assert.rejects(() => getEmailThreads(), /could not reach/i);
  });
});

test("email replies post an idempotent strict mutation and validate the exact thread outcome", async (context) => {
  const replyToEmailThread = (phase3 as typeof phase3 & {
    replyToEmailThread: (id: string, body: string, idempotencyKey: string) => Promise<any>;
  }).replyToEmailThread;

  await context.test("live", async () => {
    const response = {
      sent: true,
      threadId: "email/thread 1",
      messageId: "provider-message-1",
      sentAt: "2026-08-26T05:00:00.000Z",
    };
    const calls = captureFetch(jsonResponse(response));
    assert.deepEqual(await replyToEmailThread("email/thread 1", "Here is the one-pager.", "reply-key-1"), {
      sample: false,
      ...response,
    });
    assert.equal(calls[0]?.url, "/api/email-threads/email%2Fthread%201/reply");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      body: "Here is the one-pager.",
      idempotencyKey: "reply-key-1",
    });
  });

  await context.test("missing endpoint", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    await assert.rejects(() => replyToEmailThread("thread-1", "Hello", "key-1"), /Not found/);
  });

  await context.test("mismatched thread", async () => {
    captureFetch(jsonResponse({ sent: true, threadId: "thread-2", messageId: "message-1", sentAt: "2026-08-26T05:00:00.000Z" }));
    await assert.rejects(() => replyToEmailThread("thread-1", "Hello", "key-1"), /invalid response/i);
  });
});

test("email account reads are labelled and action mutations are discriminated and strict", async (context) => {
  const getEmailAccount = (phase3 as typeof phase3 & { getEmailAccount: () => Promise<any> }).getEmailAccount;
  const updateEmailAccount = (phase3 as typeof phase3 & {
    updateEmailAccount: (input: Record<string, unknown>) => Promise<any>;
  }).updateEmailAccount;

  await context.test("live read", async () => {
    const account = emailAccount();
    const calls = captureFetch(jsonResponse({ data: account }));
    assert.deepEqual(await getEmailAccount(), { sample: false, data: account });
    assert.equal(calls[0]?.url, "/api/email-account");
  });

  await context.test("deterministic sample read", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    const first = await getEmailAccount();
    assert.equal(first.sample, true);
    assert.deepEqual(await getEmailAccount(), first);
  });

  await context.test("connecting and error states remain explicit", async () => {
    const connecting = emailAccount({
      status: "connecting",
      address: null,
      displayName: null,
      connectedAt: null,
      lastSyncAt: null,
      cap: { limit: 0, used: 0, remaining: 0 },
    });
    captureFetch(jsonResponse({ data: connecting }));
    assert.deepEqual(await getEmailAccount(), { sample: false, data: connecting });

    const errored = emailAccount({ status: "error", error: "OAuth access was revoked." });
    captureFetch(jsonResponse({ data: errored }));
    assert.deepEqual(await getEmailAccount(), { sample: false, data: errored });
  });

  await context.test("connect", async () => {
    const calls = captureFetch(jsonResponse({ authorizationUrl: "https://accounts.google.com/o/oauth2/auth?state=opaque" }));
    assert.deepEqual(await updateEmailAccount({ action: "connect", provider: "google" }), {
      sample: false,
      action: "connect",
      authorizationUrl: "https://accounts.google.com/o/oauth2/auth?state=opaque",
    });
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { action: "connect", provider: "google" });
  });

  await context.test("disconnect", async () => {
    const disconnected = emailAccount({
      status: "disconnected",
      provider: null,
      address: null,
      displayName: null,
      connectedAt: null,
      lastSyncAt: null,
      error: null,
      cap: { limit: 0, used: 0, remaining: 0 },
    });
    const calls = captureFetch(jsonResponse({ data: disconnected }));
    assert.deepEqual(await updateEmailAccount({ action: "disconnect" }), {
      sample: false,
      action: "disconnect",
      data: disconnected,
    });
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { action: "disconnect" });
  });

  await context.test("send-test", async () => {
    const calls = captureFetch(jsonResponse({ sent: true, messageId: "test-message-1" }));
    assert.deepEqual(await updateEmailAccount({ action: "send-test" }), {
      sample: false,
      action: "send-test",
      sent: true,
      messageId: "test-message-1",
    });
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { action: "send-test" });
  });

  await context.test("invalid cap", async () => {
    captureFetch(jsonResponse({ data: emailAccount({ cap: { limit: 50, used: 12, remaining: 39 } }) }));
    await assert.rejects(() => getEmailAccount(), /invalid response/i);
  });

  await context.test("missing account observability fields", async () => {
    const { lastSyncAt: _lastSyncAt, ...missingLastSync } = emailAccount();
    captureFetch(jsonResponse({ data: missingLastSync }));
    await assert.rejects(() => getEmailAccount(), /invalid response/i);
  });

  await context.test("missing mutation endpoint", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    await assert.rejects(() => updateEmailAccount({ action: "send-test" }), /Not found/);
  });
});

test("approveSendBatch posts the exact Phase 2 contract and returns validated live data", async () => {
  const calls = captureFetch(jsonResponse({
    approved: 2,
    itemIds: ["recipient-1", "recipient-2"],
    intervalSeconds: 60,
    firstScheduledAt: "2026-08-30T02:00:00.000Z",
    lastScheduledAt: "2026-08-30T02:01:00.000Z",
  }));

  const result = await approveSendBatch(["recipient-1", "recipient-2"]);

  assert.deepEqual(result, {
    approved: 2,
    itemIds: ["recipient-1", "recipient-2"],
    retryableItemIds: [],
    intervalSeconds: 60,
    firstScheduledAt: "2026-08-30T02:00:00.000Z",
    lastScheduledAt: "2026-08-30T02:01:00.000Z",
  });
  assert.equal(calls[0]?.url, "/api/send-queue/approve-batch");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    itemIds: ["recipient-1", "recipient-2"],
    consentConfirmed: true,
  });
});

test("getSendQueue rejects malformed live caps and queue items", async (context) => {
  await context.test("invalid cap", async () => {
    captureFetch(jsonResponse({ cap: { limit: 20, used: "four", scheduled: 0, remaining: 16, windowHours: 12, resetsAt: "2026-08-27T04:00:00.000Z" }, totalQueued: 0, batch: [] }));
    await assert.rejects(() => getSendQueue(), /invalid response/i);
  });

  await context.test("invalid queue item", async () => {
    captureFetch(jsonResponse({ cap: { limit: 20, used: 4, scheduled: 1, remaining: 16, windowHours: 12, resetsAt: "2026-08-27T04:00:00.000Z" }, totalQueued: 1, batch: [{ recipientId: null }] }));
    await assert.rejects(() => getSendQueue(), /invalid response/i);
  });
});

test("getSendQueue preserves truthful over-cap usage while accepting an empty batch", async () => {
  const payload = {
    cap: { limit: 20, used: 24.5, scheduled: 4, remaining: 0, windowHours: 12, resetsAt: "2026-08-27T04:00:00.000Z" },
    totalQueued: 3,
    batch: [],
  };
  captureFetch(jsonResponse(payload));

  assert.deepEqual(await getSendQueue(), payload);
});

test("getSendQueue floors remaining capacity for truthful fractional under-cap usage", async () => {
  const payload = {
    cap: { limit: 20, used: 4.5, scheduled: 2, remaining: 15, windowHours: 12, resetsAt: "2026-08-27T04:00:00.000Z" },
    totalQueued: 0,
    batch: [],
  };
  captureFetch(jsonResponse(payload));

  assert.deepEqual(await getSendQueue(), payload);
});

test("approveSendBatch rejects empty batches before making a request", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return jsonResponse({ approved: 0, itemIds: [] });
  }) as typeof fetch;

  await assert.rejects(() => approveSendBatch([]), /at least one queued item/i);
  assert.equal(called, false);
});

test("approveSendBatch returns exact completed and retryable ids from a partial 2xx response", async () => {
  captureFetch(jsonResponse({
    approved: 1,
    itemIds: ["recipient-1"],
    intervalSeconds: 60,
    firstScheduledAt: "2026-08-30T02:00:00.000Z",
    lastScheduledAt: "2026-08-30T02:00:00.000Z",
  }));

  assert.deepEqual(
    await approveSendBatch(["recipient-1", "recipient-2"]),
    {
      approved: 1,
      itemIds: ["recipient-1"],
      retryableItemIds: ["recipient-2"],
      intervalSeconds: 60,
      firstScheduledAt: "2026-08-30T02:00:00.000Z",
      lastScheduledAt: "2026-08-30T02:00:00.000Z",
    },
  );
});

test("approveSendBatch rejects a partial 2xx response that does not identify completed items", async () => {
  captureFetch(jsonResponse({ approved: 1 }));

  await assert.rejects(
    () => approveSendBatch(["recipient-1", "recipient-2"]),
    /invalid.*response/i,
  );
});

test("approveSendBatch rejects a success body that identifies the wrong recipients", async () => {
  captureFetch(jsonResponse({ approved: 2, itemIds: ["recipient-1", "recipient-3"] }));

  await assert.rejects(
    () => approveSendBatch(["recipient-1", "recipient-2"]),
    /invalid.*response/i,
  );
});

test("strict batch approval surfaces backend, network, and malformed-response failures", async (context) => {
  await context.test("backend error", async () => {
    captureFetch(jsonResponse({ error: "Daily sending limit reached" }, 429));
    await assert.rejects(() => approveSendBatch(["recipient-1"]), /Daily sending limit reached/);
  });

  await context.test("network error", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    await assert.rejects(() => approveSendBatch(["recipient-1"]), /could not reach/i);
  });

  await context.test("malformed live response", async () => {
    captureFetch(jsonResponse({ success: true }));
    await assert.rejects(() => approveSendBatch(["recipient-1"]), /invalid.*response/i);
  });
});

test("getThreads encodes a campaign filter and labels a validated live response", async () => {
  const thread = {
    id: 7,
    leadId: 3,
    campaignId: "campaign/June & July",
    leadName: "Jamie Lim",
    initials: "JL",
    color: "mint",
    company: "WhatsApp",
    title: "WhatsApp reply",
    email: "jamie@example.com",
    phone: "+6591234567",
    campaign: "June Seminar",
    subject: "June Seminar",
    preview: "Interested",
    occurredAt: "2026-08-26T02:00:00.000Z",
    read: false,
    starred: false,
    category: "Interested",
    thread: [{
      id: "message-7",
      from: "lead",
      senderName: "Jamie Lim",
      senderContact: "+6591234567",
      occurredAt: "2026-08-26T02:00:00.000Z",
      body: "[Sticker received]",
      attachment: {
        kind: "sticker",
        name: "sticker.webp",
        url: "https://storage.example.test/sticker.webp?token=signed",
        mimeType: "image/webp",
      },
    }],
  };
  const calls = captureFetch(jsonResponse({ data: [thread], total: 1, unread: 1 }));

  const result = await getThreads("campaign/June & July");

  assert.equal(calls[0]?.url, "/api/threads?campaign=campaign%2FJune+%26+July");
  assert.deepEqual(result, { sample: false, data: [thread], total: 1, unread: 1 });
});

test("legacy reply fallback matches the requested campaign by id or exact campaign title", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("/api/threads")) return jsonResponse({ error: "Not found" }, 404);
    if (url === "/api/replies") {
      return jsonResponse({
        data: [
          threadRecord({ id: 7, campaignId: "legacy-id", campaign: "June Seminar" }),
          threadRecord({ id: 8, campaignId: "other-id", campaign: "Other campaign" }),
        ],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const result = await getThreads("campaign-uuid", "June Seminar");

  assert.deepEqual(calls, ["/api/threads?campaign=campaign-uuid", "/api/replies"]);
  assert.deepEqual(result.data.map((thread) => thread.id), [7]);
  assert.equal(result.sample, false);
});

test("thread reads fall back to deterministic labelled samples when the endpoint is unavailable", async () => {
  captureFetch(jsonResponse({ error: "Not found" }, 404));
  const list = await getThreads("campaign-june-seminar");

  assert.equal(list.sample, true);
  assert.ok(list.data.length > 0);
  assert.ok(list.data.every((thread) => thread.campaignId === "campaign-june-seminar"));
  assert.equal(list.total, list.data.length);
  assert.equal(list.unread, list.data.filter((thread) => !thread.read).length);
});

test("thread reads surface a stable error when both primary and legacy services are unreachable", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("offline");
  }) as typeof fetch;

  await assert.rejects(() => getThreads(), /could not reach/i);
});

test("malformed thread reads surface errors instead of becoming sample data", async () => {
  captureFetch(jsonResponse({ data: [{ id: 999 }], total: 1, unread: 0 }));

  await assert.rejects(() => getThreads("unknown-campaign"), /invalid response/i);
});

test("filtered thread reads reject unrelated campaigns and inconsistent totals", async (context) => {
  const thread = {
    id: 7,
    leadId: 3,
    campaignId: "another-campaign",
    leadName: "Jamie Lim",
    initials: "JL",
    color: "mint",
    company: "WhatsApp",
    title: "WhatsApp reply",
    email: "jamie@example.com",
    phone: "+6591234567",
    campaign: "Another campaign",
    subject: "Another campaign",
    preview: "Interested",
    occurredAt: "2026-08-26T02:00:00.000Z",
    read: false,
    starred: false,
    category: "Interested",
    thread: [],
  };

  await context.test("wrong campaign", async () => {
    captureFetch(jsonResponse({ data: [thread], total: 1, unread: 1 }));
    await assert.rejects(() => getThreads("requested-campaign"), /invalid response/i);
  });

  await context.test("wrong totals", async () => {
    captureFetch(jsonResponse({ data: [{ ...thread, campaignId: "requested-campaign" }], total: 2, unread: 0 }));
    await assert.rejects(() => getThreads("requested-campaign"), /invalid response/i);
  });
});

test("getThread addresses encoded ids and returns null for unknown sample deep links", async (context) => {
  await context.test("live id", async () => {
    const calls = captureFetch(jsonResponse({ data: {
      id: 7,
      leadId: null,
      campaignId: null,
      leadName: "Jamie Lim",
      initials: "JL",
      color: "mint",
      company: "WhatsApp",
      title: "WhatsApp reply",
      email: "WhatsApp contact",
      phone: null,
      campaign: "Direct WhatsApp conversation",
      subject: "WhatsApp reply",
      preview: "Hello",
      occurredAt: "2026-08-26T02:00:00.000Z",
      read: true,
      starred: false,
      category: "Question",
      thread: [],
    } }));
    const result = await getThread(7);
    assert.equal(calls[0]?.url, "/api/threads/7");
    assert.equal(result.sample, false);
  });

  await context.test("mismatched live id", async () => {
    captureFetch(jsonResponse({ data: {
      id: 7,
      leadId: null,
      campaignId: null,
      leadName: "Wrong thread",
      initials: "WT",
      color: "mint",
      company: "WhatsApp",
      title: "WhatsApp reply",
      email: "WhatsApp contact",
      phone: null,
      campaign: "Direct WhatsApp conversation",
      subject: "WhatsApp reply",
      preview: "Wrong",
      occurredAt: "2026-08-26T02:00:00.000Z",
      read: true,
      starred: false,
      category: "Question",
      thread: [],
    } }));
    await assert.rejects(() => getThread(8), /invalid response/i);
  });

  await context.test("unknown sample id", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    const result = await getThread("does-not-exist");
    assert.deepEqual(result, { sample: true, data: null });
  });

  await context.test("plain-text missing detail endpoint falls back to legacy replies", async () => {
    const legacyThread = threadRecord({ id: 10 });
    const calls = captureFetchSequence([
      new Response("The page could not be found\n\nNOT_FOUND", {
        status: 404,
        headers: { "content-type": "text/plain" },
      }),
      jsonResponse({ data: [legacyThread] }),
    ]);

    const result = await getThread(10);

    assert.deepEqual(calls.map((call) => call.url), ["/api/threads/10", "/api/replies"]);
    assert.deepEqual(result, { sample: false, data: legacyThread });
  });

  await context.test("malformed live detail", async () => {
    captureFetch(jsonResponse({ data: { id: 404 } }));
    await assert.rejects(() => getThread("malformed-thread"), /invalid response/i);
  });
});

test("importLeads posts rows and editable mapping without simulating success", async () => {
  const rows = [{ FullName: "Jamie Lim", Mobile: "+6591234567" }];
  const mapping = { name: "FullName", phone: "Mobile" };
  const calls = captureFetch(jsonResponse({ added: 1 }));

  const result = await importLeads(rows, mapping);

  assert.deepEqual(result, { sample: false, added: 1, skippedDuplicates: [], errors: [] });
  assert.equal(calls[0]?.url, "/api/leads/import");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { rows, mapping });
});

test("importLeads leaves row and mapping requirements to the documented backend contract", async () => {
  const calls = captureFetch(jsonResponse({ added: 0 }));

  assert.deepEqual(await importLeads([], {}), {
    sample: false,
    added: 0,
    skippedDuplicates: [],
    errors: [],
  });
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { rows: [], mapping: {} });
});

test("importLeads propagates backend validation errors", async () => {
  const mapping = { name: "FullName", phone: "Mobile" };

  captureFetch(jsonResponse({ error: "Phone column is required" }, 422));
  await assert.rejects(() => importLeads([{ FullName: "Jamie" }], mapping), /Phone column is required/);
});

test("importLeads does not invent an undocumented upper bound for the backend added count", async () => {
  captureFetch(jsonResponse({ added: 2 }));

  assert.equal((await importLeads([{ FullName: "Jamie" }], { name: "FullName" })).added, 2);
});

test("importLeads validates report row shape without imposing undocumented workbook bounds", async () => {
  captureFetch(jsonResponse({
    added: 0,
    skippedDuplicates: [{ row: 0, reason: "Duplicate email" }],
  }));

  const result = await importLeads([{ FullName: "Jamie" }], { name: "FullName" });
  assert.deepEqual(result.skippedDuplicates, [{ row: 0, reason: "Duplicate email" }]);
});

test("importLeads rejects malformed optional lead records", async () => {
  captureFetch(jsonResponse({
    added: 1,
    skippedDuplicates: [],
    errors: [],
    data: [{ id: 1 }],
  }));

  await assert.rejects(
    () => importLeads([{ FullName: "Jamie" }], { name: "FullName" }),
    /invalid response/i,
  );
});

test("importLeads accepts independently valid optional reports without undocumented accounting rules", async (context) => {
  const rows = [{ FullName: "Jamie" }, { FullName: "Aisha" }];
  const importedLead = {
    id: 1,
    source_row: 2,
    name: "Jamie",
    dob: null,
    age: null,
    age_band: null,
    phone: "+6591234567",
    email: null,
    topics: [],
    status: "Untouched",
    struck: false,
    subscribed: true,
    unsubscribed_at: null,
    first_captured: "2026-08-26T00:00:00.000Z",
    remarks: null,
    source_tabs: "Import",
  };

  await context.test("optional data count disagrees with added", async () => {
    captureFetch(jsonResponse({ added: 2, skippedDuplicates: [], errors: [], data: [importedLead] }));
    const result = await importLeads(rows, { name: "FullName" });
    assert.deepEqual(result.data, [importedLead]);
  });

  await context.test("a workbook row has no outcome", async () => {
    captureFetch(jsonResponse({ added: 1, skippedDuplicates: [], errors: [] }));
    assert.equal((await importLeads(rows, { name: "FullName" })).added, 1);
  });

  await context.test("one row is both duplicate and invalid", async () => {
    captureFetch(jsonResponse({
      added: 0,
      skippedDuplicates: [{ row: 2, reason: "Duplicate phone" }],
      errors: [{ row: 2, field: "phone", message: "Invalid phone" }],
    }));
    const result = await importLeads([{ FullName: "Jamie" }], { name: "FullName" });
    assert.equal(result.skippedDuplicates.length, 1);
    assert.equal(result.errors.length, 1);
  });
});

test("campaign detail uses the exact endpoint and safely falls back for known and unknown ids", async (context) => {
  await context.test("live", async () => {
    const campaign = {
      id: "campaign/live",
      title: "Live campaign",
      poster_name: null,
      poster_path: null,
      subject: "Hello",
      message: "Hello {{first_name}}",
      audience: { ageBands: [], topics: [], statuses: [] },
      audience_count: 8,
      status: "queued",
      created_at: "2026-08-20T00:00:00.000Z",
      updated_at: "2026-08-26T00:00:00.000Z",
    };
    const calls = captureFetch(jsonResponse({ data: campaign }));
    const result = await getCampaignDetail("campaign/live");
    assert.equal(calls[0]?.url, "/api/campaigns/campaign%2Flive");
    assert.deepEqual(result, { sample: false, data: campaign });
  });

  await context.test("worker-shaped live campaign with omitted audience arrays", async () => {
    const campaign = {
      id: "campaign/live",
      title: "Live campaign",
      poster_name: null,
      poster_path: null,
      subject: "Hello",
      message: "Hello {{first_name}}",
      audience: {},
      audience_count: 8,
      status: "queued",
      created_at: "2026-08-20T00:00:00.000Z",
      updated_at: "2026-08-26T00:00:00.000Z",
    };
    captureFetch(jsonResponse({ data: campaign }));

    const result = await getCampaignDetail("campaign/live");

    assert.deepEqual(result.data?.audience, { ageBands: [], topics: [], statuses: [] });
  });

  await context.test("known sample", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    const result = await getCampaignDetail("campaign-june-seminar");
    assert.equal(result.sample, true);
    assert.equal(result.data?.id, "campaign-june-seminar");
  });

  await context.test("unknown sample", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    const result = await getCampaignDetail("missing-campaign");
    assert.deepEqual(result, { sample: true, data: null });
  });

  await context.test("malformed live detail", async () => {
    captureFetch(jsonResponse({ data: { id: "campaign-june-seminar" } }));
    await assert.rejects(
      () => getCampaignDetail("campaign-june-seminar"),
      /invalid response/i,
    );
  });

  await context.test("mismatched live detail id", async () => {
    captureFetch(jsonResponse({ data: {
      id: "another-campaign",
      title: "Wrong campaign",
      poster_name: null,
      poster_path: null,
      subject: "Wrong",
      message: "Wrong",
      audience: { ageBands: [], topics: [], statuses: [] },
      audience_count: 1,
      status: "draft",
      created_at: "2026-08-26T00:00:00.000Z",
      updated_at: "2026-08-26T00:00:00.000Z",
    } }));
    await assert.rejects(
      () => getCampaignDetail("campaign-june-seminar"),
      /invalid response/i,
    );
  });

  await context.test("service failure is not replaced by sample campaign data", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    await assert.rejects(
      () => getCampaignDetail("campaign-june-seminar"),
      /could not reach/i,
    );
  });
});

test("legacy stub mutations only use labelled local fallbacks for definitively missing endpoints", async (context) => {
  await context.test("404 can use a labelled local fallback", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    assert.deepEqual(
      await updateProspectReview("prospect-1", { review_status: "qualified" }),
      { sample: true },
    );
  });

  await context.test("server errors do not become fake draft saves", async () => {
    captureFetch(jsonResponse({ error: "Database unavailable" }, 503));
    await assert.rejects(
      () => updateOutreachDraft("d1", { subject: "Changed" }),
      /Database unavailable/,
    );
  });

  await context.test("missing draft update remains a strict backend failure", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    await assert.rejects(
      () => updateOutreachDraft("unknown-draft", { subject: "Changed" }),
      /Not found/,
    );
  });

  await context.test("null prospect data is not accepted as a successful mutation", async () => {
    captureFetch(jsonResponse({ data: null }));
    await assert.rejects(
      () => updateProspectReview("prospect-1", { review_status: "qualified" }),
      /invalid response/i,
    );
  });

  await context.test("empty draft data is not accepted as a successful mutation", async () => {
    captureFetch(jsonResponse({ data: {} }));
    await assert.rejects(
      () => updateOutreachDraft("d1", { subject: "Changed" }),
      /invalid response/i,
    );
  });

  await context.test("network failures do not become fake prospect decisions", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    await assert.rejects(
      () => updateProspectReview("prospect-1", { review_status: "qualified" }),
      /could not reach/i,
    );
  });
});

test("settings are not locally persisted after a failed live mutation", async () => {
  const values = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });
  const settings: HiHuntSettings = {
    discovery: { location: "Singapore", companyDomain: "", seniorities: [], dailyLimit: 15, autoRunEnabled: true },
    outreach: { valueProp: "Value", senderName: "JJ", signoff: "Thanks" },
  };

  try {
    captureFetch(jsonResponse({ error: "Database unavailable" }, 503));
    await assert.rejects(() => saveSettings(settings), /Database unavailable/);
    assert.equal(values.size, 0);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("settings reads validate live data and use only deterministic labelled missing-endpoint defaults", async (context) => {
  const settings: HiHuntSettings = {
    discovery: { location: "Singapore", companyDomain: "example.com", seniorities: ["director"], dailyLimit: 15, autoRunEnabled: true },
    outreach: { valueProp: "Value", senderName: "JJ", signoff: "Thanks" },
  };

  await context.test("live read", async () => {
    const calls = captureFetch(jsonResponse({ data: settings }));
    assert.deepEqual(await getSettings(), { sample: false, data: settings });
    assert.equal(calls[0]?.url, "/api/hihunt-settings");
  });

  await context.test("deterministic missing endpoint", async () => {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    const first = await getSettings();
    assert.equal(first.sample, true);
    first.data.outreach.senderName = "Changed locally";
    const second = await getSettings();
    assert.equal(second.sample, true);
    assert.equal(second.data.outreach.senderName, "Hilite");
  });

  await context.test("malformed live response", async () => {
    captureFetch(jsonResponse({ data: { discovery: {}, outreach: {} } }));
    await assert.rejects(() => getSettings(), /invalid response/i);
  });

  await context.test("service failure", async () => {
    captureFetch(jsonResponse({ error: "Database unavailable" }, 503));
    await assert.rejects(() => getSettings(), /Database unavailable/);
  });
});

test("settings saves require the live service to echo the whole persisted object", async () => {
  const values = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });
  const settings: HiHuntSettings = {
    discovery: { location: "Singapore", companyDomain: "", seniorities: ["director"], dailyLimit: 15, autoRunEnabled: true },
    outreach: { valueProp: "Value", senderName: "JJ", signoff: "Thanks" },
  };
  const stale = { ...settings, outreach: { ...settings.outreach, senderName: "Old sender" } };

  try {
    captureFetch(jsonResponse({ data: stale }));
    await assert.rejects(() => saveSettings(settings), /invalid response/i);
    assert.equal(values.size, 0);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("missing settings endpoint is a strict failure and never a local save", async () => {
  const values = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });
  const settings: HiHuntSettings = {
    discovery: { location: "Singapore", companyDomain: "", seniorities: ["director"], dailyLimit: 15, autoRunEnabled: true },
    outreach: { valueProp: "Value", senderName: "JJ", signoff: "Thanks" },
  };

  try {
    captureFetch(jsonResponse({ error: "Not found" }, 404));
    await assert.rejects(() => saveSettings(settings), /Not found/);
    assert.equal(values.size, 0);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
