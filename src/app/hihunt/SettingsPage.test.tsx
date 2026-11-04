import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";
import SettingsPage from "./SettingsPage";

async function renderSettings() {
  const routes = [{
    path: "/hihunt/settings",
    element: <SettingsPage initialEmailSender={{ configured: true, provider: "Gmail", address: "namiuser89@gmail.com", displayName: "Hilite", requirement: null }} initialSenderPreference={{ senderEmail: "namiuser89@gmail.com" }} initialSettings={{ discovery: { location: "Singapore", companyDomain: "", seniorities: ["director"], dailyLimit: 15, autoRunEnabled: true }, outreach: { valueProp: "Value", senderName: "JJ", signoff: "Warm regards" } }} />,
  }];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request("http://localhost/hihunt/settings"));
  assert.ok(!(context instanceof Response));
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToStaticMarkup(<StaticRouterProvider context={context} router={router} />);
}

test("Hi-Hunt settings renders the fixed Gmail sender and email defaults", async () => {
  const markup = await renderSettings();
  assert.match(markup, />Hi-Hunt settings</);
  assert.match(markup, />Email · Gmail</);
  assert.match(markup, /namiuser89@gmail\.com/);
  assert.match(markup, /Connected Gmail account/);
  assert.match(markup, />Check Gmail</);
  assert.match(markup, /disabled=""/);
  assert.doesNotMatch(markup, /Connect Google|Connect Microsoft|Disconnect|Apollo|APOLLO_API_KEY/);
  assert.match(markup, /Default sender name/);
  assert.match(markup, /Sign-off/);
  assert.doesNotMatch(markup, />Save changes</);
});

test("Settings guards every in-app navigation plus hard unloads", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/SettingsPage.tsx"), "utf8");
  assert.match(source, /useBlocker/);
  assert.match(source, /beforeunload/);
  assert.match(source, /confirmedNavigation\.current/);
  assert.match(source, /<ConfirmDialog/);
  assert.doesNotMatch(source, /window\.confirm/);
});

test("sender preference uses the live Gmail status endpoint", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/SettingsPage.tsx"), "utf8");
  assert.match(source, /getEmailSenderStatus/);
  assert.match(source, /saveHiHuntSenderPreference/);
  assert.match(source, /secure Gmail connection/);
});
