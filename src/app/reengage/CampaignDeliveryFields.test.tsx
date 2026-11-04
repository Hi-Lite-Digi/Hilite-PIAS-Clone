import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import CampaignDeliveryFields from "./CampaignDeliveryFields";

test("legacy email delivery keeps its internals without exposing an Email blast selector", () => {
  const markup = renderToStaticMarkup(
    <CampaignDeliveryFields
      delivery={{
        channel: "email",
        senderEmail: "events@example.test",
        scheduledAt: "2026-09-01T01:00:00.000Z",
        ctaUrl: "https://zoom.us/j/123",
        reminderDates: ["2026-08-31T01:00:00.000Z"],
      }}
      emailSender={{ configured: true, provider: "Gmail", address: "namiuser89@gmail.com", displayName: "Hilite", requirement: null }}
      loadingSender={false}
      onChange={() => undefined}
      posterName="seminar.pdf"
    />,
  );

  assert.match(markup, /Connected Gmail sender/);
  assert.match(markup, /namiuser89@gmail\.com/);
  assert.match(markup, /seminar\.pdf will be attached/);
  assert.match(markup, /Zoom \/ CTA link/);
  assert.doesNotMatch(markup, /Email blast/);
  assert.doesNotMatch(markup, /Participant WhatsApp reminders/);
});

test("WhatsApp delivery schedules participant reminders and carries the poster", () => {
  const scheduledAt = "2026-09-08T02:00:00.000Z";
  const markup = renderToStaticMarkup(
    <CampaignDeliveryFields
      delivery={{
        channel: "whatsapp",
        senderEmail: null,
        scheduledAt,
        ctaUrl: null,
        reminderDates: [
          "2026-09-01T02:00:00.000Z",
          "2026-09-07T02:00:00.000Z",
          "2026-09-07T21:00:00.000Z",
        ],
      }}
      emailSender={null}
      loadingSender={false}
      onChange={() => undefined}
      posterName="seminar.png"
    />,
  );

  assert.match(markup, /Campaign date &amp; time/);
  assert.match(markup, /Zoom \/ CTA link/);
  assert.match(markup, /every WhatsApp message/);
  assert.doesNotMatch(markup, /Attendance capacity/);
  assert.doesNotMatch(markup, /1500/);
  assert.match(markup, /reply <strong>YES<\/strong> to attend/);
  assert.match(markup, /MAYBE NEXT TIME/);
  assert.match(markup, /reply <strong>UNSUBSCRIBE<\/strong> to opt out/);
  assert.match(markup, /marks the lead unsubscribed in Supabase/);
  assert.match(markup, /Participant WhatsApp reminders/);
  assert.match(markup, /Add reminder/);
  assert.match(markup, /Reminder 1/);
  assert.match(markup, /7 days before the event/);
  assert.match(markup, /1 day before the event/);
  assert.match(markup, /5 hours before the event/);
  assert.equal((markup.match(/id="participant-reminder-/g) || []).length, 3);
  assert.equal((markup.match(/Remove reminder/g) || []).length, 3);
  assert.match(markup, /seminar\.png will be attached to the initial WhatsApp and every automatic participant reminder/);
  assert.doesNotMatch(markup, /Email blast/);
  assert.doesNotMatch(markup, /Client-facing sender/);
});

test("an extracted poster date that has passed is shown truthfully with a warning", () => {
  const markup = renderToStaticMarkup(
    <CampaignDeliveryFields
      delivery={{
        channel: "whatsapp",
        senderEmail: null,
        scheduledAt: "2026-08-20T11:00:00.000Z",
        ctaUrl: null,
        reminderDates: [],
      }}
      emailSender={null}
      loadingSender={false}
      onChange={() => undefined}
      posterName="cpf-seminar.jpeg"
    />,
  );

  assert.match(markup, /This poster date has passed\. Update it before continuing\./);
  assert.match(markup, /value="2026-08-20T19:00"/);
});
