import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";
import type { EmailAccountRecord, EmailThreadRecord } from "../../lib/stubs";
import InboxPage from "./InboxPage";

const selected: EmailThreadRecord = {
  id: "thread-1",
  prospectId: "prospect-1",
  workflowId: "workflow-1",
  workflowName: "HR leaders",
  sender: { name: "Rachel Tan", address: "rachel@example.com" },
  subject: "Re: Financial wellness",
  snippet: "Could you send details?",
  lastMessageAt: "2026-08-26T03:00:00.000Z",
  unread: true,
  status: "needs_reply",
  category: "Interested",
  messages: [{ id: "message-1", direction: "inbound", from: { name: "Rachel Tan", address: "rachel@example.com" }, to: [{ name: "JJ", address: "jj@example.com" }], occurredAt: "2026-08-26T03:00:00.000Z", body: "Could you send details?" }],
};
const account: EmailAccountRecord = { provider: "google", status: "connected", address: "jj@example.com", displayName: "JJ", connectedAt: "2026-08-20T01:00:00.000Z", lastSyncAt: "2026-08-26T01:00:00.000Z", error: null, cap: { limit: 30, used: 8, remaining: 22 } };

async function renderInbox(pathname: string) {
  const routes = [{ path: "/hihunt/inbox/:threadId?", element: <InboxPage initialAccount={account} initialSample={false} initialSelectedThread={selected} initialThreads={[selected]} /> }];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`http://localhost${pathname}`));
  assert.ok(!(context instanceof Response));
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToStaticMarkup(<StaticRouterProvider context={context} router={router} />);
}

async function renderInboxWithAccountError(message: string) {
  const routes = [{
    path: "/hihunt/inbox/:threadId?",
    element: (
      <InboxPage
        initialAccountError={message}
        initialSample={false}
        initialSelectedThread={selected}
        initialThreads={[selected]}
      />
    ),
  }];
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request("http://localhost/hihunt/inbox/thread-1"));
  assert.ok(!(context instanceof Response));
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToStaticMarkup(<StaticRouterProvider context={context} router={router} />);
}

test("Hi-Hunt inbox renders email-shaped list, thread cards, and connected composer", async () => {
  const markup = await renderInbox("/hihunt/inbox/thread-1");
  assert.match(markup, /Rachel Tan/);
  assert.match(markup, /Re: Financial wellness/);
  assert.match(markup, /HR leaders/);
  assert.match(markup, /From/);
  assert.match(markup, /To/);
  assert.match(markup, /Needs reply/);
  assert.match(markup, /Sending from jj@example\.com/);
  assert.match(markup, /Interested/);
  assert.match(markup, /Follow-up/);
  assert.match(markup, /Uninterested/);
  assert.match(markup, />All/);
});

test("email-account failures show the actual error with manual retry", async () => {
  const markup = await renderInboxWithAccountError("Mailbox status failed");
  assert.match(markup, /Mailbox status failed/);
  assert.match(markup, /Retry account/);
  assert.doesNotMatch(markup, /Connect an email account in Settings to reply/);
});

test("email thread failures require manual retry and replies use the strict contract", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/hihunt/InboxPage.tsx"), "utf8");
  assert.match(source, /threadRetry/);
  assert.match(source, /getEmailThreadRequestDecision/);
  assert.match(source, /replyGenerationByThread/);
  assert.match(source, /listMutationGeneration/);
  assert.match(source, /replyToEmailThread/);
  assert.match(source, /!listSample && !threadSample/);
  assert.match(source, /if \(!result\.sample\) onCountsChangeRef/);
  assert.match(source, /if \(!result\.sample\) setThreads/);
  assert.match(source, /selectedMatchesRoute/);
  assert.match(source, /Try again/);
  assert.doesNotMatch(source, /setInterval|setTimeout\([^,]+,\s*0/);
});
