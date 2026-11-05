import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";
import type { WhatsAppGatewayStatus } from "../../lib/api";
import SettingsPage from "./SettingsPage";
import { DEFAULT_REENGAGE_SETTINGS, type ReengageSettings } from "./settings-model";
import { MetaTestProvider } from "./MetaTestContext";

const needsAttention: WhatsAppGatewayStatus = {
  configured: true,
  connected: false,
  provider: "Hermes",
  channel: "WhatsApp",
  accountName: "Hilite Advisory",
  deliveryReady: false,
  requirements: ["Reconnect the paired phone", "Keep the Hermes worker online"],
};

async function renderSettings(initialSettings?: ReengageSettings) {
  const routes = [
    {
      path: "/reengage/settings",
      element: (
        <SettingsPage
          initialCap={{ limit: 20, used: 14, scheduled: 2, remaining: 6, windowHours: 12, resetsAt: "2026-08-27T04:00:00.000Z" }}
          initialEmailSender={{ configured: false, provider: "Gmail", address: initialSettings?.senderEmail || null, displayName: "Hilite", requirement: "Authorize this Gmail account once before email campaigns can send." }}
          initialGateway={needsAttention}
          initialSettings={initialSettings}
        />
      ),
    },
  ];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request("http://localhost/reengage/settings"));
  assert.ok(!(context instanceof Response));
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToStaticMarkup(<MetaTestProvider><StaticRouterProvider context={context} router={router} /></MetaTestProvider>);
}

test("RE-engage settings renders WhatsApp, the fixed Gmail sender, cap, and local send window", async () => {
  const markup = await renderSettings();

  assert.match(markup, />RE-engage settings</);
  assert.match(markup, />Needs attention</);
  assert.match(markup, /<ul/);
  assert.match(markup, /<li[\s\S]*?Reconnect the paired phone/);
  assert.match(markup, />Check connection</);
  assert.match(markup, />Email · Gmail</);
  assert.match(markup, />Connected Gmail account</);
  assert.match(markup, /cannot be changed per campaign/);
  assert.match(markup, />Check Gmail</);
  assert.doesNotMatch(markup, /type="email"/);
  assert.match(markup, />12-hour cap</);
  assert.match(markup, />20 messages \/ 12h/);
  assert.match(markup, />14 used this window/);
  assert.match(markup, />Resets at 12:00 pm SGT\./);
  assert.match(markup, /type="time"/);
  assert.match(markup, /Local preference/);
  assert.match(markup, /Device-local planning preference/);
  assert.match(markup, /midnight and noon Singapore time/);
  assert.match(markup, /does not delay approved messages yet/);
  assert.doesNotMatch(markup, /Apollo|Hi-Hunt discovery|Prospecting email/);
  assert.doesNotMatch(markup, />Save changes</);
});

test("send-window validation is connected to both time controls", async () => {
  const markup = await renderSettings({ ...DEFAULT_REENGAGE_SETTINGS, sendWindowStart: "18:00", sendWindowEnd: "09:00" });

  assert.match(markup, /id="send-window-start"[^>]*aria-describedby="send-window-error"[^>]*aria-invalid="true"/);
  assert.match(markup, /id="send-window-end"[^>]*aria-describedby="send-window-error"[^>]*aria-invalid="true"/);
  assert.match(markup, /id="send-window-error"[^>]*role="alert"/);
});

test("settings uses the data-router blocker and system confirmation while retaining hard-unload protection", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/SettingsPage.tsx"), "utf8");
  assert.match(source, /useBlocker/);
  assert.match(source, /<ConfirmDialog/);
  assert.match(source, /beforeunload/);
  assert.match(source, /confirmedNavigation\.current/);
  assert.doesNotMatch(source, /window\.confirm|document\.addEventListener|popstate/);
});
