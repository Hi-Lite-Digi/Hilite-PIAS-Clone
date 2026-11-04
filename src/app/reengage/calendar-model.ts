import type { CampaignRecord } from "../../lib/api";
import { campaignDelivery } from "../../lib/campaign";

const SINGAPORE_TIME_ZONE = "Asia/Singapore";

type CalendarMonth = {
  month: number;
  year: number;
};

type CalendarDay = CalendarMonth & {
  date: number;
  dateKey: string;
  inMonth: boolean;
};

type CampaignCalendarEvent = {
  at: string;
  campaignId: string;
  channel: "whatsapp" | "email";
  dateSource: "scheduled" | "updated";
  dateKey: string;
  status: CampaignRecord["status"];
  title: string;
};

function dateParts(value: Date | string | number, timeZone = SINGAPORE_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = read("year");
  const month = read("month");
  const day = read("day");
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? { day, month, year }
    : null;
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getSingaporeDateKey(value: Date | string | number) {
  const parts = dateParts(value);
  return parts ? dateKey(parts.year, parts.month - 1, parts.day) : null;
}

function getSingaporeMonth(value: Date | string | number = new Date()): CalendarMonth {
  const parts = dateParts(value) ?? dateParts(new Date())!;
  return { month: parts.month - 1, year: parts.year };
}

function shiftCalendarMonth(current: CalendarMonth, amount: number): CalendarMonth {
  const shifted = new Date(Date.UTC(current.year, current.month + amount, 1));
  return { month: shifted.getUTCMonth(), year: shifted.getUTCFullYear() };
}

function calendarMonthLabel(current: CalendarMonth) {
  return new Intl.DateTimeFormat("en-SG", { month: "long", timeZone: "UTC", year: "numeric" })
    .format(new Date(Date.UTC(current.year, current.month, 1)));
}

function buildCalendarDays(current: CalendarMonth): CalendarDay[] {
  const firstDay = new Date(Date.UTC(current.year, current.month, 1));
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(firstDay.getUTCDate() - firstDay.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(gridStart);
    value.setUTCDate(gridStart.getUTCDate() + index);
    const year = value.getUTCFullYear();
    const month = value.getUTCMonth();
    const day = value.getUTCDate();
    return {
      date: day,
      dateKey: dateKey(year, month, day),
      inMonth: year === current.year && month === current.month,
      month,
      year,
    };
  });
}

function campaignCalendarEvents(campaigns: readonly CampaignRecord[]): CampaignCalendarEvent[] {
  const events: CampaignCalendarEvent[] = [];
  for (const campaign of campaigns) {
    const delivery = campaignDelivery(campaign.audience);
    const scheduledAt = delivery.scheduledAt && Number.isFinite(Date.parse(delivery.scheduledAt))
      ? delivery.scheduledAt
      : null;
    const fallbackAt = Number.isFinite(Date.parse(campaign.updated_at))
      ? campaign.updated_at
      : Number.isFinite(Date.parse(campaign.created_at))
        ? campaign.created_at
        : null;
    const at = scheduledAt ?? fallbackAt;
    if (!at) continue;
    const eventDateKey = getSingaporeDateKey(at);
    if (!eventDateKey) continue;
    events.push({
      at,
      campaignId: campaign.id,
      channel: delivery.channel,
      dateSource: scheduledAt ? "scheduled" : "updated",
      dateKey: eventDateKey,
      status: campaign.status,
      title: campaign.title,
    });
  }
  return events.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function groupCalendarEvents(events: readonly CampaignCalendarEvent[]) {
  const grouped = new Map<string, CampaignCalendarEvent[]>();
  for (const event of events) {
    const dayEvents = grouped.get(event.dateKey);
    if (dayEvents) dayEvents.push(event);
    else grouped.set(event.dateKey, [event]);
  }
  return grouped;
}

function upcomingCalendarEvents(events: readonly CampaignCalendarEvent[], now = new Date(), limit = 5) {
  const nowTime = now.getTime();
  return events
    .filter((event) => event.dateSource === "scheduled" && Date.parse(event.at) >= nowTime)
    .slice(0, Math.max(0, limit));
}

function formatSingaporeEventTime(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: SINGAPORE_TIME_ZONE,
  }).format(new Date(value));
}

function formatSingaporeEventDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: SINGAPORE_TIME_ZONE,
    weekday: "short",
    year: "numeric",
  }).format(new Date(value));
}

export {
  SINGAPORE_TIME_ZONE,
  buildCalendarDays,
  calendarMonthLabel,
  campaignCalendarEvents,
  formatSingaporeEventDate,
  formatSingaporeEventTime,
  getSingaporeDateKey,
  getSingaporeMonth,
  groupCalendarEvents,
  shiftCalendarMonth,
  upcomingCalendarEvents,
};
export type { CalendarDay, CalendarMonth, CampaignCalendarEvent };
