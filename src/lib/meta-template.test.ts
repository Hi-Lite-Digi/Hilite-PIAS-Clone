import assert from "node:assert/strict";
import test from "node:test";
import { buildTestMessage, runMetaTemplateTest } from "../../scripts/test-meta-template.mjs";

const env = {
  META_ACCESS_TOKEN: "test-only", META_WABA_ID: "1656774412758599", META_PHONE_NUMBER_ID: "1442204225635652",
  META_NEW_SENDER_NUMBER: "+12025550101", META_TEST_RECIPIENT: "+12025550102", META_TEST_ALLOWED_RECIPIENT: "+12025550102",
  META_HEADER_IMAGE_URL: "https://demo.example/cpf-webinar.png",
};
const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

test("previewing the Meta template never contacts a service", async () => {
  const result = await runMetaTemplateTest(env, { fetcher: async () => { throw new Error("Unexpected network request"); } });
  assert.equal(result.mode, "preview");
  assert.equal(result.recipient, "ending 0102");
});

test("the image template requires a valid poster before any request", async () => {
  const fetcher: typeof fetch = async () => { throw new Error("Unexpected network request"); };
  await assert.rejects(runMetaTemplateTest({ ...env, META_HEADER_IMAGE_URL: "" }, { send: true, fetcher }), /exactly one META_HEADER_IMAGE/);
  await assert.rejects(runMetaTemplateTest({ ...env, META_HEADER_IMAGE_ID: "123" }, { send: true, fetcher }), /exactly one META_HEADER_IMAGE/);
  await assert.rejects(runMetaTemplateTest({ ...env, META_HEADER_IMAGE_URL: "file:///poster.png" }, { send: true, fetcher }), /public HTTPS URL/);
  const message = buildTestMessage(env.META_TEST_RECIPIENT, "Pyie", { id: "123456" });
  assert.deepEqual(message.template.components[0], { type: "header", parameters: [{ type: "image", image: { id: "123456" } }] });
});

test("another account or an unapproved recipient is rejected without any network request", async () => {
  const fetcher: typeof fetch = async () => { throw new Error("Unexpected network request"); };
  await assert.rejects(runMetaTemplateTest({ ...env, META_WABA_ID: "999" }, { send: true, fetcher }), /confirmed new PIAS_Demo/);
  await assert.rejects(runMetaTemplateTest({ ...env, META_PHONE_NUMBER_ID: "999" }, { send: true, fetcher }), /confirmed new PIAS_Demo/);
  await assert.rejects(runMetaTemplateTest({ ...env, META_TEST_RECIPIENT: "+12025550103" }, { send: true, fetcher }), /explicitly allowed/);
  await assert.rejects(runMetaTemplateTest({ ...env, META_TEST_RECIPIENT: env.META_NEW_SENDER_NUMBER, META_TEST_ALLOWED_RECIPIENT: env.META_NEW_SENDER_NUMBER }, { send: true, fetcher }), /different from the new bot/);
});

test("the test sender refuses an old number or unapproved template before sending", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const oldSender: typeof fetch = async (input, options = {}) => {
    const url = String(input);
    requests.push({ url, method: options.method || "GET" });
    return reply({ data: [{ id: env.META_PHONE_NUMBER_ID, display_phone_number: "+12025550199" }] });
  };
  await assert.rejects(runMetaTemplateTest(env, { send: true, fetcher: oldSender }), /does not match the new sender/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");

  const pending: typeof fetch = async (input, options = {}) => {
    const url = String(input);
    requests.push({ url, method: options.method || "GET" });
    return reply({ data: url.includes("phone_numbers") ? [{ id: env.META_PHONE_NUMBER_ID, display_phone_number: env.META_NEW_SENDER_NUMBER }] : [{ name: "pias_clone_cpf_webinar_image", language: "en_US", status: "PENDING" }] });
  };
  await assert.rejects(runMetaTemplateTest(env, { send: true, fetcher: pending }), /not approved yet/);
  assert.ok(requests.every(request => request.method === "GET"));
});

test("a verified and approved setup sends exactly one message to the allowed recipient", async () => {
  const sends: unknown[] = [];
  const fetcher: typeof fetch = async (input, options = {}) => {
    const url = String(input);
    if (options.method === "POST") {
      sends.push(JSON.parse(String(options.body)));
      return reply({ messages: [{ id: "wamid.test-only" }] });
    }
    return reply({ data: url.includes("phone_numbers") ? [{ id: env.META_PHONE_NUMBER_ID, display_phone_number: env.META_NEW_SENDER_NUMBER }] : [{ name: "pias_clone_cpf_webinar_image", language: "en_US", status: "APPROVED" }] });
  };
  const result = await runMetaTemplateTest(env, { send: true, fetcher });
  assert.equal(sends.length, 1);
  assert.equal((sends[0] as { to: string }).to, "12025550102");
  const sentTemplate = (sends[0] as { template: { name: string; components: unknown[] } }).template;
  assert.equal(sentTemplate.name, "pias_clone_cpf_webinar_image");
  assert.deepEqual(sentTemplate.components[0], { type: "header", parameters: [{ type: "image", image: { link: env.META_HEADER_IMAGE_URL } }] });
  assert.ok("accepted" in result);
  assert.equal(result.accepted, true);
  assert.equal(result.deliveryConfirmed, false);
});
