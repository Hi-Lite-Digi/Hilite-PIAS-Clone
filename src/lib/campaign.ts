import type { CampaignAudience, CampaignDelivery, WorkspaceSummary } from "./api";

export const AGE_ORDER = ["Below 50", "50-54", "55-65", "65-75", "Above 75", "No DOB"];
export const SAFE_STATUSES = ["Untouched", "Unreachable"];
export const DAILY_SEND_CAP = 20;

export const ACCEPTED_POSTER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
export const MAX_POSTER_BYTES = 50 * 1024 * 1024;
export const PARTICIPANT_REMINDER_PRESETS = [
  { hours: 168, label: "1 week before" },
  { hours: 24, label: "1 day before" },
  { hours: 5, label: "5 hours before" },
] as const;
export const MAX_PARTICIPANT_REMINDERS = 3;

export type CampaignDraft = { title: string; subject: string; message: string };

export const DEFAULT_CAMPAIGN_DELIVERY: CampaignDelivery = {
  channel: "whatsapp",
  senderEmail: null,
  scheduledAt: null,
  ctaUrl: null,
  reminderDates: [],
};

export function defaultCampaignDelivery(now = new Date()): CampaignDelivery {
  const eventDate = new Date(now);
  eventDate.setDate(eventDate.getDate() + 14);
  eventDate.setHours(10, 0, 0, 0);
  const scheduledAt = eventDate.toISOString();
  return {
    ...DEFAULT_CAMPAIGN_DELIVERY,
    scheduledAt,
    reminderDates: participantReminderDates(scheduledAt),
  };
}

export function campaignDeliveryForPosterEvent(delivery: CampaignDelivery, eventStartsAt: string | null) {
  const eventTime = Date.parse(eventStartsAt ?? "");
  if (!Number.isFinite(eventTime)) return { ...delivery, reminderDates: [...delivery.reminderDates] };
  const scheduledAt = new Date(eventTime).toISOString();
  return {
    ...delivery,
    scheduledAt,
    reminderDates: delivery.channel === "whatsapp" ? participantReminderDates(scheduledAt) : [],
  };
}

export function participantReminderDates(scheduledAt: string | null) {
  if (!scheduledAt) return [];
  const eventTime = Date.parse(scheduledAt);
  if (!Number.isFinite(eventTime)) return [];
  return PARTICIPANT_REMINDER_PRESETS.map(({ hours }) =>
    new Date(eventTime - hours * 60 * 60 * 1000).toISOString());
}

export function normaliseParticipantReminderDates(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .map((value) => new Date(value).toISOString()))]
    .slice(0, MAX_PARTICIPANT_REMINDERS);
}

export function campaignDelivery(audience: CampaignAudience | null | undefined): CampaignDelivery {
  const delivery = audience?.delivery;
  const channel = delivery?.channel === "email" ? "email" : "whatsapp";
  const scheduledAt = delivery?.scheduledAt ?? null;
  const hasSavedReminderDates = Array.isArray(delivery?.reminderDates);
  return {
    channel,
    senderEmail: delivery?.senderEmail ?? null,
    scheduledAt,
    ctaUrl: delivery?.ctaUrl ?? null,
    reminderDates: channel === "whatsapp"
      ? hasSavedReminderDates
        ? normaliseParticipantReminderDates(delivery.reminderDates)
        : participantReminderDates(scheduledAt)
      : [],
  };
}

export function emptyAudience(): CampaignAudience {
  return { ageBands: [], minAge: null, maxAge: null, topics: [], statuses: [...SAFE_STATUSES], includedLeadIds: [], excludedLeadIds: [] };
}

export function cloneAudience(audience: CampaignAudience | null | undefined): CampaignAudience {
  const clone: CampaignAudience = {
    ageBands: [...(audience?.ageBands || [])],
    minAge: audience?.minAge ?? null,
    maxAge: audience?.maxAge ?? null,
    topics: [...(audience?.topics || [])],
    statuses: audience?.statuses?.length ? [...audience.statuses] : [...SAFE_STATUSES],
    includedLeadIds: [...(audience?.includedLeadIds || [])],
    excludedLeadIds: [...(audience?.excludedLeadIds || [])],
  };
  if (audience?.delivery) clone.delivery = campaignDelivery(audience);
  return clone;
}

export function audienceSignature(audience: CampaignAudience) {
  return JSON.stringify({
    ageBands: [...(audience.ageBands || [])].sort(),
    minAge: audience.minAge ?? null,
    maxAge: audience.maxAge ?? null,
    topics: [...(audience.topics || [])].sort(),
    statuses: [...(audience.statuses || [])].sort(),
    includedLeadIds: [...(audience.includedLeadIds || [])].sort((left, right) => left - right),
    excludedLeadIds: [...(audience.excludedLeadIds || [])].sort((left, right) => left - right),
    delivery: audience.delivery ? campaignDelivery(audience) : undefined,
  });
}

export function hasAudienceRules(audience: CampaignAudience) {
  return Boolean(
    audience.topics?.length ||
    audience.ageBands?.length ||
    audience.statuses?.length ||
    (audience.minAge !== null && audience.minAge !== undefined) ||
    (audience.maxAge !== null && audience.maxAge !== undefined) ||
    audience.includedLeadIds?.length,
  );
}

export function dripDays(count: number, cap = DAILY_SEND_CAP) {
  return Math.max(1, Math.ceil(count / cap));
}

export function personaliseMessage(message: string, firstName: string) {
  return String(message || "").replace(/\{\{\s*first_name\s*\}\}/gi, firstName);
}

export function ensurePersonalisedWhatsAppGreeting(message: string) {
  const body = String(message || "").trim();
  if (/^(?:hi|hello|hey)\s+\{\{\s*first_name\s*\}\}(?:\s*[,!])?(?:\s*👋)?/i.test(body)) return body;
  return `Hi {{first_name}} 👋${body ? `\n\n${body}` : ""}`;
}

export function firstNameOf(fullName: string) {
  return String(fullName || "").trim().split(/\s+/)[0] || "there";
}

export function titleFromFile(name: string) {
  const cleaned = name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(edm|poster|final|draft|v\d+)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /codex clipboard/i.test(cleaned)) return "Hilite Investment Seminar";
  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function inferTopic(title: string, topics: WorkspaceSummary["topics"]) {
  const haystack = title.toLowerCase();
  const keywordMap = [
    ["retire", "Retirement Planning"],
    ["cpf", "CPF"],
    ["legacy", "Legacy Planning"],
    ["lpa", "LPA & LTC"],
    ["women", "Women Financial Wellness"],
    ["network", "Networking"],
    ["invest", "Investment"],
  ];
  const preferred = keywordMap.find(([keyword]) => haystack.includes(keyword))?.[1] || "Investment";
  return topics.find((topic) => topic.name === preferred)?.name || topics[0]?.name || preferred;
}

export function generateDraft(title: string, topic: string): CampaignDraft {
  return {
    title,
    subject: "You're invited: " + title,
    message:
      "Hi {{first_name}} 👋\n\nYou're invited to *" +
      title +
      "* 🎉\n\n✨ What to expect\nPractical information about " +
      topic.toLowerCase() +
      " that you can use.\n\n📌 The full date, time, venue, and price are in the poster above.\n\n✅ To attend, reply *YES*.\n🗓️ Unable to attend this event? Reply *MAYBE NEXT TIME*.\n\nHilite Team",
  };
}

export function formatCampaignMessage(value: string) {
  let normalized = String(value || "");
  // Previously saved drafts may contain more than one layer of escaped newlines.
  for (let pass = 0; pass < 3; pass += 1) {
    const next = normalized
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n");
    if (next === normalized) break;
    normalized = next;
  }

  const cleaned = normalized
    .replace(/\r\n?/g, "\n")
    .replace(/\\+\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Older AI drafts were sometimes returned as one email-like paragraph. Keep
  // short lines intact, but make dense copy easy to scan in WhatsApp.
  const formatted = cleaned
    .split(/\n{2,}/)
    .flatMap((section) => {
      const text = section.trim();
      if (!text || text.length < 160) return text ? [text] : [];

      const greeting = text.match(/^(Hi\s+\{\{first_name\}\}[,!]?)\s+(.+)$/i);
      const body = greeting?.[2] || text;
      const sentences = body
        .split(/(?<=[.!?])\s+(?=[A-Z])/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);

      return greeting ? [greeting[1], ...sentences] : sentences;
    })
    .join("\n\n");
  return ensurePersonalisedWhatsAppGreeting(formatted);
}

export function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function validatePosterFile(file: File): string | null {
  if (!ACCEPTED_POSTER_TYPES.includes(file.type)) return "Upload a PNG, JPEG, WebP, GIF, or PDF poster.";
  if (file.size > MAX_POSTER_BYTES) return "The poster must be 50 MB or smaller.";
  return null;
}
