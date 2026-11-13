import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";
import handler from "../../api/meta-whatsapp-webhook.js";
import { handleMetaDeliveryWebhook, metaDeliveryVercelHandler } from "../../worker/meta-delivery-webhook.js";

const env = { META_APP_SECRET: "mock-app-secret", META_WEBHOOK_VERIFY_TOKEN: "mock-verification-token-at-least-32-characters" };
const payload = { object: "whatsapp_business_account", entry: [{ id: "1656774412758599", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "1442204225635652" }, contacts: [{ profile: { name: "DO NOT LOG" } }], messages: [{ text: { body: "PRIVATE BODY" } }], statuses: [{ id: "wamid.mock-only", status: "failed", timestamp: "1794483500", recipient_id: "447700900123", errors: [{ code: 131049, error_data: { details: "Example +44 7700 900123 and demo@example.test" } }] }] } }] }] };
function request(raw = JSON.stringify(payload), secret = env.META_APP_SECRET) {
  return new Request("https://hilite.example/api/meta-whatsapp-webhook", { method: "POST", headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}` }, body: raw });
}

test("signed callbacks persist only new-account status observations and retry storage failures", async () => {
  let rows: unknown[] = [];
  const success = await handleMetaDeliveryWebhook(request(), env, { logger: () => {}, recordDelivery: async (events: unknown[]) => { rows = events; } });
  assert.equal(success.status, 200);
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE BODY|DO NOT LOG|447700900123|demo@example.test/);
  const retry = await handleMetaDeliveryWebhook(request(), env, { logger: () => {}, recordDelivery: async () => { throw new Error("db unavailable"); } });
  assert.equal(retry.status, 503);
  const foreign = JSON.stringify({ ...payload, entry: [{ ...payload.entry[0], id: "old-account" }] });
  let foreignWrites = 0;
  assert.equal((await handleMetaDeliveryWebhook(request(foreign), env, { logger: () => {}, recordDelivery: async () => { foreignWrites++; } })).status, 200);
  assert.equal(foreignWrites, 0);
});

test("Meta webhook entry point exists and verification requires a configured matching private token", async () => {
  assert.equal(handler, metaDeliveryVercelHandler);
  const verify = (token: string) => new Request(`https://hilite.example/api/meta-whatsapp-webhook?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=${token}`);
  assert.equal((await handleMetaDeliveryWebhook(verify(env.META_WEBHOOK_VERIFY_TOKEN), {})).status, 503);
  assert.equal((await handleMetaDeliveryWebhook(verify("wrong"), env)).status, 403);
  const valid = await handleMetaDeliveryWebhook(verify(env.META_WEBHOOK_VERIFY_TOKEN), env);
  assert.equal(valid.status, 200);
  assert.equal(await valid.text(), "12345");
});

test("callbacks verify the original signed bytes and reject forged or altered payloads before logging", async () => {
  const events: unknown[] = [];
  const options = { logger: (event: unknown) => events.push(event) };
  assert.equal((await handleMetaDeliveryWebhook(request(undefined, "wrong"), env, options)).status, 403);
  const modified = request();
  modified.headers.set("x-hub-signature-256", "sha256=bad");
  assert.equal((await handleMetaDeliveryWebhook(modified, env, options)).status, 403);
  assert.equal(events.length, 0);
  assert.equal((await handleMetaDeliveryWebhook(request(), env, options)).status, 200);
  const output = JSON.stringify(events);
  assert.match(output, /131049/);
  assert.ok(!/PRIVATE BODY|DO NOT LOG|447700900123|7700|demo@example/.test(output));
});

test("old accounts and other numbers never produce delivery records; callbacks never cause sends", async () => {
  for (const oldAsset of ["account", "phone"]) {
    const old = structuredClone(payload);
    if (oldAsset === "account") old.entry[0].id = "old-account";
    else old.entry[0].changes[0].value.metadata.phone_number_id = "old-phone";
    const events: any[] = [];
    assert.equal((await handleMetaDeliveryWebhook(request(JSON.stringify(old)), env, { logger: (event: any) => events.push(event) })).status, 200);
    assert.deepEqual(events, [{ event: "meta_whatsapp_webhook_verified", deliveryEvents: 0 }]);
  }
});

test("Vercel adapter preserves whitespace and Unicode in the raw HMAC-signed request stream", async () => {
  const raw = JSON.stringify(payload, null, 2).replace("PRIVATE BODY", "PRIVATE 👋 BODY");
  const req: any = Readable.from([Buffer.from(raw)]);
  req.method = "POST"; req.url = "/api/meta-whatsapp-webhook";
  req.headers = { host: "hilite.example", "x-hub-signature-256": request(raw).headers.get("x-hub-signature-256") };
  Object.defineProperty(req, "body", { get() { throw new Error("Must not read a parsed body"); } });
  let ended = "";
  const res: any = { setHeader() {}, end(value: Buffer) { ended = value.toString(); } };
  const events: any[] = [];
  await metaDeliveryVercelHandler(req, res, env, { logger: (event: any) => events.push(event) });
  assert.equal(res.statusCode, 200);
  assert.equal(ended, "OK");
  assert.equal(events[0].status, "failed");
});
