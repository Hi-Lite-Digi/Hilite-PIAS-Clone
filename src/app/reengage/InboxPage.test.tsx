import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router";
import type { ReplyConversationRecord } from "../../lib/api";
import InboxPage from "./InboxPage";

const sampleThread: ReplyConversationRecord = {
  id: 42,
  leadId: 7,
  campaignId: "june/seminar",
  leadName: "Aisha Rahman",
  initials: "AR",
  color: "mint",
  company: "WhatsApp",
  title: "WhatsApp reply",
  email: "aisha@example.com",
  phone: "+65 8123 4567",
  campaign: "June Seminar",
  subject: "June Seminar",
  preview: "Could you share the venue?",
  occurredAt: "2026-08-26T09:00:00.000Z",
  read: false,
  starred: false,
  category: "Question",
  thread: [
    { id: "one", from: "us", senderName: "Hilite", senderContact: "+65 8000 0000", occurredAt: "2026-08-25T08:00:00.000Z", body: "Hi Aisha, registration is open." },
    { id: "two", from: "lead", senderName: "Aisha", senderContact: "+65 8123 4567", occurredAt: "2026-08-26T09:00:00.000Z", body: "Could you share the venue?" },
  ],
};

function renderInbox(pathname: string) {
  return renderToStaticMarkup(
    <StaticRouter location={pathname}>
      <Routes>
        <Route
          path="/reengage/inbox/:threadId?"
          element={(
            <InboxPage
              initialSample
              initialSelectedThread={sampleThread}
              initialThreads={[sampleThread]}
            />
          )}
        />
      </Routes>
    </StaticRouter>,
  );
}

test("inbox renders a 360px desktop list, campaign filters, sample marker, and addressable rows", () => {
  const markup = renderInbox("/reengage/inbox");
  assert.match(markup, /data-slot="inbox-list"/);
  assert.match(markup, /md:w-\[360px\]/);
  assert.match(markup, /aria-label="Search conversations"/);
  assert.match(markup, />June Seminar</);
  assert.match(markup, /href="\/reengage\/inbox\/42"/);
  assert.match(markup, />Sample data</);
  assert.match(markup, />Select a conversation</);
});

test("inbox detail has mobile back navigation, campaign context, thread controls, and confirm-free composer", () => {
  const markup = renderInbox("/reengage/inbox/42");
  assert.match(markup, /aria-label="Back to conversations"/);
  assert.match(markup, /Replied to:/);
  assert.match(markup, />June Seminar</);
  assert.match(markup, /aria-label="Star conversation"/);
  assert.match(markup, />Mark unread</);
  assert.match(markup, /aria-label="Reply to Aisha Rahman"/);
  assert.match(markup, /aria-label="Attach image"/);
  assert.match(markup, />Send</);
  assert.match(markup, /Enter to send · Shift\+Enter for a new line/);
  assert.doesNotMatch(markup, /Confirm &amp; send|Review send/);
});

test("conversation clicks select immediately and the composer submits Enter without consuming Shift+Enter", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/InboxPage.tsx"), "utf8");
  assert.match(source, /onClick=\{\(event\) => \{[\s\S]*setSelectedThread\(thread\)/);
  assert.match(source, /event\.key !== "Enter" \|\| event\.shiftKey \|\| event\.nativeEvent\.isComposing/);
  assert.match(source, /event\.preventDefault\(\);\s*void sendMessage\(\);/);
});

test("the live inbox refreshes visible conversations and animates newly observed bubbles", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/InboxPage.tsx"), "utf8");
  assert.match(source, /window\.setInterval\(refreshVisibleInbox, 4_000\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", refreshVisibleInbox\)/);
  assert.match(source, /findMatchingThread\(result\.data, current\)/);
  assert.match(source, /<SettledItem[\s\S]*key=\{message\.id\}/);
});

test("failed inbox loads render stable manual retry states", () => {
  const listMarkup = renderToStaticMarkup(
    <StaticRouter location="/reengage/inbox">
      <InboxPage initialListError="Inbox service is offline" />
    </StaticRouter>,
  );
  assert.match(listMarkup, /Inbox service is offline/);
  assert.match(listMarkup, />Try again</);

  const threadMarkup = renderToStaticMarkup(
    <StaticRouter location="/reengage/inbox/99">
      <Routes>
        <Route path="/reengage/inbox/:threadId" element={<InboxPage initialThreadError="Conversation service is offline" initialThreads={[]} />} />
      </Routes>
    </StaticRouter>,
  );
  assert.match(threadMarkup, /Conversation service is offline/);
  assert.match(threadMarkup, />Try again</);
});

test("successful sends reconcile into the thread and remove their optimistic pending entry", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/InboxPage.tsx"), "utf8");
  assert.match(source, /reconcileSuccessfulReply/);
  assert.match(source, /removePendingReply/);
  assert.doesNotMatch(source, /deliveryState:\s*undefined/);
});

test("the RE-engage composer uploads and sends private image attachments", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/InboxPage.tsx"), "utf8");
  assert.match(source, /getPosterUploadTicket\(file\)/);
  assert.match(source, /uploadPosterFile\(file, ticket\)/);
  assert.match(source, /attachmentPath: imageAttachment\.path/);
  assert.match(source, /pending\.attachmentPath/);
  assert.match(source, /Attach an image or write a reply/);
  assert.match(source, /message\.attachment\.url/);
  assert.match(source, /message\.attachment\.kind === "sticker"/);
  assert.match(source, /MEDIA_ONLY_BODIES/);
  assert.match(source, /loading="lazy"/);
});

test("long conversations expose a one-click jump to the latest message", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/reengage/InboxPage.tsx"), "utf8");
  assert.match(source, /aria-label="Jump to latest message"/);
  assert.match(source, /container\.scrollTo\(\{ top: container\.scrollHeight, behavior: "smooth" \}\)/);
  assert.match(source, /onScroll=\{\(event\) => updateJumpToLatest\(event\.currentTarget\)\}/);
});
