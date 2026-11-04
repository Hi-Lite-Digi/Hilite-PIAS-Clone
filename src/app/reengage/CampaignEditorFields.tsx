import { useRef, useState } from "react";
import { FileText, Link2, X } from "lucide-react";
import { ensurePersonalisedWhatsAppGreeting, personaliseMessage, type CampaignDraft } from "../../lib/campaign";

type CampaignEditorFieldsProps = {
  channel?: "whatsapp" | "email";
  draft: CampaignDraft;
  posterPreviewUrl: string | null;
  posterMimeType: string | null;
  posterName: string | null;
  onChange: (next: Partial<CampaignDraft>) => void;
  readOnly?: boolean;
};

const FIELD_CLASS =
  "mt-1.5 w-full rounded-control border border-line bg-surface-2 px-3.5 text-body text-ink outline-none placeholder:text-ink-3 focus:ring-3 focus:ring-ring/40";

export default function CampaignEditorFields({ channel = "whatsapp", draft, onChange, posterMimeType, posterName, posterPreviewUrl, readOnly = false }: CampaignEditorFieldsProps) {
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const linkComposerOpenRef = useRef(false);
  const [linkRange, setLinkRange] = useState({ start: 0, end: 0 });
  const [linkLabel, setLinkLabel] = useState("YES");
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkComposer, setShowLinkComposer] = useState(false);
  const [linkError, setLinkError] = useState("");

  const openLinkComposer = () => {
    const field = messageRef.current;
    const start = field?.selectionStart ?? draft.message.length;
    const end = field?.selectionEnd ?? start;
    const selected = draft.message.slice(start, end).trim();
    linkComposerOpenRef.current = true;
    setLinkRange({ start, end });
    setLinkLabel(selected || "YES");
    setLinkUrl("");
    setLinkError("");
    setShowLinkComposer(true);
  };

  const closeLinkComposer = () => {
    linkComposerOpenRef.current = false;
    setShowLinkComposer(false);
    setLinkError("");
    requestAnimationFrame(() => messageRef.current?.focus());
  };

  const insertLink = () => {
    const label = linkLabel.trim();
    let url: URL;
    try {
      url = new URL(linkUrl.trim());
      if (url.protocol !== "https:") throw new Error();
    } catch {
      setLinkError("Enter a complete HTTPS link.");
      return;
    }
    if (!label) {
      setLinkError("Enter the words that should introduce the link.");
      return;
    }
    const start = Math.min(linkRange.start, draft.message.length);
    const end = Math.min(Math.max(start, linkRange.end), draft.message.length);
    const inserted = `${label}: ${url.toString()}`;
    const next = `${draft.message.slice(0, start)}${inserted}${draft.message.slice(end)}`;
    onChange({ message: next });
    linkComposerOpenRef.current = false;
    setShowLinkComposer(false);
    setLinkError("");
    requestAnimationFrame(() => {
      const field = messageRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <label className="block text-label font-medium text-ink">Campaign name
          <input className={`${FIELD_CLASS} h-11`} disabled={readOnly} onChange={(event) => onChange({ title: event.target.value })} value={draft.title} />
        </label>
        <label className="block text-label font-medium text-ink">Internal label
          <input className={`${FIELD_CLASS} h-11`} disabled={readOnly} onChange={(event) => onChange({ subject: event.target.value })} value={draft.subject} />
        </label>
        <label className="block text-label font-medium text-ink">{channel === "email" ? "Email message" : "WhatsApp message"}
          <textarea ref={messageRef} className={`${FIELD_CLASS} min-h-64 resize-y py-3 leading-6`} disabled={readOnly} onBlur={() => { if (channel === "whatsapp" && !linkComposerOpenRef.current) onChange({ message: ensurePersonalisedWhatsAppGreeting(draft.message) }); }} onChange={(event) => onChange({ message: event.target.value })} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openLinkComposer(); } }} rows={12} value={draft.message} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface px-3 text-label font-medium text-ink outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-45" disabled={readOnly} onClick={openLinkComposer} onMouseDown={() => { linkComposerOpenRef.current = true; }} type="button"><Link2 aria-hidden="true" className="size-4" />Add link <kbd className="rounded bg-surface-2 px-1.5 py-0.5 text-chip font-normal text-ink-2">Ctrl K</kbd></button>
          <span className="text-chip text-ink-2">WhatsApp keeps the URL visible, so links are inserted as “words: https://…”</span>
        </div>
        {showLinkComposer && (
          <div className="rounded-card border border-line bg-surface p-4" onKeyDown={(event) => { if (event.key === "Escape") closeLinkComposer(); }}>
            <div className="flex items-center justify-between gap-3"><p className="text-label font-medium text-ink">Insert a message link</p><button aria-label="Close link editor" className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50" onClick={closeLinkComposer} type="button"><X aria-hidden="true" className="size-4" /></button></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(8rem,0.55fr)_minmax(12rem,1fr)_auto] sm:items-end">
              <label className="text-label font-medium text-ink-2">Words<input autoFocus className={`${FIELD_CLASS} h-11`} onChange={(event) => { setLinkLabel(event.target.value); setLinkError(""); }} placeholder="YES" value={linkLabel} /></label>
              <label className="text-label font-medium text-ink-2">HTTPS link<input className={`${FIELD_CLASS} h-11`} onChange={(event) => { setLinkUrl(event.target.value); setLinkError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); insertLink(); } }} placeholder="https://example.com" type="url" value={linkUrl} /></label>
              <button className="h-11 rounded-full bg-ink px-5 text-label font-medium text-surface outline-none hover:bg-ink/90 focus-visible:ring-3 focus-visible:ring-ring/50" onClick={insertLink} type="button">Insert</button>
            </div>
            {linkError && <p className="mt-2 text-label text-danger" role="alert">{linkError}</p>}
          </div>
        )}
        <p className="text-label text-ink-2"><code className="rounded-control bg-surface-2 px-1.5 py-1 text-chip text-ink">{"{{first_name}}"}</code> becomes each recipient's first name.{channel === "whatsapp" ? " A personalized greeting is added automatically. Wrap text in *asterisks* for WhatsApp bold." : " The internal label becomes the client-facing email subject."}</p>
      </div>

      <aside aria-label="Recipient preview">
        <p className="text-label font-medium text-ink-2">Recipient preview</p>
        <div className="mt-2 rounded-card bg-surface-2 p-3.5">
          <div className="ml-auto max-w-[17rem] rounded-control bg-mint px-3 py-3 shadow-sm">
            {posterPreviewUrl && posterMimeType !== "application/pdf" && <img alt={posterName || "Campaign poster"} className="mb-3 w-full rounded-control" src={posterPreviewUrl} />}
            {posterName && (posterMimeType === "application/pdf" || !posterPreviewUrl) && (
              <div className="mb-3 flex items-center gap-2 rounded-control bg-surface/70 px-3 py-2 text-chip font-medium text-ink-2"><FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />{posterName}</div>
            )}
            <p className="whitespace-pre-wrap text-body leading-5 text-ink">{renderWhatsAppBold(personaliseMessage(channel === "whatsapp" ? ensurePersonalisedWhatsAppGreeting(draft.message) : draft.message, "Sarah"))}</p>
            <p className="mt-2 text-right text-chip text-ink-2">{new Date().toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" })}</p>
          </div>
        </div>
        <p className="mt-2 text-label text-ink-2">Previewed as Sarah. {posterName ? channel === "email" && posterName.toLowerCase().endsWith(".pdf") ? "The PDF is attached to every email." : "The poster is attached to every message." : "No attachment is selected."}</p>
      </aside>
    </div>
  );
}

function renderWhatsAppBold(text: string) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, index) =>
    part.startsWith("*") && part.endsWith("*") && part.length > 2
      ? <strong key={index}>{part.slice(1, -1)}</strong>
      : <span key={index}>{part}</span>,
  );
}

export { renderWhatsAppBold };
