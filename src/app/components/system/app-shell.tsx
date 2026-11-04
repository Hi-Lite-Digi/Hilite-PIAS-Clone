import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Link, useLocation, useNavigate, useOutlet } from "react-router";
import { BrandLogo } from "./brand-logo";
import {
  WORKSPACES,
  getSwitchTarget,
  getWorkspaceFromPath,
  rememberLocation,
  type WorkspaceId,
} from "../../navigation";
import { BadgesProvider, EMPTY_BADGES, type Badges } from "../../layout/BadgesContext";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { PageTransition, getPageMotionKey } from "./motion";
import { NavPills } from "./nav-pills";
import { Toast } from "./toast";
import { WorkspaceSwitcher } from "./workspace-switcher";

function getInboxLinkLabel(workspaceLabel: string, unreadCount: number) {
  const baseLabel = `Open ${workspaceLabel} inbox`;
  return unreadCount > 0 ? `${baseLabel}, ${unreadCount} unread` : baseLabel;
}

function updateReplyBadges(current: Badges, counts: { unread: number; total: number }): Badges {
  if (current.repliesUnread === counts.unread && current.repliesTotal === counts.total) return current;
  return { ...current, repliesUnread: counts.unread, repliesTotal: counts.total };
}

function updateEmailBadges(current: Badges, counts: { unread: number; total: number }): Badges {
  if (current.emailUnread === counts.unread && current.emailTotal === counts.total) return current;
  return { ...current, emailUnread: counts.unread, emailTotal: counts.total };
}

function getLifecycleNewBadge(summary: { lifecycle?: { new: number }; [key: string]: unknown }): number | null {
  return summary.lifecycle?.new ?? null;
}

function getWorkspaceInboxBadge(workspace: WorkspaceId, badges: Badges) {
  return workspace === "reengage" ? badges.repliesUnread : badges.emailUnread;
}

function getWorkspaceNavBadges(workspace: WorkspaceId, badges: Badges): Record<string, number> {
  return workspace === "reengage"
    ? { inbox: badges.repliesUnread }
    : { home: badges.outreachDrafts, leads: badges.prospectsNew, inbox: badges.emailUnread };
}

function RouteLoadingFallback() {
  return (
    <main
      aria-label="Loading page"
      aria-live="polite"
      className="min-h-0 flex-1 overflow-hidden bg-bg px-4 py-5 md:px-7 md:py-7"
      role="status"
    >
      <div className="mx-auto max-w-[1180px] animate-pulse space-y-5">
        <div className="h-9 w-48 rounded-control bg-surface-2" />
        <div className="h-24 rounded-card bg-surface" />
        <div className="h-64 rounded-card bg-surface" />
        <span className="sr-only">Loading page</span>
      </div>
    </main>
  );
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const [badges, setBadges] = useState<Badges>(EMPTY_BADGES);
  const activeWorkspaceId = getWorkspaceFromPath(location.pathname) ?? "reengage";
  const workspace = WORKSPACES[activeWorkspaceId];

  const refresh = useCallback(async () => {
    if (activeWorkspaceId === "reengage") {
      if (location.pathname.startsWith("/reengage/inbox")) return;
      const { getReplies } = await import("../../../lib/api");
      getReplies()
        .then((result) =>
          setBadges((current) => ({ ...current, repliesUnread: result.unread, repliesTotal: result.total })),
        )
        .catch(() => {
          // Keep the last known counts if the live inbox is temporarily unavailable.
        });
      return;
    }

    const [{ getHRProspects }, { getEmailThreads, getOutreachDrafts }] = await Promise.all([
      import("../../../lib/api"),
      import("../../../lib/stubs"),
    ]);
    getHRProspects({ limit: 1 })
      .then((result) => {
        const prospectsNew = getLifecycleNewBadge(result.summary);
        if (prospectsNew !== null) setBadges((current) => ({ ...current, prospectsNew }));
      })
      .catch(() => {});
    getOutreachDrafts()
      .then((result) => {
        if (!result.sample) setBadges((current) => ({ ...current, outreachDrafts: result.summary.draft }));
      })
      .catch(() => {});
    if (!location.pathname.startsWith("/hihunt/inbox")) {
      getEmailThreads()
        .then((result) => {
          if (!result.sample) setBadges((current) => updateEmailBadges(current, result));
        })
        .catch(() => {});
    }
  }, [activeWorkspaceId, location.pathname]);

  useEffect(() => {
    rememberLocation(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) refresh();
    };

    refresh();
    const intervalId = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  const setReplyCounts = useCallback((counts: { unread: number; total: number }) => {
    setBadges((current) => updateReplyBadges(current, counts));
  }, []);

  const setEmailCounts = useCallback((counts: { unread: number; total: number }) => {
    setBadges((current) => updateEmailBadges(current, counts));
  }, []);

  const contextValue = useMemo(
    () => ({
      ...badges,
      setEmailCounts,
      setReplyCounts,
      refresh,
    }),
    [badges, refresh, setEmailCounts, setReplyCounts],
  );

  const changeWorkspace = (nextWorkspace: WorkspaceId) => {
    navigate(getSwitchTarget(nextWorkspace));
  };

  const inboxPath = workspace.tabs.find((tab) => tab.id === "inbox")?.path ?? `${workspace.root}/inbox`;
  const inboxBadge = getWorkspaceInboxBadge(activeWorkspaceId, badges);
  const navBadges = getWorkspaceNavBadges(activeWorkspaceId, badges);

  return (
    <BadgesProvider value={contextValue}>
      <div className="h-dvh overflow-hidden bg-bg p-0 md:p-4 xl:p-6" data-slot="app-shell">
        <div className="flex h-full flex-col overflow-hidden bg-surface md:rounded-container md:shadow-shell">
          <header
            className="flex min-h-[68px] shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4 md:gap-4 md:px-7"
            data-slot="mobile-topbar"
          >
            <Link
              aria-label="Hilite home"
              className="inline-flex shrink-0 items-center rounded-control outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              to={workspace.root}
            >
              <BrandLogo className="h-8 text-[1.75rem] md:text-[2rem]" />
            </Link>

            <WorkspaceSwitcher activeWorkspace={activeWorkspaceId} onWorkspaceChange={changeWorkspace} />

            <NavPills
              badgeCounts={navBadges}
              className="ml-auto hidden md:flex"
              placement="top"
              workspace={activeWorkspaceId}
            />

            <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
              <Link
                aria-label={getInboxLinkLabel(workspace.label, inboxBadge)}
                className="relative hidden size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2 outline-none transition-colors hover:bg-ink hover:text-surface focus-visible:ring-3 focus-visible:ring-ring/50 md:inline-flex"
                to={inboxPath}
              >
                <Inbox aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
                {inboxBadge > 0 && (
                  <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-chip font-semibold leading-4 text-ink">
                    {inboxBadge > 99 ? "99+" : inboxBadge}
                  </span>
                )}
              </Link>
              <Avatar aria-label="Account" className="size-10 bg-surface-2" role="img">
                <AvatarFallback className="bg-surface-2 text-chip font-semibold text-ink">HH</AvatarFallback>
              </Avatar>
            </div>
          </header>

          {import.meta.env.VITE_DEMO_MODE === "true" && (
            <div className="shrink-0 border-b border-line bg-mint px-3 py-2 text-center text-chip text-ink sm:px-4 md:px-7" role="note">
              Demo · Fictional data · Sending disabled
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-slot="app-shell-outlet">
            <Suspense fallback={<RouteLoadingFallback />}>
              <PageTransition motionKey={getPageMotionKey(location.pathname)}>
                {outlet}
              </PageTransition>
            </Suspense>
          </div>

          <NavPills
            badgeCounts={navBadges}
            className="shrink-0 border-t border-line bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
            placement="bottom"
            workspace={activeWorkspaceId}
          />
        </div>
      </div>
      <Toast />
    </BadgesProvider>
  );
}

export {
  AppShell,
  getInboxLinkLabel,
  getLifecycleNewBadge,
  getWorkspaceInboxBadge,
  getWorkspaceNavBadges,
  updateEmailBadges,
  updateReplyBadges,
};
