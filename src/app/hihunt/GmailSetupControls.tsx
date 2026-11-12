import { useState } from "react";
import { configureGmailClient, startGmailConnection } from "../../lib/api";
import { Button } from "../components/system";

export function GmailSetupControls({ clientConfigured, connected, onSaved }: { clientConfigured: boolean; connected: boolean; onSaved: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const callback = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("gmail");
  const messages: Record<string, string> = { connected: "Gmail connected. Sending remains paused.", expired: "The connection request expired. Connect again.", cancelled: "Google connection cancelled.", wrong_account: "Choose business@hilitedigi.ai to connect this workspace.", permission_missing: "Google did not grant the required sending access. Connect again and review the permissions.", failed: "Google connection could not finish. Check the OAuth client and try again." };
  async function saveClient() {
    if (busy) return;
    setBusy(true); setError("");
    try { await configureGmailClient(clientId, clientSecret); setClientSecret(""); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : "Google client could not be saved."); }
    finally { setBusy(false); }
  }
  async function connect() {
    if (busy) return;
    setBusy(true); setError("");
    try { const result = await startGmailConnection(); window.location.assign(result.url); }
    catch (error) { setError(error instanceof Error ? error.message : "Google connection could not start."); setBusy(false); }
  }
  return <div className="mt-4 space-y-3">
    {callback && messages[callback] && <p role="status" className="text-label text-ink-2">{messages[callback]}</p>}
    {!connected && <>
      {clientConfigured ? <Button loading={busy} onClick={() => void connect()}>Connect business@hilitedigi.ai</Button> : <details className="rounded-control border border-line p-4">
        <summary className="cursor-pointer text-label font-medium">Google connection setup</summary>
        <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void saveClient(); }}>
          <label className="block text-label font-medium">Google OAuth client ID<input required autoComplete="off" value={clientId} onChange={event => setClientId(event.target.value)} className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 focus:outline-none focus:ring-3 focus:ring-ring/40" /></label>
          <label className="block text-label font-medium">Google OAuth client secret<input required autoComplete="new-password" type="password" value={clientSecret} onChange={event => setClientSecret(event.target.value)} className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 focus:outline-none focus:ring-3 focus:ring-ring/40" /></label>
          <p className="break-all text-chip text-ink-2">Web application redirect URI: https://hilite-outreach.vercel.app/api/gmail/callback</p>
          <Button loading={busy} type="submit" disabled={!clientId.trim() || !clientSecret.trim()}>Save Google client</Button>
        </form>
      </details>}
      <p className="text-chip text-ink-2">Google will request email sending and basic account identity. Inbox access is not requested. Connecting does not send a message.</p>
    </>}
    {error && <p role="alert" className="text-label text-danger">{error}</p>}
  </div>;
}
