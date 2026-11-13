import { createWorkspaceDb, requireWorkspaceAccess } from "./workspace-session.js";

const template = "pias_clone_cpf_webinar_image";
const ranks = { accepted: 0, sent: 1, failed: 2, delivered: 3, read: 4 };

export function isSampleLead(lead) {
  return lead.import_batch === "hilite-demo-v1" || /\.example$/i.test(String(lead.email || "")) || /^120255501\d{2}$/.test(String(lead.phone || "").replace(/\D/g, ""));
}

export function projectDelivery(row, events) {
  let result = { ...row };
  for (const event of events) {
    if (event.meta_message_id !== row.meta_message_id || !(event.status in ranks)) continue;
    if ((ranks[event.status] ?? -1) < (ranks[result.status] ?? -1)) continue;
    if (event.status === result.status && result.status_at && result.status_at > event.event_at) continue;
    result = { ...result, status: event.status, status_at: event.event_at, failure_reason: event.status === "failed" ? event.errors?.[0]?.details || `Meta error ${event.errors?.[0]?.code || "unknown"}` : null };
  }
  return result;
}

export async function trackedDeliveries(db, rows) {
  const ids = [...new Set(rows.map(row => row.meta_message_id).filter(Boolean))];
  const events = [];
  for (let start = 0; start < ids.length; start += 25) {
    const params = new URLSearchParams({ select: "meta_message_id,status,event_at,errors", meta_message_id: `in.(${ids.slice(start, start + 25).map(id => JSON.stringify(id)).join(",")})`, limit: "1000" });
    events.push(...await db(`meta_delivery_events?${params}`));
  }
  return rows.map(row => projectDelivery(row, events));
}

export async function outreachActivity(request, env, { db = createWorkspaceDb(env), authorize = requireWorkspaceAccess } = {}) {
  await authorize(request, env);
  const [campaigns, deliveries, direct] = await Promise.all([
    db(`campaigns?audience->>template=eq.${template}&select=*&order=created_at.desc&limit=100`),
    db("meta_campaign_deliveries?select=*,lead:leads(name),campaign:campaigns(title)&order=created_at.desc&limit=500"),
    db("whatsapp_messages?direction=eq.outbound&raw_metadata->>provider=eq.meta&select=id,external_message_id,recipient_phone,occurred_at,raw_metadata,campaign_id&order=occurred_at.desc&limit=100"),
  ]);
  const campaignMessages = deliveries.map(row => ({ ...row, name: row.lead?.name || "Contact", campaignTitle: row.campaign?.title || "CPF campaign", occurred_at: row.attempted_at || row.created_at }));
  const known = new Set(campaignMessages.map(row => row.meta_message_id).filter(Boolean));
  const directMessages = direct.filter(row => !known.has(row.external_message_id)).map(row => ({ id: row.id, meta_message_id: row.external_message_id, name: row.raw_metadata?.recipient_name || "Contact", campaignTitle: "Direct CPF test", campaign_id: row.campaign_id, phone: row.recipient_phone, status: "accepted", failure_reason: null, occurred_at: row.occurred_at }));
  const activity = await trackedDeliveries(db, [...campaignMessages, ...directMessages]);
  activity.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  return new Response(JSON.stringify({ campaigns, activity, limit: 500, truncated: deliveries.length === 500 }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function saveDirectTemplateHistory(env, { messageId, recipient, firstName }, db = createWorkspaceDb(env)) {
  return db("whatsapp_messages?on_conflict=external_message_id", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ direction: "outbound", external_message_id: messageId, recipient_phone: recipient, sender_phone: "6580254289", sender_name: "Hi-Hunt", body: "CPF Changes & You · approved image template", raw_metadata: { provider: "meta", template, recipient_name: firstName, status: "accepted" } }) });
}
