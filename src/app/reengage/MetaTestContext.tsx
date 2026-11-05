import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type TestLead = { id: string; name: string; phone: string; consented: boolean; created_at?: string };
export type TestCampaign = { id: string; title: string; lead_id: string; status: "draft" | "sending" | "accepted" | "failed" | "unknown"; lead: TestLead; created_at: string; meta_message_id?: string };
export type TestConnection = { ready: boolean; senderStatus: string; templateStatus: string; requirements: string[] };
type TestAccess = {
  operatorKey: string;
  setOperatorKey: (key: string) => void;
  request: <T>(action: string, input?: Record<string, unknown>) => Promise<T>;
};
const Context = createContext<TestAccess | null>(null);

export function MetaTestProvider({ children }: { children: ReactNode }) {
  // Tab memory only. Navigation between Leads, Campaigns and Settings keeps the
  // key; reload, locking or closing the tab clears it. Never put it in a URL.
  const [operatorKey, setOperatorKey] = useState("");
  const request = useCallback(async <T,>(action: string, input: Record<string, unknown> = {}): Promise<T> => {
    if (!operatorKey.trim()) throw new Error("Enter your private test key to continue.");
    const response = await fetch("/api/meta-whatsapp", {
      method: "POST", cache: "no-store",
      headers: { "content-type": "application/json", authorization: `Bearer ${operatorKey.trim()}` },
      body: JSON.stringify({ ...input, action }),
    }).catch(() => { throw new Error(action === "send_campaign" || action === "send"
      ? "Delivery was not confirmed. Check the recipient's WhatsApp before trying another test."
      : "Hilite could not be reached. Check your connection and try again."); });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "The private test request failed. Refresh the page and try again.");
    return result as T;
  }, [operatorKey]);
  const value = useMemo(() => ({ operatorKey, setOperatorKey, request }), [operatorKey, request]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMetaTest() {
  const value = useContext(Context);
  if (!value) throw new Error("Private tests require the app's test access provider.");
  return value;
}
