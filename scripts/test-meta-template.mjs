import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const template = JSON.parse(readFileSync(new URL("../config/pias-clone-demo-template.json", import.meta.url), "utf8"));
// Confirmed in WhatsApp Manager for the new PIAS_Demo number, never the older accounts.
const dedicatedBot = { wabaId: "1656774412758599", phoneNumberId: "1442204225635652" };
const digits = value => String(value || "").replace(/[+\s()-]/g, "");

/** @param {{ id?: string, link?: string }} [headerImage] */
export function buildTestMessage(recipient, firstName = "Demo", headerImage = undefined) {
  const to = digits(recipient);
  if (!/^[1-9]\d{7,14}$/.test(to)) throw new Error("Set a valid, separate test-recipient number with its country code.");
  const components = [{ type: "body", parameters: [{ type: "text", text: String(firstName || "Demo").trim().slice(0, 80) }] }];
  if (template.components.some(component => component.type === "HEADER" && component.format === "IMAGE")) {
    const id = String(headerImage?.id || "").trim();
    const link = String(headerImage?.link || "").trim();
    if ((!id && !link) || (id && link)) throw new Error("Set exactly one META_HEADER_IMAGE_ID or META_HEADER_IMAGE_URL for the poster.");
    let image;
    if (id) {
      if (!/^\d+$/.test(id)) throw new Error("Use a valid Meta media ID for the poster.");
      image = { id };
    } else {
      let url;
      try { url = new URL(link); } catch { throw new Error("Use a public HTTPS URL for the poster."); }
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use a public HTTPS URL for the poster.");
      image = { link: url.href };
    }
    components.unshift({ type: "header", parameters: [{ type: "image", image }] });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components,
    },
  };
}

export async function runMetaTemplateTest(env, { send = false, check = false, fetcher = fetch } = {}) {
  const message = buildTestMessage(env.META_TEST_RECIPIENT, env.META_TEST_FIRST_NAME, { id: env.META_HEADER_IMAGE_ID, link: env.META_HEADER_IMAGE_URL });
  const summary = { mode: send ? "send-one-test" : check ? "check-setup" : "preview", template: template.name, language: template.language, recipient: `ending ${message.to.slice(-4)}` };
  if (!send && !check) return summary;

  for (const name of ["META_ACCESS_TOKEN", "META_WABA_ID", "META_PHONE_NUMBER_ID", "META_NEW_SENDER_NUMBER", "META_TEST_ALLOWED_RECIPIENT"]) {
    if (!String(env[name] || "").trim()) throw new Error(`Set ${name} in private server configuration before testing.`);
  }
  if (env.META_WABA_ID !== dedicatedBot.wabaId || env.META_PHONE_NUMBER_ID !== dedicatedBot.phoneNumberId) {
    throw new Error("Use only the confirmed new PIAS_Demo account and phone-number IDs. No message was sent.");
  }
  if (message.to !== digits(env.META_TEST_ALLOWED_RECIPIENT)) throw new Error("The recipient must match the one explicitly allowed for this test.");
  if (message.to === digits(env.META_NEW_SENDER_NUMBER)) throw new Error("The test recipient must be different from the new bot's sender number.");
  if (!/^\d+$/.test(env.META_WABA_ID) || !/^\d+$/.test(env.META_PHONE_NUMBER_ID)) throw new Error("The WhatsApp account and phone-number IDs must be numeric.");
  const version = env.META_GRAPH_API_VERSION || "v25.0";
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("Use a valid Meta Graph API version.");
  const graph = async (path, options = {}) => {
    const response = await fetcher(`https://graph.facebook.com/${version}/${path}`, {
      ...options,
      headers: { authorization: `Bearer ${env.META_ACCESS_TOKEN}`, "content-type": "application/json" },
    });
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(`Meta request failed (HTTP ${response.status}, code ${body.error?.code || "unknown"}).`);
    return body;
  };

  // Verify the selected ID belongs to the NEW registered number before any send.
  // Existing business numbers are never edited, registered, or used as senders.
  const phones = await graph(`${env.META_WABA_ID}/phone_numbers?fields=id,display_phone_number&limit=100`);
  const sender = (phones.data || []).find(phone => String(phone.id) === env.META_PHONE_NUMBER_ID);
  if (!sender || digits(sender.display_phone_number) !== digits(env.META_NEW_SENDER_NUMBER)) {
    throw new Error("The selected phone-number ID does not match the new sender. No message was sent.");
  }
  const templates = await graph(`${env.META_WABA_ID}/message_templates?name=${encodeURIComponent(template.name)}&fields=name,status,language&limit=100`);
  const approved = (templates.data || []).some(item => item.name === template.name && item.language === template.language && item.status === "APPROVED");
  if (!approved) throw new Error("The exact English demo template is not approved yet. No message was sent.");
  if (!send) return { ...summary, senderVerified: true, templateApproved: true, sent: false };

  // One request only. Do not retry automatically, since that may duplicate delivery.
  const result = await graph(`${env.META_PHONE_NUMBER_ID}/messages`, { method: "POST", body: JSON.stringify(message) });
  const messageId = result.messages?.[0]?.id;
  if (!messageId) throw new Error("Meta did not return a message ID; check Meta's status before retrying.");
  return { ...summary, accepted: true, messageId, deliveryConfirmed: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    try { process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url))); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const flags = process.argv.slice(2);
    if (flags.some(flag => !["--send", "--check"].includes(flag))) throw new Error("Use no flag to preview, --check to verify, or --send for one authorized test message.");
    console.log(JSON.stringify(await runMetaTemplateTest(process.env, { send: flags.includes("--send"), check: flags.includes("--check") }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
