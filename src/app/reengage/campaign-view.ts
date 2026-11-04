import type { CampaignAudience, CampaignRecord, LeadRecord, ReplyConversationRecord } from "../../lib/api";
import type { CampaignDraft } from "../../lib/campaign";
import type { Status } from "../components/system/status";

function campaignStatus(status: CampaignRecord["status"]): Status {
  if (status === "sending") return "running";
  if (status === "sent") return "done";
  return status;
}

function audienceSummary(audience: CampaignAudience) {
  const parts: string[] = [];
  if (audience.ageBands.length > 0) parts.push(audience.ageBands.join(", "));
  else if (audience.minAge != null || audience.maxAge != null) {
    parts.push(`${audience.minAge ?? "Any"}-${audience.maxAge ?? "Any"}`);
  }
  if (audience.topics.length > 0) {
    parts.push(audience.topics.length === 1 ? audience.topics[0] : `${audience.topics[0]} +${audience.topics.length - 1}`);
  }
  if (audience.statuses.length > 0) {
    parts.push(audience.statuses.length === 1 ? audience.statuses[0] : `${audience.statuses[0]} +${audience.statuses.length - 1}`);
  }
  const included = audience.includedLeadIds?.length ?? 0;
  const excluded = audience.excludedLeadIds?.length ?? 0;
  if (included > 0) parts.push(`${included} included`);
  if (excluded > 0) parts.push(`${excluded} excluded`);
  return parts.join(" · ") || "All eligible leads";
}

function audienceHasManualPicks(audience: CampaignAudience) {
  return Boolean(audience.includedLeadIds?.length || audience.excludedLeadIds?.length);
}

function clearManualPicks(audience: CampaignAudience): CampaignAudience {
  return { ...audience, includedLeadIds: [], excludedLeadIds: [] };
}

type CampaignUpdateSection = "message" | "audience";
type CampaignPosterDraft = { posterName: string | null; posterPath: string | null };

function posterUpdate(posterName: string | null, posterPath: string | null) {
  return posterName && posterPath ? { posterName, posterPath } : {};
}

function buildCampaignSectionUpdate(
  section: CampaignUpdateSection,
  campaign: CampaignRecord,
  draft: CampaignDraft,
  audience: CampaignAudience,
  poster: CampaignPosterDraft,
) {
  if (section === "message") {
    return {
      ...draft,
      audience: campaign.audience,
      ...posterUpdate(poster.posterName, poster.posterPath),
    };
  }
  return {
    title: campaign.title,
    subject: campaign.subject,
    message: campaign.message,
    audience,
    ...posterUpdate(campaign.poster_name, campaign.poster_path),
  };
}

function getCampaignStatusAction(status: CampaignRecord["status"]) {
  if (status === "draft") {
    return {
      operation: "queue" as const,
      label: "Approve & queue",
      successText: "is queued.",
      failureTitle: "Campaign could not be queued",
    };
  }
  if (status === "paused") {
    return {
      operation: "resume" as const,
      label: "Resume",
      successText: "is queued.",
      failureTitle: "Campaign could not be resumed",
    };
  }
  if (status === "sent") {
    return {
      operation: "pause" as const,
      label: "Completed",
      successText: "is paused.",
      failureTitle: "Campaign could not be paused",
    };
  }
  return {
    operation: "pause" as const,
    label: "Pause",
    successText: "is paused.",
    failureTitle: "Campaign could not be paused",
  };
}

function campaignProgress(campaign: CampaignRecord) {
  const recordedTotal = campaign.delivery_total;
  const total = Math.max(0, Math.floor(
    typeof recordedTotal === "number" && recordedTotal > 0 ? recordedTotal : campaign.audience_count,
  ));
  if (typeof campaign.delivery_sent === "number") {
    return {
      sent: Math.min(total, Math.max(0, Math.floor(campaign.delivery_sent))),
      total,
      exact: true as const,
    };
  }
  if (campaign.status === "sent") return { sent: total, total, exact: true as const };
  if (campaign.status === "draft" || campaign.status === "queued") return { sent: 0, total, exact: true as const };
  if (total === 0) return { sent: 0, total, exact: false as const };
  const seed = [...campaign.id].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  const ratio = campaign.status === "paused" ? 0.42 : 0.38 + (seed % 42) / 100;
  const sent = Math.min(total - 1, Math.max(1, Math.round(total * ratio)));
  return { sent, total, exact: false as const };
}

function campaignReplyCount(campaign: CampaignRecord, threads: readonly ReplyConversationRecord[]) {
  return threads.filter((thread) => thread.campaignId
    ? thread.campaignId === campaign.id
    : thread.campaign === campaign.title).length;
}

function campaignAttendanceCount(campaign: CampaignRecord, threads: readonly ReplyConversationRecord[]) {
  return threads.filter((thread) => (thread.campaignId
    ? thread.campaignId === campaign.id
    : thread.campaign === campaign.title) && thread.category === "Interested").length;
}

function campaignAttendanceTotal(campaign: CampaignRecord) {
  return campaignProgress(campaign).total;
}

function leadMatchesCampaignAudience(lead: LeadRecord, audience: CampaignAudience) {
  const excluded = new Set(audience.excludedLeadIds ?? []);
  if (excluded.has(lead.id)) return false;
  if (new Set(audience.includedLeadIds ?? []).has(lead.id)) return true;

  const hasAgeRange = audience.minAge != null || audience.maxAge != null;
  const hasRules = hasAgeRange
    || audience.ageBands.length > 0
    || audience.topics.length > 0
    || audience.statuses.length > 0;
  if (!hasRules) return false;
  if (hasAgeRange) {
    if (lead.age == null) return false;
    if (audience.minAge != null && lead.age < audience.minAge) return false;
    if (audience.maxAge != null && lead.age > audience.maxAge) return false;
  } else if (audience.ageBands.length > 0 && !audience.ageBands.includes(lead.age_band ?? "No DOB")) {
    return false;
  }
  if (audience.topics.length > 0 && !audience.topics.some((topic) => lead.topics.includes(topic))) return false;
  if (audience.statuses.length > 0 && !audience.statuses.includes(lead.status ?? "")) return false;
  return true;
}

export {
  audienceHasManualPicks,
  audienceSummary,
  buildCampaignSectionUpdate,
  campaignAttendanceCount,
  campaignAttendanceTotal,
  campaignProgress,
  campaignReplyCount,
  campaignStatus,
  clearManualPicks,
  getCampaignStatusAction,
  leadMatchesCampaignAudience,
};
export type { CampaignUpdateSection };
