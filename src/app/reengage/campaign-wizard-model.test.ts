import assert from "node:assert/strict";
import test from "node:test";
import { emptyAudience, type CampaignDraft } from "../../lib/campaign";
import {
  createWizardSnapshot,
  isWizardDirty,
  shouldConfirmPosterReplacement,
} from "./campaign-wizard-model";

const emptyDraft: CampaignDraft = { title: "", subject: "", message: "" };

test("the initialized wizard baseline includes the prefilled safe statuses", () => {
  const baseline = createWizardSnapshot(null, emptyDraft, emptyAudience());

  assert.equal(
    isWizardDirty(baseline, createWizardSnapshot(null, { ...emptyDraft }, emptyAudience())),
    false,
  );
  assert.equal(
    isWizardDirty(
      baseline,
      createWizardSnapshot(null, { ...emptyDraft, message: "Edited" }, emptyAudience()),
    ),
    true,
  );
});

test("campaign delivery planning participates in unsaved-change protection", () => {
  const baseline = createWizardSnapshot(null, emptyDraft, emptyAudience());
  assert.equal(isWizardDirty(baseline, createWizardSnapshot(null, emptyDraft, {
    ...emptyAudience(),
    delivery: {
      channel: "email",
      senderEmail: "events@example.test",
      scheduledAt: "2026-09-01T01:00:00.000Z",
      ctaUrl: "https://zoom.us/j/123",
      reminderDates: [],
    },
  })), true);
});

test("poster upload confirmation is limited to content edited since the current generated or blank baseline", () => {
  const generatedDraft: CampaignDraft = {
    title: "Retirement seminar",
    subject: "Retirement seminar",
    message: "Hi {{first_name}}",
  };
  const generatedAudience = { ...emptyAudience(), topics: ["Retirement"] };
  const baseline = createWizardSnapshot("first.pdf", generatedDraft, generatedAudience);

  assert.equal(
    shouldConfirmPosterReplacement(
      baseline,
      createWizardSnapshot("first.pdf", { ...generatedDraft }, { ...generatedAudience }),
    ),
    false,
  );
  assert.equal(
    shouldConfirmPosterReplacement(
      baseline,
      createWizardSnapshot("first.pdf", { ...generatedDraft, message: "Carefully edited" }, generatedAudience),
    ),
    true,
  );
  assert.equal(
    shouldConfirmPosterReplacement(
      baseline,
      createWizardSnapshot("first.pdf", generatedDraft, { ...generatedAudience, includedLeadIds: [42] }),
    ),
    true,
  );
  assert.equal(
    shouldConfirmPosterReplacement(
      baseline,
      createWizardSnapshot(null, { ...generatedDraft, message: "Carefully edited" }, generatedAudience),
    ),
    true,
  );

  const blankBaseline = createWizardSnapshot(null, emptyDraft, emptyAudience());
  assert.equal(
    shouldConfirmPosterReplacement(
      blankBaseline,
      createWizardSnapshot(null, { ...emptyDraft }, emptyAudience()),
    ),
    false,
  );
  assert.equal(
    shouldConfirmPosterReplacement(
      blankBaseline,
      createWizardSnapshot(null, { ...emptyDraft, message: "Written before upload" }, emptyAudience()),
    ),
    true,
  );
});
