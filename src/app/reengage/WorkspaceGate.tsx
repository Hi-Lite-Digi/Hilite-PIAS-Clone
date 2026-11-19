import { useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Card } from "../components/system";
import { useMetaTest } from "./MetaTestContext";

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { authenticated, checking, sessionError, refreshSession, login } = useMetaTest();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const usernameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (error) usernameRef.current?.focus(); }, [error]);
  if (import.meta.env.VITE_DEMO_MODE !== "true" || authenticated) return <>{children}</>;
  return <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
    {checking ? <p role="status">Loading workspace…</p> : <Card className="w-full max-w-md" title="Sign in to Hilite">
      {sessionError ? <><p className="mb-4 text-label text-danger" role="alert">{sessionError}</p><Button onClick={() => void refreshSession()}>Try again</Button></> : <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError("");
        try { await login(username, password); setPassword(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-in failed. Try again."); } finally { setBusy(false); }
      }}>
        <label className="block text-label font-medium" htmlFor="workspace-username">Username<input aria-describedby={error ? "login-error" : undefined} aria-invalid={Boolean(error)} autoCapitalize="none" autoComplete="username" className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-3 text-body outline-none focus-visible:ring-2 focus-visible:ring-ink/60" disabled={busy} id="workspace-username" maxLength={80} name="username" onChange={event => { setUsername(event.target.value); setError(""); }} ref={usernameRef} required spellCheck={false} value={username} /></label>
        <div>
          <label className="block text-label font-medium" htmlFor="workspace-password">Password</label>
          <div className="relative mt-2">
            <input aria-describedby={error ? "login-error" : undefined} aria-invalid={Boolean(error)} autoComplete="current-password" className="h-11 w-full rounded-control border border-line bg-surface pl-3 pr-12 text-body outline-none focus-visible:ring-2 focus-visible:ring-ink/60" disabled={busy} id="workspace-password" maxLength={256} name="password" onChange={event => { setPassword(event.target.value); setError(""); }} required type={showPassword ? "text" : "password"} value={password} />
            <button aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-control text-ink-2 outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50" disabled={busy} onClick={() => setShowPassword(value => !value)} type="button">{showPassword ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}</button>
          </div>
        </div>
        <p className="text-label text-ink-2">Stay signed in on this device for 30 days.</p>
        {error && <p className="text-label text-danger" id="login-error" role="alert">{error}</p>}
        <Button className="w-full" loading={busy} type="submit">Sign in</Button>
      </form>}
    </Card>}
  </main>;
}
