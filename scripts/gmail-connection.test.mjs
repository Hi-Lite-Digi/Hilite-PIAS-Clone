import test from "node:test";
import assert from "node:assert/strict";
import { handleGmailSetup, gmailConnectionStatus, openGmailValue, sealGmailValue } from "../worker/gmail-connection.js";

const env = { META_TEST_OPERATOR_TOKEN: "unit-test-workspace-secret-abcdefghijklmnopqrstuvwxyz" };
const base = "https://hilite-outreach.vercel.app/api/gmail/";
const authorize = async () => {};
function store() {
  let row; const calls = [];
  return { calls, db: async (path, opts = {}) => {
    calls.push({ path, opts });
    if (opts.method === "POST") { row = JSON.parse(opts.body); return []; }
    if (opts.method === "PATCH") { row = { ...row, ...JSON.parse(opts.body) }; return []; }
    return row ? [row] : [];
  } };
}
const post = (action, data) => new Request(base + action, { method: "POST", body: JSON.stringify(data) });

test("Gmail secret encryption authenticates purpose and key", () => {
  const sealed = sealGmailValue("private-secret", env, "client-secret");
  assert.equal(openGmailValue(sealed, env, "client-secret"), "private-secret");
  assert.throws(() => openGmailValue(sealed, env, "refresh-token"));
  assert.throws(() => openGmailValue(sealed, { META_TEST_OPERATOR_TOKEN: "different-test-workspace-secret-abcdefghijklmnopqrstuvwxyz" }, "client-secret"));
  assert(!sealed.includes("private-secret"));
});

test("Gmail setup requires workspace authorization before saving credentials", async () => {
  let accessed = false;
  await assert.rejects(handleGmailSetup(post("client", {}), env, { authorize: async () => { throw new Error("unauthorized"); }, db: async () => { accessed = true; } }), /unauthorized/);
  assert.equal(accessed, false);
});

test("Gmail setup uses PKCE, pins account, stores encrypted tokens, and leaves sending paused", async () => {
  const storage = store(); let generated; let exchange; let emailsSent = 0;
  const oauth = { generateAuthUrl: input => { generated = input; return "https://accounts.google.com/authorize"; }, getToken: async input => { exchange = input; return { tokens: { refresh_token: "unit-refresh-secret", id_token: "unit-id", scope: "openid email https://www.googleapis.com/auth/gmail.send" } }; }, verifyIdToken: async () => ({ getPayload: () => ({ email: "business@hilitedigi.ai", email_verified: true }) }), send: () => { emailsSent++; } };
  const options = { db: storage.db, authorize, clientFactory: () => oauth };
  await handleGmailSetup(post("client", { clientId: "unit-client.apps.googleusercontent.com", clientSecret: "unit-client-secret-long" }), env, options);
  assert.equal((await gmailConnectionStatus(env, storage.db)).configured, false);
  const start = await handleGmailSetup(post("start", {}), env, options);
  const cookie = start.headers.get("set-cookie").split(";")[0];
  assert(start.headers.get("set-cookie").includes("HttpOnly; Secure; SameSite=Lax"));
  assert.equal(generated.code_challenge_method, "S256");
  assert.equal(generated.login_hint, "business@hilitedigi.ai");
  assert(!generated.scope.some(scope => /readonly|modify|mail\.google/.test(scope)));
  const callback = await handleGmailSetup(new Request(`${base}callback?code=unit-code&state=${generated.state}`, { headers: { cookie } }), env, options);
  assert(callback.headers.get("location").endsWith("gmail=connected"));
  assert(exchange.codeVerifier.length >= 43);
  const status = await gmailConnectionStatus(env, storage.db);
  assert.equal(status.configured, true); assert.equal(status.sendingEnabled, false);
  assert(!JSON.stringify(status).includes("secret"));
  assert(!storage.calls.some(call => call.opts.body?.includes("unit-refresh-secret")));
  assert.equal(emailsSent, 0);
});

test("Gmail callback rejects mismatched state, missing cookie and wrong accounts", async () => {
  const storage = store(); let state; let exchanges = 0;
  const options = { db: storage.db, authorize, clientFactory: () => ({ generateAuthUrl: input => { state = input.state; return "https://accounts.google.com/authorize"; }, getToken: async () => { exchanges++; return { tokens: { id_token: "unit", refresh_token: "unit", scope: "https://www.googleapis.com/auth/gmail.send" } }; }, verifyIdToken: async () => ({ getPayload: () => ({ email: "someone@example.com", email_verified: true }) }) }) };
  await handleGmailSetup(post("client", { clientId: "unit.apps.googleusercontent.com", clientSecret: "unit-long-client-secret" }), env, options);
  const start = await handleGmailSetup(post("start", {}), env, options);
  const cookie = start.headers.get("set-cookie").split(";")[0];
  const missing = await handleGmailSetup(new Request(`${base}callback?code=x&state=${state}`), env, options);
  assert(missing.headers.get("location").endsWith("gmail=expired"));
  const mismatch = await handleGmailSetup(new Request(`${base}callback?code=x&state=wrong`, { headers: { cookie } }), env, options);
  assert(mismatch.headers.get("location").endsWith("gmail=expired")); assert.equal(exchanges, 0);
  const wrong = await handleGmailSetup(new Request(`${base}callback?code=x&state=${state}`, { headers: { cookie } }), env, options);
  assert(wrong.headers.get("location").endsWith("gmail=wrong_account"));
  assert.equal((await gmailConnectionStatus(env, storage.db)).configured, false);
});
