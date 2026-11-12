import assert from "node:assert/strict";
import test from "node:test";
import { handleTemplateCampaignRequest } from "../../worker/template-campaigns.js";

const key = "test-only-workspace-key-at-least-32-characters";
const env = { META_TEST_OPERATOR_TOKEN: key, META_ACCESS_TOKEN: "mock-meta-token", META_TEST_SEND_ENABLED: "true" };
const campaignId = "b34049ba-8f6d-409c-8be8-f441e814418c";
const deliveryId = "4f8ca086-694a-493b-b70b-26c04e0f6891";
const lead = { id: 80, name: "Test Person", phone: "+447700900123", email: null, subscribed: true, struck: false };
const templateName = "pias_clone_cpf_webinar_image";
const campaign = { id: campaignId, title: "CPF invitation", status: "draft", audience: { template: templateName, includedLeadIds: [lead.id] } };
function request(path: string, input: unknown, method = "POST", authorised = true) {
  return new Request(`https://hilite.example/api/campaigns${path}`, { method, headers: { origin: "https://hilite.example", ...(authorised ? { authorization: `Bearer ${key}` } : {}) }, ...(method === "GET" ? {} : { body: JSON.stringify(input) }) });
}
function mock({ sendError = false, fake = false } = {}) {
  let savedCampaign: any = structuredClone(campaign);
  let row: any = { id: deliveryId, campaign_id: campaignId, lead_id: lead.id, phone: "447700900123", status: "draft", lead: { ...lead, ...(fake ? { phone: "+12025550102" } : {}) } };
  const dbCalls: Array<{ path: string; options: any }> = [];
  const providerCalls: string[] = [];
  const sentBodies: any[] = [];
  const db = async (path: string, options: any = {}) => {
    dbCalls.push({ path, options });
    if (path.startsWith("leads?")) return [{ ...row.lead }];
    if (path.startsWith("campaigns")) {
      if (options.method === "POST") { savedCampaign = { id: campaignId, ...JSON.parse(options.body) }; return [savedCampaign]; }
      if (options.method === "PATCH") {
        if (path.includes("status=eq.draft") && savedCampaign.status !== "draft") return [];
        savedCampaign = { ...savedCampaign, ...JSON.parse(options.body) }; return [savedCampaign];
      }
      return [structuredClone(savedCampaign)];
    }
    if (path.startsWith("meta_campaign_deliveries")) {
      if (options.method === "PATCH") {
        const requiredStatus = /status=eq\.(\w+)/.exec(path)?.[1];
        if (requiredStatus && row.status !== requiredStatus) return [];
        row = { ...row, ...JSON.parse(options.body) }; return [structuredClone(row)];
      }
      return [structuredClone(row)];
    }
    if (path.startsWith("whatsapp_messages")) return [];
    throw new Error(`Unexpected database path ${path}`);
  };
  const fetcher: typeof fetch = async (input, options) => {
    const url = String(input); providerCalls.push(url);
    if (url.endsWith("/messages")) sentBodies.push(JSON.parse(String(options?.body)));
    const data = url.includes("phone_numbers?") ? { data: [{ id: "1442204225635652", display_phone_number: "+6599994289", status: "CONNECTED" }] }
      : url.includes("message_templates?") ? { data: [{ name: templateName, language: "en_US", status: "APPROVED", components: [{ type: "HEADER", format: "IMAGE" }] }] }
        : url.endsWith("?fields=health_status") ? { id: "1442204225635652", health_status: { can_send_message: "AVAILABLE", entities: [] } }
          : url.endsWith("/media") ? { id: "12345" } : { messages: [{ id: "wamid.mock-only" }] };
    if (sendError && url.endsWith("/messages")) throw new Error("network timeout");
    return new Response(JSON.stringify(data));
  };
  return { db, dbCalls, fetcher, providerCalls, sentBodies, loadPoster: async () => Buffer.from([137, 80, 78, 71]), setSending: () => { savedCampaign.status = "sending"; }, get row() { return row; } };
}

test("normal campaigns save the selected normal lead and pin all message content on the server", async () => {
  const state = mock();
  const response = await handleTemplateCampaignRequest(request("", { title: "My campaign", leadIds: [80], message: "Do not send this", template: "unapproved", phone: "old-number" }), env, state);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.data.audience.template, templateName);
  assert.deepEqual(result.data.audience.includedLeadIds, [80]);
  assert.ok(!result.data.message.includes("Do not send this"));
  assert.equal(result.data.poster_name, "cpf-webinar-poster.png");
  assert.equal(state.providerCalls.length, 0);
});

test("normal campaign data stays private and fictional sample recipients cannot be used for live sends", async () => {
  const state = mock();
  assert.equal((await handleTemplateCampaignRequest(request("", { title: "My campaign", leadIds: [80] }, "POST", false), env, state)).status, 401);
  assert.equal(state.dbCalls.length, 0);
  const fake = mock({ fake: true });
  assert.equal((await handleTemplateCampaignRequest(request("", { title: "My campaign", leadIds: [80] }), env, fake)).status, 400);
  assert.equal(fake.providerCalls.length, 0);
});

test("concurrent normal campaign recipient requests claim once and send only to the stored phone with the approved image", async () => {
  const state = mock(); state.setSending();
  const send = () => handleTemplateCampaignRequest(request(`/${campaignId}/send-template`, { confirmed: true, deliveryId, recipient: "old-number", template: "unapproved" }), env, state);
  const replies = await Promise.all([send(), send()]);
  assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
  assert.equal(state.providerCalls.filter(url => url.endsWith("/messages")).length, 1);
  assert.equal(state.row.status, "accepted");
  assert.equal(state.sentBodies[0].to, "447700900123");
  assert.equal(state.sentBodies[0].template.name, templateName);
  assert.equal(state.sentBodies[0].template.components[0].parameters[0].type, "image");
  assert.ok(state.dbCalls.some(call => call.path.startsWith("whatsapp_messages")));
});

test("normal campaign initialization requires explicit approval and creates delivery rows only after an atomic campaign claim", async () => {
  const state = mock();
  const unconfirmed = await handleTemplateCampaignRequest(request(`/${campaignId}/start-template`, {}), env, state);
  assert.equal(unconfirmed.status, 400);
  assert.ok(state.dbCalls.every(call => !call.options.method));
  const response = await handleTemplateCampaignRequest(request(`/${campaignId}/start-template`, { confirmed: true }), env, state);
  assert.equal(response.status, 200);
  const claimIndex = state.dbCalls.findIndex(call => call.path.includes("status=eq.draft") && call.options.method === "PATCH");
  const insertIndex = state.dbCalls.findIndex(call => call.path === "meta_campaign_deliveries" && call.options.method === "POST");
  assert.ok(claimIndex >= 0 && insertIndex > claimIndex);
  assert.equal(state.providerCalls.filter(url => url.endsWith("/messages")).length, 0);
});

test("normal campaign drafts cannot be edited after sending starts", async () => {
  const state = mock(); state.setSending();
  const response = await handleTemplateCampaignRequest(request(`/${campaignId}`, { title: "Changed", leadIds: [80] }, "PATCH"), env, state);
  assert.equal(response.status, 409);
  assert.equal(state.providerCalls.length, 0);
});

test("an uncertain normal campaign send is never retried or marked delivered", async () => {
  const state = mock({ sendError: true }); state.setSending();
  const send = () => handleTemplateCampaignRequest(request(`/${campaignId}/send-template`, { confirmed: true, deliveryId }), env, state);
  const response = await send();
  assert.equal(response.status, 502);
  assert.equal(state.row.status, "unknown");
  assert.equal((await send()).status, 409);
  assert.equal(state.providerCalls.filter(url => url.endsWith("/messages")).length, 1);
  assert.equal(state.dbCalls.filter(call => call.path.startsWith("whatsapp_messages")).length, 0);
});
