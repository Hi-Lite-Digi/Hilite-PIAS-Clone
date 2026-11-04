import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { NavPills } from "./nav-pills";
import { WorkspaceSwitcher, shouldChangeWorkspace } from "./workspace-switcher";

function render(node: React.ReactNode) {
  return renderToStaticMarkup(node);
}

test("workspace switcher identifies the current segment and keeps both targets touch-sized", () => {
  const switcher = render(
    <WorkspaceSwitcher activeWorkspace="reengage" onWorkspaceChange={() => undefined} />,
  );

  assert.match(switcher, /aria-label="Workspace"/);
  assert.equal((switcher.match(/data-slot="workspace-option"/g) ?? []).length, 2);
  assert.match(switcher, /aria-pressed="true"[^>]*>RE-engage</);
  assert.match(switcher, /aria-pressed="false"[^>]*>Hi-Hunt</);
  assert.equal((switcher.match(/min-h-11/g) ?? []).length, 2);
  assert.equal((switcher.match(/md:min-h-9/g) ?? []).length, 2);
  assert.equal(shouldChangeWorkspace("reengage", "reengage"), false);
  assert.equal(shouldChangeWorkspace("reengage", "hihunt"), true);
});

test("top RE-engage navigation exposes six links, one current page, and hides labels below xl", () => {
  const navigation = render(
    <StaticRouter location="/reengage/campaigns/example">
      <NavPills workspace="reengage" placement="top" badgeCounts={{ inbox: 3 }} />
    </StaticRouter>,
  );

  assert.match(navigation, /aria-label="RE-engage primary navigation"/);
  assert.match(navigation, /data-placement="top"/);
  assert.equal((navigation.match(/data-slot="nav-pill"/g) ?? []).length, 6);
  assert.equal((navigation.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(navigation, /aria-current="page"[^>]*href="\/reengage\/campaigns"/);
  assert.equal((navigation.match(/hidden xl:inline/g) ?? []).length, 6);
  for (const label of ["Home", "Leads", "Campaigns", "Calendar", "Settings"]) {
    assert.match(navigation, new RegExp(`aria-label="${label}"`));
  }
  assert.match(navigation, /aria-label="Inbox, 3 unread"/);
  assert.match(navigation, /aria-hidden="true"[^>]*hidden[^>]*xl:inline-flex/);
  assert.match(navigation, /absolute -right-2 -top-1 size-2 rounded-full bg-accent xl:hidden/);
  assert.equal((navigation.match(/size-5/g) ?? []).length, 6);
});

test("bottom Hi-Hunt navigation keeps all six labels visible and renders optional badge counts", () => {
  const navigation = render(
    <StaticRouter location="/hihunt/inbox/thread-1">
      <NavPills workspace="hihunt" placement="bottom" badgeCounts={{ inbox: 3 }} />
    </StaticRouter>,
  );

  assert.match(navigation, /aria-label="Hi-Hunt primary navigation"/);
  assert.match(navigation, /data-placement="bottom"/);
  assert.equal((navigation.match(/data-slot="nav-pill"/g) ?? []).length, 6);
  assert.match(navigation, /aria-current="page"[^>]*href="\/hihunt\/inbox"/);
  assert.match(navigation, /aria-label="Inbox, 3 unread"/);
  assert.doesNotMatch(navigation, /hidden xl:inline/);
  for (const label of ["Home", "Leads", "Campaigns", "Workflows", "Inbox", "Settings"]) {
    assert.match(navigation, new RegExp(`>${label}<`));
  }
});
