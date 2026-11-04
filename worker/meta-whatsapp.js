import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { buildTestMessage } from "../scripts/test-meta-template.mjs";

const definition = JSON.parse(readFileSync(new URL("../config/pias-clone-demo-template.json", import.meta.url), "utf8"));
const WABA_ID = "1656774412758599";
const PHONE_ID = "1442204225635652";
const digits = value => String(value || "").replace(/[+\s()-]/g, "");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const failure = (message, status = 400) => Object.assign(new Error(message), { status });

function authorise(request, env) {
  const expected = String(env.META_TEST_OPERATOR_TOKEN || "");
  if (expected.length < 32) throw failure("The private WhatsApp test connection needs server setup.", 503);
  const supplied = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw failure("Enter the operator key to use the WhatsApp test connection.", 401);
  if (!env.META_ACCESS_TOKEN) throw failure("The new bot's Meta access token is not configured.", 503);
  if ((env.META_WABA_ID && env.META_WABA_ID !== WABA_ID) || (env.META_PHONE_NUMBER_ID && env.META_PHONE_NUMBER_ID !== PHONE_ID)) {
    throw failure("This connection accepts only the new PIAS_Demo account and number.", 503);
  }
}

async function graph(env, path, options = {}, fetcher = fetch) {
  const version = env.META_GRAPH_API_VERSION || "v25.0";
  if (!/^v\d+\.\d+$/.test(version)) throw failure("The Meta API version is invalid.", 503);
  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${env.META_ACCESS_TOKEN}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  let response;
  try {
    response = await fetcher(`https://graph.facebook.com/${version}/${path}`, { ...options, headers, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw failure(options.method === "POST" && path.endsWith("/messages")
      ? "Delivery was not confirmed. Check the recipient's WhatsApp before trying again."
      : "Meta could not be reached. Please check the connection again.", 502);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const code = Number(body.error?.code) || 0;
    const detail = code === 190 ? "The Meta access token has expired or is invalid."
      : code === 131042 ? "Meta requires an eligible payment method for this WhatsApp account."
        : code === 133010 ? "The new phone number still needs Cloud API registration."
          : `Meta rejected the request (code ${code || response.status}).`;
    throw failure(detail, 502);
  }
  return body;
}

export async function getMetaTestStatus(env, fetcher = fetch) {
  const phones = await graph(env, `${WABA_ID}/phone_numbers?fields=id,display_phone_number,status,verified_name&limit=100`, {}, fetcher);
  const phone = (phones.data || []).find(item => String(item.id) === PHONE_ID);
  if (!phone || !digits(phone.display_phone_number).endsWith("4289")) throw failure("Meta did not confirm the new number ending 4289. Sending stays locked.", 409);
  const templates = await graph(env, `${WABA_ID}/message_templates?name=${encodeURIComponent(definition.name)}&fields=name,status,language,components&limit=100`, {}, fetcher);
  const template = (templates.data || []).find(item => item.name === definition.name && item.language === definition.language);
  const posterTemplate = template?.components?.some(component => component.type === "HEADER" && component.format === "IMAGE");
  const connected = phone.status === "CONNECTED";
  const approved = template?.status === "APPROVED" && posterTemplate === true;
  const enabled = String(env.META_TEST_SEND_ENABLED).toLowerCase() === "true";
  return {
    ready: connected && approved && enabled,
    sender: "Number ending 4289",
    senderStatus: phone.status || "UNKNOWN",
    template: definition.name,
    templateStatus: template?.status || "NOT_FOUND",
    requirements: [
      ...(!connected ? ["Complete registration of the new number in Meta."] : []),
      ...(!approved ? ["Meta must approve the image template."] : []),
      ...(!enabled ? ["Enable manual test sending on the server."] : []),
    ],
    // Used only within this server module, stripped from every HTTP response.
    senderNumber: digits(phone.display_phone_number),
  };
}

export async function handleMetaWhatsAppRequest(request, env, { fetcher = fetch, loadPoster = () => readFile(new URL("../assets/demo/cpf-webinar-poster.png", import.meta.url)) } = {}) {
  try {
    if (request.method !== "POST") return json({ error: "Use POST for the private WhatsApp test connection." }, 405);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "This request must come from Hilite." }, 403);
    authorise(request, env);
    const raw = await request.text();
    if (raw.length > 2048) throw failure("The test request is too large.", 413);
    let input;
    try { input = JSON.parse(raw); } catch { throw failure("Enter valid test details."); }
    if (!input || !["status", "send"].includes(input.action)) throw failure("Choose a connection check or a single test send.");
    let recipient;
    let firstName;
    if (input.action === "send") {
      if (input.confirmed !== true) throw failure("Confirm the recipient agreed to receive this test message.");
      recipient = digits(input.recipient);
      if (recipient.length === 8) recipient = `65${recipient}`;
      if (!/^[1-9]\d{7,14}$/.test(recipient)) throw failure("Enter a WhatsApp number with its country code.");
      if (/^120255501\d{2}$/.test(recipient)) throw failure("Choose a real test recipient instead of a fictional demo contact.");
      firstName = String(input.firstName || "").trim();
      if (!firstName || firstName.length > 80 || /[\r\n\t]/.test(firstName)) throw failure("Enter a first name of up to 80 characters.");
      if (String(env.META_TEST_SEND_ENABLED).toLowerCase() !== "true") throw failure("Manual test sending is not enabled yet.", 403);
    }
    const status = await getMetaTestStatus(env, fetcher);
    const { senderNumber, ...publicStatus } = status;
    if (input.action === "status") return json(publicStatus);
    if (!status.ready) return json({ error: status.requirements.join(" "), ...publicStatus }, 409);
    if (recipient === senderNumber) throw failure("Use a different WhatsApp number as the test recipient.");

    // Upload only this supplied poster, only after verifying the dedicated sender
    // and approved template. Never accept a caller-selected URL, sender or file.
    const media = new FormData();
    media.set("messaging_product", "whatsapp");
    media.set("type", "image/png");
    media.set("file", new Blob([await loadPoster()], { type: "image/png" }), "cpf-webinar-poster.png");
    const uploaded = await graph(env, `${PHONE_ID}/media`, { method: "POST", body: media }, fetcher);
    if (!/^\d+$/.test(String(uploaded.id || ""))) throw failure("Meta did not accept the poster upload. No message was sent.", 502);
    const message = buildTestMessage(recipient, firstName, { id: String(uploaded.id) });
    // One send request. Network failures are never automatically retried.
    const result = await graph(env, `${PHONE_ID}/messages`, { method: "POST", body: JSON.stringify(message) }, fetcher);
    if (!result.messages?.[0]?.id) throw failure("Delivery was not confirmed. Check WhatsApp before trying again.", 502);
    return json({ accepted: true, messageId: result.messages[0].id, recipient: `Number ending ${recipient.slice(-4)}`, deliveryConfirmed: false });
  } catch (error) {
    return json({ error: error?.status ? error.message : "The WhatsApp test could not be completed." }, Number(error?.status) || 500);
  }
}
