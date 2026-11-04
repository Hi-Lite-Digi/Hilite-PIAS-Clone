import type { AssistantLeadPreview, CampaignAudience } from "../../lib/api";

type AudienceLoadState = {
  people: AssistantLeadPreview[];
  total: number;
  loading: boolean;
  error: string | null;
};

function idleAudienceLoad(): AudienceLoadState {
  return { people: [], total: 0, loading: false, error: null };
}

function startAudienceLoad(): AudienceLoadState {
  return { people: [], total: 0, loading: true, error: null };
}

function finishAudienceLoad(people: AssistantLeadPreview[], total: number): AudienceLoadState {
  return { people, total, loading: false, error: null };
}

function failAudienceLoad(error: unknown, fallback: string): AudienceLoadState {
  const message = error instanceof Error && error.message.trim() ? error.message : fallback;
  return { people: [], total: 0, loading: false, error: message };
}

function setAudienceLeadMode(
  audience: CampaignAudience,
  leadId: number,
  mode: "include" | "exclude" | "auto",
): CampaignAudience {
  const included = new Set(audience.includedLeadIds ?? []);
  const excluded = new Set(audience.excludedLeadIds ?? []);
  included.delete(leadId);
  excluded.delete(leadId);
  if (mode === "include") included.add(leadId);
  if (mode === "exclude") excluded.add(leadId);
  return { ...audience, includedLeadIds: [...included], excludedLeadIds: [...excluded] };
}

function audienceRuleKey(audience: CampaignAudience) {
  return JSON.stringify({
    ageBands: audience.ageBands,
    minAge: audience.minAge ?? null,
    maxAge: audience.maxAge ?? null,
    topics: audience.topics,
    statuses: audience.statuses,
  });
}

export {
  audienceRuleKey,
  failAudienceLoad,
  finishAudienceLoad,
  idleAudienceLoad,
  setAudienceLeadMode,
  startAudienceLoad,
};
export type { AudienceLoadState };
