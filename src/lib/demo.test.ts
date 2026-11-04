import assert from "node:assert/strict";
import test from "node:test";
import { handleApiRequest } from "../../worker/supabase-api.js";

test("demo mode blocks every external delivery route even when real provider credentials exist", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    throw new Error("Demo must not contact an external provider");
  }) as typeof fetch;
  try {
    const paths = [
      "/api/campaigns/a0000000-0000-4000-8000-000000000001/send-whatsapp",
      "/api/campaigns/a0000000-0000-4000-8000-000000000001/send-email",
      "/api/hr-campaigns/d0000000-0000-4000-8000-000000000001/send",
      "/api/send-queue/approve-batch",
      "/api/replies/1/send",
      "/api/email-threads/demo-email-1/reply",
      "/api/hr-discovery",
      "/api/integrations/whatsapp/inbound",
    ];
    for (const path of paths) {
      const response = await handleApiRequest(new Request(`https://demo.example${path}`, { method: "POST", body: "{}" }), {
        DEMO_MODE: "true", GMAIL_REFRESH_TOKEN: "accidentally-configured", HERMES_RELAY_URL: "https://relay.example", HERMES_RELAY_TOKEN: "accidentally-configured",
      });
      assert.equal(response.status, 403, path);
      assert.match((await response.json()).error, /Sending is disabled in this demo/);
    }
    for (const path of ["/api/cron/campaign-sends", "/api/cron/campaign-reminders", "/api/cron/hr-discovery"]) {
      const response = await handleApiRequest(new Request(`https://demo.example${path}`), { DEMO_MODE: "true" });
      assert.deepEqual(await response.json(), { ok: true, demo: true, skipped: true });
    }
    assert.deepEqual(requests, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("demo email inbox reads the seeded database instead of connecting to Gmail", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const thread = { id: "demo-email-1", subject: "Team wellness", unread: true, messages: [{ body: "Could you send the outline?" }] };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    assert.ok(url.startsWith("https://demo-project.supabase.co/rest/v1/demo_email_threads?"));
    return new Response(JSON.stringify([{ payload: thread }]), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const env = { DEMO_MODE: "true", SUPABASE_URL: "https://demo-project.supabase.co", SUPABASE_SECRET_KEY: "test-only" };
    const listing = await handleApiRequest(new Request("https://demo.example/api/email-threads"), env);
    assert.deepEqual(await listing.json(), { data: [{ id: thread.id, subject: thread.subject, unread: true }], total: 1, unread: 1 });
    const detail = await handleApiRequest(new Request("https://demo.example/api/email-threads/demo-email-1"), env);
    assert.deepEqual(await detail.json(), { data: thread });
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
