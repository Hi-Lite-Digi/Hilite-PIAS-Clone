import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type TestConnection = { ready: boolean; senderStatus: string; templateStatus: string; requirements: string[] };
type TestAccess = {
  operatorKey: string;
  setOperatorKey: (key: string) => void;
  authenticated: boolean;
  checking: boolean;
  sessionError: string;
  refreshSession: () => Promise<void>;
  login: (key: string) => Promise<void>;
  logout: () => Promise<void>;
  request: <T>(action: string, input?: Record<string, unknown>) => Promise<T>;
};
const Context = createContext<TestAccess | null>(null);

export function MetaTestProvider({ children }: { children: ReactNode }) {
  const [operatorKey, setOperatorKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const request = useCallback(async <T,>(action: string, input: Record<string, unknown> = {}): Promise<T> => {
    const response = await fetch("/api/meta-whatsapp", {
      method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { "content-type": "application/json", ...(operatorKey.trim() ? { authorization: `Bearer ${operatorKey.trim()}` } : {}) },
      body: JSON.stringify({ ...input, action }),
    }).catch(() => { throw new Error(action === "send_campaign" || action === "send"
      ? "Delivery was not confirmed. Check the recipient's WhatsApp before trying another test."
      : "Hilite could not be reached. Check your connection and try again."); });
    const result = await response.json().catch(() => null);
    if (response.status === 401) setAuthenticated(false);
    if (!response.ok) throw new Error(result?.error || "Hilite could not complete this request. Try again.");
    return result as T;
  }, [operatorKey]);
  const refreshSession = useCallback(async () => {
    setChecking(true); setSessionError("");
    try {
      const response = await fetch("/api/meta-whatsapp", {
        method: "POST", cache: "no-store", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "session" }),
      });
      if (!response.ok && response.status !== 401) throw new Error("Your workspace could not be reached. Try again.");
      setAuthenticated(response.ok);
    } catch (cause) { setSessionError(cause instanceof Error ? cause.message : "Your workspace could not be reached. Try again."); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => { if (import.meta.env.VITE_DEMO_MODE === "true") void refreshSession(); else setChecking(false); }, [refreshSession]);
  useEffect(() => {
    const expired = () => setAuthenticated(false);
    window.addEventListener("hilite-session-expired", expired);
    return () => window.removeEventListener("hilite-session-expired", expired);
  }, []);
  const login = useCallback(async (key: string) => {
    const response = await fetch("/api/meta-whatsapp", {
      method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { "content-type": "application/json", authorization: `Bearer ${key.trim()}` }, body: JSON.stringify({ action: "login" }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Sign-in failed. Try again.");
    setOperatorKey(""); setAuthenticated(true); setSessionError("");
  }, []);
  const logout = useCallback(async () => { await request("logout"); setOperatorKey(""); setAuthenticated(false); }, [request]);
  const value = useMemo(() => ({ operatorKey, setOperatorKey, authenticated, checking, sessionError, refreshSession, login, logout, request }), [operatorKey, authenticated, checking, sessionError, refreshSession, login, logout, request]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMetaTest() {
  const value = useContext(Context);
  if (!value) throw new Error("Private tests require the app's test access provider.");
  return value;
}
