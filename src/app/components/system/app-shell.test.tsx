import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes, StaticRouter } from "react-router";
import {
  AppShell,
  getInboxLinkLabel,
  getWorkspaceInboxBadge,
  getWorkspaceNavBadges,
  getLifecycleNewBadge,
  updateEmailBadges,
  updateReplyBadges,
} from "./app-shell";
import { EMPTY_BADGES } from "../../layout/BadgesContext";

function renderShell(pathname: string) {
  return renderToStaticMarkup(
    <StaticRouter location={pathname}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/reengage" element={<main>Workspace content</main>} />
          <Route path="/hihunt" element={<main>Workspace content</main>} />
        </Route>
      </Routes>
    </StaticRouter>,
  );
}

test("the shell exposes the floating desktop frame and edge-to-edge mobile structure", () => {
  const shell = renderShell("/reengage");

  assert.match(shell, /data-slot="app-shell"/);
  assert.match(shell, /md:p-4/);
  assert.match(shell, /xl:p-6/);
  assert.match(shell, /md:rounded-container/);
  assert.match(shell, /md:shadow-shell/);
  assert.doesNotMatch(shell, /max-w-\[1600px\]/);
  assert.match(shell, />Workspace content</);
  assert.match(shell, /aria-label="Hilite home"/);
  assert.match(shell, />Hilite</);
  assert.doesNotMatch(shell, /lucide-target/);
});

test("the shell renders desktop and mobile Hi-Hunt navigation with one toast host", () => {
  const shell = renderShell("/hihunt");

  assert.equal((shell.match(/data-slot="nav-pill"/g) ?? []).length, 12);
  assert.match(shell, /data-placement="top"/);
  assert.match(shell, /data-placement="bottom"/);
  assert.equal((shell.match(/data-slot="toast-viewport"/g) ?? []).length, 1);
  assert.match(shell, /aria-label="Hi-Hunt primary navigation"/);
  assert.doesNotMatch(shell, /New campaign/);
  assert.equal(getInboxLinkLabel("RE-engage", 3), "Open RE-engage inbox, 3 unread");
});

test("mobile shell controls remain touch-sized and the bottom nav includes safe-area padding", () => {
  const shell = renderShell("/reengage");

  assert.match(shell, /data-slot="mobile-topbar"/);
  assert.match(shell, /min-h-11/);
  assert.match(shell, /safe-area-inset-bottom/);
});

test("unchanged inbox counts preserve badge state identity instead of retriggering consumers", () => {
  const current = { ...EMPTY_BADGES, repliesUnread: 2, repliesTotal: 5 };
  assert.equal(updateReplyBadges(current, { unread: 2, total: 5 }), current);
  assert.notEqual(updateReplyBadges(current, { unread: 1, total: 5 }), current);
});

test("Hi-Hunt uses email unread counts for both its topbar and inbox tab", () => {
  const current = { ...EMPTY_BADGES, emailUnread: 4, emailTotal: 9, outreachDrafts: 3, prospectsNew: 6 };
  assert.equal(getWorkspaceInboxBadge("hihunt", current), 4);
  assert.deepEqual(getWorkspaceNavBadges("hihunt", current), { home: 3, leads: 6, inbox: 4 });
  assert.equal(getInboxLinkLabel("Hi-Hunt", 4), "Open Hi-Hunt inbox, 4 unread");
  assert.equal(updateEmailBadges(current, { unread: 4, total: 9 }), current);
  assert.notEqual(updateEmailBadges(current, { unread: 3, total: 9 }), current);
});

test("Hi-Hunt lead badges use authoritative lifecycle counts only", () => {
  assert.equal(getLifecycleNewBadge({ lifecycle: { new: 7 } }), 7);
  assert.equal(getLifecycleNewBadge({ new: 23 }), null);
});
