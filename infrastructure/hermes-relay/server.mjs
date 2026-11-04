import { createHash, timingSafeEqual } from "node:crypto";
import { chmod, chown, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, posix, relative } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const TOKEN = String(process.env.HERMES_RELAY_TOKEN || "");
const HERMES_URL = String(process.env.HERMES_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const STATE_FILE = String(process.env.STATE_FILE || "/data/state.json");
const MAX_DAILY_SENDS = Number(process.env.MAX_DAILY_SENDS || 20);
const MIN_SEND_INTERVAL_MS = Number(process.env.MIN_SEND_INTERVAL_MS || 3000);
const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_LENGTH = 6000;
const MAX_POSTER_BYTES = 50 * 1024 * 1024;
const POSTER_DOWNLOAD_TIMEOUT_MS = 30_000;
const RELAY_MEDIA_DIR = String(process.env.RELAY_MEDIA_DIR || tmpdir());
const HERMES_MEDIA_DIR = String(process.env.HERMES_MEDIA_DIR || RELAY_MEDIA_DIR);
const HERMES_MEDIA_UID = Number(process.env.HERMES_MEDIA_UID);
const HERMES_MEDIA_GID = Number(process.env.HERMES_MEDIA_GID);
const POSTER_MEDIA_TYPES = new Map([
  [".png", "image"],
  [".jpg", "image"],
  [".jpeg", "image"],
  [".webp", "image"],
  [".gif", "image"],
  [".pdf", "document"],
]);

let state = { day: new Date().toISOString().slice(0, 10), sends: 0, lastSentAt: 0, idempotency: {} };

async function loadState() {
  try {
    const loaded = JSON.parse(await readFile(STATE_FILE, "utf8"));
    if (loaded && typeof loaded === "object") state = { ...state, ...loaded };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function saveState() {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  const temporary = `${STATE_FILE}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await rename(temporary, STATE_FILE);
}

function json(response, body, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function authorised(request) {
  const expected = Buffer.from(`Bearer ${TOKEN}`);
  const received = Buffer.from(String(request.headers.authorization || ""));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("A valid JSON body is required"), { status: 400 });
  }
}

function normalisePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `65${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

function phoneFingerprint(phone) {
  return createHash("sha256").update(phone).digest("hex").slice(0, 12);
}

export function posterInput(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("The campaign poster is invalid"), { status: 400 });
  }
  let url;
  try {
    url = new URL(String(value.url || ""));
  } catch {
    throw Object.assign(new Error("The campaign poster URL is invalid"), { status: 400 });
  }
  const trustedSupabaseHost = url.hostname.endsWith(".supabase.co");
  const trustedStoragePath = url.pathname.startsWith("/storage/v1/object/sign/campaign-posters/");
  if (url.protocol !== "https:" || !trustedSupabaseHost || !trustedStoragePath) {
    throw Object.assign(new Error("The campaign poster URL is not trusted"), { status: 400 });
  }

  const pathExtension = extname(url.pathname).toLowerCase();
  const requestedName = String(value.name || "")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  const requestedExtension = extname(requestedName).toLowerCase();
  const extension = pathExtension;
  const mediaType = POSTER_MEDIA_TYPES.get(extension);
  if (!mediaType) throw Object.assign(new Error("The campaign poster type is not supported"), { status: 400 });
  const requestedStem = requestedName && POSTER_MEDIA_TYPES.has(requestedExtension)
    ? requestedName.slice(0, -requestedExtension.length)
    : requestedName;
  const fileName = `${requestedStem || "campaign-poster"}${extension}`;
  return { url: url.toString(), extension, fileName, mediaType };
}

export async function sendPoster(phone, message, poster) {
  const response = await fetch(poster.url, {
    redirect: "error",
    signal: AbortSignal.timeout(POSTER_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw Object.assign(new Error("The campaign poster could not be downloaded"), { status: 502 });
  }
  const announcedBytes = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(announcedBytes) && announcedBytes > MAX_POSTER_BYTES) {
    throw Object.assign(new Error("The campaign poster is too large"), { status: 413 });
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw Object.assign(new Error("The campaign poster is empty"), { status: 400 });
  if (bytes.length > MAX_POSTER_BYTES) {
    throw Object.assign(new Error("The campaign poster is too large"), { status: 413 });
  }

  await mkdir(RELAY_MEDIA_DIR, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(RELAY_MEDIA_DIR, "hihunt-poster-"));
  const filePath = join(temporaryDirectory, `poster${poster.extension}`);
  try {
    await writeFile(filePath, bytes, { mode: 0o600 });
    if (Number.isInteger(HERMES_MEDIA_UID) && HERMES_MEDIA_UID >= 0
      && Number.isInteger(HERMES_MEDIA_GID) && HERMES_MEDIA_GID >= 0) {
      await chown(temporaryDirectory, HERMES_MEDIA_UID, HERMES_MEDIA_GID);
      await chown(filePath, HERMES_MEDIA_UID, HERMES_MEDIA_GID);
    }
    await chmod(temporaryDirectory, 0o750);
    await chmod(filePath, 0o640);
    const relativeFilePath = relative(RELAY_MEDIA_DIR, filePath).split("\\").join("/");
    const hermesFilePath = posix.join(HERMES_MEDIA_DIR.split("\\").join("/"), relativeFilePath);
    return await hermes("/send-media", {
      method: "POST",
      body: JSON.stringify({
        chatId: `${phone}@s.whatsapp.net`,
        filePath: hermesFilePath,
        mediaType: poster.mediaType,
        caption: message,
        fileName: poster.fileName,
      }),
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function hermes(path, init = {}) {
  const response = await fetch(`${HERMES_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error("Hermes rejected the WhatsApp request"), {
      status: 502,
      upstreamStatus: response.status,
      upstreamMessage: String(payload?.error || payload?.message || "").slice(0, 240),
    });
  }
  return payload;
}

function resetDailyLimit() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.day !== today) state = { day: today, sends: 0, lastSentAt: 0, idempotency: {} };
}

export async function relayHealthStatus() {
  try {
    const bridge = await hermes("/health", { method: "GET" });
    const connected = bridge.status === "connected";
    return {
      status: connected ? 200 : 503,
      body: {
        configured: true,
        connected,
        provider: "Hermes",
        channel: "WhatsApp",
        accountName: "HiHunt WhatsApp",
        deliveryReady: connected,
        bridgeStatus: String(bridge.status || "unknown"),
        diagnosticCode: connected ? null : "whatsapp_disconnected",
        requirements: connected
          ? []
          : [
              "Reconnect the paired WhatsApp number",
              "Confirm the phone still lists Hermes under Linked Devices",
            ],
      },
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "bridge_health_failed",
      message: error instanceof Error ? error.message : "Unknown bridge health error",
      upstreamStatus: Number(error?.upstreamStatus) || null,
    }));
    return {
      status: 503,
      body: {
        configured: true,
        connected: false,
        provider: "Hermes",
        channel: "WhatsApp",
        accountName: "HiHunt WhatsApp",
        deliveryReady: false,
        bridgeStatus: "unavailable",
        diagnosticCode: "bridge_unavailable",
        requirements: [
          "Start the Docker gateway with hermes gateway run",
          "Confirm the internal WhatsApp bridge is listening on port 3000",
        ],
      },
    };
  }
}

async function handleHealth(response) {
  const health = await relayHealthStatus();
  json(response, health.body, health.status);
}

async function handleSend(request, response) {
  const input = await readJson(request);
  if (input.consentConfirmed !== true) {
    return json(response, { error: "Confirm that this recipient consented to receive WhatsApp messages" }, 400);
  }
  const phone = normalisePhone(input.phone);
  if (!phone) return json(response, { error: "A valid WhatsApp phone number is required" }, 400);
  const message = String(input.message || "").trim();
  if (!message) return json(response, { error: "The WhatsApp message is empty" }, 400);
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json(response, { error: `The WhatsApp message must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer` }, 400);
  }
  const idempotencyKey = String(input.idempotencyKey || "").trim().slice(0, 180);
  if (!idempotencyKey) return json(response, { error: "An idempotency key is required" }, 400);
  const poster = posterInput(input.poster);

  resetDailyLimit();
  if (state.idempotency[idempotencyKey]) {
    return json(response, { ...state.idempotency[idempotencyKey], duplicate: true });
  }
  if (state.sends >= MAX_DAILY_SENDS) {
    return json(response, { error: "The daily WhatsApp safety limit has been reached" }, 429);
  }
  const waitMs = MIN_SEND_INTERVAL_MS - (Date.now() - Number(state.lastSentAt || 0));
  if (waitMs > 0) {
    return json(response, { error: "Please wait briefly before sending another WhatsApp message", retryAfterMs: waitMs }, 429);
  }

  const result = poster
    ? await sendPoster(phone, message, poster)
    : await hermes("/send", {
        method: "POST",
        body: JSON.stringify({ chatId: `${phone}@s.whatsapp.net`, message }),
      });
  const recorded = {
    sent: true,
    deliveryMode: "hermes_direct",
    messageId: String(result.messageId || result.messageIds?.[0] || "") || null,
    posterSent: Boolean(poster),
  };
  state.sends += 1;
  state.lastSentAt = Date.now();
  state.idempotency[idempotencyKey] = recorded;
  await saveState();
  console.info(JSON.stringify({
    event: "whatsapp_sent",
    at: new Date().toISOString(),
    recipient: phoneFingerprint(phone),
    campaignId: String(input.campaignId || "").slice(0, 80) || null,
    leadId: Number(input.leadId) || null,
  }));
  json(response, recorded);
}

export async function startRelay() {
  if (TOKEN.length < 32) throw new Error("HERMES_RELAY_TOKEN must contain at least 32 characters");
  await loadState();
  const server = createServer(async (request, response) => {
    try {
      if (!authorised(request)) return json(response, { error: "Unauthorized" }, 401);
      const url = new URL(request.url || "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") return await handleHealth(response);
      if (request.method === "POST" && url.pathname === "/send") return await handleSend(request, response);
      return json(response, { error: "Not found" }, 404);
    } catch (error) {
      console.error(JSON.stringify({ event: "relay_error", message: error instanceof Error ? error.message : "Unknown error" }));
      const status = Number(error?.status) || 502;
      return json(response, { error: status >= 500 ? "WhatsApp delivery is temporarily unavailable" : error.message }, status);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
  console.info(`HiHunt WhatsApp relay listening on 127.0.0.1:${PORT}`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startRelay();
}
