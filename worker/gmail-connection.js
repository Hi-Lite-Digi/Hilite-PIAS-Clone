import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { createWorkspaceDb, requireWorkspaceAccess } from "./workspace-session.js";

export const GMAIL_ADDRESS = "business@hilitedigi.ai";
const ORIGIN = "https://hilite-outreach.vercel.app";
const REDIRECT = `${ORIGIN}/api/gmail/callback`;
const COOKIE = "__Host-hilite_gmail_oauth";
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const failure = (message, status = 400) => Object.assign(new Error(message), { status });

function encryptionKey(env) {
  const secret = String(env.META_TEST_OPERATOR_TOKEN || "");
  if (secret.length < 32) throw failure("Secure mailbox storage needs server setup.", 503);
  return Buffer.from(hkdfSync("sha256", secret, "hilite-gmail-v1", "private-oauth-storage", 32));
}

export function sealGmailValue(value, env, purpose) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openGmailValue(value, env, purpose) {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}

async function connection(env, db = createWorkspaceDb(env)) {
  return (await db("gmail_connection?id=eq.primary&select=*&limit=1"))[0] || null;
}

export async function gmailConnectionStatus(env, db) {
  const row = await connection(env, db);
  const connected = Boolean(row?.refresh_token_encrypted && row?.sender_email === GMAIL_ADDRESS);
  const clientConfigured = Boolean(row?.client_id && row?.client_secret_encrypted);
  return {
    configured: connected, clientConfigured, provider: "Gmail", address: connected ? GMAIL_ADDRESS : null,
    expectedAddress: GMAIL_ADDRESS, displayName: "Hilite", sendingEnabled: false,
    connectedAt: connected ? row.connected_at : null,
    requirement: connected ? "Connected. Email sending is paused." : clientConfigured ? "Connect business@hilitedigi.ai with Google." : "Add the Google OAuth client to connect business@hilitedigi.ai.",
  };
}

export async function gmailCredentials(env, db) {
  const row = await connection(env, db);
  if (!row?.refresh_token_encrypted || row.sender_email !== GMAIL_ADDRESS) throw failure("Connect the Hilite Gmail account first.", 503);
  return { clientId: row.client_id, clientSecret: openGmailValue(row.client_secret_encrypted, env, "client-secret"), refreshToken: openGmailValue(row.refresh_token_encrypted, env, "refresh-token"), address: row.sender_email };
}

export async function handleGmailSetup(request, env, options = {}) {
  const db = options.db || createWorkspaceDb(env);
  const authorize = options.authorize || requireWorkspaceAccess;
  const clientFactory = options.clientFactory || ((id, secret) => new OAuth2Client(id, secret, REDIRECT));
  const action = new URL(request.url).pathname.split("/").pop();
  const cookie = (value, age) => `${COOKIE}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
  const back = result => new Response(null, { status: 303, headers: { location: `${ORIGIN}/hihunt/settings?gmail=${result}`, "set-cookie": cookie("", 0), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  if (action === "callback" && request.method === "GET") {
    try {
      const url = new URL(request.url);
      const raw = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
      if (!raw || raw.length > 3000) return back("expired");
      const state = JSON.parse(openGmailValue(raw, env, "oauth-state"));
      if (!state.nonce || state.nonce !== url.searchParams.get("state") || state.expires < Date.now()) return back("expired");
      if (url.searchParams.has("error")) return back("cancelled");
      const row = await connection(env, db);
      if (!row || state.clientId !== row.client_id) return back("expired");
      const oauth = clientFactory(row.client_id, openGmailValue(row.client_secret_encrypted, env, "client-secret"));
      const { tokens } = await oauth.getToken({ code: url.searchParams.get("code") || "", codeVerifier: state.verifier, redirect_uri: REDIRECT });
      const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: row.client_id });
      const identity = ticket.getPayload();
      if (identity?.email?.toLowerCase() !== GMAIL_ADDRESS || identity.email_verified !== true) return back("wrong_account");
      const scopes = String(tokens.scope || "").split(" ");
      if (!scopes.includes(SEND_SCOPE) || !tokens.refresh_token) return back("permission_missing");
      await db("gmail_connection?id=eq.primary", { method: "PATCH", body: JSON.stringify({ refresh_token_encrypted: sealGmailValue(tokens.refresh_token, env, "refresh-token"), sender_email: GMAIL_ADDRESS, scopes, connected_at: new Date().toISOString() }) });
      return back("connected");
    } catch { return back("failed"); }
  }
  await authorize(request, env);
  if (action === "status" && request.method === "GET") return json(await gmailConnectionStatus(env, db));
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (action === "client") {
    const input = await request.json();
    const clientId = String(input.clientId || "").trim();
    const secret = String(input.clientSecret || "").trim();
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) || secret.length < 16 || secret.length > 300) throw failure("Enter a valid Google web OAuth client and secret.");
    await db("gmail_connection?on_conflict=id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: "primary", client_id: clientId, client_secret_encrypted: sealGmailValue(secret, env, "client-secret"), refresh_token_encrypted: null, sender_email: null, scopes: [], connected_at: null }) });
    return json({ saved: true });
  }
  if (action === "start") {
    const row = await connection(env, db);
    if (!row) throw failure("Save the Google OAuth client first.");
    const nonce = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const oauth = clientFactory(row.client_id, openGmailValue(row.client_secret_encrypted, env, "client-secret"));
    const url = oauth.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["openid", "email", SEND_SCOPE], login_hint: GMAIL_ADDRESS, state: nonce, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") });
    return new Response(JSON.stringify({ url }), { headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": cookie(sealGmailValue(JSON.stringify({ nonce, verifier, clientId: row.client_id, expires: Date.now() + 600_000 }), env, "oauth-state"), 600) } });
  }
  return json({ error: "Not found" }, 404);
}
