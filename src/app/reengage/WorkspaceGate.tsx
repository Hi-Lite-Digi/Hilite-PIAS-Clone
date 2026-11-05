import { useState, type ReactNode } from "react";
import { Button, Card } from "../components/system";
import { useMetaTest } from "./MetaTestContext";

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { authenticated, checking, sessionError, refreshSession, login } = useMetaTest();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (import.meta.env.VITE_DEMO_MODE !== "true" || authenticated) return <>{children}</>;
  return <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
    {checking ? <p role="status">Loading workspace…</p> : <Card className="w-full max-w-md" title="Sign in to Hilite">
      {sessionError ? <><p className="mb-4 text-label text-danger" role="alert">{sessionError}</p><Button onClick={() => void refreshSession()}>Try again</Button></> : <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError("");
        try { await login(key); setKey(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-in failed. Try again."); } finally { setBusy(false); }
      }}>
        <label className="block text-label font-medium" htmlFor="workspace-key">Workspace key<input autoComplete="current-password" className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" disabled={busy} id="workspace-key" name="workspace-key" onChange={event => setKey(event.target.value)} required type="password" value={key} /></label>
        <p className="text-label text-ink-2">Stay signed in on this device for 30 days.</p>
        {error && <p className="text-label text-danger" role="alert">{error}</p>}
        <Button className="w-full" loading={busy} type="submit">Sign in</Button>
      </form>}
    </Card>}
  </main>;
}
