import { createWorkspaceDb, requireWorkspaceAccess } from "./workspace-session.js";
import { correlateMetaReplies, metaReplyResponse } from "./meta-inbound.js";

const template = "pias_clone_cpf_webinar_image";
const ranks = { accepted: 0, sent: 1, failed: 2, delivered: 3, read: 4 };

export function campaignMetrics(campaign, deliveries, messages) {
  const rows = deliveries.filter(row => row.campaign_id === campaign.id);
  const replies = correlateMetaReplies(messages, deliveries).filter(row => row.direction === "inbound" && row.campaign_id === campaign.id && row.raw_metadata?.demo !== true);
  const latest = new Map();
  const replied = new Set();
  for (const row of replies) {
    const key = row.sender_phone ? `phone:${String(row.sender_phone).replace(/\D/g, "")}` : `lead:${row.lead_id}`;
    replied.add(key);
    if (!(row.raw_metadata?.response || metaReplyResponse(row.body))) continue;
    const prior = latest.get(key);
    if (!prior || Date.parse(row.occurred_at) > Date.parse(prior.occurred_at) || (row.occurred_at === prior.occurred_at && Number(row.id) > Number(prior.id))) latest.set(key, row);
  }
  const responses = [...latest.values()].map(row => row.raw_metadata?.response || metaReplyResponse(row.body));
  const accepted = rows.filter(row => ["accepted", "sent", "delivered", "read"].includes(row.status)).length;
  const total = Math.max(Number(campaign.audience_count) || 0, rows.length);
  return { total, accepted, notSent: Math.max(0, total - accepted), delivered: rows.filter(row => ["delivered", "read"].includes(row.status)).length,
    read: rows.filter(row => row.status === "read").length, failed: rows.filter(row => ["failed", "unknown"].includes(row.status)).length,
    replies: replied.size, attending: responses.filter(value => value === "attending").length,
    notAttending: responses.filter(value => value === "not_attending").length, unsubscribed: responses.filter(value => value === "unsubscribed").length };
}

async function pagedRows(db, path) {
  const rows = [];
  for (let page = 0; page < 100; page++) {
    const next = await db(`${path}&limit=1000&offset=${page * 1000}`);
    rows.push(...next);
    if (next.length < 1000) return rows;
  }
  throw Object.assign(new Error("Sending history is too large to load. Open a specific campaign."), { status: 413 });
}

export function loadMetaReplies(db) {
  return pagedRows(db, "whatsapp_messages?direction=eq.inbound&raw_metadata->>provider=eq.meta&select=id,direction,lead_id,campaign_id,sender_phone,body,occurred_at,raw_metadata&order=occurred_at.desc,id.desc");
}

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
  const [campaigns, deliveries, direct, replies] = await Promise.all([
    db(`campaigns?audience->>template=eq.${template}&select=*&order=created_at.desc&limit=100`),
    pagedRows(db, "meta_campaign_deliveries?select=*,lead:leads(name),campaign:campaigns(title)&order=created_at.desc,id.desc"),
    db("whatsapp_messages?direction=eq.outbound&raw_metadata->>provider=eq.meta&raw_metadata->>template=eq.pias_clone_cpf_webinar_image&select=id,external_message_id,recipient_phone,occurred_at,raw_metadata,campaign_id&order=occurred_at.desc&limit=100"),
    loadMetaReplies(db),
  ]);
  const campaignMessages = deliveries.map(row => ({ ...row, name: row.lead?.name || "Contact", campaignTitle: row.campaign?.title || "CPF campaign", occurred_at: row.attempted_at || row.created_at }));
  const known = new Set(campaignMessages.map(row => row.meta_message_id).filter(Boolean));
  const directMessages = direct.filter(row => !known.has(row.external_message_id)).map(row => ({ id: row.id, meta_message_id: row.external_message_id, name: row.raw_metadata?.recipient_name || "Contact", campaignTitle: "Direct CPF test", campaign_id: row.campaign_id, phone: row.recipient_phone, status: "accepted", failure_reason: null, occurred_at: row.occurred_at }));
  const activity = await trackedDeliveries(db, [...campaignMessages, ...directMessages]);
  activity.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  const summarized = campaigns.map(campaign => ({ ...campaign, metrics: campaignMetrics(campaign, activity, replies) }));
  return new Response(JSON.stringify({ campaigns: summarized, activity: activity.slice(0, 500), limit: 500, truncated: activity.length > 500 }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function saveDirectTemplateHistory(env, { messageId, recipient, firstName }, db = createWorkspaceDb(env)) {
  return db("whatsapp_messages?on_conflict=external_message_id", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ direction: "outbound", external_message_id: messageId, recipient_phone: recipient, sender_phone: "6580254289", sender_name: "Hi-Hunt", body: "CPF Changes & You · approved image template", raw_metadata: { provider: "meta", template, recipient_name: firstName, status: "accepted" } }) });
}
