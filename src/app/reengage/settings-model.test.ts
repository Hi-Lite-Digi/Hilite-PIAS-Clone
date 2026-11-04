import assert from "node:assert/strict";
import test from "node:test";
import type { WhatsAppGatewayStatus } from "../../lib/api";
import {
  DEFAULT_REENGAGE_SETTINGS,
  getGatewayPresentation,
  isReengageSettingsDirty,
  loadReengageSettings,
  validateSenderEmail,
  validateSendWindow,
} from "./settings-model";

const connectedStatus: WhatsAppGatewayStatus = {
  configured: true,
  connected: true,
  provider: "Hermes",
  channel: "WhatsApp",
  accountName: "Hilite Advisory",
  deliveryReady: true,
  requirements: [],
};

test("gateway presentation distinguishes checking, connected, needs-attention, and not-configured states", () => {
  assert.equal(getGatewayPresentation(null, true).state, "checking");
  assert.equal(getGatewayPresentation(connectedStatus, false).state, "connected");
  assert.equal(getGatewayPresentation({ ...connectedStatus, connected: false, deliveryReady: false }, false).state, "attention");
  assert.equal(getGatewayPresentation({ ...connectedStatus, configured: false, connected: false, deliveryReady: false }, false).state, "not-configured");

  const labels = [
    getGatewayPresentation(null, true).label,
    getGatewayPresentation(connectedStatus, false).label,
    getGatewayPresentation({ ...connectedStatus, connected: false }, false).label,
    getGatewayPresentation({ ...connectedStatus, configured: false }, false).label,
  ];
  assert.equal(new Set(labels).size, 4);
});

test("gateway presentation explains bridge and WhatsApp session failures separately", () => {
  const bridgeOffline = getGatewayPresentation({
    ...connectedStatus,
    connected: false,
    deliveryReady: false,
    bridgeStatus: "unavailable",
    diagnosticCode: "bridge_unavailable",
  }, false);
  const sessionDisconnected = getGatewayPresentation({
    ...connectedStatus,
    connected: false,
    deliveryReady: false,
    bridgeStatus: "disconnected",
    diagnosticCode: "whatsapp_disconnected",
  }, false);

  assert.equal(bridgeOffline.label, "Bridge offline");
  assert.match(bridgeOffline.copy, /internal Hermes WhatsApp bridge is not running/i);
  assert.equal(sessionDisconnected.label, "WhatsApp disconnected");
  assert.match(sessionDisconnected.copy, /paired WhatsApp session/i);
});

test("send-window validation requires a real, ascending local-time range", () => {
  assert.equal(validateSendWindow("09:00", "18:00"), null);
  assert.match(validateSendWindow("18:00", "09:00") ?? "", /after/i);
  assert.match(validateSendWindow("9am", "18:00") ?? "", /valid/i);
});

test("sender email validation accepts an empty preference or a valid address", () => {
  assert.equal(validateSenderEmail(""), null);
  assert.equal(validateSenderEmail("events@example.com"), null);
  assert.match(validateSenderEmail("not-an-email") ?? "", /valid/i);
});

test("settings loading is resilient and dirty comparison is value based", () => {
  const validStorage = {
    getItem: () => JSON.stringify({ senderEmail: "EVENTS@EXAMPLE.COM", sendWindowStart: "08:30", sendWindowEnd: "17:30" }),
  };
  const malformedStorage = { getItem: () => "not-json" };

  assert.deepEqual(loadReengageSettings(validStorage), { senderEmail: "events@example.com", sendWindowStart: "08:30", sendWindowEnd: "17:30" });
  assert.deepEqual(loadReengageSettings(malformedStorage), DEFAULT_REENGAGE_SETTINGS);
  assert.equal(isReengageSettingsDirty(DEFAULT_REENGAGE_SETTINGS, { ...DEFAULT_REENGAGE_SETTINGS }), false);
  assert.equal(isReengageSettingsDirty(DEFAULT_REENGAGE_SETTINGS, { ...DEFAULT_REENGAGE_SETTINGS, sendWindowStart: "08:00" }), true);
});
