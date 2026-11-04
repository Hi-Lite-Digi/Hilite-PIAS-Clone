import type { CampaignAudience } from "../../lib/api";
import { audienceSignature, type CampaignDraft } from "../../lib/campaign";

type WizardSnapshot = {
  posterName: string | null;
  title: string;
  subject: string;
  message: string;
  audience: string;
};

function createWizardSnapshot(
  posterName: string | null,
  draft: CampaignDraft,
  audience: CampaignAudience,
): WizardSnapshot {
  return {
    posterName,
    title: draft.title,
    subject: draft.subject,
    message: draft.message,
    audience: audienceSignature(audience),
  };
}

function hasContentEdits(baseline: WizardSnapshot, current: WizardSnapshot) {
  return baseline.title !== current.title
    || baseline.subject !== current.subject
    || baseline.message !== current.message
    || baseline.audience !== current.audience;
}

function isWizardDirty(baseline: WizardSnapshot, current: WizardSnapshot) {
  return baseline.posterName !== current.posterName || hasContentEdits(baseline, current);
}

function shouldConfirmPosterReplacement(baseline: WizardSnapshot, current: WizardSnapshot) {
  return hasContentEdits(baseline, current);
}

export {
  createWizardSnapshot,
  isWizardDirty,
  shouldConfirmPosterReplacement,
};
export type { WizardSnapshot };
