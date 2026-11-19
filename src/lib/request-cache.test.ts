import assert from "node:assert/strict";
import test from "node:test";
import { createRequestCache } from "./request-cache";

test("page reads share concurrent requests, return independent response bodies and reuse a fresh result", async () => {
  let calls = 0;
  const cache = createRequestCache((async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return Response.json({ data: [1] }); }) as typeof fetch);
  const responses = await Promise.all([cache.request("/api/leads?limit=10"), cache.request("/api/leads?limit=10")]);
  assert.deepEqual(await responses[0].json(), { data: [1] });
  assert.deepEqual(await responses[1].json(), { data: [1] });
  assert.deepEqual(await (await cache.request("/api/leads?limit=10")).json(), { data: [1] });
  assert.equal(calls, 1);
});

test("filters and headers partition cached results while parameter order does not", async () => {
  let calls = 0;
  const cache = createRequestCache((async () => Response.json({ count: ++calls })) as typeof fetch);
  await cache.request("/api/leads?limit=10&search=one");
  await cache.request("/api/leads?search=one&limit=10");
  await cache.request("/api/leads?search=two&limit=10");
  await cache.request("/api/leads?search=two&limit=10", { headers: { accept: "different" } });
  assert.equal(calls, 3);
});

test("header badges and the inbox reuse the same conversation response", async () => {
  let calls = 0;
  const cache = createRequestCache((async () => { calls++; return Response.json({ data: [], total: 0, unread: 0 }); }) as typeof fetch);
  await Promise.all([cache.request("/api/replies"), cache.request("/api/threads")]);
  assert.equal(calls, 1);
});

test("expired results remain available for immediate rendering while the next read revalidates", async () => {
  let time = 0; let calls = 0;
  const cache = createRequestCache((async () => Response.json({ count: ++calls })) as typeof fetch, () => time);
  await cache.request("/api/threads");
  time = 2_001;
  assert.deepEqual(cache.peek("/api/threads"), { count: 1 });
  assert.deepEqual(await (await cache.request("/api/threads")).json(), { count: 2 });
  time = 123_000;
  assert.equal(cache.peek("/api/threads"), undefined);
});

test("mutations invalidate reads and neither writes nor session checks are cached", async () => {
  let calls = 0;
  const cache = createRequestCache((async () => Response.json({ count: ++calls })) as typeof fetch);
  await cache.request("/api/leads");
  await cache.request("/api/leads", { method: "POST", body: "{}" });
  assert.equal(cache.peek("/api/leads"), undefined);
  await cache.request("/api/leads");
  for (let i = 0; i < 2; i++) await cache.request("/api/meta-whatsapp", { method: "POST", body: JSON.stringify({ action: "session" }) });
  assert.equal(calls, 5);
});

test("errors, malformed JSON and authorization failures are never cached", async () => {
  let calls = 0;
  const cache = createRequestCache((async () => { calls++; return calls === 1 ? Response.json({ data: true }) : new Response("bad", { status: calls === 2 ? 401 : 200 }); }) as typeof fetch);
  await cache.request("/api/leads");
  await cache.request("/api/summary");
  assert.equal(cache.peek("/api/leads"), undefined);
  await cache.request("/api/summary");
  await cache.request("/api/summary");
  assert.equal(calls, 4);
});

test("clearing a session prevents a late request from repopulating its cache", async () => {
  let complete!: (response: Response) => void;
  const cache = createRequestCache((() => new Promise(resolve => { complete = resolve; })) as typeof fetch);
  const read = cache.request("/api/leads");
  cache.clear(); complete(Response.json({ private: "old session" }));
  await read;
  assert.equal(cache.peek("/api/leads"), undefined);
});

test("only the read-only Meta connection check is cached among POST actions", async () => {
  let calls = 0;
  const cache = createRequestCache((async () => Response.json({ count: ++calls })) as typeof fetch);
  const status = { method: "POST", body: JSON.stringify({ action: "status" }) };
  await cache.request("/api/meta-whatsapp", status); await cache.request("/api/meta-whatsapp", status);
  assert.equal(calls, 1);
  await cache.request("/api/meta-whatsapp", { method: "POST", body: JSON.stringify({ action: "send" }) });
  assert.equal(calls, 2);
});
