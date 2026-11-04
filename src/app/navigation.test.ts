import assert from "node:assert/strict";
import test from "node:test";
import {
  LAST_WORKSPACE_KEY,
  WORKSPACES,
  getActiveTab,
  getSwitchTarget,
  getWorkspaceFromPath,
  getWorkspaceRoot,
  rememberLocation,
  resolveLegacyRedirect,
  type NavigationStorage,
} from "./navigation";

function createStorage(initial: Record<string, string> = {}): NavigationStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("each workspace exposes its approved tab information architecture", () => {
  assert.deepEqual(
    WORKSPACES.reengage.tabs.map(({ id, label, path }) => ({ id, label, path })),
    [
      { id: "home", label: "Home", path: "/reengage" },
      { id: "leads", label: "Leads", path: "/reengage/leads" },
      { id: "campaigns", label: "Campaigns", path: "/reengage/campaigns" },
      { id: "calendar", label: "Calendar", path: "/reengage/calendar" },
      { id: "inbox", label: "Inbox", path: "/reengage/inbox" },
      { id: "settings", label: "Settings", path: "/reengage/settings" },
    ],
  );
  assert.deepEqual(
    WORKSPACES.hihunt.tabs.map(({ id, label, path }) => ({ id, label, path })),
    [
      { id: "home", label: "Home", path: "/hihunt" },
      { id: "leads", label: "Leads", path: "/hihunt/leads" },
      { id: "campaigns", label: "Campaigns", path: "/hihunt/campaigns" },
      { id: "workflows", label: "Workflows", path: "/hihunt/workflows" },
      { id: "inbox", label: "Inbox", path: "/hihunt/inbox" },
      { id: "settings", label: "Settings", path: "/hihunt/settings" },
    ],
  );
});

test("workspace and active-tab detection honor path boundaries and detail routes", () => {
  assert.equal(getWorkspaceFromPath("/reengage/campaigns/42"), "reengage");
  assert.equal(getWorkspaceFromPath("/hihunt/inbox/thread-7"), "hihunt");
  assert.equal(getWorkspaceFromPath("/reengagement"), null);
  assert.equal(getWorkspaceFromPath("/settings"), null);

  assert.equal(getActiveTab("/reengage", "reengage")?.id, "home");
  assert.equal(getActiveTab("/reengage/campaigns/42", "reengage")?.id, "campaigns");
  assert.equal(getActiveTab("/reengage/calendar", "reengage")?.id, "calendar");
  assert.equal(getActiveTab("/hihunt/campaigns/new", "hihunt")?.id, "campaigns");
  assert.equal(getActiveTab("/hihunt/workflows/weekly", "hihunt")?.id, "workflows");
  assert.equal(getActiveTab("/hihunt/unknown", "hihunt"), null);
});

test("navigation memory stores safe tab roots independently per workspace", () => {
  const storage = createStorage();

  rememberLocation("/reengage/campaigns/42", storage);
  rememberLocation("/hihunt/inbox/thread-7", storage);

  assert.equal(storage.getItem(LAST_WORKSPACE_KEY), "hihunt");
  assert.equal(getSwitchTarget("reengage", storage), "/reengage/campaigns");
  assert.equal(getSwitchTarget("hihunt", storage), "/hihunt/inbox");
  assert.equal(storage.values.has("/reengage/campaigns/42"), false);
});

test("invalid or unavailable storage falls back safely without throwing", () => {
  const throwingStorage: NavigationStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  const invalidStorage = createStorage({
    [LAST_WORKSPACE_KEY]: "elsewhere",
    "hihunt:v2:last-tab:reengage": "/reengage/not-a-tab",
  });

  assert.doesNotThrow(() => rememberLocation("/reengage/leads", throwingStorage));
  assert.equal(getWorkspaceRoot(throwingStorage), "/reengage");
  assert.equal(getSwitchTarget("hihunt", throwingStorage), "/hihunt");
  assert.equal(getWorkspaceRoot(invalidStorage), "/reengage");
  assert.equal(getSwitchTarget("reengage", invalidStorage), "/reengage");
});

test("legacy paths resolve to their Phase 1 canonical destinations", () => {
  const storage = createStorage({ [LAST_WORKSPACE_KEY]: "hihunt" });

  assert.equal(resolveLegacyRedirect("/reengage/replies"), "/reengage/inbox");
  assert.equal(resolveLegacyRedirect("/hihunt/prospects"), "/hihunt/leads");
  assert.equal(resolveLegacyRedirect("/hihunt/outreach"), "/hihunt");
  assert.equal(resolveLegacyRedirect("/settings", storage), "/hihunt/settings");
  assert.equal(resolveLegacyRedirect("/reengage/campaigns/abc-123/edit"), "/reengage/campaigns/abc-123");
  assert.equal(resolveLegacyRedirect("/reengage/campaigns/abc-123"), null);
});
