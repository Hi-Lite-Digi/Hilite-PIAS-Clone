import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { handleWorkspaceSession, requireWorkspaceAccess } from "../../worker/workspace-session.js";
import { handleApiRequest } from "../../worker/supabase-api.js";

const key = "test-only-workspace-key-at-least-32-characters";
const env = { DEMO_MODE: "true", META_TEST_OPERATOR_TOKEN: key };
const req = (headers: Record<string, string> = {}) => new Request("https://hilite.example/api/meta-whatsapp", { method: "POST", headers: { origin: "https://hilite.example", ...headers } });
function sessionStore() {
  const rows = new Map<string, { token_hash: string; credential_tag: string; expires_at: string }>();
  return { rows, create: async (row: { token_hash: string; credential_tag: string; expires_at: string }) => { rows.set(row.token_hash, row); }, find: async (hash: string) => rows.get(hash), remove: async (hash: string) => { rows.delete(hash); } };
}

test("workspace sign-in creates a persistent HttpOnly session without disclosing or storing raw credentials", async () => {
  const store = sessionStore();
  const response = await handleWorkspaceSession(req({ authorization: `Bearer ${key}` }), env, "login", store);
  const cookie = response.headers.get("set-cookie")!;
  assert.match(cookie, /Secure; HttpOnly; SameSite=Strict/);
  assert.match(cookie, /Max-Age=2592000/);
  assert.ok(!cookie.includes(key));
  const safeBody = await response.text();
  const token = cookie.split(";")[0].split("=")[1];
  assert.ok(!safeBody.includes(key) && !safeBody.includes(token));
  assert.ok(!JSON.stringify([...store.rows.values()]).includes(token));
  assert.ok(store.rows.has(createHash("sha256").update(token).digest("hex")));
  // A fresh request has no React state or Authorization header after a refresh.
  const refreshed = req({ cookie: cookie.split(";")[0] });
  await requireWorkspaceAccess(refreshed, env, store);
  assert.equal((await handleWorkspaceSession(refreshed, env, "session", store)).status, 200);
  const logout = await handleWorkspaceSession(refreshed, env, "logout", store);
  assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
  await assert.rejects(requireWorkspaceAccess(refreshed, env, store), { status: 401 });
});

test("expired, fabricated and revoked browser sessions cannot read the workspace", async () => {
  const store = sessionStore();
  await assert.rejects(handleWorkspaceSession(req({ authorization: "Bearer wrong" }), env, "login", store), { status: 401 });
  assert.equal(store.rows.size, 0);
  const response = await handleWorkspaceSession(req({ authorization: `Bearer ${key}` }), env, "login", store);
  const request = req({ cookie: response.headers.get("set-cookie")!.split(";")[0] });
  await assert.rejects(requireWorkspaceAccess(request, { ...env, META_TEST_OPERATOR_TOKEN: `${key}-rotated` }, store), { status: 401 });
  for (const session of store.rows.values()) session.expires_at = "2000-01-01T00:00:00Z";
  await assert.rejects(requireWorkspaceAccess(request, env, store), { status: 401 });
  await assert.rejects(requireWorkspaceAccess(req({ cookie: `__Host-hilite_workspace=${"a".repeat(43)}` }), env, store), { status: 401 });
  await assert.rejects(handleWorkspaceSession(req({ authorization: `Bearer ${key}`, origin: "https://elsewhere.example" }), env, "login", store), { status: 403 });
});

test("normal data reads, lead writes and campaign mutations require workspace authorization before database access", async () => {
  for (const [path, method] of [["leads", "GET"], ["leads", "POST"], ["summary", "GET"], ["campaigns", "GET"], ["campaigns", "POST"], ["threads", "GET"], ["email-threads", "GET"]]) {
    const response = await handleApiRequest(new Request(`https://hilite.example/api/${path}`, { method }), env);
    assert.equal(response.status, 401, `${method} ${path}`);
  }
  assert.equal((await handleApiRequest(new Request("https://hilite.example/api/leads"), { DEMO_MODE: "true" })).status, 503);
});

test("normal lead searches preserve full email addresses and quote filter punctuation", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const search of ["demo.contact@example.test", 'Doe, Jane (CPF) "Advisor"']) {
      let upstreamFilter = "";
      globalThis.fetch = (async input => {
        upstreamFilter = new URL(String(input)).searchParams.get("or") || "";
        return new Response("[]", { headers: { "content-range": "*/0", "content-type": "application/json" } });
      }) as typeof fetch;
      const url = new URL("https://hilite.example/api/leads");
      url.searchParams.set("search", search);
      const response = await handleApiRequest(new Request(url, { headers: { authorization: `Bearer ${key}` } }), { ...env, SUPABASE_URL: "https://demo-project.supabase.co", SUPABASE_SECRET_KEY: "test-only" });
      assert.equal(response.status, 200);
      const encodedPattern = JSON.stringify(`*${search}*`);
      assert.ok(upstreamFilter.includes(`email.ilike.${encodedPattern}`));
      assert.ok(upstreamFilter.includes(`name.ilike.${encodedPattern}`));
    }
  } finally { globalThis.fetch = originalFetch; }
});
