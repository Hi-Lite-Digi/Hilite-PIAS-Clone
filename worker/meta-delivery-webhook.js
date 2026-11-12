import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const WABA_ID = "1656774412758599";
const PHONE_ID = "1442204225635652";
const MAX_BYTES = 3 * 1024 * 1024;
const statuses = new Set(["sent", "delivered", "read", "failed"]);
const response = (text, status = 200) => new Response(text, { status, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
const equalSecret = (left, right) => timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
const safeDetail = value => String(value || "").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]").replace(/\+?\d[\d ()-]{6,}\d/g, "[number]").slice(0, 1000);

// Diagnostic events only: no message body/contact data, database writes, replies,
// retries, or effects on old accounts. Repeated/out-of-order callbacks are logged
// as observations; they never overwrite a later state or trigger another send.
export async function handleMetaDeliveryWebhook(request, env, { logger = event => console.info(JSON.stringify(event)) } = {}) {
  if (!env.META_APP_SECRET || String(env.META_WEBHOOK_VERIFY_TOKEN || "").length < 32) return response("Webhook is not configured.", 503);
  if (request.method === "GET") {
    const query = new URL(request.url).searchParams;
    if (query.get("hub.mode") !== "subscribe" || !equalSecret(query.get("hub.verify_token") || "", env.META_WEBHOOK_VERIFY_TOKEN)) return response("Forbidden", 403);
    const challenge = query.get("hub.challenge") || "";
    return /^[A-Za-z0-9_-]{1,256}$/.test(challenge) ? response(challenge) : response("Invalid challenge", 400);
  }
  if (request.method !== "POST") return response("Method not allowed", 405);
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return response("Payload too large", 413);
  const signature = request.headers.get("x-hub-signature-256") || "";
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return response("Forbidden", 403);
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > MAX_BYTES) return response("Payload too large", 413);
  const expected = createHmac("sha256", env.META_APP_SECRET).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"))) return response("Forbidden", 403);
  let payload;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return response("Invalid JSON", 400); }
  if (payload?.object !== "whatsapp_business_account") return response("OK");
  let recorded = 0;
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    if (String(entry?.id) !== WABA_ID) continue;
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const value = change?.value;
      if (change?.field !== "messages" || value?.messaging_product !== "whatsapp" || String(value.metadata?.phone_number_id) !== PHONE_ID) continue;
      for (const item of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!statuses.has(item?.status) || !/^wamid\.[A-Za-z0-9+/_=-]{1,500}$/.test(String(item.id || ""))) continue;
        logger({ event: "meta_whatsapp_delivery", messageId: item.id, status: item.status,
          timestamp: /^\d{10,13}$/.test(String(item.timestamp || "")) ? String(item.timestamp) : null,
          errors: (Array.isArray(item.errors) ? item.errors : []).map(error => ({ code: Number(error?.code) || 0, details: safeDetail(error?.error_data?.details || error?.message) })) });
        recorded++;
      }
    }
  }
  if (!recorded) logger({ event: "meta_whatsapp_webhook_verified", deliveryEvents: 0 });
  return response("OK");
}

export async function metaDeliveryVercelHandler(req, res, env = process.env, options = {}) {
  // Read the original byte stream. Parsing/stringifying req.body changes the
  // bytes and would make a genuine Meta HMAC fail verification.
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BYTES) { res.statusCode = 413; res.end("Payload too large"); return; }
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  const request = new Request(`https://${req.headers.host || "localhost"}${req.url}`, {
    method: req.method, headers: req.headers, ...(req.method === "POST" ? { body } : {}),
  });
  const result = await handleMetaDeliveryWebhook(request, env, options);
  res.statusCode = result.status;
  result.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await result.arrayBuffer()));
}
