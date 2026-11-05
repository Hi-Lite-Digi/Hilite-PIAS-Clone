import { useState } from "react";
import { Copy, LockKeyhole, RefreshCw, SendHorizontal } from "lucide-react";
import { Button, Card, ConfirmDialog, StatusPill } from "../components/system";
import definition from "../../../config/pias-clone-demo-template.json";
import posterUrl from "../../../assets/demo/cpf-webinar-poster.png";
import { Link } from "react-router";
import { useMetaTest } from "./MetaTestContext";

type Connection = { ready: boolean; sender: string; senderStatus: string; template: string; templateStatus: string; requirements: string[] };
const inputClass = "mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

export default function MetaWhatsAppTestPanel() {
  const { operatorKey, setOperatorKey } = useMetaTest();
  const [recipient, setRecipient] = useState("");
  const [firstName, setFirstName] = useState("");
  const [consented, setConsented] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState<"check" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const body = definition.components.find(component => component.type === "BODY")?.text || "";

  async function request(action: "status" | "send") {
    const response = await fetch("/api/meta-whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${operatorKey.trim()}` },
      body: JSON.stringify(action === "status" ? { action } : { action, recipient, firstName, confirmed: consented }),
    }).catch(() => { throw new Error(action === "send" ? "Delivery was not confirmed. Check WhatsApp before trying again." : "Hilite could not be reached. Please check the connection again."); });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "The connection could not be checked. Please try again.");
    return result;
  }

  async function check() {
    setBusy("check"); setError(null); setConnection(null);
    try { setConnection(await request("status")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The connection could not be checked."); }
    finally { setBusy(null); }
  }

  async function copyKey() {
    try { await navigator.clipboard.writeText(operatorKey.trim()); setKeyCopied(true); }
    catch { setError("Your browser could not copy the key. Select the key and copy it manually."); }
  }

  async function send() {
    setConfirmOpen(false); setBusy("send"); setError(null); setAccepted(false);
    try {
      const result = await request("send");
      if (result.accepted !== true) throw new Error("Delivery was not confirmed. Check WhatsApp before trying again.");
      setAccepted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delivery was not confirmed. Check WhatsApp before trying again.");
    } finally { setBusy(null); }
  }

  return (
    <Card id="whatsapp-test" title="WhatsApp test · Hi-Hunt" action={<StatusPill label={connection?.ready ? "Ready" : "Locked"} status={connection?.ready ? "done" : "paused"} />}>
      <p className="mb-5 text-label text-ink-2">Send the approved CPF image template from the new number ending 4289.</p>
      <p className="mb-5 text-label"><Link className="underline underline-offset-4" to="/reengage/leads">Add a private lead</Link>, then <Link className="underline underline-offset-4" to="/reengage/campaigns">create a one-person test campaign</Link>.</p>
      <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (connection?.ready && consented && !busy) setConfirmOpen(true); }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-label font-medium text-ink-2" htmlFor="meta-operator-key"><span className="inline-flex items-center gap-2"><LockKeyhole aria-hidden="true" className="size-4" />Private test key</span><input autoComplete="off" className={inputClass} disabled={Boolean(busy)} id="meta-operator-key" onChange={event => { setOperatorKey(event.target.value); setConnection(null); setError(null); setKeyCopied(false); }} required type="password" value={operatorKey} /></label>
          <Button disabled={!operatorKey.trim() || Boolean(busy)} onClick={() => void copyKey()} size="lg" type="button" variant="secondary"><Copy aria-hidden="true" className="size-4" />{keyCopied ? "Copied" : "Copy key"}</Button>
          <Button disabled={!operatorKey.trim() || Boolean(busy)} loading={busy === "check"} onClick={() => void check()} size="lg" type="button" variant="secondary"><RefreshCw aria-hidden="true" className="size-4" />Check bot</Button>
        </div>
        {connection && <div aria-live="polite" className="rounded-control bg-surface-2 p-4 text-label text-ink-2"><p>Number: {connection.senderStatus} · Template: {connection.templateStatus}</p>{connection.requirements.length > 0 && <ul className="mt-2 list-inside list-disc space-y-1">{connection.requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul>}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-label font-medium text-ink-2" htmlFor="meta-test-recipient">Recipient number<input autoComplete="tel" className={inputClass} disabled={Boolean(busy)} id="meta-test-recipient" onChange={event => { setRecipient(event.target.value); setAccepted(false); }} placeholder="+65 …" required type="tel" value={recipient} /></label>
          <label className="text-label font-medium text-ink-2" htmlFor="meta-test-name">First name<input autoComplete="given-name" className={inputClass} disabled={Boolean(busy)} id="meta-test-name" maxLength={80} onChange={event => { setFirstName(event.target.value); setAccepted(false); }} required type="text" value={firstName} /></label>
        </div>
        <details className="rounded-control border border-line bg-surface-2 p-4">
          <summary className="cursor-pointer text-label font-medium text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Preview CPF invitation</summary>
          <div className="mt-4 space-y-4">
            <a className="inline-block rounded-control outline-none focus-visible:ring-3 focus-visible:ring-ring/50" href={posterUrl} rel="noreferrer" target="_blank">
              <img alt="CPF Changes 2026 webinar poster, 29 October, 7–9:30 pm" className="max-h-80 max-w-full rounded-control object-contain" loading="lazy" src={posterUrl} />
            </a>
            <p className="whitespace-pre-line text-label text-ink">{body.replace("{{1}}", firstName.trim() || "{{1}}")}</p>
            <p className="text-chip text-ink-2">{definition.components.find(component => component.type === "FOOTER")?.text}</p>
            <p className="text-label font-medium text-ink">Attending · Maybe next time · Unsubscribe</p>
          </div>
        </details>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-label text-ink-2"><input checked={consented} className="mt-0.5 size-5 shrink-0 accent-ink focus-visible:ring-3 focus-visible:ring-ring/50" disabled={Boolean(busy)} onChange={event => setConsented(event.target.checked)} required type="checkbox" /><span>This recipient agreed to receive this test message.</span></label>
        {error && <p className="text-label text-danger" role="alert">{error}</p>}
        {accepted && <p className="text-label text-ink" role="status">Accepted by Meta. Check the recipient’s WhatsApp to confirm delivery.</p>}
        <Button disabled={!connection?.ready || !consented || Boolean(busy)} loading={busy === "send"} size="lg" type="submit"><SendHorizontal aria-hidden="true" className="size-4" />Send one test message</Button>
      </form>
      <ConfirmDialog confirmLabel="Send test message" description={`Send the CPF invitation and poster to ${recipient} as ${firstName}? This is one real WhatsApp message. Meta messaging charges may apply.`} onConfirm={() => void send()} onOpenChange={setConfirmOpen} open={confirmOpen} pending={busy === "send"} title="Send this WhatsApp test?" />
    </Card>
  );
}
