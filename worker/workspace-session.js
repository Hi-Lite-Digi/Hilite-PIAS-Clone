import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const COOKIE = "__Host-hilite_workspace";
const TTL = 30 * 24 * 60 * 60;
const failure = (message, status) => Object.assign(new Error(message), { status });
const hash = value => createHash("sha256").update(value).digest("hex");
const derivePassword = promisify(scrypt);
const equal = (left, right) => timingSafeEqual(Buffer.from(hash(left), "hex"), Buffer.from(hash(right), "hex"));
const credentialTag = env => hash([operatorKey(env), env.WORKSPACE_LOGIN_USERNAME || "", env.WORKSPACE_LOGIN_PASSWORD_HASH || ""].join("\0"));

export async function hashWorkspacePassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await derivePassword(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function validWorkspaceLogin(input, env) {
  const username = String(env.WORKSPACE_LOGIN_USERNAME || "");
  const stored = String(env.WORKSPACE_LOGIN_PASSWORD_HASH || "");
  if (!username || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored)) throw failure("Workspace sign-in needs server setup.", 503);
  if (typeof input.username !== "string" || typeof input.password !== "string" || input.username.length > 80 || input.password.length > 256) return false;
  const [, salt, expected] = stored.split("$");
  const actual = await derivePassword(input.password, salt, 64);
  return equal(input.username.trim(), username) && timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
});

export function checkWorkspaceOrigin(request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw failure("Open Hilite directly to continue.", 403);
  }
}

export function workspaceProtectionEnabled(env) {
  return String(env.DEMO_MODE).toLowerCase() === "true";
}

function operatorKey(env) {
  const key = String(env.META_TEST_OPERATOR_TOKEN || "");
  if (key.length < 32) throw failure("Workspace sign-in needs server setup.", 503);
  return key;
}

export function hasOperatorKey(request, env) {
  const expected = Buffer.from(operatorKey(env));
  const supplied = Buffer.from(String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function createWorkspaceDb(env, fetcher = fetch) {
  return async (path, options = {}) => {
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw failure("Workspace storage needs server setup.", 503);
    const headers = new Headers(options.headers);
    headers.set("apikey", env.SUPABASE_SECRET_KEY);
    headers.set("authorization", `Bearer ${env.SUPABASE_SECRET_KEY}`);
    headers.set("content-type", "application/json");
    if (!headers.has("prefer")) headers.set("prefer", "return=representation");
    let response;
    try {
      response = await fetcher(`${String(env.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/${path}`, { ...options, headers, signal: AbortSignal.timeout(15_000) });
    } catch { throw failure("Hilite could not reach your saved data. Try again.", 502); }
    const body = await response.json().catch(() => null);
    if (!response.ok) throw failure("Hilite could not save or load this change. Refresh and try again.", 503);
    return body;
  };
}

export function createSessionStore(env, fetcher = fetch) {
  const db = createWorkspaceDb(env, fetcher);
  return {
    create: session => db("workspace_sessions", { method: "POST", body: JSON.stringify(session) }),
    find: async tokenHash => (await db(`workspace_sessions?token_hash=eq.${tokenHash}&select=token_hash,credential_tag,expires_at&limit=1`))[0],
    remove: tokenHash => db(`workspace_sessions?token_hash=eq.${tokenHash}`, { method: "DELETE" }),
    limitLogin: async request => {
      const ip = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const key = createHmac("sha256", operatorKey(env)).update(ip).digest("hex");
      return await db("rpc/check_workspace_login_rate", { method: "POST", body: JSON.stringify({ p_key: key }) });
    },
  };
}

function cookieToken(request) {
  const value = String(request.headers.get("cookie") || "").split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export async function requireWorkspaceAccess(request, env, store = createSessionStore(env)) {
  checkWorkspaceOrigin(request);
  if (hasOperatorKey(request, env)) return;
  const token = cookieToken(request);
  const session = token ? await store.find(hash(token)) : null;
  if (!session || session.credential_tag !== credentialTag(env) || !Number.isFinite(Date.parse(session.expires_at)) || Date.parse(session.expires_at) <= Date.now()) {
    throw failure("Sign in to Hilite to access your workspace.", 401);
  }
}

export async function handleWorkspaceSession(request, env, action, store = createSessionStore(env), input = {}) {
  checkWorkspaceOrigin(request);
  const cookie = (value, age) => `${COOKIE}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
  if (action === "login") {
    if (store.limitLogin && !await store.limitLogin(request)) throw failure("Too many sign-in attempts. Wait a minute and try again.", 429);
    const valid = input.username !== undefined || input.password !== undefined
      ? await validWorkspaceLogin(input, env)
      : hasOperatorKey(request, env);
    if (!valid) throw failure("The username or password is incorrect. Check them and try again.", 401);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TTL * 1000).toISOString();
    await store.create({ token_hash: hash(token), credential_tag: credentialTag(env), expires_at: expiresAt });
    return json({ authenticated: true, expiresAt }, 200, { "set-cookie": cookie(token, TTL) });
  }
  if (action === "logout") {
    const token = cookieToken(request);
    if (token) await store.remove(hash(token));
    return json({ authenticated: false }, 200, { "set-cookie": cookie("", 0) });
  }
  await requireWorkspaceAccess(request, env, store);
  return json({ authenticated: true });
}
