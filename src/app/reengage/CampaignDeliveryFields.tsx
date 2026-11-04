import { CalendarClock, FileText, Link2, Mail, MessageCircle, Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { CampaignDelivery, EmailSenderStatus } from "../../lib/api";
import { MAX_PARTICIPANT_REMINDERS, participantReminderDates } from "../../lib/campaign";
import { StatusPill } from "../components/system";

type CampaignDeliveryFieldsProps = {
  delivery: CampaignDelivery;
  emailSender: EmailSenderStatus | null;
  loadingSender: boolean;
  onChange: (delivery: CampaignDelivery) => void;
  posterName: string | null;
};

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function reminderTimingLabel(reminderAt: string, scheduledAt: string | null) {
  if (!scheduledAt) return "Before the event";
  const differenceMinutes = Math.round((Date.parse(scheduledAt) - Date.parse(reminderAt)) / 60_000);
  if (!Number.isFinite(differenceMinutes) || differenceMinutes <= 0) return "Must be before the event";
  if (differenceMinutes % (24 * 60) === 0) {
    const days = differenceMinutes / (24 * 60);
    return `${days} day${days === 1 ? "" : "s"} before the event`;
  }
  if (differenceMinutes % 60 === 0) {
    const hours = differenceMinutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"} before the event`;
  }
  return `${differenceMinutes} minutes before the event`;
}

function CampaignDeliveryFields({ delivery, emailSender, loadingSender, onChange, posterName }: CampaignDeliveryFieldsProps) {
  const campaignDateHasPassed = delivery.scheduledAt !== null && Date.parse(delivery.scheduledAt) <= Date.now();
  const setChannel = (channel: CampaignDelivery["channel"]) => onChange({
    ...delivery,
    channel,
    senderEmail: channel === "email" ? emailSender?.address ?? delivery.senderEmail ?? null : null,
    reminderDates: channel === "whatsapp" ? participantReminderDates(delivery.scheduledAt) : [],
  });
  const setScheduledAt = (value: string) => {
    const scheduledAt = isoDateTime(value);
    onChange({
      ...delivery,
      scheduledAt,
      reminderDates: delivery.channel === "whatsapp" ? participantReminderDates(scheduledAt) : [],
    });
  };
  const setReminderAt = (index: number, value: string) => {
    const reminderAt = isoDateTime(value);
    const reminderDates = [...delivery.reminderDates];
    if (reminderAt) reminderDates[index] = reminderAt;
    else reminderDates.splice(index, 1);
    onChange({ ...delivery, reminderDates });
  };
  const removeReminder = (index: number) => onChange({
    ...delivery,
    reminderDates: delivery.reminderDates.filter((_, reminderIndex) => reminderIndex !== index),
  });
  const addReminder = () => {
    if (!delivery.scheduledAt || delivery.reminderDates.length >= MAX_PARTICIPANT_REMINDERS) return;
    const existing = new Set(delivery.reminderDates);
    const reminderAt = participantReminderDates(delivery.scheduledAt).find((value) => !existing.has(value))
      ?? new Date(Date.parse(delivery.scheduledAt) - 60 * 60 * 1000).toISOString();
    onChange({ ...delivery, reminderDates: [...delivery.reminderDates, reminderAt] });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-label font-medium text-ink-2">Delivery channel</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <button aria-pressed={delivery.channel === "whatsapp"} className={`flex min-h-20 items-center gap-3 rounded-card border p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${delivery.channel === "whatsapp" ? "border-ink bg-mint" : "border-line bg-surface-2"}`} onClick={() => setChannel("whatsapp")} type="button"><MessageCircle aria-hidden="true" className="size-5" /><span><strong className="block text-body text-ink">WhatsApp</strong><span className="text-label text-ink-2">Send through the paired Hermes account</span></span></button>
        </div>
      </div>

      {delivery.channel === "email" && (
        <>
          <div className="rounded-card border border-line bg-surface-2 p-4">
            <div className="flex items-start gap-3"><Mail aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-body font-medium text-ink">Connected Gmail sender</p><StatusPill label={loadingSender ? "Checking" : emailSender?.configured ? "Ready" : "Needs setup"} status={loadingSender ? "queued" : emailSender?.configured ? "done" : "error"} /></div>{loadingSender ? <p className="mt-1 text-label text-ink-2">Checking Gmail…</p> : <>{emailSender?.address && <p className="mt-1 break-all text-label text-ink-2">{emailSender.address}</p>}{emailSender?.requirement && <p className="mt-1 text-label text-danger">{emailSender.requirement}</p>}{!emailSender?.address && !emailSender?.requirement && <p className="mt-1 text-label text-ink-2">Connect Gmail under RE-engage Settings.</p>}</>}</div></div>
          </div>

          {posterName && <div className="flex items-center gap-3 rounded-control bg-surface-2 p-4"><FileText aria-hidden="true" className="size-5" /><div><p className="text-label font-medium text-ink">Email attachment</p><p className="text-chip text-ink-2">{posterName.toLowerCase().endsWith(".pdf") ? `${posterName} will be attached to the email.` : `${posterName} remains the campaign creative. Upload a PDF to send it as an email attachment.`}</p></div></div>}
        </>
      )}

      {delivery.channel === "whatsapp" && (
        <div className={`flex items-center gap-3 rounded-control p-4 ${posterName ? "bg-mint" : "border border-warning/30 bg-warning/10"}`}>
          <FileText aria-hidden="true" className="size-5 shrink-0" />
          <div>
            <p className="text-label font-medium text-ink">WhatsApp poster attachment</p>
            <p className="text-chip text-ink-2">{posterName
              ? `${posterName} will be attached to the initial WhatsApp and every automatic participant reminder.`
              : "No poster is selected. Upload one if every WhatsApp and reminder should include the event creative."}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-label font-medium text-ink-2"><span className="flex items-center gap-2"><CalendarClock aria-hidden="true" className="size-4" />Campaign date & time</span><input className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40" min={localDateTime(new Date().toISOString())} onChange={(event) => setScheduledAt(event.target.value)} type="datetime-local" value={localDateTime(delivery.scheduledAt)} /><span className={`mt-1 block text-chip font-normal ${campaignDateHasPassed ? "text-danger" : ""}`}>{campaignDateHasPassed ? "This poster date has passed. Update it before continuing." : delivery.channel === "email" ? "Future email sends stay locked until this time." : "This event time controls the participant reminders below."}</span></label>
        <label className="text-label font-medium text-ink-2"><span className="flex items-center gap-2"><Link2 aria-hidden="true" className="size-4" />Zoom / CTA link</span><input className="mt-2 h-11 w-full rounded-control border border-line bg-surface-2 px-3 text-body text-ink outline-none focus:ring-3 focus:ring-ring/40" onChange={(event) => onChange({ ...delivery, ctaUrl: event.target.value.trim() || null })} placeholder="https://zoom.us/j/..." type="url" value={delivery.ctaUrl ?? ""} /><span className="mt-1 block text-chip font-normal">The link is appended clearly to every {delivery.channel === "email" ? "email" : "WhatsApp message"}.</span></label>
      </div>

      {delivery.channel === "whatsapp" && <p className="rounded-control border border-line bg-mint/60 p-3 text-chip leading-5 text-ink-2" role="note"><strong className="font-medium text-ink">Three response choices:</strong> reply <strong>YES</strong> to attend, reply <strong>MAYBE NEXT TIME</strong> when unable to attend, or reply <strong>UNSUBSCRIBE</strong> to opt out.</p>}

      <p className="flex items-start gap-2 rounded-control border border-line bg-surface-2 p-3 text-chip leading-5 text-ink-2" role="note">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        Every delivered WhatsApp campaign and reminder includes “Reply ‘Unsubscribe’ to stop receiving updates.” That reply marks the lead unsubscribed in Supabase and excludes them from future sends and reminders.
      </p>

      {delivery.channel === "whatsapp" && (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-label font-medium text-ink-2">Participant WhatsApp reminders</p><p className="mt-1 text-chip text-ink-2">Choose up to three times. Each reminder goes only to subscribed recipients who received the campaign, with the poster and CTA included.</p></div>
            <button className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-chip font-medium text-ink outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40" disabled={!delivery.scheduledAt || delivery.reminderDates.length >= MAX_PARTICIPANT_REMINDERS} onClick={addReminder} type="button"><Plus aria-hidden="true" className="size-4" />Add reminder</button>
          </div>
          {delivery.scheduledAt ? (
            delivery.reminderDates.length > 0 ? <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {delivery.reminderDates.map((reminderAt, index) => (
                <div className="rounded-control border border-line bg-surface-2 p-3" key={`${index}-${reminderAt}`}>
                  <div className="flex items-center justify-between gap-2"><label className="text-chip font-medium uppercase tracking-wide text-ink-2" htmlFor={`participant-reminder-${index}`}>Reminder {index + 1}</label><button aria-label={`Remove reminder ${index + 1}`} className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 outline-none hover:bg-danger/10 hover:text-danger focus-visible:ring-3 focus-visible:ring-ring/50" onClick={() => removeReminder(index)} type="button"><Trash2 aria-hidden="true" className="size-4" /></button></div>
                  <input className="mt-2 h-10 w-full rounded-control border border-line bg-surface px-2 text-label tabular-nums text-ink outline-none focus:ring-3 focus:ring-ring/40" id={`participant-reminder-${index}`} max={localDateTime(delivery.scheduledAt)} min={localDateTime(new Date().toISOString())} onChange={(event) => setReminderAt(index, event.target.value)} type="datetime-local" value={localDateTime(reminderAt)} />
                  <p className="mt-2 text-chip text-ink-2">{reminderTimingLabel(reminderAt, delivery.scheduledAt)}</p>
                </div>
              ))}
            </div> : <div className="mt-3 rounded-control border border-dashed border-line bg-surface-2 p-4 text-label text-ink-2">No reminders selected. Use “Add reminder” if you want automatic WhatsApp reminders for this event.</div>
          ) : (
            <div className="mt-3 rounded-control border border-dashed border-line bg-surface-2 p-4 text-label text-ink-2">Choose the campaign date and time first, then pick up to three reminder times.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default CampaignDeliveryFields;
