import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { afterEach } from "node:test";
import {
  createHRCampaign,
  deleteCampaign,
  deleteHRCampaign,
  getHRCampaign,
  sendReply,
  sendHRCampaign,
  setCampaignStatus,
  updateLead,
  updateHRCampaign,
  updateReply,
} from "./api";
import { handleApiRequest, hasSendableHRWorkEmail, hihuntEmailSendWindow, singaporeSendWindow } from "../../worker/supabase-api.js";

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
    return response;
  }) as typeof fetch;
  return calls;
}

test("Singapore send caps reset at midnight and noon", () => {
  assert.deepEqual(singaporeSendWindow(new Date("2026-08-27T03:59:59.999Z")), {
    startedAt: "2026-08-26T16:00:00.000Z",
    resetsAt: "2026-08-27T04:00:00.000Z",
    hours: 12,
  });
  assert.deepEqual(singaporeSendWindow(new Date("2026-08-27T04:00:00.000Z")), {
    startedAt: "2026-08-27T04:00:00.000Z",
    resetsAt: "2026-08-27T16:00:00.000Z",
    hours: 12,
  });
});

test("the backend accepts evidenced public company listings without calling them verified", () => {
  const publicListing = {
    provider: "public_web",
    email_status: "public",
    work_email: "aisha.lim@example.com",
    company_domain: "example.com",
    source_metadata: { public_company_listing: true },
  };
  assert.equal(hasSendableHRWorkEmail(publicListing), true);
  assert.equal(hasSendableHRWorkEmail({ ...publicListing, work_email: "aisha@gmail.com", company_domain: "gmail.com" }), false);
  assert.equal(hasSendableHRWorkEmail({ ...publicListing, company_domain: "other.example" }), false);
  assert.equal(hasSendableHRWorkEmail({ ...publicListing, source_metadata: {} }), false);
  assert.equal(hasSendableHRWorkEmail({ ...publicListing, provider: "apollo", email_status: "verified" }), true);
});

test("WhatsApp status preserves an authenticated relay diagnostic returned with 503", async () => {
  const calls = captureFetch(jsonResponse({
    configured: true,
    connected: false,
    provider: "Hermes",
    channel: "WhatsApp",
    accountName: "HiHunt WhatsApp",
    deliveryReady: false,
    bridgeStatus: "unavailable",
    diagnosticCode: "bridge_unavailable",
    requirements: ["Start the Docker gateway with hermes gateway run"],
  }, 503));

  const response = await handleApiRequest(new Request("https://example.test/api/integrations/whatsapp"), {
    HERMES_RELAY_URL: "https://hermes.example.test",
    HERMES_RELAY_TOKEN: "test-relay-token-that-is-long-enough",
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.diagnosticCode, "bridge_unavailable");
  assert.equal(payload.bridgeStatus, "unavailable");
  assert.deepEqual(payload.requirements, ["Start the Docker gateway with hermes gateway run"]);
  assert.equal(calls[0]?.url, "https://hermes.example.test/health");
  assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer test-relay-token-that-is-long-enough");
});

test("Hi-Hunt email cap resets at 7:00 AM Singapore time", () => {
  assert.deepEqual(hihuntEmailSendWindow(new Date("2026-09-04T22:59:59.999Z")), {
    startedAt: "2026-09-03T23:00:00.000Z",
    resetsAt: "2026-09-04T23:00:00.000Z",
    hours: 24,
  });
  assert.deepEqual(hihuntEmailSendWindow(new Date("2026-09-04T23:00:00.000Z")), {
    startedAt: "2026-09-04T23:00:00.000Z",
    resetsAt: "2026-09-05T23:00:00.000Z",
    hours: 24,
  });
});

test("lead edit PATCH validates the returned target before reporting success", async () => {
  const calls = captureFetch(jsonResponse({ data: { id: 12 } }));
  await assert.rejects(() => updateLead(11, { name: "Jamie Lim" }), /invalid response/i);
  assert.equal(calls[0]?.url, "/api/leads/11");
  assert.equal(calls[0]?.init?.method, "PATCH");
});

test("campaign delete calls the exact campaign route and validates the response", async () => {
  const campaignId = "11111111-1111-4111-8111-111111111111";
  const calls = captureFetch(jsonResponse({ deleted: true, id: campaignId }));
  assert.deepEqual(await deleteCampaign(campaignId), { deleted: true, id: campaignId });
  assert.equal(calls[0]?.url, `/api/campaigns/${campaignId}`);
  assert.equal(calls[0]?.init?.method, "DELETE");

  captureFetch(jsonResponse({ deleted: true, id: "another-campaign" }));
  await assert.rejects(() => deleteCampaign(campaignId), /invalid response/i);
});

test("Hi-Hunt campaign client calls load and update drafts while preserving explicit send consent", async () => {
  const campaignId = "77777777-7777-4777-8777-777777777777";
  const prospectId = "88888888-8888-4888-8888-888888888888";
  const campaign = {
    id: campaignId,
    name: "Testing outreach",
    subject: "Hello testing",
    body: "Hi {{first_name}}",
    status: "draft",
    sender_email: "namiuser89@gmail.com",
    audience_count: 1,
    sent_count: 0,
    failed_count: 0,
    poster_name: null,
    poster_path: null,
    poster_mime_type: null,
    sent_at: null,
    created_at: "2026-08-29T09:00:00.000Z",
    updated_at: "2026-08-29T09:00:00.000Z",
  };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === `/api/hr-campaigns/${campaignId}`) {
      return jsonResponse({ data: { ...campaign, recipient_ids: [prospectId] } });
    }
    return url.endsWith("/send")
      ? jsonResponse({ sent: 1, failed: 0, skipped: 0, data: { ...campaign, status: "sent", sent_count: 1, sent_at: "2026-08-29T09:01:00.000Z" } })
      : jsonResponse({ data: campaign }, 201);
  }) as typeof fetch;

  await getHRCampaign(campaignId);
  await updateHRCampaign(campaignId, {
    name: "Updated outreach",
    subject: campaign.subject,
    body: campaign.body,
    recipientIds: [prospectId],
  });
  await createHRCampaign({
    name: campaign.name,
    subject: campaign.subject,
    body: campaign.body,
    recipientIds: [prospectId],
  });
  await sendHRCampaign(campaignId);

  assert.equal(calls[0]?.url, `/api/hr-campaigns/${campaignId}`);
  assert.equal(calls[0]?.init?.method, undefined);
  assert.equal(calls[1]?.url, `/api/hr-campaigns/${campaignId}`);
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    name: "Updated outreach",
    subject: campaign.subject,
    body: campaign.body,
    recipientIds: [prospectId],
  });
  assert.equal(calls[2]?.url, "/api/hr-campaigns");
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), {
    name: campaign.name,
    subject: campaign.subject,
    body: campaign.body,
    recipientIds: [prospectId],
  });
  assert.equal(calls[3]?.url, `/api/hr-campaigns/${campaignId}/send`);
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { consentConfirmed: true });
});

test("Hi-Hunt campaign delete calls only the email campaign route", async () => {
  const campaignId = "77777777-7777-4777-8777-777777777777";
  const calls = captureFetch(jsonResponse({ deleted: true, id: campaignId }));
  assert.deepEqual(await deleteHRCampaign(campaignId), { deleted: true, id: campaignId });
  assert.equal(calls[0]?.url, `/api/hr-campaigns/${campaignId}`);
  assert.equal(calls[0]?.init?.method, "DELETE");
  assert.equal(/whatsapp|hermes/i.test(calls[0]?.url || ""), false);
});

test("Hi-Hunt campaign DELETE removes only the selected email campaign", async () => {
  const campaignId = "77777777-7777-4777-8777-777777777777";
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    calls.push({ url, method });
    if (url.includes(`/rest/v1/hr_campaigns?id=eq.${campaignId}&select=id`) && method === "DELETE") {
      return jsonResponse([{ id: campaignId }]);
    }
    throw new Error(`Unexpected request: ${url} ${method}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request(`https://example.test/api/hr-campaigns/${campaignId}`, { method: "DELETE" }),
    { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true, id: campaignId });
  assert.equal(calls.some((call) => /whatsapp|hermes/i.test(call.url)), false);
});

test("Hi-Hunt campaign details reopen a draft and PATCH replaces only its email recipients", async () => {
  const campaignId = "77777777-7777-4777-8777-777777777777";
  const prospectId = "88888888-8888-4888-8888-888888888888";
  const createdAt = "2026-08-30T08:00:00.000Z";
  const campaign = {
    id: campaignId,
    name: "Original draft",
    subject: "Original subject",
    body: "Hi {{first_name}}",
    status: "draft",
    sender_email: "namiuser89@gmail.com",
    audience_count: 1,
    poster_name: null,
    poster_path: null,
    poster_mime_type: null,
    sent_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const prospect = {
    id: prospectId,
    full_name: "testing",
    work_email: "kamisanma13@gmail.com",
    email_status: "verified",
    suppressed: false,
  };
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  let detailRead = true;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" && /^[\[{]/.test(init.body) ? JSON.parse(init.body) : init?.body;
    calls.push({ url, method, body });
    if (url.includes(`/rest/v1/hr_campaigns?id=eq.${campaignId}&select=*`) && method === "GET") return jsonResponse([campaign]);
    if (url.includes("/rest/v1/hr_campaign_recipients?campaign_id=eq.") && url.includes("select=prospect_id,status") && method === "GET") {
      detailRead = false;
      return jsonResponse([{ prospect_id: prospectId, status: "queued" }]);
    }
    if (url.includes(`/rest/v1/hr_prospects?id=in.(${prospectId})`) && method === "GET") return jsonResponse([prospect]);
    if (url.includes("select=campaign_id,prospect_id,prospect_name,email,status") && method === "GET") {
      return jsonResponse([{ campaign_id: campaignId, prospect_id: prospectId, prospect_name: "testing", email: prospect.work_email, status: "queued" }]);
    }
    if (url.includes("/rest/v1/hr_campaign_recipients?campaign_id=eq.") && method === "DELETE") return jsonResponse([]);
    if (url.endsWith("/rest/v1/hr_campaign_recipients") && method === "POST") return jsonResponse([], 201);
    if (url.includes(`/rest/v1/hr_campaigns?id=eq.${campaignId}&status=eq.draft&select=*`) && method === "PATCH") {
      return jsonResponse([{ ...campaign, name: "Edited draft", subject: "Edited subject", updated_at: "2026-08-30T08:05:00.000Z" }]);
    }
    throw new Error(`Unexpected request: ${url} ${method}${detailRead ? " during detail read" : ""}`);
  }) as typeof fetch;

  const env = { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" };
  const detailResponse = await handleApiRequest(new Request(`https://example.test/api/hr-campaigns/${campaignId}`), env);
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.deepEqual(detail.data.recipient_ids, [prospectId]);

  const updateResponse = await handleApiRequest(new Request(`https://example.test/api/hr-campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Edited draft",
      subject: "Edited subject",
      body: campaign.body,
      recipientIds: [prospectId],
    }),
  }), env);
  const updated = await updateResponse.json();
  assert.equal(updateResponse.status, 200, JSON.stringify(updated));
  assert.equal(updated.data.name, "Edited draft");
  assert.deepEqual(updated.data.recipient_ids, [prospectId]);
  const replacement = calls.find((call) => call.url.endsWith("/rest/v1/hr_campaign_recipients") && call.method === "POST");
  assert.deepEqual(replacement?.body, [{
    campaign_id: campaignId,
    prospect_id: prospectId,
    prospect_name: "testing",
    email: "kamisanma13@gmail.com",
    status: "queued",
  }]);
  assert.equal(calls.some((call) => /whatsapp|hermes/i.test(call.url)), false);
});

test("lead edits reject incomplete records instead of reporting a malformed 200 as saved", async () => {
  captureFetch(jsonResponse({
    data: {
      id: 11,
      source_row: 4,
      name: "Jamie Lim",
      age: null,
      age_band: null,
      phone: "+6591234567",
      email: null,
      topics: [],
      struck: false,
    },
  }));

  await assert.rejects(() => updateLead(11, { name: "Jamie Lim" }), /invalid response/i);
});

test("campaign pause PATCH validates the returned status before reporting success", async () => {
  const calls = captureFetch(jsonResponse({ data: { id: "campaign-1", status: "sending" } }));
  await assert.rejects(() => setCampaignStatus("campaign-1", "paused"), /invalid response/i);
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { status: "paused" });

  captureFetch(jsonResponse({ data: { id: "campaign-1", status: "paused" } }));
  await assert.rejects(() => setCampaignStatus("campaign-1", "paused"), /invalid response/i);
});

test("campaign resume uses a status-only transition instead of rebuilding recipients", async () => {
  const resumed = {
    id: "campaign-1",
    title: "Welcome back",
    poster_name: null,
    poster_path: null,
    subject: "Welcome back",
    message: "Hello",
    audience: { ageBands: [], topics: [], statuses: ["Untouched"] },
    audience_count: 12,
    status: "queued",
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
  };
  const calls = captureFetch(jsonResponse({ data: resumed }));

  assert.deepEqual(await setCampaignStatus("campaign-1", "queued"), { data: resumed });
  assert.equal(calls[0]?.url, "/api/campaigns/campaign-1");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { status: "queued" });
});

test("campaign mutations normalize audience arrays omitted by stored worker records", async () => {
  const resumed = {
    id: "campaign-1",
    title: "Welcome back",
    poster_name: null,
    poster_path: null,
    subject: "Welcome back",
    message: "Hello",
    audience: {},
    audience_count: 12,
    status: "queued",
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
  };
  captureFetch(jsonResponse({ data: resumed }));

  const result = await setCampaignStatus("campaign-1", "queued");

  assert.deepEqual(result.data.audience, { ageBands: [], topics: [], statuses: [] });
});

test("normalizing legacy delivery does not rebuild its campaign audience", async () => {
  const campaignId = "12121212-1212-4121-8121-121212121212";
  const audience = {
    ageBands: [],
    topics: [],
    statuses: ["Untouched"],
    delivery: {
      channel: "whatsapp",
      senderEmail: null,
      scheduledAt: null,
      ctaUrl: null,
      reminderDates: [],
    },
  };
  const current = {
    id: campaignId,
    title: "Legacy attendance",
    subject: "Legacy attendance",
    message: "Join our seminar.",
    audience,
    audience_count: 5,
    status: "sent",
  };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/rest/v1/campaigns?") && (!init?.method || init.method === "GET")) return jsonResponse([current]);
    if (url.includes("/rest/v1/campaigns?") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return jsonResponse([{ ...current, ...body }]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request(`https://example.test/api/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: current.title, subject: current.subject, message: current.message, audience }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });

  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(calls.some((call) => call.url.includes("campaign_recipients")), false);
  assert.equal(payload.audienceReset, false);
  assert.equal(payload.data.audience.delivery.attendanceCapacity, undefined);
  assert.equal(payload.data.message, "Hi {{first_name}} 👋\n\nJoin our seminar.");
});

test("the worker resumes a paused campaign without touching recipient rows", async () => {
  const campaignId = "11111111-1111-4111-8111-111111111111";
  const paused = { id: campaignId, status: "paused", audience_count: 12 };
  const resumed = { ...paused, status: "queued" };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse(calls.length === 1 ? [paused] : [resumed]);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request(`https://example.test/api/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "queued" }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => !call.url.includes("campaign_recipients")));
  const statusPatch = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>;
  assert.equal(statusPatch.status, "queued");
  assert.equal(typeof statusPatch.updated_at, "string");
});

test("resuming a paused campaign reactivates only its latest missed WhatsApp reminder", async () => {
  const campaignId = "11111111-1111-4111-8111-111111111111";
  const reminderAt = "2021-08-29T09:15:00.000Z";
  const paused = {
    id: campaignId,
    status: "paused",
    audience_count: 2,
    audience: {
      delivery: {
        channel: "whatsapp",
        scheduledAt: "2999-08-31T11:00:00.000Z",
        reminderDates: ["2020-08-28T09:15:00.000Z", reminderAt],
      },
    },
  };
  const resumed = { ...paused, status: "queued" };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/rest/v1/campaigns?") && (!init?.method || init.method === "GET")) return jsonResponse([paused]);
    if (url.includes("/rest/v1/campaigns?") && init?.method === "PATCH") return jsonResponse([resumed]);
    if (url.includes("/rest/v1/campaign_recipients?")) return jsonResponse([{ lead_id: 41 }, { lead_id: 42 }]);
    if (url.includes("/rest/v1/leads?")) {
      return jsonResponse([
        { id: 41, phone: "+6591111111" },
        { id: 42, phone: "+6592222222" },
      ]);
    }
    if (url.includes("on_conflict=campaign_id,lead_id,reminder_at")) return jsonResponse([{ id: "new-delivery" }]);
    if (url.includes("status=eq.skipped") && (!init?.method || init.method === "GET")) {
      return jsonResponse([{ id: "skipped-delivery" }]);
    }
    if (url.includes("campaign_reminder_deliveries?id=in.") && init?.method === "PATCH") return jsonResponse([]);
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request(`https://example.test/api/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "queued" }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.remindersActivated, 2);
  const reminderInsert = calls.find((call) => call.url.includes("on_conflict=campaign_id,lead_id,reminder_at"));
  const reminderRows = JSON.parse(String(reminderInsert?.init?.body)) as Array<Record<string, unknown>>;
  assert.deepEqual(reminderRows.map((row) => row.reminder_at), [reminderAt, reminderAt]);
  assert.ok(reminderRows.every((row) => row.status === "pending"));
  const skippedPatch = calls.find((call) => call.url.includes("campaign_reminder_deliveries?id=in."));
  const skippedBody = JSON.parse(String(skippedPatch?.init?.body)) as Record<string, unknown>;
  assert.equal(skippedBody.status, "pending");
  assert.equal(skippedBody.attempts, 0);
});

test("campaign listings use exact recipient delivery counts to repair stale status labels", async () => {
  const campaignId = "11111111-1111-4111-8111-111111111111";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/rest/v1/campaigns?")) {
      return jsonResponse([{ id: campaignId, title: "CPF seminar", status: "queued", audience_count: 3 }]);
    }
    if (url.includes("/rest/v1/campaign_recipients?")) {
      return jsonResponse([
        { campaign_id: campaignId, status: "sent" },
        { campaign_id: campaignId, status: "replied" },
        { campaign_id: campaignId, status: "sent" },
      ]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/campaigns"), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.data[0], {
    id: campaignId,
    title: "CPF seminar",
    status: "sent",
    audience_count: 3,
    delivery_total: 3,
    delivery_sent: 3,
  });
});

test("campaign listings preserve a paused reminder state after the initial messages finish", async () => {
  const campaignId = "33333333-3333-4333-8333-333333333333";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/rest/v1/campaigns?")) {
      return jsonResponse([{ id: campaignId, title: "Paused seminar", status: "paused", audience_count: 2 }]);
    }
    if (url.includes("/rest/v1/campaign_recipients?")) {
      return jsonResponse([
        { campaign_id: campaignId, status: "sent" },
        { campaign_id: campaignId, status: "replied" },
      ]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/campaigns"), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data[0].status, "paused");
  assert.equal(payload.data[0].delivery_sent, 2);
  assert.equal(payload.data[0].delivery_total, 2);
});

test("campaign DELETE removes the exact campaign and reports missing ids safely", async () => {
  const campaignId = "22222222-2222-4222-8222-222222222222";
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse([{ id: campaignId }]);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request(`https://example.test/api/campaigns/${campaignId}`, {
    method: "DELETE",
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });

  assert.deepEqual(await response.json(), { deleted: true, id: campaignId });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, new RegExp(`campaigns\\?id=eq\\.${campaignId}`));
  assert.equal(calls[0].init?.method, "DELETE");
  assert.equal(new Headers(calls[0].init?.headers).get("Prefer"), "return=representation");

  const invalid = await handleApiRequest(new Request("https://example.test/api/campaigns/not-a-uuid", {
    method: "DELETE",
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });
  assert.equal(invalid.status, 404);
  assert.equal(calls.length, 1);
});

test("queue preparation never overwrites an existing delivered recipient", async () => {
  const campaignId = "22222222-2222-4222-8222-222222222222";
  const campaign = {
    id: campaignId,
    title: "Welcome back",
    message: "Hello {{first_name}}",
    audience: { ageBands: [], topics: [], statuses: ["Untouched"] },
    audience_count: 2,
    status: "draft",
  };
  const leads = [
    { id: 1, email: "sent@example.com", age: 40, age_band: "35-44", topics: [], status: "Untouched", struck: false },
    { id: 2, email: "new@example.com", age: 41, age_band: "35-44", topics: [], status: "Untouched", struck: false },
  ];
  const insertCalls: Array<{ init?: RequestInit }> = [];
  const queuedDeletes: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/rest/v1/campaigns?") && method === "GET") return jsonResponse([campaign]);
    if (url.includes("/rest/v1/leads?")) return jsonResponse(leads);
    if (url.includes("/rest/v1/campaign_recipients?") && method === "DELETE") {
      queuedDeletes.push(url);
      return jsonResponse([]);
    }
    if (url.includes("/rest/v1/campaign_recipients?campaign_id=") && method === "GET") {
      return jsonResponse([{ lead_id: 1, email: "sent@example.com", status: "sent" }]);
    }
    if (url.includes("on_conflict=campaign_id,lead_id") && method === "POST") {
      insertCalls.push({ init });
      return jsonResponse([]);
    }
    if (url.includes("/rest/v1/campaigns?") && method === "PATCH") {
      return jsonResponse([{ ...campaign, status: "queued" }]);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request(`https://example.test/api/campaigns/${campaignId}/queue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });

  assert.equal(response.status, 200);
  assert.equal(queuedDeletes.length, 1);
  assert.match(queuedDeletes[0], /status=eq\.queued/);
  assert.equal(insertCalls.length, 1);
  assert.deepEqual(JSON.parse(String(insertCalls[0]?.init?.body)).map((row: { lead_id: number }) => row.lead_id), [2]);
  assert.equal(new Headers(insertCalls[0]?.init?.headers).get("prefer"), "resolution=ignore-duplicates");
  assert.equal((await response.json()).queued, 1);
});

test("audience changes delete only unsent queued recipients", async () => {
  const campaignId = "33333333-3333-4333-8333-333333333333";
  const current = {
    id: campaignId,
    title: "Current",
    subject: "Current",
    message: "Current",
    audience: { ageBands: ["35-44"], topics: [], statuses: [] },
    audience_count: 4,
    status: "draft",
  };
  const deleteUrls: string[] = [];
  const mutationOrder: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/rest/v1/campaigns?") && method === "GET") return jsonResponse([current]);
    if (url.includes("/rest/v1/leads?")) return jsonResponse([]);
    if (url.includes("/rest/v1/campaigns?") && method === "PATCH") {
      mutationOrder.push("patch");
      return jsonResponse([{ ...current, audience: { ageBands: ["45-54"], topics: [], statuses: [] }, status: "draft" }]);
    }
    if (url.includes("/rest/v1/campaign_recipients?") && method === "DELETE") {
      mutationOrder.push("delete");
      deleteUrls.push(url);
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request(`https://example.test/api/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Current",
      subject: "Current",
      message: "Current",
      audience: { ageBands: ["45-54"], topics: [], statuses: [] },
    }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });

  assert.equal(response.status, 200);
  assert.equal(deleteUrls.length, 1);
  assert.match(deleteUrls[0], /status=eq\.queued/);
  assert.deepEqual(mutationOrder, ["delete", "patch"]);
});

test("reply mutations reject malformed 200 responses", async (context) => {
  await context.test("conversation update", async () => {
    captureFetch(jsonResponse({ data: {} }));
    await assert.rejects(() => updateReply(7, { starred: true }), /invalid response/i);
  });

  await context.test("send", async () => {
    captureFetch(jsonResponse({ sent: false, messageId: null }));
    await assert.rejects(() => sendReply(7, "Hello", "key-1"), /invalid response/i);
  });
});

test("the live audience endpoint includes status-only campaign rules", async () => {
  globalThis.fetch = (async () => jsonResponse([
    {
      id: 1,
      name: "Aisha Rahman",
      age: 42,
      age_band: "35-44",
      phone: "+6591234567",
      email: "aisha@example.com",
      topics: [],
      status: "Untouched",
      struck: false,
    },
    {
      id: 2,
      name: "Ben Lim",
      age: 39,
      age_band: "35-44",
      phone: "+6598765432",
      email: "ben@example.com",
      topics: [],
      status: "Contacted",
      struck: false,
    },
  ])) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/audience-count", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      audience: { ageBands: [], topics: [], statuses: ["Untouched"] },
    }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { count: 1 });
});

test("poster analysis uses GPT-4o mini even when the assistant model is overridden", async () => {
  const openAiBodies: Array<Record<string, unknown>> = [];
  let leadFetches = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/leads?")) {
      leadFetches += 1;
      return jsonResponse([
        {
          id: 1,
          name: "Sarah Tan",
          age: 61,
          age_band: "55-65",
          phone: "+6591234567",
          email: "sarah@example.com",
          topics: ["Retirement Planning"],
          status: "Untouched",
          struck: false,
        },
      ]);
    }
    if (url.includes("/storage/v1/object/sign/campaign-posters/")) {
      return jsonResponse({ signedURL: "/object/sign/campaign-posters/drafts/poster.png?token=signed" });
    }
    if (url === "https://api.openai.com/v1/responses") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      openAiBodies.push(body);
      return jsonResponse({
        model: "gpt-4o-mini-2024-07-18",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  title: "Retirement Seminar",
                  subject: "Retirement Seminar invitation",
                  message: "Join our retirement seminar.\n\nReply *YES* to register.\n\nHilite Team",
                  eventDate: "2026-08-20",
                  eventStartTime: "19:00",
                  topics: ["Retirement Planning"],
                  ageBands: ["55-65"],
                  rationale: "The poster is about retirement planning.",
                }),
              },
            ],
          },
        ],
      });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/poster-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      posterName: "retirement-seminar.png",
      posterPath: "drafts/11111111-1111-4111-8111-111111111111.png",
      posterMimeType: "image/png",
    }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL: "gpt-5.6-luna",
  });

  assert.equal(response.status, 200);
  assert.equal(openAiBodies.length, 1);
  assert.equal(openAiBodies[0]?.model, "gpt-4o-mini");
  assert.match(String(openAiBodies[0]?.instructions), /registration\/check-in time as the event start/i);
  const openAiInput = openAiBodies[0]?.input as Array<{ content: Array<{ image_url?: string }> }>;
  assert.equal(
    openAiInput[0]?.content[1]?.image_url,
    "https://supabase.example.test/storage/v1/object/sign/campaign-posters/drafts/poster.png?token=signed",
  );
  assert.equal(leadFetches, 2);
  const payload = await response.json();
  assert.equal(payload.warning, undefined);
  assert.equal(payload.ai.model, "gpt-4o-mini-2024-07-18");
  assert.equal(payload.draft.title, "Retirement Seminar");
  assert.match(payload.draft.message, /^Hi \{\{first_name\}\} 👋/);
  assert.equal(payload.eventStartsAt, "2026-08-20T11:00:00.000Z");
  const schema = ((openAiBodies[0]?.text as Record<string, unknown>)?.format as Record<string, unknown>)?.schema as Record<string, unknown>;
  assert.deepEqual((schema.properties as Record<string, unknown>).eventDate, { type: ["string", "null"] });
  assert.deepEqual((schema.properties as Record<string, unknown>).eventStartTime, { type: ["string", "null"] });
});

test("poster analysis returns sanitized OpenAI diagnostics when it falls back", async () => {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/rest/v1/leads?")) return jsonResponse([]);
    if (url.includes("/storage/v1/object/sign/campaign-posters/")) {
      return jsonResponse({ signedURL: "/storage/v1/object/sign/campaign-posters/drafts/poster.png?token=signed" });
    }
    if (url === "https://api.openai.com/v1/responses") {
      return jsonResponse({
        error: {
          code: "invalid_image_url",
          param: "input[0].content[1].image_url",
          message: "Could not fetch https://private.example.test/poster.png?token=secret-value",
        },
      }, 400);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/poster-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      posterName: "poster.png",
      posterPath: "drafts/11111111-1111-4111-8111-111111111111.png",
      posterMimeType: "image/png",
    }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    OPENAI_API_KEY: "test-openai-key",
  });

  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ai.mode, "fallback");
  assert.deepEqual(payload.diagnostic, {
    message: "The GPT request failed",
    upstreamStatus: 400,
    upstreamCode: "invalid_image_url",
    upstreamParam: "input[0].content[1].image_url",
    upstreamMessage: "Could not fetch [url]",
  });
  assert.doesNotMatch(JSON.stringify(payload), /secret-value/);
});

test("Hi-Hunt poster analysis fills a personalised HR email template from the creative", async () => {
  const openAiBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/storage/v1/object/sign/campaign-posters/")) {
      return jsonResponse({ signedURL: "/object/sign/campaign-posters/drafts/workshop.png?token=signed" });
    }
    if (url === "https://api.openai.com/v1/responses") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      openAiBodies.push(body);
      return jsonResponse({
        model: "gpt-4o-mini-2024-07-18",
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              title: "Sourdough Bread Baking Workshop",
              subject: "Sourdough bread baking workshop for your team",
              body: "Join our sourdough bread baking workshop.\n\nEvent details:\n- Date: 21 November 2026\n- Fee: $10\n\nWould you be open to sharing this with interested colleagues?",
              rationale: "The subject and email details come directly from the poster.",
            }),
          }],
        }],
      });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/hr-poster-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      posterName: "workshop.png",
      posterPath: "drafts/11111111-1111-4111-8111-111111111111.png",
      posterMimeType: "image/png",
    }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    OPENAI_API_KEY: "test-openai-key",
  });

  assert.equal(response.status, 200);
  assert.equal(openAiBodies.length, 1);
  assert.equal(openAiBodies[0]?.model, "gpt-4o-mini");
  assert.match(String(openAiBodies[0]?.instructions), /email template for outreach to HR professionals/i);
  const payload = await response.json();
  assert.equal(payload.draft.title, "Sourdough Bread Baking Workshop");
  assert.equal(payload.draft.subject, "Sourdough bread baking workshop for your team");
  assert.match(payload.draft.body, /^Hi \{\{first_name\}\},/);
  assert.match(payload.draft.body, /Event details:\n- Date: 21 November 2026/);
  assert.match(payload.draft.body, /Warm regards,\nHilite$/);
  assert.equal(payload.ai.mode, "gpt");
});

test("batch approval requires explicit consent before any queue lookup", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("Unexpected fetch");
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/send-queue/approve-batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemIds: ["recipient-1"] }),
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
    },
  );

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("batch approval rejects duplicate IDs before any queue lookup", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("Unexpected fetch");
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/send-queue/approve-batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemIds: ["recipient-1", "recipient-1"],
        consentConfirmed: true,
      }),
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
    },
  );

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("batch approval falls back to durable table scheduling when the RPC cache is stale", async () => {
  const campaignId = "11111111-1111-4111-8111-111111111111";
  const campaign = {
    id: campaignId,
    title: "Safe batch",
    poster_name: "safe-batch.png",
    poster_path: "drafts/22222222-2222-4222-8222-222222222222.png",
    message: "Join our seminar.",
    audience: { includedLeadIds: [1, 2], delivery: { channel: "whatsapp", ctaUrl: "https://zoom.us/j/123" } },
    audience_count: 2,
    status: "queued",
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:00:00.000Z",
  };
  const leads = [
    { id: 1, name: "First", phone: "+65 8000 0001", email: "first@example.test", age_band: null, topics: [], status: "Untouched", struck: false, subscribed: true, unsubscribe_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" },
    { id: 2, name: "Second", phone: "+65 8000 0002", email: "second@example.test", age_band: null, topics: [], status: "Untouched", struck: false, subscribed: true, unsubscribe_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2" },
  ];
  const recipients = leads.map((lead) => ({
    id: 100 + lead.id,
    campaign_id: campaignId,
    lead_id: lead.id,
    email: lead.email,
    status: "queued",
  }));
  let relayAttempts = 0;
  const seenUrls: string[] = [];
  const relayMessages: string[] = [];
  const relayPosters: Array<Record<string, unknown>> = [];
  const campaignPatches: Array<Record<string, unknown>> = [];
  let scheduleBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seenUrls.push(`${init?.method || "GET"} ${url}`);
    if (url.includes("/rest/v1/whatsapp_messages?select=id")) {
      return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    }
    if (url.includes("/rest/v1/campaign_recipients?select=id") && url.includes("status=in.(scheduled,sending)")) {
      return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    }
    if (url.includes("/rest/v1/campaigns?status=eq.queued")) return jsonResponse([campaign]);
    if (url.includes("/rest/v1/campaign_recipients?select=id")) {
      const count = url.includes("status=not.in.(sent,replied)")
        ? recipients.filter((recipient) => recipient.status !== "sent" && recipient.status !== "replied").length
        : recipients.length;
      return new Response(null, { status: 200, headers: { "content-range": `*/${count}` } });
    }
    if (url.includes("/rest/v1/campaign_recipients?status=eq.queued")) return jsonResponse(recipients);
    if (url.includes("/rest/v1/leads?id=in.")) return jsonResponse(leads);
    if (url.includes("/rest/v1/rpc/schedule_whatsapp_campaign_recipients")) {
      scheduleBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ code: "PGRST202", message: "Function not found in the schema cache" }, 404);
    }
    if (url.includes("/rest/v1/campaign_recipients?id=in.(101,102)&status=eq.queued") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { scheduled_at: string; status: string };
      recipients.forEach((recipient) => { recipient.status = body.status; });
      return jsonResponse(recipients.map((recipient) => ({ id: recipient.id, scheduled_at: body.scheduled_at })));
    }
    if (url.includes("/rest/v1/campaigns?id=eq.") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      campaignPatches.push(body);
      return jsonResponse([{ ...campaign, ...body }]);
    }
    if (url.includes("/rest/v1/campaigns?id=eq.")) return jsonResponse([campaign]);
    if (url.includes("/rest/v1/leads?id=eq.")) {
      const lead = leads.find((candidate) => url.includes(`id=eq.${candidate.id}`));
      return jsonResponse(lead ? [lead] : []);
    }
    if (url.includes("/rest/v1/campaign_recipients?campaign_id=eq.")) {
      const lead = recipients.find((recipient) => url.includes(`lead_id=eq.${recipient.lead_id}`));
      return jsonResponse(lead ? [{ status: lead.status }] : []);
    }
    if (url.includes("/storage/v1/object/sign/campaign-posters/")) {
      return jsonResponse({ signedURL: "/storage/v1/object/sign/campaign-posters/drafts/safe-batch.png?token=signed" });
    }
    if (url === "https://hermes.example.test/send") {
      relayAttempts += 1;
      const relayBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      relayMessages.push(String(relayBody.message));
      relayPosters.push(relayBody.poster as Record<string, unknown>);
      if (relayAttempts === 2) {
        return jsonResponse({ error: "Please wait briefly before sending another WhatsApp message", retryAfterMs: 1 }, 429);
      }
      return jsonResponse({ sent: true, posterSent: true, messageId: `message-${relayAttempts}` });
    }
    if (url.includes("/rest/v1/campaign_recipients?on_conflict=")) {
      const body = JSON.parse(String(init?.body)) as { lead_id: number; status: string };
      const recipient = recipients.find((item) => item.lead_id === body.lead_id);
      if (recipient) recipient.status = body.status;
      return jsonResponse([]);
    }
    if (url.includes("/rest/v1/whatsapp_messages?on_conflict=")) {
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/send-queue/approve-batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemIds: ["101", "102"],
        consentConfirmed: true,
      }),
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      HERMES_RELAY_URL: "https://hermes.example.test",
      HERMES_RELAY_TOKEN: "test-relay-token-that-is-long-enough",
      PUBLIC_APP_URL: "https://hilite.example.test",
    },
  );

  const payload = await response.json();
  const scheduledRequest = scheduleBody as unknown as Record<string, unknown>;
  assert.equal(response.status, 200, JSON.stringify({ payload, relayAttempts, seenUrls }, null, 2));
  assert.deepEqual(payload, {
    approved: 2,
    itemIds: ["101", "102"],
    retryableItemIds: [],
    intervalSeconds: 60,
    firstScheduledAt: String(scheduledRequest.p_approved_at),
    lastScheduledAt: new Date(Date.parse(String(scheduledRequest.p_approved_at)) + 60_000).toISOString(),
  });
  assert.deepEqual(scheduledRequest.p_recipient_ids, [101, 102]);
  assert.equal(scheduledRequest.p_interval_seconds, 60);
  assert.ok(seenUrls.some((url) => url.startsWith("PATCH ") && url.includes("id=in.(101,102)&status=eq.queued")));
  assert.equal(relayAttempts, 0);
  assert.ok(seenUrls.some((url) => url.includes("whatsapp_messages?select=id")
    && url.includes("occurred_at=gte.")
    && url.includes("occurred_at=lt.")));
  assert.equal(relayMessages.length, 0);
  assert.equal(relayPosters.length, 0);
  assert.equal(campaignPatches.length, 0);
  assert.ok(seenUrls.every((url) => !url.includes("https://hermes.example.test")));
});

test("WhatsApp campaign send cron rejects requests without the configured Vercel secret", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("Unexpected fetch");
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/cron/campaign-sends"),
    { CRON_SECRET: "test-cron-secret" },
  );

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("WhatsApp campaign send cron falls back to a guarded table claim and sends one recipient", async () => {
  const campaignId = "11111111-1111-4111-8111-111111111111";
  const campaign = {
    id: campaignId,
    title: "Safe batch",
    poster_name: "safe-batch.png",
    poster_path: "drafts/22222222-2222-4222-8222-222222222222.png",
    message: "Join our seminar.",
    audience: { includedLeadIds: [1], delivery: { channel: "whatsapp", ctaUrl: "https://zoom.us/j/123" } },
    audience_count: 1,
    status: "queued",
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
  };
  const lead = { id: 1, name: "First", phone: "+65 8000 0001", email: "first@example.test", age_band: null, topics: [], status: "Untouched", struck: false, subscribed: true, unsubscribe_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" };
  const recipientUpdates: Array<Record<string, unknown>> = [];
  let relayBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/rpc/claim_due_whatsapp_campaign_recipient")) {
      return jsonResponse({ code: "PGRST202", message: "Function not found in the schema cache" }, 404);
    }
    if (url.includes("/rest/v1/campaign_recipients?status=eq.sending&locked_until=lte.") && init?.method === "PATCH") {
      return jsonResponse([]);
    }
    if (url.includes("/rest/v1/campaign_recipients?status=eq.sending&locked_until=gt.")) {
      return jsonResponse([]);
    }
    if (url.includes("/rest/v1/whatsapp_messages?direction=eq.outbound&occurred_at=gt.")) {
      return jsonResponse([]);
    }
    if (url.includes("/rest/v1/campaign_recipients?status=eq.scheduled&scheduled_at=lte.")) {
      return jsonResponse([{ id: 101, campaign_id: campaignId, lead_id: 1, status: "scheduled", attempts: 0 }]);
    }
    if (url.includes("/rest/v1/campaigns?id=in.") && url.includes("status=in.(queued,sending)")) {
      return jsonResponse([campaign]);
    }
    if (url.includes("/rest/v1/campaign_recipients?id=eq.101&status=eq.scheduled") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return jsonResponse([{ id: 101, campaign_id: campaignId, lead_id: 1, ...body }]);
    }
    if (url.includes("/rest/v1/campaigns?id=eq.") && init?.method === "PATCH") {
      return jsonResponse([{ ...campaign, ...JSON.parse(String(init.body)) }]);
    }
    if (url.includes("/rest/v1/campaigns?id=eq.")) return jsonResponse([campaign]);
    if (url.includes("/rest/v1/leads?id=eq.1")) return jsonResponse([lead]);
    if (url.includes("/rest/v1/campaign_recipients?campaign_id=eq.")) return jsonResponse([{ status: "sending" }]);
    if (url.includes("/storage/v1/object/sign/campaign-posters/")) {
      return jsonResponse({ signedURL: "/storage/v1/object/sign/campaign-posters/drafts/safe-batch.png?token=signed" });
    }
    if (url === "https://hermes.example.test/send") {
      relayBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ sent: true, posterSent: true, messageId: "message-1" });
    }
    if (url.includes("/rest/v1/campaign_recipients?on_conflict=")) return jsonResponse([]);
    if (url.includes("/rest/v1/whatsapp_messages?on_conflict=")) return jsonResponse([]);
    if (url.includes("/rest/v1/campaign_recipients?select=id")) {
      const remaining = url.includes("status=not.in.(sent,replied)") ? 0 : 1;
      return new Response(null, { status: 200, headers: { "content-range": `*/${remaining}` } });
    }
    if (url.includes("/rest/v1/campaign_recipients?id=eq.101") && init?.method === "PATCH") {
      recipientUpdates.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/cron/campaign-sends", {
      headers: { authorization: "Bearer test-cron-secret" },
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      HERMES_RELAY_URL: "https://hermes.example.test",
      HERMES_RELAY_TOKEN: "test-relay-token-that-is-long-enough",
      CRON_SECRET: "test-cron-secret",
      PUBLIC_APP_URL: "https://hilite.example.test",
    },
  );

  const payload = await response.json();
  const sentToRelay = relayBody as unknown as Record<string, unknown>;
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.deepEqual(payload, { ok: true, claimed: 1, sent: 1, retrying: 0, failed: 0 });
  assert.match(String(sentToRelay.message), /^Hi First 👋/);
  assert.match(String(sentToRelay.message), /https:\/\/zoom\.us\/j\/123/);
  assert.match(String(sentToRelay.message), /reply \*YES\*/);
  assert.match(String(sentToRelay.message), /reply \*MAYBE NEXT TIME\*/i);
  assert.match(String(sentToRelay.message), /_Reply 'Unsubscribe' to stop receiving updates_$/);
  assert.doesNotMatch(String(sentToRelay.message), /\/unsubscribe\//);
  assert.equal((sentToRelay.poster as Record<string, unknown>)?.name, "safe-batch.png");
  assert.equal(recipientUpdates.at(-1)?.status, "sent");
  assert.equal(recipientUpdates.at(-1)?.locked_until, null);
});

test("WhatsApp campaign send cron retries a Hermes cooldown no sooner than one minute later", async () => {
  const campaignId = "33333333-3333-4333-8333-333333333333";
  const campaign = {
    id: campaignId,
    title: "Cooldown batch",
    poster_name: null,
    poster_path: null,
    message: "Hi {{first_name}}",
    audience: { includedLeadIds: [7], delivery: { channel: "whatsapp" } },
    audience_count: 1,
    status: "queued",
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
  };
  const lead = { id: 7, name: "Retry", phone: "+65 8000 0007", email: "retry@example.test", age_band: null, topics: [], status: "Untouched", struck: false, subscribed: true, unsubscribe_token: "cccccccc-cccc-4ccc-8ccc-ccccccccccc7" };
  const recipientUpdates: Array<Record<string, unknown>> = [];
  let relayAttempts = 0;
  const startedAt = Date.now();

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/rpc/claim_due_whatsapp_campaign_recipient")) {
      return jsonResponse([{ id: 107, campaign_id: campaignId, lead_id: 7, status: "sending", attempts: 1 }]);
    }
    if (url.includes("/rest/v1/campaigns?id=eq.")) return jsonResponse([campaign]);
    if (url.includes("/rest/v1/leads?id=eq.7")) return jsonResponse([lead]);
    if (url.includes("/rest/v1/campaign_recipients?campaign_id=eq.")) return jsonResponse([{ status: "sending" }]);
    if (url === "https://hermes.example.test/send") {
      relayAttempts += 1;
      return jsonResponse({ error: "Please wait before sending again", retryAfterMs: 1_000 }, 429);
    }
    if (url.includes("/rest/v1/campaign_recipients?id=eq.107") && init?.method === "PATCH") {
      recipientUpdates.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/cron/campaign-sends", {
      headers: { authorization: "Bearer test-cron-secret" },
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      HERMES_RELAY_URL: "https://hermes.example.test",
      HERMES_RELAY_TOKEN: "test-relay-token-that-is-long-enough",
      CRON_SECRET: "test-cron-secret",
      PUBLIC_APP_URL: "https://hilite.example.test",
    },
  );

  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.sent, 0);
  assert.equal(payload.retrying, 1);
  assert.equal(payload.failed, 0);
  assert.equal(relayAttempts, 1);
  assert.equal(recipientUpdates.at(-1)?.status, "scheduled");
  assert.equal(recipientUpdates.at(-1)?.locked_until, null);
  assert.ok(Date.parse(String(recipientUpdates.at(-1)?.scheduled_at)) >= startedAt + 60_000);
});

test("campaign reminder cron rejects requests without the configured Vercel secret", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("Unexpected fetch");
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/cron/campaign-reminders"),
    { CRON_SECRET: "test-cron-secret" },
  );

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("campaign reminder cron sends the due WhatsApp reminder with its poster once", async () => {
  const campaignId = "66666666-6666-4666-8666-666666666666";
  const reminderId = "77777777-7777-4777-8777-777777777777";
  const reminderAt = new Date(Date.now() - 1_000).toISOString();
  const eventAt = new Date(Date.now() + (3 * 60 * 60 * 1000)).toISOString();
  const campaign = {
    id: campaignId,
    title: "CPF Changes & You Seminar",
    poster_name: "cpf-seminar.png",
    poster_path: "drafts/88888888-8888-4888-8888-888888888888.png",
    message: "Hi {{first_name}}",
    audience: {
      includedLeadIds: [17],
      delivery: {
        channel: "whatsapp",
        senderEmail: null,
        scheduledAt: eventAt,
        ctaUrl: "https://zoom.us/j/456",
        reminderDates: [reminderAt],
      },
    },
    audience_count: 1,
    status: "sent",
    updated_at: new Date().toISOString(),
  };
  const lead = {
    id: 17,
    name: "Jamie Lim",
    phone: "+65 8000 0017",
    struck: false,
    subscribed: true,
    unsubscribe_token: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  };
  let queuedReminder: Record<string, unknown> | null = null;
  let relayBody: Record<string, unknown> | null = null;
  const deliveryUpdates: Array<Record<string, unknown>> = [];
  const storedMessages: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/campaigns?status=in.(queued,sending,sent)")) return jsonResponse([campaign]);
    if (url.includes("/rest/v1/campaign_recipients?") && url.includes("select=lead_id")) {
      return jsonResponse([{ lead_id: lead.id }]);
    }
    if (url.includes("/rest/v1/leads?id=in.(17)") && url.includes("struck=eq.false")) {
      return jsonResponse([{ id: lead.id, phone: lead.phone }]);
    }
    if (url.includes("/rest/v1/campaign_reminder_deliveries?on_conflict=") && init?.method === "POST") {
      queuedReminder = (JSON.parse(String(init.body)) as Array<Record<string, unknown>>)[0];
      return jsonResponse([{ id: reminderId }]);
    }
    if (url.includes("/rest/v1/rpc/claim_campaign_reminder_deliveries") && init?.method === "POST") {
      assert.ok(queuedReminder);
      return jsonResponse([{
        id: reminderId,
        campaign_id: campaignId,
        lead_id: lead.id,
        reminder_at: queuedReminder.reminder_at,
        offset_hours: 3,
        status: "sending",
        attempts: 1,
      }]);
    }
    if (url.includes(`/rest/v1/campaigns?id=eq.${campaignId}`)) return jsonResponse([campaign]);
    if (url.includes("/rest/v1/leads?id=eq.17")) return jsonResponse([lead]);
    if (url.includes("/rest/v1/campaign_recipients?") && url.includes("lead_id=eq.17")) {
      return jsonResponse([{ id: "recipient-17", status: "sent" }]);
    }
    if (url.includes("/storage/v1/object/sign/campaign-posters/")) {
      return jsonResponse({ signedURL: "/storage/v1/object/sign/campaign-posters/drafts/cpf-seminar.png?token=signed" });
    }
    if (url === "https://hermes.example.test/send") {
      relayBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ sent: true, posterSent: true, messageId: "reminder-message-1" });
    }
    if (url.includes(`/rest/v1/campaign_reminder_deliveries?id=eq.${reminderId}`) && init?.method === "PATCH") {
      deliveryUpdates.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse([]);
    }
    if (url.includes("/rest/v1/whatsapp_messages?on_conflict=external_message_id") && init?.method === "POST") {
      storedMessages.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/cron/campaign-reminders", {
      headers: { authorization: "Bearer test-cron-secret" },
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      HERMES_RELAY_URL: "https://hermes.example.test",
      HERMES_RELAY_TOKEN: "test-relay-token-that-is-long-enough",
      CRON_SECRET: "test-cron-secret",
      PUBLIC_APP_URL: "https://hilite.example.test",
    },
  );
  const payload = await response.json();
  const queued = queuedReminder as Record<string, unknown> | null;
  const sentToRelay = relayBody as Record<string, unknown> | null;

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.deepEqual(payload, { ok: true, enqueued: 1, claimed: 1, sent: 1, failed: 0, skipped: 0 });
  assert.equal(queued?.offset_hours, 3);
  assert.match(String(sentToRelay?.message), /about 3 hours/i);
  assert.match(String(sentToRelay?.message), /https:\/\/zoom\.us\/j\/456/);
  assert.match(
    String(sentToRelay?.message),
    /See you there!\nHilite Team\n\n_Reply 'Unsubscribe' to stop receiving updates_$/,
  );
  assert.equal((sentToRelay?.poster as Record<string, unknown>)?.name, "cpf-seminar.png");
  assert.equal((sentToRelay?.poster as Record<string, unknown>)?.url,
    "https://supabase.example.test/storage/v1/object/sign/campaign-posters/drafts/cpf-seminar.png?token=signed");
  assert.equal(sentToRelay?.idempotencyKey, `campaign-reminder:${reminderId}`);
  assert.equal(deliveryUpdates.at(-1)?.status, "sent");
  assert.equal(storedMessages.length, 1);
  assert.equal((storedMessages[0]?.raw_metadata as Record<string, unknown>)?.offsetHours, 3);
});

test("WhatsApp inbound stores a brand-new phone number without requiring a lead or campaign", async () => {
  const inboundSecret = "test-inbound-secret-that-is-long-enough";
  const storedMessages: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/leads?")) return jsonResponse([]);
    if (url.includes("/rest/v1/whatsapp_messages?on_conflict=")) {
      const storedMessage = JSON.parse(String(init?.body)) as Record<string, unknown>;
      storedMessages.push(storedMessage);
      return jsonResponse([{ id: 91, ...storedMessage }]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/integrations/whatsapp/inbound", {
      method: "POST",
      headers: {
        authorization: `Bearer ${inboundSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        platform: "whatsapp",
        messageId: "new-number-message-1",
        text: "Hello from a new number",
        receivedAt: "2026-08-27T07:11:00+08:00",
        sender: {
          userId: "6581234567@s.whatsapp.net",
          chatId: "6581234567@s.whatsapp.net",
          name: "New contact",
          phone: "6581234567",
        },
      }),
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      HERMES_INBOUND_SECRET: inboundSecret,
    },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    received: true,
    id: 91,
    matchedLead: false,
    campaignPaused: false,
  });
  const storedMessage = storedMessages[0];
  assert.equal(storedMessage?.lead_id, null);
  assert.equal(storedMessage?.campaign_id, null);
  assert.equal(storedMessage?.sender_phone, "+6581234567");
});

test("WhatsApp inbound issues a private image and sticker upload ticket", async () => {
  const inboundSecret = "test-inbound-secret-that-is-long-enough";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/storage/v1/bucket/campaign-posters") && (!init?.method || init.method === "GET")) {
      return jsonResponse({ id: "campaign-posters", public: false });
    }
    if (url.endsWith("/storage/v1/bucket/campaign-posters") && init?.method === "PUT") return jsonResponse({});
    if (url.includes("/storage/v1/object/upload/sign/campaign-posters/inbound/")) {
      return jsonResponse({ signedURL: "/storage/v1/object/upload/sign/campaign-posters/inbound/private.webp?token=upload" });
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/integrations/whatsapp/inbound", {
    method: "POST",
    headers: { authorization: `Bearer ${inboundSecret}`, "content-type": "application/json" },
    body: JSON.stringify({
      action: "media-upload-ticket",
      platform: "whatsapp",
      messageId: "sticker-ticket-1",
      media: { kind: "sticker", name: "sticker.webp", mimeType: "image/webp", bytes: 2048 },
    }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    HERMES_INBOUND_SECRET: inboundSecret,
  });

  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.match(payload.path, /^inbound\/[0-9a-f-]{36}\.webp$/i);
  assert.match(payload.uploadUrl, /campaign-posters\/inbound\/private\.webp\?token=upload/);
  assert.equal(payload.maxBytes, 20 * 1024 * 1024);
});

test("WhatsApp inbound accepts a media-only sticker and stores its private metadata", async () => {
  const inboundSecret = "test-inbound-secret-that-is-long-enough";
  const stickerPath = "inbound/33333333-3333-4333-8333-333333333333.webp";
  let storedMessage: Record<string, unknown> | null = null;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/leads?")) return jsonResponse([]);
    if (url.includes("/rest/v1/whatsapp_messages?on_conflict=")) {
      storedMessage = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse([{ id: 93, ...storedMessage }]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/integrations/whatsapp/inbound", {
    method: "POST",
    headers: { authorization: `Bearer ${inboundSecret}`, "content-type": "application/json" },
    body: JSON.stringify({
      platform: "whatsapp",
      messageId: "sticker-message-1",
      text: "",
      mediaType: "sticker",
      media: { kind: "sticker", path: stickerPath, name: "sticker.webp", mimeType: "image/webp", bytes: 2048 },
      sender: { phone: "+6581234567" },
    }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    HERMES_INBOUND_SECRET: inboundSecret,
  });

  const payload = await response.json();
  const stored = storedMessage as Record<string, unknown> | null;
  assert.equal(response.status, 201, JSON.stringify(payload));
  assert.equal(stored?.body, "[Sticker received]");
  assert.deepEqual(stored?.raw_metadata, {
    source: "hermes",
    mediaType: "sticker",
    matchedLead: false,
    imagePath: stickerPath,
    imageName: "sticker.webp",
    imageMimeType: "image/webp",
    mediaKind: "sticker",
  });
});

test("WhatsApp YES and MAYBE NEXT TIME replies produce attendance categories", async () => {
  const inboundSecret = "test-inbound-secret-that-is-long-enough";
  const campaignId = "11111111-1111-4111-8111-111111111111";
  const storedMessages: Array<Record<string, unknown>> = [];
  const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/leads?") && (!init?.method || init.method === "GET")) {
      return jsonResponse([{ id: 77, name: "Jamie Lim", phone: "+6591111177", email: "jamie@example.test", topics: [], status: "Untouched", remarks: null }]);
    }
    if (url.includes("/rest/v1/campaign_recipients?") && (!init?.method || init.method === "GET")) {
      return jsonResponse([{ campaign_id: campaignId, status: "sent", queued_at: null, sent_at: "2026-08-31T01:00:00.000Z" }]);
    }
    if (url.includes(`/rest/v1/campaigns?id=eq.${campaignId}`) && (!init?.method || init.method === "GET")) {
      return jsonResponse([{ id: campaignId, title: "Legacy Seminar" }]);
    }
    if (url.includes("/rest/v1/whatsapp_messages?on_conflict=") && init?.method === "POST") {
      const stored = JSON.parse(String(init.body)) as Record<string, unknown>;
      storedMessages.push(stored);
      return jsonResponse([{ id: 100 + storedMessages.length, ...stored }]);
    }
    if (init?.method === "PATCH") {
      patches.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  for (const [index, text] of ["YES", "Maybe next time, I am unable to attend"].entries()) {
    const response = await handleApiRequest(new Request("https://example.test/api/integrations/whatsapp/inbound", {
      method: "POST",
      headers: { authorization: `Bearer ${inboundSecret}`, "content-type": "application/json" },
      body: JSON.stringify({ platform: "whatsapp", messageId: `rsvp-${index}`, text, sender: { phone: "+6591111177" } }),
    }), {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      HERMES_INBOUND_SECRET: inboundSecret,
    });
    const payload = await response.json();
    assert.equal(response.status, 201, JSON.stringify(payload));
  }

  assert.deepEqual(storedMessages.map((message) => message.category), ["Interested", "Not Interested"]);
  assert.ok(storedMessages.every((message) => message.campaign_id === campaignId));
  assert.ok(patches.some((patch) => patch.url.includes("campaign_recipients") && patch.body.status === "replied"));
});

test("RE-engage inbox sends a private image through Hermes and records its metadata", async () => {
  const imagePath = "drafts/22222222-2222-4222-8222-222222222222.png";
  let relayBody: Record<string, unknown> | null = null;
  let storedMessage: Record<string, unknown> | null = null;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/whatsapp_messages?id=eq.91") && (!init?.method || init.method === "GET")) {
      return jsonResponse([{ id: 91, direction: "inbound", lead_id: 77, campaign_id: "11111111-1111-4111-8111-111111111111", chat_id: null, sender_phone: "+6591111177", category: "Interested" }]);
    }
    if (url.includes("/rest/v1/leads?id=eq.77")) {
      return jsonResponse([{ id: 77, name: "Jamie Lim", phone: "+6591111177", email: "jamie@example.test" }]);
    }
    if (url.includes("/storage/v1/object/sign/campaign-posters/")) {
      return jsonResponse({ signedURL: `/storage/v1/object/sign/campaign-posters/${imagePath}?token=signed` });
    }
    if (url === "https://hermes.example.test/send") {
      relayBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ sent: true, posterSent: true, messageId: "image-message-91" });
    }
    if (url.includes("/rest/v1/whatsapp_messages?on_conflict=") && init?.method === "POST") {
      storedMessage = JSON.parse(String(init.body)) as Record<string, unknown>;
      return jsonResponse([{ id: 92, ...storedMessage }]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/replies/91/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "",
      idempotencyKey: "image-reply-91",
      image: { path: imagePath, name: "venue.png", mimeType: "image/png" },
    }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    HERMES_RELAY_URL: "https://hermes.example.test",
    HERMES_RELAY_TOKEN: "test-relay-token-that-is-long-enough",
  });

  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  const sent = relayBody as Record<string, unknown> | null;
  const stored = storedMessage as Record<string, unknown> | null;
  assert.equal(sent?.message, "\u200B");
  assert.equal((sent?.poster as Record<string, unknown>)?.name, "venue.png");
  assert.match(String((sent?.poster as Record<string, unknown>)?.url), /campaign-posters\/drafts\/22222222/);
  assert.equal(stored?.body, "[Image sent]");
  assert.deepEqual(stored?.raw_metadata, {
    source: "hihunt_reply",
    replyTo: 91,
    imagePath,
    imageName: "venue.png",
    imageMimeType: "image/png",
  });
});

test("RE-engage inbox returns a short-lived preview URL for recorded images", async () => {
  const imagePath = "drafts/23232323-2323-4232-8232-232323232323.png";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/rest/v1/whatsapp_messages?select=")) {
      return jsonResponse([
        { id: 101, direction: "inbound", lead_id: 77, campaign_id: null, external_message_id: "wa:in:101", chat_id: null, sender_platform_id: null, sender_phone: "+6591111177", recipient_phone: null, sender_name: "Jamie Lim", body: "Here is the venue", category: "Follow-up", occurred_at: "2026-09-02T01:00:00.000Z", read_at: null, starred: false, raw_metadata: {} },
        { id: 102, direction: "outbound", lead_id: 77, campaign_id: null, external_message_id: "wa:out:102", chat_id: null, sender_platform_id: null, sender_phone: null, recipient_phone: "+6591111177", sender_name: "Alex Thompson", body: "[Image sent]", category: "Follow-up", occurred_at: "2026-09-02T01:01:00.000Z", read_at: null, starred: false, raw_metadata: { imagePath, imageName: "venue.png", imageMimeType: "image/png" } },
      ]);
    }
    if (url.includes("/rest/v1/leads?id=in.(77)")) return jsonResponse([{ id: 77, name: "Jamie Lim", phone: "+6591111177", email: "jamie@example.test", remarks: "", source_tabs: "Testing" }]);
    if (url.includes("/storage/v1/object/sign/campaign-posters/")) {
      return jsonResponse({ signedURL: `/storage/v1/object/sign/campaign-posters/${imagePath}?token=preview-token` });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/replies"), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  const attachment = payload.data[0].thread.find((message: { id: string }) => message.id === "102").attachment;
  assert.equal(attachment.name, "venue.png");
  assert.equal(attachment.kind, "image");
  assert.equal(attachment.mimeType, "image/png");
  assert.match(attachment.url, /campaign-posters\/drafts\/23232323/);
  assert.match(attachment.url, /token=preview-token/);
});

test("WhatsApp Unsubscribe replies suppress the matched lead and cancel every unsent recipient", async () => {
  const inboundSecret = "test-inbound-secret-that-is-long-enough";
  const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/leads?") && (!init?.method || init.method === "GET")) {
      return jsonResponse([{ id: 44, name: "Jamie Lim", phone: "+6591111111", email: "jamie@example.test", topics: [], status: "Untouched", remarks: "Imported" }]);
    }
    if (url.includes("/rest/v1/campaign_recipients?") && (!init?.method || init.method === "GET")) return jsonResponse([]);
    if (url.includes("/rest/v1/whatsapp_messages?on_conflict=")) return jsonResponse([{ id: 92 }]);
    if (init?.method === "PATCH") {
      patches.push({ url, body: JSON.parse(String(init.body)) });
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/integrations/whatsapp/inbound", {
    method: "POST",
    headers: { authorization: `Bearer ${inboundSecret}`, "content-type": "application/json" },
    body: JSON.stringify({ platform: "whatsapp", messageId: "unsubscribe-1", text: "Unsubscribe", sender: { phone: "+6591111111" } }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    HERMES_INBOUND_SECRET: inboundSecret,
  });

  assert.equal(response.status, 201);
  assert.equal((await response.json()).unsubscribed, true);
  const leadPatch = patches.find((item) => item.url.includes("/rest/v1/leads?id=eq.44"));
  assert.equal(leadPatch?.body.struck, true);
  assert.equal(leadPatch?.body.subscribed, false);
  assert.match(String(leadPatch?.body.unsubscribed_at), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(leadPatch?.body.status, "Do Not Call");
  assert.match(String(leadPatch?.body.remarks), /Opted out by WhatsApp reply/);
  const recipientPatch = patches.find((item) => item.url.includes("campaign_recipients?lead_id=eq.44"));
  assert.match(String(recipientPatch?.url), /status=in\.\(queued,scheduled,sending,failed\)/);
  assert.deepEqual(recipientPatch?.body, {
    status: "suppressed",
    locked_until: null,
    failure_reason: "Lead unsubscribed",
  });
  const reminderPatch = patches.find((item) => item.url.includes("campaign_reminder_deliveries?lead_id=eq.44"));
  assert.equal(reminderPatch?.body.status, "skipped");
});

test("public unsubscribe links disable the lead and cancel queued campaign work", async () => {
  const token = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes(`/rest/v1/leads?unsubscribe_token=eq.${token}`) && (!init?.method || init.method === "GET")) {
      return jsonResponse([{ id: 52 }]);
    }
    if (init?.method === "PATCH") {
      patches.push({ url, body: JSON.parse(String(init.body)) });
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { unsubscribed: true });
  const leadPatch = patches.find((item) => item.url.includes("/rest/v1/leads?id=eq.52"));
  assert.equal(leadPatch?.body.subscribed, false);
  assert.equal(leadPatch?.body.struck, true);
  assert.equal(leadPatch?.body.status, "Do Not Call");
  assert.match(String(leadPatch?.body.unsubscribed_at), /^\d{4}-\d{2}-\d{2}T/);
  assert.match(
    String(patches.find((item) => item.url.includes("campaign_recipients?lead_id=eq.52"))?.url),
    /status=in\.\(queued,scheduled,sending,failed\)/,
  );
  assert.deepEqual(
    patches.find((item) => item.url.includes("campaign_recipients?lead_id=eq.52"))?.body,
    { status: "suppressed", locked_until: null, failure_reason: "Lead unsubscribed" },
  );
  assert.equal(
    patches.find((item) => item.url.includes("campaign_reminder_deliveries?lead_id=eq.52"))?.body.status,
    "skipped",
  );
});

test("invalid unsubscribe tokens do not query or mutate the database", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("Unexpected fetch");
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "not-a-private-token" }),
  }), {});

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("lead import preview rejects normalized phone duplicates and matching identity triples", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method || "GET" });
    if (url.includes("/rest/v1/leads?")) {
      return new Response(JSON.stringify([{ id: 1, name: "Existing Person", email: "existing@example.test", age: 54, phone: "+6599999999" }]), {
        headers: { "content-type": "application/json", "content-range": "0-0/1" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/leads/import-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rows: [
        { Name: "  EXISTING   PERSON ", Email: "existing@example.test", Age: "54", Phone: "+6591111111" },
        { Name: "New Person", Email: "new@example.test", Age: "61", Phone: "+6592222222" },
        { Name: "New Person", Email: "new@example.test", Age: "61", Phone: "+6593333333" },
        { Name: "Different Person", Email: "existing@example.test", Age: "54", Phone: "+6594444444" },
        { Name: "Unknown Age", Email: "unknown@example.test", Phone: "+6595555555" },
        { Name: "Unknown Age", Email: "unknown@example.test", Phone: "+6596666666" },
        { Name: "Existing Phone", Email: "phone@example.test", Age: "30", Phone: "9999 9999" },
        { Name: "File Phone", Email: "file-phone@example.test", Age: "31", Phone: "9222 2222" },
      ],
      mapping: { name: "Name", email: "Email", age: "Age", phone: "Phone" },
    }),
  }), { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.added, 4);
  assert.deepEqual(payload.skippedDuplicates, [
    { row: 2, reason: "Name, email, and age already exist in the lead sheet" },
    { row: 4, reason: "Duplicate name, email, and age in this file" },
    { row: 8, reason: "Phone already exists" },
    { row: 9, reason: "Duplicate phone in this file" },
  ]);
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("manual lead creation rejects a normalized name, email, and age duplicate", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const birthYear = new Date().getUTCFullYear() - 54;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method || "GET" });
    if (url.includes("/rest/v1/leads?") && url.includes("email=eq.jamie%40example.test")) {
      return jsonResponse([{ id: 8, name: "Jamie Lim", email: "jamie@example.test", age: 54 }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "  JAMIE   LIM ",
      email: "JAMIE@example.test",
      dob: `${birthYear}-01-01`,
    }),
  }), { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "A lead with the same name, email, and age already exists" });
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("manual lead creation rejects an existing normalized WhatsApp number", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method || "GET" });
    if (url.includes("/rest/v1/leads?") && url.includes("phone=eq.%2B6596610444")) {
      return jsonResponse([{ id: 8, phone: "+6596610444" }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Another Amanda", phone: "9661 0444" }),
  }), { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "A lead with this phone number already exists" });
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("lead edits cannot reuse another lead's normalized WhatsApp number", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method || "GET" });
    if (url.includes("/rest/v1/leads?id=eq.10&select=*")) {
      return jsonResponse([{
        id: 10,
        name: "Jamie Lim",
        phone: "+6591111111",
        email: null,
        dob: null,
        age: null,
        age_band: "No DOB",
        topics: [],
        status: "Untouched",
        remarks: null,
        source_tabs: "Manual entry",
      }]);
    }
    if (url.includes("/rest/v1/leads?") && url.includes("phone=eq.%2B6596610444")) {
      return jsonResponse([{ id: 11, phone: "+6596610444" }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/leads/10", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "9661 0444" }),
  }), { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "A lead with this phone number already exists" });
  assert.equal(calls.some((call) => call.method === "PATCH"), false);
});

test("an existing lead can keep its normalized WhatsApp number while being edited", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const current = {
    id: 10,
    name: "Jamie Lim",
    phone: "+6596610444",
    email: null,
    dob: null,
    age: null,
    age_band: "No DOB",
    topics: [],
    status: "Untouched",
    struck: false,
    subscribed: true,
    unsubscribed_at: null,
    first_captured: null,
    remarks: null,
    source_tabs: "Manual entry",
  };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    calls.push({ url, method });
    if (url.includes("/rest/v1/leads?id=eq.10&select=*") && method === "GET") return jsonResponse([current]);
    if (url.includes("/rest/v1/leads?id=eq.10&select=") && method === "PATCH") {
      return jsonResponse([{ ...current, name: "Jamie Updated" }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/leads/10", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Jamie Updated", phone: "9661 0444" }),
  }), { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.name, "Jamie Updated");
  assert.equal(calls.some((call) => call.url.includes("phone=eq.")), false);
});

test("email sender status requires the fixed Gmail account and server-side OAuth credentials", async () => {
  const missing = await handleApiRequest(new Request("https://example.test/api/email-sender"), {});
  assert.deepEqual(await missing.json(), {
    configured: false,
    provider: "Gmail",
    address: null,
    displayName: "Hilite",
    requirement: "Set the Gmail sender account before email campaigns can send.",
  });
  const connected = await handleApiRequest(new Request("https://example.test/api/email-sender"), {
    GMAIL_CLIENT_ID: "client.apps.googleusercontent.com",
    GMAIL_CLIENT_SECRET: "test-client-secret",
    GMAIL_REFRESH_TOKEN: "test-refresh-token",
    GMAIL_SENDER_EMAIL: "namiuser89@gmail.com",
    GMAIL_SENDER_NAME: "Hilite Events",
  });
  assert.deepEqual(await connected.json(), {
    configured: true,
    provider: "Gmail",
    address: "namiuser89@gmail.com",
    displayName: "Hilite Events",
    requirement: null,
  });
  const cannotOverride = await handleApiRequest(new Request("https://example.test/api/email-sender?address=attacker%40example.test"), {
    GMAIL_CLIENT_ID: "client.apps.googleusercontent.com",
    GMAIL_CLIENT_SECRET: "test-client-secret",
    GMAIL_REFRESH_TOKEN: "test-refresh-token",
    GMAIL_SENDER_EMAIL: "namiuser89@gmail.com",
  });
  assert.deepEqual(await cannotOverride.json(), {
    configured: true,
    provider: "Gmail",
    address: "namiuser89@gmail.com",
    displayName: "Hilite",
    requirement: null,
  });
});

test("Hi-Hunt email account reports a fixed 200-send cap for the 7:00 AM SGT window", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    assert.equal(init?.method, "HEAD");
    const count = url.includes("status=eq.sent") ? 123 : 4;
    return new Response(null, { headers: { "content-range": `*/${count}` } });
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/email-account"), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    GMAIL_CLIENT_ID: "client.apps.googleusercontent.com",
    GMAIL_CLIENT_SECRET: "test-client-secret",
    GMAIL_REFRESH_TOKEN: "test-refresh-token",
    GMAIL_SENDER_EMAIL: "namiuser89@gmail.com",
    GMAIL_DAILY_LIMIT: "500",
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.cap, { limit: 200, used: 127, remaining: 73 });
  assert.equal(calls.length, 2);
  assert.ok(calls.some((url) => url.includes("status=eq.sent") && url.includes("sent_at=lt.")));
  assert.ok(calls.some((url) => url.includes("status=eq.sending") && url.includes("updated_at=lt.")));
});

test("reply image sends preserve the private storage reference in the request", async () => {
  const calls = captureFetch(jsonResponse({ sent: true, messageId: "image-message-1" }));
  await sendReply(7, "Venue map", "key-image-1", {
    path: "drafts/11111111-1111-4111-8111-111111111111.png",
    name: "venue.png",
    mimeType: "image/png",
  });
  assert.equal(calls[0]?.url, "/api/replies/7/send");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    message: "Venue map",
    idempotencyKey: "key-image-1",
    image: {
      path: "drafts/11111111-1111-4111-8111-111111111111.png",
      name: "venue.png",
      mimeType: "image/png",
    },
  });
});

test("Gmail campaigns use OAuth, preserve unsubscribe links, and attach the PDF poster", async () => {
  const campaignId = "44444444-4444-4444-8444-444444444444";
  const campaign = {
    id: campaignId,
    title: "CPF seminar",
    poster_name: "cpf-seminar.pdf",
    poster_path: "drafts/55555555-5555-4555-8555-555555555555.pdf",
    subject: "CPF seminar for {{first_name}}",
    message: "Hi {{first_name}}",
    audience: { ageBands: [], topics: [], statuses: [], delivery: { channel: "email", senderEmail: "namiuser89@gmail.com", scheduledAt: null, ctaUrl: "https://zoom.us/j/123", reminderDates: [] } },
    audience_count: 1,
    status: "queued",
    created_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:00:00.000Z",
  };
  const providerCalls: Array<{ url: string; headers: Headers; body: { raw: string } }> = [];
  const tokenRequests: URLSearchParams[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/campaigns?id=eq.") && (!init?.method || init.method === "GET")) return jsonResponse([campaign]);
    if (url.includes("/rest/v1/campaign_recipients?") && (!init?.method || init.method === "GET")) return jsonResponse([{ id: 71, lead_id: 9, email: "jamie@example.test" }]);
    if (url.includes("/rest/v1/leads?id=in.")) return jsonResponse([{ id: 9, name: "Jamie Lim", email: "jamie@example.test", struck: false, subscribed: true, unsubscribe_token: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }]);
    if (url.includes("/storage/v1/object/sign/campaign-posters/cpf.pdf?token=test")) {
      return new Response(Buffer.from("test-pdf-content"), { headers: { "content-type": "application/pdf" } });
    }
    if (url.includes("/storage/v1/object/sign/")) return jsonResponse({ signedURL: "/storage/v1/object/sign/campaign-posters/cpf.pdf?token=test" });
    if (url === "https://oauth2.googleapis.com/token") {
      tokenRequests.push(new URLSearchParams(String(init?.body)));
      return jsonResponse({ access_token: "test-access-token", expires_in: 3600, token_type: "Bearer" });
    }
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
      providerCalls.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return jsonResponse({ id: "gmail-message-1" });
    }
    if (url.includes("/rest/v1/campaign_recipients?id=in.") && init?.method === "PATCH") return jsonResponse([]);
    if (url.includes("/rest/v1/campaigns?id=eq.") && init?.method === "PATCH") return jsonResponse([{ ...campaign, status: "sent" }]);
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request(`https://example.test/api/campaigns/${campaignId}/send-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ consentConfirmed: true }),
  }), {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    GMAIL_CLIENT_ID: "client.apps.googleusercontent.com",
    GMAIL_CLIENT_SECRET: "test-client-secret",
    GMAIL_REFRESH_TOKEN: "test-refresh-token",
    GMAIL_SENDER_EMAIL: "namiuser89@gmail.com",
    PUBLIC_APP_URL: "https://hilite.example.test",
  });
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.sent, 1);
  assert.equal(payload.senderEmail, "namiuser89@gmail.com");
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].headers.get("authorization"), "Bearer test-access-token");
  assert.equal(tokenRequests[0]?.get("client_id"), "client.apps.googleusercontent.com");
  assert.equal(tokenRequests[0]?.get("client_secret"), "test-client-secret");
  assert.equal(tokenRequests[0]?.get("refresh_token"), "test-refresh-token");
  assert.equal(tokenRequests[0]?.get("grant_type"), "refresh_token");
  const mime = Buffer.from(providerCalls[0].body.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const compactMime = mime.replace(/\s/g, "");
  assert.match(mime, /From: Hilite <namiuser89@gmail\.com>/);
  assert.match(mime, /To: jamie@example\.test/);
  assert.match(mime, /Subject: CPF seminar for Jamie/);
  assert.match(mime, /Message-ID: <campaign-44444444-4444-4444-8444-444444444444\.recipient-71@gmail\.com>/);
  assert.match(mime, /Content-Disposition: attachment; filename="cpf-seminar\.pdf"/);
  assert.ok(compactMime.includes(Buffer.from("test-pdf-content").toString("base64")));
  const expectedText = "Hi Jamie\n\nOpen the event link: https://zoom.us/j/123\n\nTo stop receiving Hilite campaign messages, unsubscribe here: https://hilite.example.test/unsubscribe/cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  assert.ok(compactMime.includes(Buffer.from(expectedText).toString("base64")));
});

test("Hi-Hunt campaigns persist a reviewed email audience and send only through Gmail", async () => {
  const campaignId = "77777777-7777-4777-8777-777777777777";
  const prospectId = "88888888-8888-4888-8888-888888888888";
  const recipientId = "99999999-9999-4999-8999-999999999999";
  const unsubscribeToken = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const createdAt = "2026-08-29T09:00:00.000Z";
  const campaign = {
    id: campaignId,
    name: "Testing outreach",
    subject: "Hello {{first_name}}",
    body: "Hi {{first_name}}\n\n[YES](https://hilite.example.test/rsvp)",
    status: "draft",
    sender_email: "namiuser89@gmail.com",
    audience_count: 1,
    poster_name: "hr-wellness.png",
    poster_path: "drafts/11111111-1111-4111-8111-111111111111.png",
    poster_mime_type: "image/png",
    sent_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const recipient = {
    id: recipientId,
    campaign_id: campaignId,
    prospect_id: prospectId,
    prospect_name: "testing",
    email: "kamisanma13@gmail.com",
    status: "queued",
    attempts: 0,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const prospect = {
    id: prospectId,
    full_name: "testing",
    first_name: "testing",
    work_email: "kamisanma13@gmail.com",
    email_status: "verified",
    suppressed: false,
    unsubscribe_token: unsubscribeToken,
    source_metadata: { hihunt_status: "new" },
  };
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  let gmailMime = "";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" && /^[\[{]/.test(init.body) ? JSON.parse(init.body) : init?.body;
    calls.push({ url, method, body });

    if (url.includes(`/rest/v1/hr_prospects?id=in.(${prospectId})`) && method === "GET") return jsonResponse([prospect]);
    if (url.endsWith("/rest/v1/hr_campaigns?select=*") && method === "POST") return jsonResponse([campaign], 201);
    if (url.endsWith("/rest/v1/hr_campaign_recipients") && method === "POST") return jsonResponse([], 201);
    if (url.includes(`/rest/v1/hr_campaigns?id=eq.${campaignId}&select=*`) && method === "GET") return jsonResponse([campaign]);
    if (url.includes("/rest/v1/hr_campaign_recipients?campaign_id=eq.") && method === "GET") return jsonResponse([recipient]);
    if (url.includes(`/rest/v1/hr_prospects?id=in.(${prospectId})`) && method === "GET") return jsonResponse([prospect]);
    if (url.includes("/storage/v1/object/sign/campaign-posters/") && method === "POST") return jsonResponse({ signedURL: "https://storage.example.test/hr-wellness.png" });
    if (url === "https://storage.example.test/hr-wellness.png") return new Response("test-hr-poster-content", { status: 200 });
    if (url === "https://oauth2.googleapis.com/token") return jsonResponse({ access_token: "test-access-token" });
    if (url.endsWith("/rest/v1/rpc/claim_hihunt_email_send_slots") && method === "POST") {
      return jsonResponse([{
        recipient_id: recipientId,
        daily_limit: 200,
        used_before: 0,
        remaining_after: 199,
        resets_at: "2026-08-29T23:00:00.000Z",
      }]);
    }
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
      const raw = String((body as { raw?: unknown })?.raw || "");
      gmailMime = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      return jsonResponse({ id: "gmail-hihunt-message-1" });
    }
    if (url.includes("/rest/v1/hr_campaign_recipients?select=id") && method === "HEAD") {
      const total = url.includes("status=eq.sent") ? 1 : 0;
      return new Response(null, { headers: { "content-range": `*/${total}` } });
    }
    if (url.includes(`/rest/v1/hr_campaigns?id=eq.${campaignId}&select=*`) && method === "PATCH") {
      return jsonResponse([{ ...campaign, status: "sent", sent_at: "2026-08-29T09:01:00.000Z", updated_at: "2026-08-29T09:01:00.000Z" }]);
    }
    if ((url.includes("/rest/v1/hr_campaigns?") || url.includes("/rest/v1/hr_campaign_recipients?") || url.includes("/rest/v1/hr_prospects?")) && method === "PATCH") {
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${method}`);
  }) as typeof fetch;

  const env = {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    GMAIL_CLIENT_ID: "client.apps.googleusercontent.com",
    GMAIL_CLIENT_SECRET: "test-client-secret",
    GMAIL_REFRESH_TOKEN: "test-refresh-token",
    GMAIL_SENDER_EMAIL: "namiuser89@gmail.com",
    PUBLIC_APP_URL: "https://hilite.example.test",
  };
  const createResponse = await handleApiRequest(new Request("https://example.test/api/hr-campaigns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: campaign.name,
      subject: campaign.subject,
      body: campaign.body,
      recipientIds: [prospectId],
      posterName: campaign.poster_name,
      posterPath: campaign.poster_path,
      posterMimeType: campaign.poster_mime_type,
    }),
  }), env);
  assert.equal(createResponse.status, 201, JSON.stringify(await createResponse.clone().json()));
  const recipientInsert = calls.find((call) => call.url.endsWith("/rest/v1/hr_campaign_recipients") && call.method === "POST");
  assert.deepEqual(recipientInsert?.body, [{
    campaign_id: campaignId,
    prospect_id: prospectId,
    prospect_name: "testing",
    email: "kamisanma13@gmail.com",
    status: "queued",
  }]);

  const sendResponse = await handleApiRequest(new Request(`https://example.test/api/hr-campaigns/${campaignId}/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ consentConfirmed: true }),
  }), env);
  const payload = await sendResponse.json();
  assert.equal(sendResponse.status, 200, JSON.stringify(payload));
  assert.equal(payload.sent, 1);
  assert.equal(payload.data.status, "sent");
  const reservation = calls.find((call) => call.url.endsWith("/rest/v1/rpc/claim_hihunt_email_send_slots"));
  assert.deepEqual(reservation?.body, {
    p_campaign_id: campaignId,
    p_recipient_ids: [recipientId],
  });
  assert.equal(calls.some((call) => call.method === "PATCH"
    && call.url.includes(`/rest/v1/hr_campaign_recipients?id=eq.${recipientId}`)
    && (call.body as { status?: unknown })?.status === "sending"), false);
  assert.match(gmailMime, /To: kamisanma13@gmail\.com/);
  assert.match(gmailMime, /Subject: Hello testing/);
  assert.match(gmailMime, /Content-Type: image\/png; name="hr-wellness\.png"/);
  assert.match(gmailMime, /Content-Disposition: attachment; filename="hr-wellness\.png"/);
  assert.match(gmailMime, new RegExp(`List-Unsubscribe: <https://hilite\\.example\\.test/api/unsubscribe\\?token=${unsubscribeToken}>`));
  assert.match(gmailMime, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.ok(gmailMime.replace(/\s/g, "").includes(Buffer.from("test-hr-poster-content").toString("base64")));
  const textPart = gmailMime.match(/Content-Type: text\/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--pias_alt_/);
  assert.ok(textPart?.[1]);
  const plainText = Buffer.from(textPart[1].replace(/\s/g, ""), "base64").toString("utf8");
  assert.equal(plainText, "Hi testing\n\nYES: https://hilite.example.test/rsvp");
  const htmlPart = gmailMime.match(/Content-Type: text\/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--pias_alt_/);
  assert.ok(htmlPart?.[1]);
  const html = Buffer.from(htmlPart[1].replace(/\s/g, ""), "base64").toString("utf8");
  assert.doesNotMatch(html, /Unsubscribe/);
  assert.doesNotMatch(html, new RegExp(`href="https://hilite\\.example\\.test/unsubscribe/${unsubscribeToken}"`));
  assert.match(html, /Hi testing/);
  assert.match(html, /<a href="https:\/\/hilite\.example\.test\/rsvp"[^>]*>YES<\/a>/);
  assert.doesNotMatch(html, /background:#171719/);
  assert.equal(calls.some((call) => /whatsapp|hermes/i.test(call.url)), false);
  assert.ok(calls.some((call) => call.method === "PATCH" && call.url.includes(`/rest/v1/hr_prospects?id=eq.${prospectId}`)));
  assert.ok(calls.some((call) => call.method === "PATCH" && JSON.stringify(call.body).includes("gmail-hihunt-message-1")));
});

test("Hi-Hunt unsubscribe links suppress the prospect and cancel unsent email campaign recipients", async () => {
  const token = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const prospectId = "88888888-8888-4888-8888-888888888888";
  const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    if (url.includes(`/rest/v1/leads?unsubscribe_token=eq.${token}`) && method === "GET") return jsonResponse([]);
    if (url.includes(`/rest/v1/hr_prospects?unsubscribe_token=eq.${token}`) && method === "GET") {
      return jsonResponse([{ id: prospectId, source_metadata: { hihunt_status: "queued" } }]);
    }
    if (method === "PATCH") {
      patches.push({ url, body: JSON.parse(String(init?.body)) });
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${method}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request(`https://example.test/api/unsubscribe?token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  }), { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { unsubscribed: true });
  assert.equal(patches.find((patch) => patch.url.includes("/rest/v1/hr_prospects?"))?.body.suppressed, true);
  assert.equal(patches.find((patch) => patch.url.includes("/rest/v1/hr_campaign_recipients?"))?.body.status, "skipped");
  assert.equal(patches.some((patch) => /whatsapp|hermes/i.test(patch.url)), false);
});

test("WhatsApp thread routes serve the inbox directly without a missing-endpoint fallback", async () => {
  const messages = [
    {
      id: 10,
      lead_id: 1,
      campaign_id: "campaign-1",
      direction: "outbound",
      occurred_at: "2026-08-27T00:00:00.000Z",
      body: "Hello",
      sender_phone: null,
      recipient_phone: "+6591111111",
      read_at: "2026-08-27T00:00:00.000Z",
      starred: false,
      category: "Follow-up",
    },
    {
      id: 11,
      lead_id: 1,
      campaign_id: "campaign-1",
      direction: "inbound",
      occurred_at: "2026-08-27T00:01:00.000Z",
      body: "Yes please",
      sender_phone: "+6591111111",
      recipient_phone: null,
      read_at: null,
      starred: false,
      category: "Interested",
    },
  ];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/rest/v1/whatsapp_messages?")) return jsonResponse(messages);
    if (url.includes("/rest/v1/leads?")) {
      return jsonResponse([{ id: 1, name: "Jamie Lim", phone: "+6591111111", email: null, remarks: null, source_tabs: "Import" }]);
    }
    if (url.includes("/rest/v1/campaigns?")) {
      return jsonResponse([{ id: "campaign-1", title: "Wellness", subject: "Wellness", message: "Hello", updated_at: "2026-08-27T00:00:00.000Z" }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const listResponse = await handleApiRequest(
    new Request("https://example.test/api/threads?campaign=campaign-1"),
    { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" },
  );
  const listPayload = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.total, 1);
  assert.equal(listPayload.unread, 1);
  assert.equal(listPayload.data[0]?.id, 11);
  assert.equal(listPayload.data[0]?.thread.length, 2);

  const detailResponse = await handleApiRequest(
    new Request("https://example.test/api/threads/11"),
    { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" },
  );
  assert.equal(detailResponse.status, 200);
  assert.equal((await detailResponse.json()).data.id, 11);
});

test("workspace summary fetches later lead pages concurrently", async () => {
  const ranges: string[] = [];
  let active = 0;
  let maxActive = 0;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const range = headers.get("range") || "0-999";
    ranges.push(range);
    const start = Number(range.split("-")[0]);
    const count = start < 2_000 ? 1_000 : 500;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, start === 0 ? 0 : 5));
    active -= 1;
    return new Response(
      JSON.stringify(Array.from({ length: count }, (_, index) => ({
        id: start + index + 1,
        age_band: "No DOB",
        email: null,
        phone: null,
        topics: [],
        status: "Untouched",
        struck: false,
        first_captured: null,
      }))),
      {
        headers: {
          "content-type": "application/json",
          "content-range": start === 0 ? "0-999/2500" : `${start}-${start + count - 1}/2500`,
        },
      },
    );
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/summary"),
    { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" },
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.total, 2_500);
  assert.equal(payload.whatsappReachable, 0);
  assert.equal(payload.addedThisMonth, 0);
  assert.deepEqual(ranges, ["0-999", "1000-1999", "2000-2999"]);
  assert.ok(maxActive >= 2);
});

test("Hi-Hunt history reads are live-empty instead of missing sample endpoints", async () => {
  const draftResponse = await handleApiRequest(
    new Request("https://example.test/api/hr-outreach-drafts"),
    {},
  );
  const threadResponse = await handleApiRequest(
    new Request("https://example.test/api/email-threads"),
    {},
  );

  assert.equal(draftResponse.status, 200);
  assert.deepEqual(await draftResponse.json(), {
    data: [],
    summary: { draft: 0, approved: 0, copied: 0, contacted: 0 },
  });
  assert.equal(threadResponse.status, 200);
  assert.deepEqual(await threadResponse.json(), { data: [], total: 0, unread: 0 });
});

test("Hi-Hunt Gmail inbox lists campaign replies and loads readable message bodies", async () => {
  const campaignId = "12121212-1212-4121-8121-121212121212";
  const prospectId = "34343434-3434-4343-8343-343434343434";
  const encodedBody = Buffer.from("Yes, please send the details.", "utf8").toString("base64url");
  const metadataThread = {
    id: "thread-1",
    snippet: "Yes, please send the details.",
    messages: [
      {
        id: "gmail-out-1",
        threadId: "thread-1",
        labelIds: ["SENT"],
        internalDate: "1788231600000",
        snippet: "Hello Rachel",
        payload: { headers: [
          { name: "From", value: "Hilite <namiuser89@gmail.com>" },
          { name: "To", value: "Rachel Tan <rachel@example.test>" },
          { name: "Subject", value: "Financial wellness" },
          { name: "Message-ID", value: "<campaign-message@example.test>" },
        ] },
      },
      {
        id: "gmail-in-1",
        threadId: "thread-1",
        labelIds: ["INBOX", "UNREAD"],
        internalDate: "1788318000000",
        snippet: "Yes, please send the details.",
        payload: { headers: [
          { name: "From", value: "Rachel Tan <rachel@example.test>" },
          { name: "To", value: "Hilite <namiuser89@gmail.com>" },
          { name: "Subject", value: "Re: Financial wellness" },
          { name: "Message-ID", value: "<reply-message@example.test>" },
        ] },
      },
    ],
  };
  const fullThread = {
    ...metadataThread,
    messages: metadataThread.messages.map((message) => ({
      ...message,
      payload: {
        ...message.payload,
        mimeType: "text/plain",
        body: { data: message.id === "gmail-in-1" ? encodedBody : Buffer.from("Hello Rachel", "utf8").toString("base64url") },
      },
    })),
  };

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return jsonResponse({ access_token: "gmail-inbox-token" });
    if (url.includes("/gmail/v1/users/me/threads?maxResults=50")) return jsonResponse({ threads: [{ id: "thread-1" }] });
    if (url.includes("/gmail/v1/users/me/threads/thread-1?") && url.includes("format=metadata")) return jsonResponse(metadataThread);
    if (url.includes("/gmail/v1/users/me/threads/thread-1?") && url.includes("format=full")) return jsonResponse(fullThread);
    if (url.includes("/rest/v1/hr_campaign_recipients?") && url.includes("external_message_id")) {
      return jsonResponse([{ external_message_id: "gmail-out-1", prospect_id: prospectId, campaign_id: campaignId }]);
    }
    if (url.includes("/rest/v1/hr_campaigns?") && url.includes("select=id%2Cname")) {
      return jsonResponse([{ id: campaignId, name: "Singapore HR seminar" }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const env = {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SECRET_KEY: "test-service-key",
    GMAIL_CLIENT_ID: "client.apps.googleusercontent.com",
    GMAIL_CLIENT_SECRET: "test-client-secret",
    GMAIL_REFRESH_TOKEN: "test-refresh-token",
    GMAIL_SENDER_EMAIL: "namiuser89@gmail.com",
    GMAIL_SENDER_NAME: "Hilite",
  };
  const listResponse = await handleApiRequest(new Request("https://example.test/api/email-threads"), env);
  const listPayload = await listResponse.json();
  assert.equal(listResponse.status, 200, JSON.stringify(listPayload));
  assert.equal(listPayload.total, 1);
  assert.equal(listPayload.unread, 1);
  assert.deepEqual(listPayload.data[0], {
    id: "thread-1",
    prospectId,
    workflowId: campaignId,
    workflowName: "Singapore HR seminar",
    sender: { name: "Rachel Tan", address: "rachel@example.test" },
    subject: "Re: Financial wellness",
    snippet: "Yes, please send the details.",
    lastMessageAt: new Date(1788318000000).toISOString(),
    unread: true,
    status: "needs_reply",
    category: "Interested",
  });

  const detailResponse = await handleApiRequest(new Request("https://example.test/api/email-threads/thread-1"), env);
  const detailPayload = await detailResponse.json();
  assert.equal(detailResponse.status, 200, JSON.stringify(detailPayload));
  assert.equal(detailPayload.data.messages[1].body, "Yes, please send the details.");
  assert.equal(detailPayload.data.messages[1].direction, "inbound");
});

test("Hi-Hunt Gmail inbox replies stay in the selected Gmail thread", async () => {
  let sentPayload: Record<string, unknown> | null = null;
  const thread = {
    id: "thread-reply-1",
    messages: [{
      id: "gmail-in-reply-1",
      labelIds: ["INBOX", "UNREAD"],
      internalDate: "1788318000000",
      snippet: "Could you share the brochure?",
      payload: { headers: [
        { name: "From", value: "Rachel Tan <rachel@example.test>" },
        { name: "To", value: "Hilite <namiuser89@gmail.com>" },
        { name: "Subject", value: "Re: Financial wellness" },
        { name: "Message-ID", value: "<reply-one@example.test>" },
        { name: "References", value: "<campaign-one@example.test>" },
      ] },
    }],
  };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return jsonResponse({ access_token: "gmail-inbox-token" });
    if (url.includes("/gmail/v1/users/me/threads/thread-reply-1?") && url.includes("format=metadata")) return jsonResponse(thread);
    if (url.endsWith("/gmail/v1/users/me/messages/send")) {
      sentPayload = JSON.parse(String(init?.body));
      return jsonResponse({ id: "gmail-out-reply-1", threadId: "thread-reply-1" });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(new Request("https://example.test/api/email-threads/thread-reply-1/reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "Absolutely — attached in our next note.", idempotencyKey: "reply-key-1" }),
  }), {
    GMAIL_CLIENT_ID: "client.apps.googleusercontent.com",
    GMAIL_CLIENT_SECRET: "test-client-secret",
    GMAIL_REFRESH_TOKEN: "test-refresh-token",
    GMAIL_SENDER_EMAIL: "namiuser89@gmail.com",
    GMAIL_SENDER_NAME: "Hilite",
  });
  const payload = await response.json();
  const sent = sentPayload as Record<string, unknown> | null;
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.threadId, "thread-reply-1");
  assert.equal(sent?.threadId, "thread-reply-1");
  const mime = Buffer.from(String(sent?.raw || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  assert.match(mime, /To: rachel@example\.test/);
  assert.match(mime, /In-Reply-To: <reply-one@example\.test>/);
  assert.match(mime, /References: <campaign-one@example\.test> <reply-one@example\.test>/);
});

test("Hi-Hunt prospect reads include suppressed contacts and project honest Apollo lifecycle context", async () => {
  const baseProspect = {
    full_name: "Taylor Tan",
    first_name: "Taylor",
    last_name: "Tan",
    job_title: "Talent Acquisition Manager",
    seniority: "manager",
    company_name: "Example Pte Ltd",
    company_domain: "example.test",
    work_email: "taylor@example.test",
    email_status: "verified",
    linkedin_url: "https://www.linkedin.com/in/taylor-tan",
    location: "Singapore",
    hr_match_reason: "HR title match: Talent Acquisition Manager",
    review_status: "new",
    provider: "apollo",
    discovered_at: "2026-08-27T00:00:00.000Z",
    updated_at: "2026-08-27T00:00:00.000Z",
  };
  let listUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/rest/v1/hr_prospects?") && url.includes("order=discovered_at.desc")) {
      listUrl = url;
      return new Response(JSON.stringify([
        { ...baseProspect, id: "prospect-1", suppressed: false, source_metadata: {} },
        { ...baseProspect, id: "prospect-2", suppressed: true, source_metadata: { hihunt_status: "new" } },
      ]), { status: 200, headers: { "content-type": "application/json", "content-range": "0-1/2" } });
    }
    if (url.includes("/rest/v1/hr_discovery_runs?")) return jsonResponse([]);
    if (url.includes("/rest/v1/hr_prospects?select=id")) {
      return new Response(null, { status: 200, headers: { "content-range": "*/1" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/hr-prospects?includeSuppressed=true&limit=25&offset=0"),
    { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.doesNotMatch(listUrl, /suppressed=eq\.false/);
  assert.deepEqual(payload.data.map((prospect: { status: string }) => prospect.status), ["new", "suppressed"]);
  assert.ok(payload.data.every((prospect: Record<string, unknown>) => !("workflow_id" in prospect) && !("workflow_name" in prospect)));
});

test("Hi-Hunt lifecycle updates persist suppression and status metadata", async () => {
  const prospectId = "33333333-3333-4333-8333-333333333333";
  const patchBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") {
      return jsonResponse([{ id: prospectId, source_metadata: { provider: "Apollo" } }]);
    }
    patchBodies.push(JSON.parse(String(init.body)));
    return jsonResponse([{ id: prospectId }]);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request(`https://example.test/api/hr-prospects/${prospectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "suppressed" }),
    }),
    { SUPABASE_URL: "https://supabase.example.test", SUPABASE_SECRET_KEY: "test-service-key" },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { id: prospectId, status: "suppressed" } });
  assert.equal(patchBodies[0]?.suppressed, true);
  assert.deepEqual(patchBodies[0]?.source_metadata, { provider: "Apollo", hihunt_status: "suppressed" });
});

test("daily Hi-Hunt discovery cron rejects requests without the configured Vercel secret", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("Unexpected fetch");
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/cron/hr-discovery"),
    { CRON_SECRET: "test-cron-secret", APOLLO_API_KEY: "test-apollo-key" },
  );

  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("daily Hi-Hunt discovery advances the Apollo page and stores only inserted prospects", async () => {
  const runId = "44444444-4444-4444-8444-444444444444";
  const runBodies: Array<Record<string, unknown>> = [];
  const completionBodies: Array<Record<string, unknown>> = [];
  const ingestBodies: Array<Record<string, unknown>> = [];
  let searchUrl = "";
  let singleMatchUrl = "";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/hr_discovery_runs?") && url.includes("triggered_by=eq.cron")) {
      return jsonResponse([]);
    }
    if (url.includes("/rest/v1/hr_discovery_runs?select=id&status=eq.completed") && init?.method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": "*/1" } });
    }
    if (url.includes("/rest/v1/hr_discovery_runs?select=id") && init?.method === "POST") {
      runBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse([{ id: runId }]);
    }
    if (url.includes("https://api.apollo.io/api/v1/mixed_people/api_search")) {
      searchUrl = url;
      return jsonResponse({
        people: [{
          id: "apollo-person-2",
          first_name: "Taylor",
          title: "Talent Acquisition Manager",
          has_email: true,
          organization: { name: "Example Pte Ltd" },
        }],
      });
    }
    if (url.includes("/rest/v1/hr_prospects?") && url.includes("provider_person_id=in.")) {
      return jsonResponse([]);
    }
    if (url.includes("https://api.apollo.io/api/v1/people/bulk_match")) {
      assert.deepEqual(JSON.parse(String(init?.body)), { details: [{ id: "apollo-person-2" }] });
      return jsonResponse({ error: "Bulk matching is unavailable on this plan" }, 403);
    }
    if (url.includes("https://api.apollo.io/api/v1/people/match")) {
      singleMatchUrl = url;
      return jsonResponse({ matches: [{
        id: "unused-bulk-result",
      }], person: {
        id: "apollo-person-2",
        first_name: "Taylor",
        last_name: "Tan",
        name: "Taylor Tan",
        title: "Talent Acquisition Manager",
        seniority: "manager",
        email: "taylor@example.test",
        email_status: "verified",
        linkedin_url: "https://www.linkedin.com/in/taylor-tan",
        city: "Singapore",
        country: "Singapore",
        organization: { id: "apollo-org-2", name: "Example Pte Ltd", primary_domain: "example.test" },
      } });
    }
    if (url.includes("/rest/v1/rpc/ingest_hr_prospects") && init?.method === "POST") {
      ingestBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse(1);
    }
    if (url.includes(`/rest/v1/hr_discovery_runs?id=eq.${runId}`) && init?.method === "PATCH") {
      completionBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/cron/hr-discovery", {
      headers: { authorization: "Bearer test-cron-secret" },
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      APOLLO_API_KEY: "test-apollo-key",
      CRON_SECRET: "test-cron-secret",
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.deepEqual(payload, {
    ok: true,
    runId,
    searched: 1,
    enriched: 1,
    saved: 1,
    verified: 1,
    provider: "Multi-provider waterfall",
    providers: ["apollo"],
    providerResults: [{ provider: "apollo", limit: 70, searched: 1, enriched: 1, saved: 1 }],
    providerErrors: [],
    requested: 300,
    capacity: 70,
    shortfall: 299,
    searchPage: 2,
  });
  assert.match(searchUrl, /page=2/);
  assert.match(searchUrl, /per_page=100/);
  assert.match(singleMatchUrl, /id=apollo-person-2/);
  assert.equal(runBodies[0]?.triggered_by, "cron");
  assert.equal(runBodies[0]?.provider, "multi_provider");
  assert.equal(runBodies[0]?.requested_count, 300);
  assert.equal((runBodies[0]?.filters as Record<string, unknown>)?.searchPage, 2);
  assert.equal((runBodies[0]?.filters as Record<string, unknown>)?.perProviderLimit, 70);
  assert.equal((runBodies[0]?.filters as Record<string, unknown>)?.configuredCapacity, 70);
  const savedProspect = (ingestBodies[0]?.p_prospects as Array<Record<string, unknown>>)[0];
  assert.equal(savedProspect.full_name, "Taylor Tan");
  assert.equal(savedProspect.work_email, "taylor@example.test");
  assert.ok(!("discovery_run_id" in savedProspect));
  assert.equal(completionBodies[0]?.saved_count, 1);
});

test("daily Hi-Hunt discovery records an Apollo limit as a safe partial run", async () => {
  const runId = "77777777-7777-4777-8777-777777777777";
  const completionBodies: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/hr_discovery_runs?") && url.includes("triggered_by=eq.cron")) {
      return jsonResponse([]);
    }
    if (url.includes("/rest/v1/hr_discovery_runs?select=id&status=eq.completed") && init?.method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": "*/1" } });
    }
    if (url.includes("/rest/v1/hr_discovery_runs?select=id") && init?.method === "POST") {
      return jsonResponse([{ id: runId }]);
    }
    if (url.includes("https://api.apollo.io/api/v1/mixed_people/api_search")) {
      return jsonResponse({ error: "daily limit reached" }, 429);
    }
    if (url.includes(`/rest/v1/hr_discovery_runs?id=eq.${runId}`) && init?.method === "PATCH") {
      completionBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/cron/hr-discovery", {
      headers: { authorization: "Bearer test-cron-secret" },
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      APOLLO_API_KEY: "test-apollo-key",
      CRON_SECRET: "test-cron-secret",
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.saved, 0);
  assert.equal(payload.capacity, 70);
  assert.equal(payload.shortfall, 300);
  assert.deepEqual(payload.providerErrors, [{
    provider: "apollo",
    message: "Apollo's API limit was reached. Wait before running another discovery",
    limitReached: true,
  }]);
  assert.equal(completionBodies[0]?.status, "completed");
  assert.equal((completionBodies[0]?.filters as Record<string, unknown>)?.perProviderLimit, 70);
});

test("Hi-Hunt discovery continues to Lusha when Apollo reaches its limit", async () => {
  const runId = "66666666-6666-4666-8666-666666666666";
  const ingestBodies: Array<Record<string, unknown>> = [];
  const runBodies: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/hr_discovery_runs?select=id&status=eq.completed") && init?.method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    }
    if (url.includes("/rest/v1/hr_discovery_runs?select=id") && init?.method === "POST") {
      runBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse([{ id: runId }]);
    }
    if (url.includes("https://api.apollo.io/api/v1/mixed_people/api_search")) {
      return jsonResponse({ error: "daily limit reached" }, 429);
    }
    if (url === "https://api.lusha.com/v3/contacts/prospecting") {
      const body = JSON.parse(String(init?.body)) as {
        pagination: { size: number };
        filters: { contacts: { include: { existingDataPoints: string[] } } };
      };
      assert.equal(body.pagination.size, 1);
      assert.deepEqual(body.filters.contacts.include.existingDataPoints, ["work_email"]);
      return jsonResponse({ results: [{ id: "lusha-person-1" }] });
    }
    if (url === "https://api.lusha.com/v3/contacts/enrich") {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        ids: ["lusha-person-1"],
        reveal: ["emails"],
        waterfallEnabled: false,
      });
      return jsonResponse({ results: [{
        id: "lusha-person-1",
        firstName: "Aisha",
        lastName: "Lim",
        jobTitle: { title: "HR Director", seniority: "director" },
        company: { name: "Example Pte Ltd", domain: "example.test" },
        emails: [{ email: "aisha@example.test", type: "work", confidence: "A" }],
        location: "Singapore",
      }] });
    }
    if (url.includes("/rest/v1/rpc/ingest_hr_prospects") && init?.method === "POST") {
      ingestBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse(1);
    }
    if (url.includes(`/rest/v1/hr_discovery_runs?id=eq.${runId}`) && init?.method === "PATCH") {
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/hr-discovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: "Singapore", seniorities: ["director"], limit: 1 }),
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      APOLLO_API_KEY: "test-apollo-key",
      LUSHA_API_KEY: "test-lusha-key",
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(runBodies[0]?.provider, "multi_provider");
  assert.deepEqual(payload.providers, ["lusha"]);
  assert.deepEqual(payload.providerErrors, [{
    provider: "apollo",
    message: "Apollo's API limit was reached. Wait before running another discovery",
    limitReached: true,
  }]);
  assert.deepEqual(payload.providerResults, [{ provider: "lusha", limit: 1, searched: 1, enriched: 1, saved: 1 }]);
  assert.equal(payload.capacity, 140);
  assert.equal(payload.saved, 1);
  const prospect = (ingestBodies[0]?.p_prospects as Array<Record<string, unknown>>)[0];
  assert.equal(prospect.provider, "lusha");
  assert.equal(prospect.work_email, "aisha@example.test");
  assert.equal(prospect.email_status, "verified");
});

test("Hi-Hunt licensed provider adapters return verified HR work emails", async () => {
  type ProviderFixture = {
    id: string;
    envKey: "HUNTER_API_KEY" | "PDL_API_KEY" | "ROCKETREACH_API_KEY" | "COGNISM_API_KEY";
    workEmail: string;
    respond: (url: string, init?: RequestInit) => Response | null;
  };

  const fixtures: ProviderFixture[] = [
    {
      id: "hunter",
      envKey: "HUNTER_API_KEY",
      workEmail: "hunter.hr@example.test",
      respond(url, init) {
        if (url.startsWith("https://api.hunter.io/v2/multi-domain-search?")) {
          assert.match(url, /location=Singapore/);
          assert.match(url, /department=human_resources/);
          assert.match(url, /limit=1/);
          return jsonResponse({ data: { results: [{ reveal_handle: "hunter-1", position: "HR Director" }] } });
        }
        if (url.startsWith("https://api.hunter.io/v2/multi-domain-search/reveal?")) {
          assert.deepEqual(JSON.parse(String(init?.body)), { handles: ["hunter-1"] });
          return jsonResponse({ data: { emails: [{
            id: "hunter-1",
            reveal_handle: "hunter-1",
            first_name: "Hana",
            last_name: "Tan",
            position: "HR Director",
            company: "Example Pte Ltd",
            domain: "example.test",
            email: "hunter.hr@example.test",
            location: "Singapore",
          }] } });
        }
        return null;
      },
    },
    {
      id: "pdl",
      envKey: "PDL_API_KEY",
      workEmail: "pdl.hr@example.test",
      respond(url, init) {
        if (url !== "https://api.peopledatalabs.com/v5/person/search") return null;
        const body = JSON.parse(String(init?.body)) as { size: number; query: { bool: { must: unknown[] } } };
        assert.equal(body.size, 1);
        assert.ok(body.query.bool.must.length >= 2);
        return jsonResponse({ data: [{
          id: "pdl-1",
          full_name: "Priya Lim",
          first_name: "Priya",
          last_name: "Lim",
          job_title: "Talent Acquisition Director",
          job_company_name: "Example Pte Ltd",
          job_company_website: "example.test",
          work_email: "pdl.hr@example.test",
          location_name: "Singapore",
        }] });
      },
    },
    {
      id: "rocketreach",
      envKey: "ROCKETREACH_API_KEY",
      workEmail: "rocket.hr@example.test",
      respond(url, init) {
        if (url === "https://api.rocketreach.co/api/v2/person/search") {
          const body = JSON.parse(String(init?.body)) as { page_size: number };
          assert.equal(body.page_size, 1);
          return jsonResponse({ profiles: [{ id: "rocket-1" }] });
        }
        if (url.startsWith("https://api.rocketreach.co/api/v2/person/lookup?")) {
          assert.match(url, /id=rocket-1/);
          return jsonResponse({
            id: "rocket-1",
            first_name: "Ravi",
            last_name: "Lee",
            current_title: "People Operations Director",
            recommended_professional_email: "rocket.hr@example.test",
            current_employer: "Example Pte Ltd",
            current_employer_domain: "example.test",
            location: "Singapore",
          });
        }
        return null;
      },
    },
    {
      id: "cognism",
      envKey: "COGNISM_API_KEY",
      workEmail: "cognism.hr@example.test",
      respond(url, init) {
        if (url.startsWith("https://app.cognism.com/api/search/contact/search?")) {
          assert.match(url, /indexSize=20/);
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          assert.deepEqual(body.countries, ["Singapore"]);
          assert.deepEqual(body.jobFunctions, ["HR"]);
          assert.equal(body.regions, undefined);
          return jsonResponse({ results: [{ redeemId: "cognism-1", hasEmail: true }] });
        }
        if (url === "https://app.cognism.com/api/search/contact/redeem") {
          assert.deepEqual(JSON.parse(String(init?.body)), { redeemIds: ["cognism-1"] });
          return jsonResponse({ results: [{
            id: "cognism-1",
            firstName: "Chen",
            lastName: "Ng",
            fullName: "Chen Ng",
            jobTitle: "Human Resources Director",
            account: { name: "Example Pte Ltd", domain: "example.test" },
            email: "cognism.hr@example.test",
            location: { country: "Singapore" },
          }] });
        }
        return null;
      },
    },
  ];

  for (const fixture of fixtures) {
    const runId = `adapter-${fixture.id}`;
    const ingestBodies: Array<Record<string, unknown>> = [];
    const requestLog: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requestLog.push(`${init?.method || "GET"} ${url}`);
      const providerResponse = fixture.respond(url, init);
      if (providerResponse) return providerResponse;
      if (url.includes("/rest/v1/hr_discovery_runs?select=id&status=eq.completed") && init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
      }
      if (url.includes("/rest/v1/hr_discovery_runs?select=id") && init?.method === "POST") {
        return jsonResponse([{ id: runId }]);
      }
      if (url.includes("/rest/v1/rpc/ingest_hr_prospects") && init?.method === "POST") {
        ingestBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return jsonResponse(1);
      }
      if (url.includes(`/rest/v1/hr_discovery_runs?id=eq.${runId}`) && init?.method === "PATCH") {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected ${fixture.id} request: ${url} ${init?.method || "GET"}`);
    }) as typeof fetch;

    const response = await handleApiRequest(
      new Request("https://example.test/api/hr-discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location: "Singapore", seniorities: ["director"], limit: 1 }),
      }),
      {
        SUPABASE_URL: "https://supabase.example.test",
        SUPABASE_SECRET_KEY: "test-service-key",
        [fixture.envKey]: "test-provider-key",
      },
    );
    const payload = await response.json();

    assert.equal(response.status, 200, `${fixture.id}: ${JSON.stringify(payload)}\n${requestLog.join("\n")}`);
    assert.deepEqual(payload.providers, [fixture.id]);
    assert.deepEqual(payload.providerErrors, []);
    assert.equal(payload.saved, 1);
    assert.equal(payload.capacity, 70);
    const prospect = (ingestBodies[0]?.p_prospects as Array<Record<string, unknown>>)[0];
    assert.equal(prospect.provider, fixture.id);
    assert.equal(prospect.work_email, fixture.workEmail);
    assert.equal(prospect.email_status, "verified");
  }
});

test("Lusha discovery paginates its 50-record API pages to honor the 70-provider cap", async () => {
  const runId = "88888888-8888-4888-8888-888888888888";
  const pageRequests: Array<{ page: number; size: number }> = [];
  const requestLog: string[] = [];
  let ingestCount = 0;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requestLog.push(`${init?.method || "GET"} ${url}`);
    if (url.includes("/rest/v1/hr_discovery_runs?select=id&status=eq.completed") && init?.method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    }
    if (url.includes("/rest/v1/hr_discovery_runs?select=id") && init?.method === "POST") {
      return jsonResponse([{ id: runId }]);
    }
    if (url === "https://api.lusha.com/v3/contacts/prospecting") {
      const body = JSON.parse(String(init?.body)) as { pagination: { page: number; size: number } };
      pageRequests.push(body.pagination);
      const offset = body.pagination.page * 50;
      return jsonResponse({ results: Array.from({ length: body.pagination.size }, (_, index) => ({ id: `lusha-${offset + index}` })) });
    }
    if (url === "https://api.lusha.com/v3/contacts/enrich") {
      const body = JSON.parse(String(init?.body)) as { ids: string[]; reveal: string[] };
      assert.equal(body.ids.length, 70);
      assert.deepEqual(body.reveal, ["emails"]);
      return jsonResponse({ results: body.ids.map((id, index) => ({
        id,
        firstName: "Lusha",
        lastName: `Contact ${index}`,
        jobTitle: { title: "HR Director", seniority: "director" },
        company: { name: "Example Pte Ltd", domain: "example.test" },
        emails: [{ email: `lusha${index}@example.test`, type: "work", confidence: "A" }],
        location: "Singapore",
      })) });
    }
    if (url.includes("/rest/v1/rpc/ingest_hr_prospects") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { p_prospects: unknown[] };
      ingestCount = body.p_prospects.length;
      return jsonResponse(ingestCount);
    }
    if (url.includes(`/rest/v1/hr_discovery_runs?id=eq.${runId}`) && init?.method === "PATCH") {
      return jsonResponse([]);
    }
    throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/hr-discovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: "Singapore", seniorities: ["director"], limit: 70 }),
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      LUSHA_API_KEY: "test-lusha-key",
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200, `${JSON.stringify(payload)}\n${requestLog.join("\n")}`);
  assert.deepEqual(pageRequests, [{ page: 0, size: 50 }, { page: 1, size: 20 }]);
  assert.equal(ingestCount, 70);
  assert.equal(payload.saved, 70);
  assert.equal(payload.shortfall, 0);
  assert.deepEqual(payload.providerResults, [{ provider: "lusha", limit: 70, searched: 70, enriched: 70, saved: 70 }]);
});

test("daily Hi-Hunt discovery cron is idempotent within the same Singapore day", async () => {
  const runId = "55555555-5555-4555-8555-555555555555";
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/rest/v1/hr_discovery_runs?") && url.includes("triggered_by=eq.cron")) {
      return jsonResponse([{ id: runId, status: "completed", started_at: new Date().toISOString(), completed_at: new Date().toISOString() }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const response = await handleApiRequest(
    new Request("https://example.test/api/cron/hr-discovery", {
      headers: { authorization: "Bearer test-cron-secret" },
    }),
    {
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SECRET_KEY: "test-service-key",
      APOLLO_API_KEY: "test-apollo-key",
      CRON_SECRET: "test-cron-secret",
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, skipped: "already-ran", runId });
});

test("Hi-Hunt production schedule and migration enforce daily growth without source workflow storage", () => {
  const vercelConfig = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
  };
  const migration = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260829082710_hihunt_daily_discovery.sql"),
    "utf8",
  );
  const dailyTargetMigration = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260902090000_hihunt_300_daily_discovery.sql"),
    "utf8",
  );
  const multiProviderMigration = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260902130000_hihunt_multi_provider_discovery.sql"),
    "utf8",
  );

  assert.deepEqual(vercelConfig.crons.find((cron) => cron.path === "/api/cron/hr-discovery"), {
    path: "/api/cron/hr-discovery",
    schedule: "0 23 * * *",
  });
  assert.match(migration, /hr_prospects_normalized_name_email_unique_idx/);
  assert.match(migration, /on conflict do nothing/i);
  assert.match(migration, /drop column if exists discovery_run_id/i);
  assert.match(migration, /triggered_by in \('manual', 'cron'\)/i);
  assert.match(dailyTargetMigration, /requested_count between 0 and 300/i);
  assert.match(multiProviderMigration, /provider in \('apollo', 'hunter', 'pdl', 'rocketreach', 'lusha', 'cognism'\)/i);
  assert.match(multiProviderMigration, /lower\(btrim\(existing\.work_email\)\) = lower\(btrim\(candidate\.work_email\)\)/i);
  assert.match(multiProviderMigration, /distinct on \(lower\(btrim\(candidate\.work_email\)\)\)/i);
});

test("Hi-Hunt campaign detail and send routes are exposed as Vercel functions", () => {
  const detailHandler = readFileSync(
    path.join(process.cwd(), "api/hr-campaigns/[id].js"),
    "utf8",
  );
  const sendHandler = readFileSync(
    path.join(process.cwd(), "api/hr-campaigns/[id]/send.js"),
    "utf8",
  );

  assert.match(detailHandler, /worker\/vercel-handler\.js/);
  assert.match(sendHandler, /worker\/vercel-handler\.js/);
});

test("Hi-Hunt Gmail thread detail and reply routes are exposed as Vercel functions", () => {
  const detailHandler = readFileSync(
    path.join(process.cwd(), "api/email-threads/[id].js"),
    "utf8",
  );
  const replyHandler = readFileSync(
    path.join(process.cwd(), "api/email-threads/[id]/reply.js"),
    "utf8",
  );

  assert.match(detailHandler, /worker\/vercel-handler\.js/);
  assert.match(replyHandler, /worker\/vercel-handler\.js/);
});

test("WhatsApp campaigns use a protected one-minute durable send schedule", () => {
  const vercelConfig = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
  };
  const migration = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260829224156_pace_whatsapp_campaign_sends.sql"),
    "utf8",
  );
  const cronHandler = readFileSync(
    path.join(process.cwd(), "api/cron/campaign-sends.js"),
    "utf8",
  );

  assert.deepEqual(vercelConfig.crons.find((cron) => cron.path === "/api/cron/campaign-sends"), {
    path: "/api/cron/campaign-sends",
    schedule: "* * * * *",
  });
  assert.match(cronHandler, /worker\/vercel-handler\.js/);
  assert.match(migration, /p_interval_seconds integer default 60/i);
  assert.match(migration, /status = 'scheduled'[\s\S]*scheduled_at <= p_now/i);
  assert.match(migration, /campaign\.status in \('queued', 'sending'\)/i);
  assert.match(migration, /occurred_at > p_now - pg_catalog\.make_interval\(secs => 60\)/i);
  assert.match(migration, /for update of recipient skip locked[\s\S]*limit 1/i);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/i);
});
