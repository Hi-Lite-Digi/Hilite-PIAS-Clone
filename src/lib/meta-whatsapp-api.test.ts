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

function provider({ sender = phone, approvedTemplate = template, sendError = false } = {}) {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, options = {}) => {
    const url = String(input);
    calls.push({ url, options });
    if (url.includes("/phone_numbers?")) return reply({ data: [sender] });
    if (url.includes("/message_templates?")) return reply({ data: [approvedTemplate] });
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
  assert.equal(mock.calls.length, 2);
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
  assert.match((await response.json()).error, /private WhatsApp test connection/);
});
