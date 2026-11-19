import { createHash } from "node:crypto";
import { createWorkspaceDb, requireWorkspaceAccess } from "./workspace-session.js";
import { sendMetaText } from "./meta-whatsapp.js";

const hash = value => createHash("sha256").update(value).digest("hex");
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function handleMetaInboxReply(request, env, replyId, { db = createWorkspaceDb(env), authorize = requireWorkspaceAccess, send = sendMetaText, now = Date.now } = {}) {
  try {
    await authorize(request, env);
    if (!Number.isSafeInteger(replyId) || replyId < 1) throw failure("Conversation not found.", 404);
    if (String(env.META_TEST_SEND_ENABLED).toLowerCase() !== "true" || String(env.META_INBOX_SEND_ENABLED).toLowerCase() !== "true") throw failure("WhatsApp inbox sending is not enabled.", 503);
    const raw = await request.text();
    if (raw.length > 20000) throw failure("Write a message of up to 4,096 characters.", 413);
    let input;
    try { input = JSON.parse(raw); } catch { throw failure("Enter a valid message."); }
    const body = typeof input?.message === "string" ? input.message.trim() : "";
    if (!body || body.length > 4096 || input.image) throw failure("Write a text message of up to 4,096 characters.");
    if (!/^[A-Za-z0-9_-]{8,180}$/.test(String(input.idempotencyKey || ""))) throw failure("Refresh this conversation before sending.");
    const anchor = (await db(`whatsapp_messages?id=eq.${Number(replyId)}&select=*&limit=1`))[0];
    if (!anchor || anchor.raw_metadata?.provider !== "meta") throw failure("This conversation is not linked to the connected WhatsApp number.", 404);
    const phone = String(anchor.direction === "inbound" ? anchor.sender_phone : anchor.recipient_phone).replace(/\D/g, "");
    if (!/^[1-9]\d{7,14}$/.test(phone) || phone === "6580254289") throw failure("Choose the contact's personal WhatsApp number.");
    const incoming = await db(`whatsapp_messages?direction=eq.inbound&raw_metadata->>provider=eq.meta&sender_phone=eq.${phone}&select=external_message_id,occurred_at,category&order=occurred_at.desc&limit=1`);
    const latest = incoming[0];
    const age = now() - Date.parse(latest?.occurred_at);
    if (!latest || !Number.isFinite(age) || age < -60_000 || age >= 24 * 60 * 60 * 1000) throw failure("Ask this contact to send a WhatsApp message to the business number first. Normal replies are available for 24 hours after their latest message.", 409);
    if (latest.category === "Unsubscribe") throw failure("This contact has unsubscribed. Do not send further outreach.", 409);
    if (anchor.lead_id) {
      const lead = (await db(`leads?id=eq.${anchor.lead_id}&select=subscribed,struck&limit=1`))[0];
      if (!lead || !lead.subscribed || lead.struck) throw failure("This contact is unsubscribed or unavailable for outreach.", 409);
    }
    const requestKey = hash(`${replyId}:${input.idempotencyKey}`);
    const fingerprint = hash(`${phone}\0${body}`);
    const path = `meta_inbox_sends?request_key=eq.${requestKey}`;
    const claim = await db("meta_inbox_sends?on_conflict=request_key", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ request_key: requestKey, fingerprint, status: "sending" }) });
    if (!claim.length) {
      const existing = (await db(`${path}&select=*&limit=1`))[0];
      if (existing?.fingerprint !== fingerprint) throw failure("This request was already used for another message.", 409);
      if (existing.status === "accepted" && existing.meta_message_id) return json({ sent: true, accepted: true, messageId: existing.meta_message_id, trackingSaved: existing.history_saved });
      throw failure("This message has already been attempted. Check WhatsApp and the inbox before sending another message.", 409);
    }
    let result;
    try { result = await send(env, phone, body); }
    catch (error) {
      await db(path, { method: "PATCH", body: JSON.stringify({ status: error.deliveryUnknown ? "unknown" : "failed" }) }).catch(() => {});
      throw error;
    }
    let trackingSaved = true;
    await db("whatsapp_messages?on_conflict=external_message_id", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({
      direction: "outbound", external_message_id: result.messageId, lead_id: anchor.lead_id, campaign_id: anchor.campaign_id,
      sender_phone: "6580254289", recipient_phone: phone, sender_name: "Hi-Hunt", body, occurred_at: new Date(now()).toISOString(),
      raw_metadata: { provider: "meta", kind: "inbox_reply", status: "accepted", request_key: requestKey, context_message_id: latest.external_message_id },
    }) }).catch(() => { trackingSaved = false; });
    await db(path, { method: "PATCH", body: JSON.stringify({ status: "accepted", meta_message_id: result.messageId, history_saved: trackingSaved }) }).catch(() => { trackingSaved = false; });
    return json({ sent: true, accepted: true, messageId: result.messageId, trackingSaved });
  } catch (error) { return json({ error: error.status ? error.message : "This message could not be sent. Refresh the conversation and try again." }, error.status || 500); }
}
