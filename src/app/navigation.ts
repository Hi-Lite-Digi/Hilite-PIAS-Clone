export type WorkspaceId = "reengage" | "hihunt";

export type WorkspaceTabId = "home" | "leads" | "campaigns" | "calendar" | "workflows" | "inbox" | "settings";

export type WorkspaceTab = {
  id: WorkspaceTabId;
  label: string;
  path: string;
};

export type Workspace = {
  id: WorkspaceId;
  label: string;
  root: string;
  tabs: readonly WorkspaceTab[];
};

export type NavigationStorage = Pick<Storage, "getItem" | "setItem">;

export const LAST_WORKSPACE_KEY = "hihunt:v2:last-workspace";
export const LAST_TAB_KEY_PREFIX = "hihunt:v2:last-tab:";

export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  reengage: {
    id: "reengage",
    label: "RE-engage",
    root: "/reengage",
    tabs: [
      { id: "home", label: "Home", path: "/reengage" },
      { id: "leads", label: "Leads", path: "/reengage/leads" },
      { id: "campaigns", label: "Campaigns", path: "/reengage/campaigns" },
      { id: "calendar", label: "Calendar", path: "/reengage/calendar" },
      { id: "inbox", label: "Inbox", path: "/reengage/inbox" },
      { id: "settings", label: "Settings", path: "/reengage/settings" },
    ],
  },
  hihunt: {
    id: "hihunt",
    label: "Hi-Hunt",
    root: "/hihunt",
    tabs: [
      { id: "home", label: "Home", path: "/hihunt" },
      { id: "leads", label: "Leads", path: "/hihunt/leads" },
      { id: "campaigns", label: "Campaigns", path: "/hihunt/campaigns" },
      { id: "workflows", label: "Workflows", path: "/hihunt/workflows" },
      { id: "inbox", label: "Inbox", path: "/hihunt/inbox" },
      { id: "settings", label: "Settings", path: "/hihunt/settings" },
    ],
  },
};

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function getStorage(storage?: NavigationStorage | null): NavigationStorage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readStorage(key: string, storage?: NavigationStorage | null) {
  try {
    return getStorage(storage)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function getWorkspaceFromPath(pathname: string): WorkspaceId | null {
  const path = normalizePath(pathname);
  for (const workspace of Object.values(WORKSPACES)) {
    if (path === workspace.root || path.startsWith(`${workspace.root}/`)) return workspace.id;
  }
  return null;
}

export function getActiveTab(pathname: string, workspaceId: WorkspaceId): WorkspaceTab | null {
  const path = normalizePath(pathname);
  const workspace = WORKSPACES[workspaceId];

  for (const tab of workspace.tabs) {
    if (tab.id === "home") continue;
    if (path === tab.path || path.startsWith(`${tab.path}/`)) return tab;
  }

  return path === workspace.root ? workspace.tabs[0] : null;
}

export function rememberLocation(pathname: string, storage?: NavigationStorage | null) {
  const workspaceId = getWorkspaceFromPath(pathname);
  if (!workspaceId) return;
  const tab = getActiveTab(pathname, workspaceId);
  if (!tab) return;

  try {
    const target = getStorage(storage);
    target?.setItem(LAST_WORKSPACE_KEY, workspaceId);
    target?.setItem(`${LAST_TAB_KEY_PREFIX}${workspaceId}`, tab.path);
  } catch {
    // Storage may be disabled or full. Navigation still works from defaults.
  }
}

export function getSwitchTarget(workspaceId: WorkspaceId, storage?: NavigationStorage | null) {
  const workspace = WORKSPACES[workspaceId];
  const rememberedPath = readStorage(`${LAST_TAB_KEY_PREFIX}${workspaceId}`, storage);
  return workspace.tabs.some((tab) => tab.path === rememberedPath) ? rememberedPath! : workspace.root;
}

export function getWorkspaceRoot(storage?: NavigationStorage | null) {
  const rememberedWorkspace = readStorage(LAST_WORKSPACE_KEY, storage);
  return rememberedWorkspace === "hihunt" || rememberedWorkspace === "reengage"
    ? WORKSPACES[rememberedWorkspace].root
    : WORKSPACES.reengage.root;
}

export function resolveLegacyRedirect(pathname: string, storage?: NavigationStorage | null): string | null {
  const path = normalizePath(pathname);
  const fixedRedirects: Record<string, string> = {
    "/reengage/replies": "/reengage/inbox",
    "/hihunt/prospects": "/hihunt/leads",
    "/hihunt/outreach": "/hihunt",
  };
  if (fixedRedirects[path]) return fixedRedirects[path];

  if (path === "/settings") {
    const workspaceRoot = getWorkspaceRoot(storage);
    return `${workspaceRoot}/settings`;
  }

  const legacyCampaignEdit = path.match(/^\/reengage\/campaigns\/([^/]+)\/edit$/);
  return legacyCampaignEdit ? `/reengage/campaigns/${legacyCampaignEdit[1]}` : null;
}
