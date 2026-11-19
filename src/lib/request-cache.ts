type Snapshot = { body: string; headers: [string, string][]; status: number; savedAt: number; ttl: number };
const MAX_ENTRIES = 80;
const MAX_BYTES = 8 * 1024 * 1024;

export function createRequestCache(fetcher: typeof fetch, now = Date.now) {
  const values = new Map<string, Snapshot>();
  const pending = new Map<string, Promise<Snapshot>>();
  let generation = 0;
  const clear = () => { generation++; values.clear(); pending.clear(); };
  const options = (url: string, init: RequestInit = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const statusRead = url === "/api/meta-whatsapp" && method === "POST" && init.body === JSON.stringify({ action: "status" });
    if ((!url.startsWith("/api/") || (method !== "GET" && !statusRead)) || init.signal || init.cache === "reload" || headers.has("authorization") || headers.has("cookie") || /\/api\/(gmail|health|unsubscribe)(\/|$)/.test(url)) return null;
    const parsed = new URL(url, "https://hilite.invalid"); parsed.searchParams.sort();
    if (parsed.pathname === "/api/replies" && !parsed.search) parsed.pathname = "/api/threads";
    const key = JSON.stringify([method, parsed.pathname + parsed.search, [...headers].sort(), init.credentials || "same-origin", statusRead ? init.body : ""]);
    const ttl = statusRead ? 20_000 : /\/api\/(threads|replies)(\/|\?|$)/.test(url) ? 2_000 : /outreach-activity|\/template(?:\?|$)/.test(url) ? 3_000 : 30_000;
    return { key, ttl };
  };
  const response = (value: Snapshot) => new Response([204, 205, 304].includes(value.status) ? null : value.body, { status: value.status, headers: value.headers });
  const peek = <T,>(url: string, init?: RequestInit, maxAge = 120_000): T | undefined => {
    const config = options(url, init); const value = config && values.get(config.key);
    if (!value || now() - value.savedAt > maxAge) return undefined;
    try { return JSON.parse(value.body) as T; } catch { return undefined; }
  };
  const request = async (url: string, init: RequestInit = {}) => {
    const config = options(url, init);
    if (!config) {
      const mutation = !["GET", "HEAD"].includes((init.method || "GET").toUpperCase());
      if (mutation) clear();
      try { return await fetcher(url, { cache: "no-store", credentials: "same-origin", ...init }); }
      finally { if (mutation) clear(); }
    }
    const cached = values.get(config.key);
    if (cached && now() - cached.savedAt < cached.ttl) return response(cached);
    let work = pending.get(config.key);
    if (!work) {
      const currentGeneration = generation;
      work = (async () => {
        const result = await fetcher(url, { cache: "no-store", credentials: "same-origin", ...init });
        const body = await result.text();
        const snapshot: Snapshot = { body, headers: [...result.headers], status: result.status, savedAt: now(), ttl: config.ttl };
        if (result.status === 401) clear();
        let validJson = false;
        try { const parsed = JSON.parse(body); validJson = parsed !== null && typeof parsed === "object"; } catch { /* Do not cache invalid responses. */ }
        if (result.ok && validJson && body.length <= 2 * 1024 * 1024 && generation === currentGeneration) {
          values.delete(config.key); values.set(config.key, snapshot);
          let size = [...values.values()].reduce((sum, value) => sum + value.body.length * 2, 0);
          while (values.size > MAX_ENTRIES || size > MAX_BYTES) { const first = values.keys().next().value!; size -= values.get(first)!.body.length * 2; values.delete(first); }
        }
        return snapshot;
      })();
      pending.set(config.key, work);
      void work.finally(() => { if (pending.get(config.key) === work) pending.delete(config.key); }).catch(() => {});
    }
    return response(await work);
  };
  return { request, peek, clear };
}

const browserCache = createRequestCache((...args) => fetch(...args));
let sessionChannel: BroadcastChannel | undefined;
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  sessionChannel = new BroadcastChannel("hilite-workspace-cache");
  sessionChannel.onmessage = () => { browserCache.clear(); window.dispatchEvent(new Event("hilite-session-changed")); };
}
export function clearApiCache(announce = false) { browserCache.clear(); if (announce) sessionChannel?.postMessage("clear"); }
export function peekApiJson<T>(url: string, init?: RequestInit) { return typeof window === "undefined" ? undefined : browserCache.peek<T>(url, { headers: { "content-type": "application/json" }, ...init }); }
export async function cachedFetch(url: string, init?: RequestInit) {
  const result = typeof window === "undefined" ? await fetch(url, init) : await browserCache.request(url, init);
  if (result.status === 401 && typeof window !== "undefined") { clearApiCache(true); window.dispatchEvent(new Event("hilite-session-expired")); }
  return result;
}
