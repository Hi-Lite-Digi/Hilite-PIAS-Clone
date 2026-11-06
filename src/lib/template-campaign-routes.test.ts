import assert from "node:assert/strict";
import test from "node:test";
import template from "../../api/campaigns/[id]/template.js";
import start from "../../api/campaigns/[id]/start-template.js";
import send from "../../api/campaigns/[id]/send-template.js";

test("published Vercel campaign entry points reach the authenticated API instead of a platform 404", async () => {
  const originalKey = process.env.META_TEST_OPERATOR_TOKEN;
  const originalMode = process.env.DEMO_MODE;
  const originalFetch = globalThis.fetch;
  process.env.META_TEST_OPERATOR_TOKEN = "test-only-workspace-key-at-least-32-characters";
  process.env.DEMO_MODE = "true";
  globalThis.fetch = (async () => { throw new Error("Unauthenticated routes must not access a provider or database"); }) as typeof fetch;
  try {
    for (const [suffix, handler, method] of [["template", template, "GET"], ["start-template", start, "POST"], ["send-template", send, "POST"]] as const) {
      let status = 0;
      let result = "";
      const headers = new Map<string, unknown>();
      await handler({ method, url: `/api/campaigns/b34049ba-8f6d-409c-8be8-f441e814418c/${suffix}`, headers: { host: "hilite.example", "x-forwarded-proto": "https" }, body: method === "POST" ? {} : undefined }, {
        set statusCode(value: number) { status = value; },
        setHeader(name: string, value: unknown) { headers.set(name.toLowerCase(), value); },
        end(value: Buffer) { result = value.toString(); },
      });
      assert.equal(status, 401, suffix);
      assert.match(JSON.parse(result).error, /Sign in to Hilite/);
      assert.equal(headers.get("cache-control"), "no-store");
    }
  } finally {
    if (originalKey === undefined) delete process.env.META_TEST_OPERATOR_TOKEN; else process.env.META_TEST_OPERATOR_TOKEN = originalKey;
    if (originalMode === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = originalMode;
    globalThis.fetch = originalFetch;
  }
});
