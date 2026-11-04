import type { AssistantLeadPreview } from "./api";

export type WhatsAppRecipient = {
  recipientName: string;
  phone: string;
};

export function normaliseWhatsAppPhone(value: string | null | undefined) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `65${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export function getWhatsAppRecipient(person: AssistantLeadPreview | undefined): WhatsAppRecipient | null {
  if (!person) return null;
  const phone = normaliseWhatsAppPhone(person.phone);
  if (!phone) return null;
  const recipientName = String(person.name || "Test contact").trim() || "Test contact";
  return { recipientName, phone };
}
