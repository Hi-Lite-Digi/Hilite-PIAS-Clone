import assert from "node:assert/strict";
import test from "node:test";
import type { CampaignRecord } from "../../lib/api";
import {
  buildCalendarDays,
  calendarMonthLabel,
  campaignCalendarEvents,
  getSingaporeDateKey,
  groupCalendarEvents,
  shiftCalendarMonth,
  upcomingCalendarEvents,
} from "./calendar-model";

function campaign(
  id: string,
  scheduledAt: string | null,
  channel: "whatsapp" | "email" = "whatsapp",
  updatedAt = "2026-08-01T00:00:00.000Z",
): CampaignRecord {
  return {
    audience: {
      ageBands: [],
      delivery: { channel, ctaUrl: null, reminderDates: [], scheduledAt, senderEmail: null },
      statuses: [],
      topics: [],
    },
    audience_count: 3,
    created_at: "2026-08-01T00:00:00.000Z",
    id,
    message: "Message",
    poster_name: null,
    poster_path: null,
    status: "queued",
    subject: "Subject",
    title: `Campaign ${id}`,
    updated_at: updatedAt,
  };
}

test("month grids always provide six complete Singapore calendar weeks", () => {
  const days = buildCalendarDays({ month: 7, year: 2026 });
  assert.equal(days.length, 42);
  assert.equal(days[0].dateKey, "2026-07-26");
  assert.equal(days.at(-1)?.dateKey, "2026-09-05");
  assert.equal(days.filter((day) => day.inMonth).length, 31);
  assert.equal(calendarMonthLabel({ month: 7, year: 2026 }), "August 2026");
});

test("month navigation crosses year boundaries without changing the selected day", () => {
  assert.deepEqual(shiftCalendarMonth({ month: 11, year: 2026 }, 1), { month: 0, year: 2027 });
  assert.deepEqual(shiftCalendarMonth({ month: 0, year: 2026 }, -1), { month: 11, year: 2025 });
});

test("campaign events use Singapore delivery dates and populate undated campaigns from their last update", () => {
  const events = campaignCalendarEvents([
    campaign("late-utc", "2026-08-29T18:30:00.000Z"),
    campaign("email", "2026-08-30T03:00:00.000Z", "email"),
    campaign("invalid", "not-a-date", "whatsapp", "2026-08-28T02:00:00.000Z"),
    campaign("unscheduled", null, "whatsapp", "2026-08-27T02:00:00.000Z"),
  ]);

  assert.equal(events.length, 4);
  assert.deepEqual(events.slice(0, 2).map((event) => event.dateKey), ["2026-08-27", "2026-08-28"]);
  assert.deepEqual(events.slice(0, 2).map((event) => event.dateSource), ["updated", "updated"]);
  assert.equal(events[2].dateKey, "2026-08-30");
  assert.equal(events[3].dateKey, "2026-08-30");
  assert.equal(events[3].channel, "email");
  assert.equal(events[3].dateSource, "scheduled");
  assert.equal(groupCalendarEvents(events).get("2026-08-30")?.length, 2);
  assert.equal(getSingaporeDateKey("2026-08-29T18:30:00.000Z"), "2026-08-30");
});

test("upcoming events exclude past dates and respect the requested limit", () => {
  const events = campaignCalendarEvents([
    campaign("past", "2026-08-29T01:00:00.000Z"),
    campaign("next", "2026-08-29T03:00:00.000Z"),
    campaign("later", "2026-09-01T03:00:00.000Z"),
    campaign("undated-future-update", null, "whatsapp", "2026-09-02T03:00:00.000Z"),
  ]);
  const upcoming = upcomingCalendarEvents(events, new Date("2026-08-29T02:00:00.000Z"), 1);
  assert.deepEqual(upcoming.map((event) => event.campaignId), ["next"]);
});
