import assert from "node:assert/strict";
import test from "node:test";
import { isSampleLead, outreachActivity, projectDelivery, trackedDeliveries } from "../../worker/outreach-activity.js";

test("delivery history handles duplicates and out-of-order callbacks without downgrading receipt", () => {
  const row = { id: "row", meta_message_id: "wamid.one", status: "accepted" };
  const events = [
    { meta_message_id: "wamid.one", status: "read", event_at: "2026-11-13T02:00:00Z" },
    { meta_message_id: "wamid.one", status: "sent", event_at: "2026-11-13T01:00:00Z" },
    { meta_message_id: "wamid.one", status: "failed", event_at: "2026-11-13T03:00:00Z" },
    { meta_message_id: "wamid.other", status: "read", event_at: "2026-11-13T04:00:00Z" },
  ];
  assert.equal(projectDelivery(row, events).status, "read");
  assert.equal(projectDelivery(row, events.reverse()).status, "read");
  assert.equal(projectDelivery(row, []).status, "accepted");
});

test("real sending history authenticates before loading private records", async () => {
  let read = false;
  await assert.rejects(outreachActivity(new Request("https://hilite.example/api/outreach-activity"), {}, { authorize: async () => { throw new Error("sign in"); }, db: async () => { read = true; return []; } }), /sign in/);
  assert.equal(read, false);
});

test("real sending history joins exact receipts and shows campaign sends only once", async () => {
  const paths: string[] = [];
  const response = await outreachActivity(new Request("https://hilite.example/api/outreach-activity"), {}, { authorize: async () => {}, db: async (path: string) => {
    paths.push(path);
    if (path.startsWith("campaigns?")) return [{ id: "campaign", audience: { template: "pias_clone_cpf_webinar_image" } }];
    if (path.startsWith("meta_campaign_deliveries?")) return [{ id: "delivery", meta_message_id: "wamid.one", status: "accepted", created_at: "2026-11-13T01:00:00Z", lead: { name: "Unit Contact" } }];
    if (path.startsWith("whatsapp_messages?")) return [{ id: "duplicate", external_message_id: "wamid.one", recipient_phone: "447700900123", occurred_at: "2026-11-13T01:00:00Z" }];
    if (path.startsWith("meta_delivery_events?")) return [{ meta_message_id: "wamid.one", status: "delivered", event_at: "2026-11-13T01:00:01Z" }];
    throw new Error("unexpected path");
  } });
  const result = await response.json();
  assert.equal(result.activity.length, 1);
  assert.equal(result.activity[0].status, "delivered");
  assert(paths.some(path => path.includes("audience->>template=eq.pias_clone_cpf_webinar_image")));
  assert(!paths.some(path => /send-queue|cron/.test(path)));
});

test("receipt lookups batch message IDs without losing recipients", async () => {
  const rows = Array.from({ length: 65 }, (_, i) => ({ meta_message_id: `wamid.unit${i}`, status: "accepted" }));
  let calls = 0;
  const result = await trackedDeliveries(async () => { calls++; return []; }, rows);
  assert.equal(calls, 3); assert.equal(result.length, 65);
});

test("sample contacts are identifiable without deleting actual lead data", () => {
  assert(isSampleLead({ import_batch: "hilite-demo-v1" }));
  assert(isSampleLead({ email: "unit@demo.hilite.example" }));
  assert(isSampleLead({ phone: "+1 202 555 0123" }));
  assert(!isSampleLead({ name: "Unit Contact", phone: "+44 7700 900123" }));
});
