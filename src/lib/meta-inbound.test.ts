import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { parseMetaInbound, saveMetaInbound, correlateMetaReplies } from "../../worker/meta-inbound.js";
import { handleMetaDeliveryWebhook } from "../../worker/meta-delivery-webhook.js";
import { campaignMetrics } from "../../worker/outreach-activity.js";
import { handleApiRequest } from "../../worker/supabase-api.js";

const message = { id: "wamid.unit-inbound", from: "447700900123", timestamp: "1795096800", type: "button", button: { text: "Attending" }, context: { id: "wamid.unit-outbound" } };
const row = () => parseMetaInbound(message, [{ wa_id: message.from, profile: { name: "Unit Contact" } }])!;

test("Meta text and quick replies are parsed without fabricating attendance or message content", () => {
  assert.equal(row().raw_metadata.response, "attending");
  assert.equal(row().category, "Interested");
  assert.equal(parseMetaInbound({ ...message, type: "interactive", interactive: { button_reply: { title: "Maybe next time" } } })!.raw_metadata.response, "not_attending");
  assert.equal(parseMetaInbound({ ...message, type: "text", text: { body: "Unsubscribe" } })!.category, "Unsubscribe");
  assert.equal(parseMetaInbound({ ...message, type: "text", text: { body: "Could I bring a friend?" } })!.raw_metadata.response, null);
  assert.equal(parseMetaInbound({ ...message, from: "bad" }), null);
  assert.equal(parseMetaInbound({ ...message, id: "bad" }), null);
});

test("incoming replies correlate only to the exact outgoing message and same recipient", async () => {
  const writes: any[] = [];
  await saveMetaInbound({}, [row()], async (path: string, options: any = {}) => {
    if (path.startsWith("whatsapp_messages?") && !options.method) return [{ campaign_id: "campaign-one", lead_id: 8, recipient_phone: message.from }];
    writes.push({ path, ...options, body: JSON.parse(options.body) }); return [];
  });
  assert.equal(writes[0].body.campaign_id, "campaign-one");
  assert.equal(writes[0].body.lead_id, 8);
  assert.match(writes[0].headers.prefer, /ignore-duplicates/);
  const unmatched: any[] = [];
  await saveMetaInbound({}, [row()], async (path: string, options: any = {}) => {
    if (path.startsWith("whatsapp_messages?") && !options.method) return [{ campaign_id: "wrong-campaign", recipient_phone: "447700900999" }];
    if (path.startsWith("leads?")) return [{ id: 8 }];
    unmatched.push(JSON.parse(options.body)); return [];
  });
  assert.equal(unmatched[0].campaign_id, null);
  const late = correlateMetaReplies([row()], [{ campaign_id: "campaign-one", lead_id: 8, phone: message.from, meta_message_id: "wamid.unit-outbound" }]);
  assert.equal(late[0].campaign_id, "campaign-one");
});

test("signed incoming messages are saved privately and storage failures request callback retry without sending", async () => {
  const env = { META_APP_SECRET: "unit-secret", META_WEBHOOK_VERIFY_TOKEN: "unit-verify-token-at-least-32-characters" };
  const payload = { object: "whatsapp_business_account", entry: [{ id: "1656774412758599", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "1442204225635652" }, messages: [message] } }] }] };
  const raw = JSON.stringify(payload);
  const request = () => new Request("https://unit.example/api/meta-whatsapp-webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", env.META_APP_SECRET).update(raw).digest("hex")}` } });
  const logs: any[] = [];
  let saved = 0;
  const options = { logger: (event: any) => logs.push(event), recordInbound: async (rows: any[]) => { saved += rows.length; } };
  assert.equal((await handleMetaDeliveryWebhook(request(), env, options)).status, 200);
  assert.equal(saved, 1);
  assert.doesNotMatch(JSON.stringify(logs), /Attending|447700900123|wamid.unit-inbound/);
  assert.equal((await handleMetaDeliveryWebhook(request(), env, { ...options, recordInbound: async () => { throw new Error("offline"); } })).status, 503);
  const forged = request(); forged.headers.set("x-hub-signature-256", "sha256=" + "0".repeat(64));
  assert.equal((await handleMetaDeliveryWebhook(forged, env, options)).status, 403);
  assert.equal(saved, 1);
});

test("campaign counts use actual receipts and each recipient's latest response to the exact campaign", () => {
  const deliveries = [{ campaign_id: "one", lead_id: 8, phone: message.from, meta_message_id: "wamid.unit-outbound", status: "read" }, { campaign_id: "one", status: "failed" }];
  const attending = { ...row(), id: 1, campaign_id: "one", lead_id: 8 };
  const declined = { ...attending, id: 2, body: "Maybe next time", occurred_at: "2026-11-19T20:00:00Z", raw_metadata: { ...attending.raw_metadata, response: "not_attending" } };
  const followup = { ...declined, id: 3, body: "Could you send details?", occurred_at: "2026-11-19T21:00:00Z", raw_metadata: { ...declined.raw_metadata, response: null } };
  const metrics = campaignMetrics({ id: "one", audience_count: 3 }, deliveries, [attending, attending, declined, followup, { ...attending, campaign_id: "other", sender_phone: "447700900999" }]);
  assert.deepEqual(metrics, { total: 3, accepted: 1, notSent: 2, delivered: 1, read: 1, failed: 1, replies: 1, attending: 0, notAttending: 1, unsubscribed: 0 });
});

test("Meta unsubscribe suppresses pending recipients without triggering outgoing requests", async () => {
  const writes: any[] = [];
  const stop = parseMetaInbound({ ...message, button: { text: "Unsubscribe" } });
  await saveMetaInbound({}, [stop], async (path: string, options: any = {}) => {
    if (!options.method) return path.startsWith("leads?") ? [{ id: 8 }] : [];
    writes.push({ path, body: JSON.parse(options.body) }); return [];
  });
  assert(writes.some(write => write.path.startsWith("leads?") && write.body.subscribed === false));
  assert(writes.some(write => write.path.includes("status=eq.draft") && write.body.status === "suppressed"));
  assert(writes.every(write => /^(leads|whatsapp_messages|meta_campaign_deliveries)/.test(write.path)));
});

test("live inbox includes outgoing-only conversations with real delivery status and no invented inbound reply", async () => {
  const original = globalThis.fetch;
  const key = "unit-only-private-key-at-least-32-characters";
  globalThis.fetch = (async input => {
    const url = new URL(String(input));
    const rows = url.pathname.endsWith("whatsapp_messages") ? [{ id: 22, direction: "outbound", lead_id: 8, campaign_id: "one", external_message_id: "wamid.unit-outbound", sender_phone: "6580254289", recipient_phone: message.from, body: "Unit invitation", occurred_at: "2026-11-19T10:00:00Z", raw_metadata: { provider: "meta" } }]
      : url.pathname.endsWith("leads") ? [{ id: 8, name: "Unit Contact", phone: message.from }]
      : url.pathname.endsWith("campaigns") ? [{ id: "one", title: "Unit campaign" }]
      : url.pathname.endsWith("meta_delivery_events") ? [{ meta_message_id: "wamid.unit-outbound", status: "read", event_at: "2026-11-19T10:01:00Z" }] : [];
    return new Response(JSON.stringify(rows));
  }) as typeof fetch;
  try {
    const response = await handleApiRequest(new Request("https://unit.example/api/threads", { headers: { authorization: `Bearer ${key}` } }), { DEMO_MODE: "true", META_TEST_OPERATOR_TOKEN: key, SUPABASE_URL: "https://db.unit.example", SUPABASE_SECRET_KEY: "unit-only" });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].phone.replace(/\D/g, ""), message.from);
    assert.equal(result.data[0].read, true);
    assert.equal(result.data[0].hasReplies, false);
    assert.equal(result.data[0].thread.length, 1);
    assert.equal(result.data[0].thread[0].deliveryStatus, "read");
    assert.equal(result.data[0].thread[0].from, "us");
  } finally { globalThis.fetch = original; }
});
