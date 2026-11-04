import assert from "node:assert/strict";
import test from "node:test";
import type { CampaignAudience } from "./api";
import {
  campaignDelivery,
  campaignDeliveryForPosterEvent,
  defaultCampaignDelivery,
  ensurePersonalisedWhatsAppGreeting,
  formatCampaignMessage,
  participantReminderDates,
} from "./campaign";

test("new campaigns start two weeks ahead at 10 AM with three reminder defaults", () => {
  const now = new Date(2026, 7, 29, 15, 30);
  const delivery = defaultCampaignDelivery(now);
  const scheduledAt = new Date(delivery.scheduledAt ?? "");

  assert.equal(scheduledAt.getFullYear(), 2026);
  assert.equal(scheduledAt.getMonth(), 8);
  assert.equal(scheduledAt.getDate(), 12);
  assert.equal(scheduledAt.getHours(), 10);
  assert.equal(scheduledAt.getMinutes(), 0);
  assert.deepEqual(delivery.reminderDates, participantReminderDates(delivery.scheduledAt));
});

test("WhatsApp drafts always start with a personalized first-name greeting", () => {
  assert.equal(
    ensurePersonalisedWhatsAppGreeting("You're invited."),
    "Hi {{first_name}} 👋\n\nYou're invited.",
  );
  assert.equal(
    ensurePersonalisedWhatsAppGreeting("Hello {{ first_name }}!\n\nYou're invited."),
    "Hello {{ first_name }}!\n\nYou're invited.",
  );
  assert.equal(
    formatCampaignMessage("Join our seminar."),
    "Hi {{first_name}} 👋\n\nJoin our seminar.",
  );
});

test("saved custom reminder times are preserved instead of being regenerated", () => {
  const customReminderDates = [
    "2026-09-10T01:00:00.000Z",
    "2026-09-11T04:30:00.000Z",
  ];
  const audience = {
    ageBands: [],
    topics: [],
    statuses: [],
    delivery: {
      channel: "whatsapp",
      senderEmail: null,
      scheduledAt: "2026-09-12T02:00:00.000Z",
      ctaUrl: null,
      reminderDates: customReminderDates,
    },
  } satisfies CampaignAudience;

  assert.deepEqual(campaignDelivery(audience).reminderDates, customReminderDates);
});

test("poster event times replace the generic future default and recalculate reminders", () => {
  const delivery = defaultCampaignDelivery(new Date(2026, 7, 29, 15, 30));
  const updated = campaignDeliveryForPosterEvent(delivery, "2026-08-20T11:00:00.000Z");

  assert.equal(updated.scheduledAt, "2026-08-20T11:00:00.000Z");
  assert.deepEqual(updated.reminderDates, [
    "2026-08-13T11:00:00.000Z",
    "2026-08-19T11:00:00.000Z",
    "2026-08-20T06:00:00.000Z",
  ]);
});
