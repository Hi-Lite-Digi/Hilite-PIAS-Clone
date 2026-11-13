import { readFileSync } from "node:fs";
import { createWorkspaceDb, requireWorkspaceAccess } from "./workspace-session.js";
import { getMetaTestStatus, sendTemplate } from "./meta-whatsapp.js";
import { trackedDeliveries } from "./outreach-activity.js";

const definition = JSON.parse(readFileSync(new URL("../config/pias-clone-demo-template.json", import.meta.url), "utf8"));
const bodyText = definition.components.find(item => item.type === "BODY").text;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const campaignPath = id => `campaigns?id=eq.${id}`;

export function templateRecipientPhone(lead) {
  let phone = String(lead.phone || "").replace(/[+\s()-]/g, "");
  if (/^\d{8}$/.test(phone)) phone = `65${phone}`;
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw failure(`${lead.name} needs a valid WhatsApp number.`);
  if (/^120255501\d{2}$/.test(phone)) throw failure(`${lead.name} has a fictional sample number. Choose a real contact for sending.`);
  if (lead.struck || lead.subscribed !== true) throw failure(`${lead.name} is unsubscribed or unavailable for outreach.`);
  return phone;
}

function selectedIds(input) {
  const ids = input.leadIds || input.audience?.includedLeadIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw failure("Select the contacts for this campaign.");
  return [...new Set(ids)];
}

export async function handleTemplateCampaignRequest(request, env, { db = createWorkspaceDb(env), fetcher = fetch, loadPoster, sessionStore } = {}) {
  try {
    await requireWorkspaceAccess(request, env, sessionStore);
    const path = new URL(request.url).pathname;
    const match = /^\/api\/campaigns\/([0-9a-f-]+)(?:\/(template|start-template|send-template))?$/.exec(path);
    const id = match?.[1];
    if (id && !uuid(id)) throw failure("Campaign not found.", 404);
    const getCampaign = async () => (await db(`${campaignPath(id)}&select=*&limit=1`))[0];
    const deliveries = () => db(`meta_campaign_deliveries?campaign_id=eq.${id}&select=*,lead:leads(id,name,phone,subscribed,struck)&order=created_at.asc,id.asc`);
    const getLeads = async ids => {
      const leads = await db(`leads?id=in.(${ids.join(",")})&select=id,name,phone,email,subscribed,struck`);
      if (leads.length !== ids.length) throw failure("Some selected contacts no longer exist. Review the audience.", 409);
      return leads;
    };
    if (request.method === "GET" && match?.[2] === "template") {
      const campaign = await getCampaign();
      if (!campaign) throw failure("Campaign not found.", 404);
      const ids = campaign.audience?.includedLeadIds || [];
      return json({ data: campaign, deliveries: await trackedDeliveries(db, await deliveries()), leads: ids.length ? await getLeads(ids) : [], fixedTemplate: campaign.audience?.template === definition.name });
    }
    const raw = await request.text();
    if (raw.length > 32000) throw failure("This campaign request is too large.", 413);
    let input;
    try { input = JSON.parse(raw); } catch { throw failure("Enter valid campaign details."); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw failure("Enter valid campaign details.");
    if ((request.method === "POST" && !id) || (request.method === "PATCH" && id && !match[2])) {
      const title = String(input.title || "").trim();
      if (!title || title.length > 120) throw failure("Enter a campaign name of up to 120 characters.");
      const ids = selectedIds(input);
      const leads = await getLeads(ids);
      for (const lead of leads) templateRecipientPhone(lead);
      const values = { title, subject: "CPF Changes & You", message: bodyText, poster_name: "cpf-webinar-poster.png", poster_path: null,
        audience: { template: definition.name, ageBands: [], topics: [], statuses: [], includedLeadIds: ids, excludedLeadIds: [], delivery: { channel: "whatsapp", senderEmail: null, scheduledAt: null, ctaUrl: null, reminderDates: [] } },
        audience_count: ids.length, status: "draft", updated_at: new Date().toISOString() };
      const saved = await db(id ? `${campaignPath(id)}&status=eq.draft` : "campaigns", { method: id ? "PATCH" : "POST", body: JSON.stringify(values) });
      if (!saved[0]) throw failure("This campaign has already started. Create a new campaign to change its audience.", 409);
      return json({ data: saved[0] }, id ? 200 : 201);
    }
    const campaign = await getCampaign();
    if (!campaign) throw failure("Campaign not found.", 404);
    if (campaign.audience?.template !== definition.name) throw failure("Create a campaign with the approved CPF invitation template before sending.", 409);
    if (input.confirmed !== true) throw failure("Confirm the selected recipients agreed to receive this campaign.");
    const status = await getMetaTestStatus(env, fetcher);
    if (!status.ready) throw failure(status.requirements.join(" "), 409);
    if (match[2] === "start-template" && request.method === "POST") {
      if (campaign.status === "sending") {
        const currentDeliveries = await deliveries();
        if (!currentDeliveries.length) throw failure("The campaign is being prepared. Refresh its status before continuing.", 409);
        return json({ deliveries: currentDeliveries });
      }
      if (campaign.status !== "draft") throw failure("This campaign has already been attempted. Review its delivery results.", 409);
      const leads = await getLeads(selectedIds(campaign));
      for (const lead of leads) if (templateRecipientPhone(lead) === status.senderNumber) throw failure("The sender cannot be its own recipient.");
      const claimed = (await db(`${campaignPath(id)}&status=eq.draft`, { method: "PATCH", body: JSON.stringify({ status: "sending", updated_at: new Date().toISOString() }) }))[0];
      if (!claimed) throw failure("Another request already started this campaign. Refresh its status.", 409);
      // Read the exact audience returned by the claim, including a simultaneous edit.
      const claimedLeads = await getLeads(selectedIds(claimed));
      const rows = claimedLeads.map(lead => ({ campaign_id: id, lead_id: lead.id, phone: templateRecipientPhone(lead) }));
      if (rows.some(row => row.phone === status.senderNumber)) throw failure("The sender cannot be its own recipient.");
      await db("meta_campaign_deliveries", { method: "POST", body: JSON.stringify(rows) });
      return json({ deliveries: await deliveries() });
    }
    if (match[2] !== "send-template" || request.method !== "POST" || !uuid(input.deliveryId)) throw failure("Choose a saved campaign recipient.");
    if (campaign.status !== "sending") throw failure("This campaign is not awaiting sends. Refresh its results.", 409);
    const row = (await db(`meta_campaign_deliveries?id=eq.${input.deliveryId}&campaign_id=eq.${id}&select=*,lead:leads(id,name,phone,email,subscribed,struck)&limit=1`))[0];
    if (!row || row.status !== "draft") throw failure("This recipient has already been attempted. Check the result before sending another campaign.", 409);
    const recipient = templateRecipientPhone(row.lead);
    if (recipient !== row.phone || recipient === status.senderNumber) throw failure("The recipient changed. Create a new campaign after reviewing the contact.", 409);
    const claim = await db(`meta_campaign_deliveries?id=eq.${row.id}&status=eq.draft`, { method: "PATCH", body: JSON.stringify({ status: "sending", attempted_at: new Date().toISOString() }) });
    if (!claim[0]) throw failure("Another request already started this message. Refresh its status.", 409);
    let accepted = false;
    let trackingSaved = true;
    try {
      const result = await sendTemplate(env, recipient, row.lead.name.trim().split(/\s+/)[0].slice(0, 80), fetcher, loadPoster);
      accepted = true;
      await db(`meta_campaign_deliveries?id=eq.${row.id}&status=eq.sending`, { method: "PATCH", body: JSON.stringify({ status: "accepted", meta_message_id: result.messageId }) });
      // Normal inbox history reflects the accepted outgoing message.
      await db("whatsapp_messages?on_conflict=external_message_id", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({
        direction: "outbound", lead_id: row.lead_id, campaign_id: id, external_message_id: result.messageId, recipient_phone: recipient,
        sender_name: "Hi-Hunt", body: bodyText.replace("{{1}}", row.lead.name.trim().split(/\s+/)[0]), raw_metadata: { provider: "meta", template: definition.name, status: "accepted" },
      }) }).catch(() => { trackingSaved = false; });
    } catch (error) {
      if (accepted) trackingSaved = false;
      else await db(`meta_campaign_deliveries?id=eq.${row.id}&status=eq.sending`, { method: "PATCH", body: JSON.stringify({ status: error.deliveryUnknown ? "unknown" : "failed", failure_reason: String(error.message).slice(0, 300) }) }).catch(() => undefined);
      if (!accepted) throw error;
    } finally {
      const all = await deliveries().catch(() => null);
      if (all?.length && all.every(item => !["draft", "sending"].includes(item.status))) {
        await db(campaignPath(id), { method: "PATCH", body: JSON.stringify({ status: all.every(item => item.status === "accepted") ? "sent" : "paused", updated_at: new Date().toISOString() }) }).catch(() => undefined);
      }
    }
    return json({ accepted, trackingSaved, deliveryConfirmed: false });
  } catch (error) {
    return json({ error: error.status ? error.message : "The campaign request could not be completed. Refresh before trying again." }, error.status || 500);
  }
}
