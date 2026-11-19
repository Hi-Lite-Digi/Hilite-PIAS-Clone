import assert from "node:assert/strict";
import test from "node:test";
import { handleMetaInboxReply } from "../../worker/meta-inbox.js";
import { sendMetaText } from "../../worker/meta-whatsapp.js";
import { handleApiRequest } from "../../worker/supabase-api.js";

const env = { META_TEST_SEND_ENABLED: "true", META_INBOX_SEND_ENABLED: "true" };
const currentTime = Date.parse("2026-11-19T14:00:00Z");
const request = (input: any = {}) => new Request("https://unit.example/api/replies/75/send", { method: "POST", body: JSON.stringify({ message: "Unit reply only", idempotencyKey: "unit-key-1234", ...input }) });
function mock({ expired = false, unsubscribed = false, unknown = false, historyFailure = false } = {}) {
  const outbox = new Map<string, any>(); const history: any[] = []; const sends: any[] = [];
  const db = async (path: string, options: any = {}) => {
    if (path.startsWith("meta_inbox_sends")) {
      if (options.method === "POST") { const row = JSON.parse(options.body); if (outbox.has(row.request_key)) return []; outbox.set(row.request_key, row); return [row]; }
      const key = /request_key=eq\.([^&]+)/.exec(path)![1];
      if (options.method === "PATCH") outbox.set(key, { ...outbox.get(key), ...JSON.parse(options.body) });
      return outbox.has(key) ? [outbox.get(key)] : [];
    }
    if (path.startsWith("leads?")) return [{ subscribed: !unsubscribed, struck: false }];
    if (path.includes("direction=eq.inbound")) return [{ external_message_id: "wamid.unit-inbound", occurred_at: new Date(currentTime - (expired ? 25 : 1) * 60 * 60 * 1000).toISOString(), category: "Follow-up" }];
    if (options.method === "POST") { if (historyFailure) throw new Error("offline"); history.push(JSON.parse(options.body)); return []; }
    return [{ id: 75, direction: "outbound", lead_id: 8, campaign_id: "unit-campaign", recipient_phone: "447700900123", raw_metadata: { provider: "meta" } }];
  };
  const send = async (_env: any, phone: string, body: string) => { sends.push({ phone, body }); if (unknown) throw Object.assign(new Error("Unconfirmed"), { status: 502, deliveryUnknown: true }); return { messageId: "wamid.unit-reply" }; };
  return { db, send, authorize: async () => {}, now: () => currentTime, outbox, sends, history };
}

test("manual inbox replies send only the saved contact to the pinned Meta number and persist accepted history", async () => {
  const state = mock();
  const response = await handleMetaInboxReply(request({ phone: "wrong-number", recipient: "another-number" }), env, 75, state);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true, accepted: true, messageId: "wamid.unit-reply", trackingSaved: true });
  assert.deepEqual(state.sends, [{ phone: "447700900123", body: "Unit reply only" }]);
  assert.equal(state.history[0].raw_metadata.kind, "inbox_reply");
  assert.equal(state.history[0].raw_metadata.status, "accepted");
});

test("expired reply windows and unsubscribed contacts are rejected before claiming or sending", async () => {
  for (const setting of [{ expired: true }, { unsubscribed: true }]) {
    const state = mock(setting);
    assert.equal((await handleMetaInboxReply(request(), env, 75, state)).status, 409);
    assert.equal(state.sends.length, 0); assert.equal(state.outbox.size, 0);
  }
});

test("concurrent attempts and retries cannot send the same inbox request twice", async () => {
  const state = mock();
  const results = await Promise.all([handleMetaInboxReply(request(), env, 75, state), handleMetaInboxReply(request(), env, 75, state)]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  assert.equal((await handleMetaInboxReply(request(), env, 75, state)).status, 200);
  assert.equal(state.sends.length, 1);
  assert.equal((await handleMetaInboxReply(request({ message: "Changed content" }), env, 75, state)).status, 409);
  assert.equal(state.sends.length, 1);
});

test("unknown outcomes are not resent and accepted messages remain accepted if tracking storage fails", async () => {
  const uncertain = mock({ unknown: true });
  assert.equal((await handleMetaInboxReply(request(), env, 75, uncertain)).status, 502);
  assert.equal((await handleMetaInboxReply(request(), env, 75, uncertain)).status, 409);
  assert.equal(uncertain.sends.length, 1);
  const failedHistory = mock({ historyFailure: true });
  const result = await (await handleMetaInboxReply(request(), env, 75, failedHistory)).json();
  assert.equal(result.accepted, true); assert.equal(result.trackingSaved, false);
  await handleMetaInboxReply(request(), env, 75, failedHistory);
  assert.equal(failedHistory.sends.length, 1);
});

test("inbox sends require authentication, explicit enablement, text limits and a valid request key", async () => {
  const denied = mock(); denied.authorize = async () => { throw Object.assign(new Error("Sign in"), { status: 401 }); };
  assert.equal((await handleMetaInboxReply(request(), env, 75, denied)).status, 401);
  const state = mock();
  assert.equal((await handleMetaInboxReply(request(), {}, 75, state)).status, 503);
  for (const input of [{ message: "" }, { message: "x".repeat(4097) }, { idempotencyKey: "bad" }, { image: { path: "somewhere" } }]) assert.equal((await handleMetaInboxReply(request(input), env, 75, state)).status, 400);
  assert.equal(state.sends.length, 0);
  const response = await handleApiRequest(request(), { ...env, DEMO_MODE: "true", META_TEST_OPERATOR_TOKEN: "unit-private-operator-key-at-least-32-characters" });
  assert.equal(response.status, 401);
});

test("Meta text payloads use only the configured new sender and report acceptance rather than delivery", async () => {
  const payloads: any[] = [];
  const setup = { META_ACCESS_TOKEN: "unit-token-only" };
  const fetcher = (async (url: any, options: any) => { assert.match(String(url), /1442204225635652\/messages$/); payloads.push(JSON.parse(options.body)); return Response.json({ messages: [{ id: "wamid.unit-reply" }] }); }) as typeof fetch;
  assert.deepEqual(await sendMetaText(setup, "447700900123", "Unit reply", fetcher), { messageId: "wamid.unit-reply" });
  assert.equal(payloads[0].type, "text"); assert.equal(payloads[0].to, "447700900123");
  await assert.rejects(sendMetaText({ ...setup, META_PHONE_NUMBER_ID: "old-number" }, "447700900123", "Unit reply", fetcher), { status: 503 });
  assert.equal(payloads.length, 1);
});
