import { createWorkspaceDb } from "./workspace-session.js";

export function metaReplyResponse(text) {
  const value = String(text || "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (/^(unsubscribe|stop|opt out)$/.test(value)) return "unsubscribed";
  if (/^(maybe next time|not attending|not interested|no thanks)$/.test(value)) return "not_attending";
  if (/^(attending|yes,? attending|i('?m| am) attending)$/.test(value)) return "attending";
  return null;
}

export function correlateMetaReplies(messages, deliveries = []) {
  const parents = new Map(deliveries.filter(row => row.meta_message_id).map(row => [row.meta_message_id, { ...row, recipient_phone: row.phone }]));
  for (const row of messages) if (row.direction === "outbound" && row.raw_metadata?.provider === "meta") parents.set(row.external_message_id, row);
  return messages.map(row => {
    if (row.direction !== "inbound" || row.raw_metadata?.provider !== "meta") return row;
    const parent = parents.get(row.raw_metadata.context_message_id);
    if (!parent || String(parent.recipient_phone || "").replace(/\D/g, "") !== String(row.sender_phone || "").replace(/\D/g, "")) return row;
    return { ...row, lead_id: row.lead_id || parent.lead_id || null, campaign_id: row.campaign_id || parent.campaign_id || null };
  });
}

function inboundBody(message) {
  if (message.type === "text") return message.text?.body;
  if (message.type === "button") return message.button?.text || message.button?.payload;
  if (message.type === "interactive") return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title;
  if (message.type === "reaction") return message.reaction?.emoji ? `Reaction: ${message.reaction.emoji}` : "Reaction removed";
  if (["image", "video", "document", "audio", "sticker", "location", "contacts"].includes(message.type)) {
    return message[message.type]?.caption || `[${message.type[0].toUpperCase()}${message.type.slice(1)} received]`;
  }
  return null;
}

export function parseMetaInbound(message, contacts = []) {
  const phone = String(message?.from || "");
  const body = String(inboundBody(message || {}) || "").trim().slice(0, 12000);
  if (!/^wamid\.[A-Za-z0-9+/_=-]{1,500}$/.test(String(message?.id || "")) || !/^[1-9]\d{7,14}$/.test(phone) || !body || !/^\d{10,13}$/.test(String(message.timestamp || ""))) return null;
  const occurredAt = new Date(Number(message.timestamp) * (String(message.timestamp).length === 13 ? 1 : 1000));
  if (!Number.isFinite(occurredAt.getTime())) return null;
  const contact = contacts.find(item => String(item.wa_id) === phone);
  const response = metaReplyResponse(body);
  const context = String(message.context?.id || "");
  return {
    direction: "inbound", external_message_id: message.id, sender_phone: phone, recipient_phone: "6580254289",
    sender_name: String(contact?.profile?.name || "").slice(0, 180) || null,
    sender_platform_id: phone, body, occurred_at: occurredAt.toISOString(),
    category: response === "unsubscribed" ? "Unsubscribe" : response === "attending" ? "Interested" : response === "not_attending" ? "Not Interested" : body.includes("?") ? "Question" : "Follow-up",
    raw_metadata: { provider: "meta", message_type: message.type, response, ...(/^wamid\.[A-Za-z0-9+/_=-]{1,500}$/.test(context) ? { context_message_id: context } : {}) },
  };
}

// Called only after verifying Meta's signature and the pinned account/phone.
// Save incoming messages once; never generate an outgoing message or guess a campaign.
export async function saveMetaInbound(env, rows, db = createWorkspaceDb(env)) {
  for (const row of rows) {
    const phone = row.sender_phone;
    let parent;
    if (row.raw_metadata.context_message_id) {
      const query = new URLSearchParams({ external_message_id: `eq.${row.raw_metadata.context_message_id}`, direction: "eq.outbound", select: "lead_id,campaign_id,recipient_phone", limit: "1" });
      parent = (await db(`whatsapp_messages?${query}`))[0];
      if (String(parent?.recipient_phone || "").replace(/\D/g, "") !== phone) parent = null;
    }
    const phones = [phone, `+${phone}`, ...(phone.startsWith("65") && phone.length === 10 ? [phone.slice(2)] : [])];
    const query = new URLSearchParams({ phone: `in.(${phones.map(value => JSON.stringify(value)).join(",")})`, select: "id", limit: "2" });
    const leads = parent?.lead_id ? [{ id: parent.lead_id }] : await db(`leads?${query}`);
    const leadId = leads.length === 1 ? leads[0].id : null;
    await db("whatsapp_messages?on_conflict=external_message_id", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ ...row, lead_id: leadId, campaign_id: parent?.campaign_id || null }) });
    if (row.category === "Unsubscribe") {
      const leadFilter = leadId ? `id=eq.${leadId}` : query.toString().replace(/&select=.*$/, "");
      await db(`leads?${leadFilter}`, { method: "PATCH", body: JSON.stringify({ subscribed: false, unsubscribed_at: row.occurred_at, struck: true, status: "Do Not Call" }) });
      if (leadId) await db(`meta_campaign_deliveries?lead_id=eq.${leadId}&status=eq.draft`, { method: "PATCH", body: JSON.stringify({ status: "suppressed", failure_reason: "Contact unsubscribed" }) });
    }
  }
}
