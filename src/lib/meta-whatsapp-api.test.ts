import assert from "node:assert/strict";
import test from "node:test";
import { handleMetaWhatsAppRequest } from "../../worker/meta-whatsapp.js";
import { handleApiRequest } from "../../worker/supabase-api.js";

const key = "test-only-operator-key-32-characters";
const env = { DEMO_MODE: "true", META_ACCESS_TOKEN: "test-only-meta-token", META_TEST_OPERATOR_TOKEN: key, META_TEST_SEND_ENABLED: "true" };
const body = { action: "send", recipient: "+447700900123", firstName: "Demo", confirmed: true };
const request = (data: unknown = body, auth = key) => new Request("https://hilite.example/api/meta-whatsapp", { method: "POST", headers: { authorization: `Bearer ${auth}`, origin: "https://hilite.example" }, body: JSON.stringify(data) });
const reply = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
const phone = { id: "1442204225635652", display_phone_number: "+6599994289", status: "CONNECTED" };
const template = { name: "pias_clone_cpf_webinar_image", language: "en_US", status: "APPROVED", components: [{ type: "HEADER", format: "IMAGE" }] };

function provider({ sender = phone, approvedTemplate = template, sendError = false, health = { can_send_message: "AVAILABLE", entities: [] as any[] }, subscribedApp = "1629215102235593" } = {}) {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, options = {}) => {
    const url = String(input);
    calls.push({ url, options });
    if (url.includes("/phone_numbers?")) return reply({ data: [sender] });
    if (url.includes("/message_templates?")) return reply({ data: [approvedTemplate] });
    if (url.endsWith("/1442204225635652?fields=health_status")) return reply({ id: phone.id, health_status: health });
    if (url.endsWith("/1656774412758599/subscribed_apps")) return reply(options.method === "POST" ? { success: true } : { data: subscribedApp ? [{ whatsapp_business_api_data: { id: subscribedApp } }] : [] });
    if (url.endsWith("/media")) return reply({ id: "123456789" });
    if (url.endsWith("/messages")) {
      if (sendError) throw new Error("network unavailable");
      return reply({ messages: [{ id: "wamid.mock-only" }] });
    }
    throw new Error(`Unexpected path: ${url}`);
  };
  return { fetcher, calls, loadPoster: async () => Buffer.from([137, 80, 78, 71]) };
}

test("private WhatsApp API rejects missing setup, wrong key, foreign account and cross-origin requests before any provider call", async () => {
  const mock = provider();
  assert.equal((await handleMetaWhatsAppRequest(request(), {}, mock)).status, 503);
  assert.equal((await handleMetaWhatsAppRequest(request(body, "wrong"), env, mock)).status, 401);
  assert.equal((await handleMetaWhatsAppRequest(request(), { ...env, META_WABA_ID: "old-account" }, mock)).status, 503);
  const crossOrigin = request(); crossOrigin.headers.set("origin", "https://elsewhere.example");
  assert.equal((await handleMetaWhatsAppRequest(crossOrigin, env, mock)).status, 403);
  assert.equal(mock.calls.length, 0);
});

test("manual sending must be enabled and individually confirmed; fictional demo recipients are refused", async () => {
  const mock = provider();
  assert.equal((await handleMetaWhatsAppRequest(request(), { ...env, META_TEST_SEND_ENABLED: "false" }, mock)).status, 403);
  assert.equal((await handleMetaWhatsAppRequest(request({ ...body, confirmed: false }), env, mock)).status, 400);
  assert.equal((await handleMetaWhatsAppRequest(request({ ...body, recipient: "+12025550102" }), env, mock)).status, 400);
  assert.equal(mock.calls.length, 0);
});

test("pending registration, a wrong sender or unapproved template prevents media uploads and sends", async () => {
  for (const options of [
    { sender: { ...phone, status: "PENDING" } },
    { sender: { ...phone, id: "old-phone" } },
    { approvedTemplate: { ...template, status: "PENDING" } },
    { approvedTemplate: { ...template, components: [{ type: "HEADER", format: "TEXT" }] } },
  ]) {
    const mock = provider(options);
    assert.equal((await handleMetaWhatsAppRequest(request(), env, mock)).status, 409);
    assert.ok(mock.calls.every(call => !call.options.method || call.options.method === "GET"));
  }
  const mock = provider();
  assert.equal((await handleMetaWhatsAppRequest(request({ ...body, recipient: phone.display_phone_number }), env, mock)).status, 400);
  assert.ok(mock.calls.every(call => !call.options.method));
});

test("the connection check never uploads or sends and omits the full phone number and credentials", async () => {
  const mock = provider();
  const response = await handleMetaWhatsAppRequest(request({ action: "status" }), env, mock);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  assert.equal(JSON.parse(text).ready, true);
  assert.ok(!text.includes(phone.display_phone_number));
  assert.ok(!text.includes(env.META_ACCESS_TOKEN));
  assert.ok(!text.includes(key));
  assert.equal(mock.calls.length, 3);
});

test("a connected number and approved template stay locked when Meta messaging health is blocked", async () => {
  const mock = provider({ health: { can_send_message: "BLOCKED", entities: [{ entity_type: "APP", can_send_message: "BLOCKED", errors: [{ error_code: 141005, error_description: "App cannot send messages.", possible_solution: "Review app status in Meta." }] }] } });
  const status = await (await handleMetaWhatsAppRequest(request({ action: "status" }), env, mock)).json();
  assert.equal(status.ready, false);
  assert.equal(status.messagingHealth, "BLOCKED");
  assert.match(status.requirements.join(" "), /141005.*App cannot send messages/);
  assert.equal((await handleMetaWhatsAppRequest(request(), env, mock)).status, 409);
  assert.ok(mock.calls.every(call => !call.options.method));
});

test("calling restrictions alone do not block messaging, but missing messaging health fails closed", async () => {
  const callingOnly = provider({ health: { can_send_message: "AVAILABLE", entities: [{ entity_type: "PHONE_NUMBER", can_send_message: "AVAILABLE", can_receive_call_sip: "BLOCKED", errors: [{ error_code: 138024 }] }] } });
  const status = await (await handleMetaWhatsAppRequest(request({ action: "status" }), env, callingOnly)).json();
  assert.equal(status.ready, true);
  assert.deepEqual(status.healthIssues, []);
  const unknown = provider({ health: { can_send_message: "UNKNOWN", entities: [] } });
  assert.equal((await handleMetaWhatsAppRequest(request(), env, unknown)).status, 409);
  assert.ok(unknown.calls.every(call => !call.options.method));
});

test("delivery subscription setup requires private access, signed callback configuration and explicit confirmation", async () => {
  const mock = provider();
  const configured = { ...env, META_APP_SECRET: "mock-app-secret", META_WEBHOOK_VERIFY_TOKEN: "mock-verification-token-at-least-32-characters" };
  assert.equal((await handleMetaWhatsAppRequest(request({ action: "connect_delivery", confirmed: true }, "wrong"), configured, mock)).status, 401);
  assert.equal((await handleMetaWhatsAppRequest(request({ action: "connect_delivery", confirmed: false }), configured, mock)).status, 400);
  assert.equal((await handleMetaWhatsAppRequest(request({ action: "connect_delivery", confirmed: true }), env, mock)).status, 503);
  assert.equal(mock.calls.length, 0);
  const response = await handleMetaWhatsAppRequest(request({ action: "connect_delivery", confirmed: true, wabaId: "old-account", appId: "old-app" }), configured, mock);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).trackingConnected, true);
  const writes = mock.calls.filter(call => call.options.method === "POST");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url, "https://graph.facebook.com/v25.0/1656774412758599/subscribed_apps");
  assert.equal(writes[0].options.body, "{}");
});

test("when signed tracking is configured, an absent or different subscribed app prevents message sends", async () => {
  const configured = { ...env, META_APP_SECRET: "mock-app-secret", META_WEBHOOK_VERIFY_TOKEN: "mock-verification-token-at-least-32-characters" };
  for (const subscribedApp of ["", "different-app"]) {
    const mock = provider({ subscribedApp });
    const status = await (await handleMetaWhatsAppRequest(request({ action: "status" }), configured, mock)).json();
    assert.equal(status.ready, false);
    assert.equal(status.trackingConnected, false);
    assert.equal((await handleMetaWhatsAppRequest(request(), configured, mock)).status, 409);
    assert.ok(mock.calls.every(call => !call.options.method));
  }
});

test("one authorised test uses the pinned new number, uploads the supplied poster, and sends its image template once", async () => {
  const mock = provider();
  const response = await handleMetaWhatsAppRequest(request({ ...body, senderId: "old-phone", template: "unapproved-template" }), env, mock);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, messageId: "wamid.mock-only", recipient: "Number ending 0123", deliveryConfirmed: false });
  const uploads = mock.calls.filter(call => call.url.endsWith("/media"));
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].url, "https://graph.facebook.com/v25.0/1442204225635652/media");
  const media = uploads[0].options.body as FormData;
  assert.equal(media.get("messaging_product"), "whatsapp");
  assert.equal((media.get("file") as File).name, "cpf-webinar-poster.png");
  const sends = mock.calls.filter(call => call.url.endsWith("/messages"));
  assert.equal(sends.length, 1);
  assert.equal(sends[0].url, "https://graph.facebook.com/v25.0/1442204225635652/messages");
  const message = JSON.parse(String(sends[0].options.body));
  assert.equal(message.to, "447700900123");
  assert.equal(message.template.name, template.name);
  assert.deepEqual(message.template.components[0], { type: "header", parameters: [{ type: "image", image: { id: "123456789" } }] });
  assert.equal(message.template.components[1].parameters[0].text, "Demo");
});

test("a network failure during the send is reported without retrying or claiming delivery", async () => {
  const mock = provider({ sendError: true });
  const response = await handleMetaWhatsAppRequest(request(), env, mock);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Check the recipient/);
  assert.equal(mock.calls.filter(call => call.url.endsWith("/messages")).length, 1);
});

test("the routed endpoint stays private in demo mode even if a Meta token is accidentally present", async () => {
  const response = await handleApiRequest(request(), { DEMO_MODE: "true", META_ACCESS_TOKEN: "test-only" });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Workspace sign-in needs server setup/);
});

const privateLead = { id: "11111111-1111-4111-8111-111111111111", name: "Demo Tester", phone: "447700900123", consented: true };
const privateCampaign = { id: "22222222-2222-4222-8222-222222222222", title: "One person only", lead_id: privateLead.id, status: "draft", lead: privateLead };
function privateStore() {
  let campaign = structuredClone(privateCampaign);
  const calls: string[] = [];
  return {
    calls,
    listLeads: async () => { calls.push("listLeads"); return [privateLead]; },
    createLead: async (lead: typeof privateLead) => { calls.push("createLead"); return { ...lead, id: privateLead.id }; },
    getLead: async (id: string) => { calls.push("getLead"); return id === privateLead.id ? privateLead : undefined; },
    listCampaigns: async () => [structuredClone(campaign)],
    createCampaign: async (value: { title: string; lead_id: string }) => { calls.push("createCampaign"); return { ...campaign, ...value }; },
    getCampaign: async (id: string) => id === campaign.id ? structuredClone(campaign) : undefined,
    claimCampaign: async () => {
      calls.push("claimCampaign");
      if (campaign.status !== "draft") return undefined;
      campaign = { ...campaign, status: "sending" };
      return structuredClone(campaign);
    },
    finishCampaign: async (_id: string, status: string) => { calls.push(`finish:${status}`); campaign = { ...campaign, status }; return structuredClone(campaign); },
  };
}

test("private lead and campaign data cannot be read or changed without the private key", async () => {
  const store = privateStore();
  const mock = { ...provider(), store };
  for (const action of ["list_leads", "create_lead", "list_campaigns", "create_campaign", "send_campaign"]) {
    assert.equal((await handleMetaWhatsAppRequest(request({ action }, "wrong"), env, mock)).status, 401);
  }
  assert.equal(store.calls.length, 0);
  assert.equal(mock.calls.length, 0);
});

test("private lead creation requires explicit consent and refuses the public fictional contacts", async () => {
  const store = privateStore();
  const mock = { ...provider(), store };
  assert.equal((await handleMetaWhatsAppRequest(request({ action: "create_lead", name: "Demo", phone: privateLead.phone, consented: false }), env, mock)).status, 400);
  assert.equal((await handleMetaWhatsAppRequest(request({ action: "create_lead", name: "Demo", phone: "12025550102", consented: true }), env, mock)).status, 400);
  assert.equal(store.calls.length, 0);
  const response = await handleMetaWhatsAppRequest(request({ action: "create_lead", name: privateLead.name, phone: `+${privateLead.phone}`, consented: true }), env, mock);
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).data, privateLead);
  assert.equal(mock.calls.length, 0);
});

test("campaign creation selects one stored private lead and never accepts a bulk audience", async () => {
  const store = privateStore();
  const mock = { ...provider(), store };
  assert.equal((await handleMetaWhatsAppRequest(request({ action: "create_campaign", title: "Bulk", leadId: [privateLead.id] }), env, mock)).status, 400);
  assert.equal((await handleMetaWhatsAppRequest(request({ action: "create_campaign", title: "Demo public lead", leadId: 10 }), env, mock)).status, 400);
  const response = await handleMetaWhatsAppRequest(request({ action: "create_campaign", title: "One person only", leadId: privateLead.id }), env, mock);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.lead_id, privateLead.id);
  assert.equal(mock.calls.length, 0);
});

test("concurrent campaign sends make exactly one Meta send and ignore client recipient overrides", async () => {
  const store = privateStore();
  const mock = { ...provider(), store };
  const data = { action: "send_campaign", campaignId: privateCampaign.id, confirmed: true, recipient: "12025550102", template: "wrong-template" };
  const responses = await Promise.all([handleMetaWhatsAppRequest(request(data), env, mock), handleMetaWhatsAppRequest(request(data), env, mock)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const sends = mock.calls.filter(call => call.url.endsWith("/messages"));
  assert.equal(sends.length, 1);
  const payload = JSON.parse(String(sends[0].options.body));
  assert.equal(payload.to, privateLead.phone);
  assert.equal(payload.template.components[1].parameters[0].text, "Demo");
  assert.equal((await store.listCampaigns())[0].status, "accepted");
});

test("an uncertain campaign send is locked against retries and does not claim delivery", async () => {
  const store = privateStore();
  const mock = { ...provider({ sendError: true }), store };
  const data = { action: "send_campaign", campaignId: privateCampaign.id, confirmed: true };
  assert.equal((await handleMetaWhatsAppRequest(request(data), env, mock)).status, 502);
  assert.equal((await store.listCampaigns())[0].status, "unknown");
  assert.equal((await handleMetaWhatsAppRequest(request(data), env, mock)).status, 409);
  assert.equal(mock.calls.filter(call => call.url.endsWith("/messages")).length, 1);
});

test("campaign sends check recipient consent, connection and the manual-send switch before claiming", async () => {
  const store = privateStore();
  const mock = { ...provider({ sender: { ...phone, status: "PENDING" } }), store };
  const data = { action: "send_campaign", campaignId: privateCampaign.id, confirmed: true };
  assert.equal((await handleMetaWhatsAppRequest(request({ ...data, confirmed: false }), env, mock)).status, 400);
  assert.equal((await handleMetaWhatsAppRequest(request(data), { ...env, META_TEST_SEND_ENABLED: "false" }, mock)).status, 403);
  assert.equal((await handleMetaWhatsAppRequest(request(data), env, mock)).status, 409);
  assert.ok(!store.calls.includes("claimCampaign"));
  assert.ok(mock.calls.every(call => !call.options.method));
});
