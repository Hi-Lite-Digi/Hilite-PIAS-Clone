import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installer = await readFile(new URL("./install-droplet-gateway.sh", import.meta.url), "utf8");
const buildPreparation = await readFile(new URL("../../scripts/prepare-sites-build.mjs", import.meta.url), "utf8");

test("Droplet installer reuses s6 and falls back to host systemd supervision", () => {
  assert.match(installer, /SUPERVISOR_MODE="s6"/);
  assert.match(installer, /container supervisor/);
  assert.match(installer, /hermes gateway restart/);
  assert.match(installer, /gateway run --replace/);
  assert.match(installer, /Restart=always/);
  assert.match(installer, /WantedBy=multi-user\.target/);
  assert.doesNotMatch(installer, /--force/);
});

test("Droplet installer removes the obsolete duplicate gateway service", () => {
  assert.match(installer, /disable --now "\$\{SERVICE_NAME\}\.service"/);
  assert.match(installer, /rm -f "\$\{SERVICE_PATH\}"/);
  assert.match(installer, /reset-failed "\$\{SERVICE_NAME\}\.service"/);
});

test("Droplet installer keeps open inbound access and repairs both session layouts", () => {
  assert.match(installer, /set_value WHATSAPP_ENABLED true/);
  assert.match(installer, /set_value WHATSAPP_MODE bot/);
  assert.match(installer, /set_value WHATSAPP_ALLOWED_USERS "\*"/);
  assert.match(installer, /platforms\/whatsapp\/session/);
  assert.match(installer, /whatsapp\/session/);
  assert.match(installer, /Missing or empty/);
  assert.match(installer, /noiseKey/);
  assert.match(installer, /signedIdentityKey/);
  assert.match(installer, /gateway stop/);
  assert.match(installer, /gateway start/);
  assert.match(installer, /\.backup-/);
  assert.match(installer, /\.new-/);
  assert.match(installer, /chown -R 10000:10000/);
  assert.match(installer, /chmod 700/);
  assert.doesNotMatch(installer, /cp -a "\$\{source_dir\}\/\." "\$\{destination\}\/"/);
});

test("Droplet installer monitors bridge port 3000 with a supervisor-aware restart", () => {
  assert.match(installer, /127\.0\.0\.1:3000\/health/);
  assert.match(installer, /OnUnitActiveSec=60s/);
  assert.match(installer, /HERMES_SUPERVISOR_MODE/);
  assert.match(installer, /hermes gateway restart/);
  assert.match(installer, /systemctl restart/);
  assert.doesNotMatch(installer, /docker restart/);
});

test("production build publishes the secret-free installer for one-command recovery", () => {
  assert.match(buildPreparation, /install-droplet-gateway\.sh/);
  assert.match(buildPreparation, /install-hermes-gateway\.sh/);
  assert.match(buildPreparation, /text\/x-shellscript/);
  assert.doesNotMatch(installer, /HERMES_RELAY_TOKEN=/);
  assert.doesNotMatch(installer, /HIHUNT_INBOUND_SECRET=/);
});
