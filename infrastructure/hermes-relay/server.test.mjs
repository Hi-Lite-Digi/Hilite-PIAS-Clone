import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { afterEach } from "node:test";

process.env.HERMES_RELAY_TOKEN = "test-relay-token-that-is-long-enough";
process.env.HERMES_URL = "https://hermes.example.test";
const relayMediaDirectory = join(tmpdir(), `hihunt-relay-test-${process.pid}`);
process.env.RELAY_MEDIA_DIR = relayMediaDirectory;
process.env.HERMES_MEDIA_DIR = "/opt/data/outbound-media";

const { posterInput, relayHealthStatus, sendPoster } = await import("./server.mjs");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("posterInput accepts only signed campaign poster URLs", () => {
  assert.deepEqual(posterInput({
    url: "https://project.supabase.co/storage/v1/object/sign/campaign-posters/drafts/poster.png?token=signed",
    name: "Retirement poster.png",
  }), {
    url: "https://project.supabase.co/storage/v1/object/sign/campaign-posters/drafts/poster.png?token=signed",
    extension: ".png",
    fileName: "Retirement poster.png",
    mediaType: "image",
  });
  assert.throws(() => posterInput({
    url: "https://example.test/private-file.png",
    name: "poster.png",
  }), /not trusted/i);
});

test("sendPoster downloads, sends, and removes the temporary poster", async () => {
  await rm(relayMediaDirectory, { recursive: true, force: true });
  await mkdir(relayMediaDirectory, { recursive: true });
  let mediaBody = null;
  let temporaryFile = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith("https://project.supabase.co/storage/")) {
      return new Response(Buffer.from("test-poster-bytes"), {
        headers: { "content-length": "17", "content-type": "image/png" },
      });
    }
    if (url === "https://hermes.example.test/send-media") {
      mediaBody = JSON.parse(String(init.body));
      const relativeFile = mediaBody.filePath.replace("/opt/data/outbound-media/", "").split("/");
      temporaryFile = join(relayMediaDirectory, ...relativeFile);
      assert.equal((await readFile(temporaryFile, "utf8")), "test-poster-bytes");
      return new Response(JSON.stringify({ success: true, messageId: "media-message-1" }), {
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const poster = posterInput({
    url: "https://project.supabase.co/storage/v1/object/sign/campaign-posters/drafts/poster.png?token=signed",
    name: "Retirement poster.png",
  });
  const result = await sendPoster("6580000001", "Hi Sarah", poster);

  assert.deepEqual(result, { success: true, messageId: "media-message-1" });
  assert.deepEqual(mediaBody, {
    chatId: "6580000001@s.whatsapp.net",
    filePath: mediaBody.filePath,
    mediaType: "image",
    caption: "Hi Sarah",
    fileName: "Retirement poster.png",
  });
  assert.match(mediaBody.filePath, /^\/opt\/data\/outbound-media\/hihunt-poster-[^/]+\/poster\.png$/);
  await assert.rejects(() => stat(temporaryFile), (error) => error?.code === "ENOENT");
  assert.deepEqual(await readdir(relayMediaDirectory), []);
});

test("relay health reports a connected bridge without outstanding requirements", async () => {
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "https://hermes.example.test/health");
    return new Response(JSON.stringify({ status: "connected" }), {
      headers: { "content-type": "application/json" },
    });
  };

  const health = await relayHealthStatus();

  assert.equal(health.status, 200);
  assert.equal(health.body.connected, true);
  assert.equal(health.body.deliveryReady, true);
  assert.equal(health.body.diagnosticCode, null);
  assert.deepEqual(health.body.requirements, []);
});

test("relay health distinguishes a stopped bridge from a disconnected WhatsApp session", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ status: "disconnected" }), {
    headers: { "content-type": "application/json" },
  });

  const disconnected = await relayHealthStatus();
  assert.equal(disconnected.status, 503);
  assert.equal(disconnected.body.diagnosticCode, "whatsapp_disconnected");
  assert.equal(disconnected.body.bridgeStatus, "disconnected");

  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };

  const unavailable = await relayHealthStatus();
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.diagnosticCode, "bridge_unavailable");
  assert.equal(unavailable.body.bridgeStatus, "unavailable");
  assert.match(unavailable.body.requirements.join(" "), /port 3000/i);
});
