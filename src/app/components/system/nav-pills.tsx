import {
  CalendarDays,
  House,
  Inbox,
  Megaphone,
  Settings2,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import {
  WORKSPACES,
  getActiveTab,
  type WorkspaceId,
  type WorkspaceTabId,
} from "../../navigation";
import { cn } from "../ui/utils";

type NavPlacement = "top" | "bottom";

type NavPillsProps = {
  workspace: WorkspaceId;
  placement?: NavPlacement;
  badgeCounts?: Partial<Record<WorkspaceTabId, number>>;
  className?: string;
};

const TAB_ICONS: Record<WorkspaceTabId, LucideIcon> = {
  home: House,
  leads: UsersRound,
  campaigns: Megaphone,
  calendar: CalendarDays,
  workflows: Workflow,
  inbox: Inbox,
  settings: Settings2,
};

function NavPills({ badgeCounts, className, placement = "top", workspace }: NavPillsProps) {
  const location = useLocation();
  const workspaceConfig = WORKSPACES[workspace];
  const activeTab = getActiveTab(location.pathname, workspace);

  return (
    <nav
      aria-label={`${workspaceConfig.label} primary navigation`}
      className={cn(
        placement === "top"
          ? "flex items-center gap-1 rounded-full bg-surface-2 p-1"
          : "flex w-full items-stretch justify-around gap-0.5",
        className,
      )}
      data-placement={placement}
      data-slot="nav-pills"
    >
      {workspaceConfig.tabs.map((tab) => {
        const Icon = TAB_ICONS[tab.id];
        const active = activeTab?.id === tab.id;
        const badgeCount = badgeCounts?.[tab.id] ?? 0;
        return (
          <Link
            aria-label={badgeCount > 0 ? `${tab.label}, ${badgeCount} unread` : tab.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex min-w-0 items-center justify-center rounded-full font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              placement === "top"
                ? "min-h-9 gap-2 px-3 text-chip"
                : "min-h-11 flex-1 flex-col gap-0.5 px-1 py-1.5 text-chip leading-none",
              active ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface hover:text-ink",
            )}
            data-slot="nav-pill"
            key={tab.id}
            to={tab.path}
          >
            <span className="relative inline-flex shrink-0" aria-hidden="true">
              <Icon className="size-5" strokeWidth={1.75} />
              {badgeCount > 0 && (
                <span
                  className={cn(
                    "absolute -right-2 -top-1 size-2 rounded-full bg-accent",
                    placement === "top" && "xl:hidden",
                  )}
                />
              )}
            </span>
            <span className={cn(placement === "top" && "hidden xl:inline")}>{tab.label}</span>
            {badgeCount > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "tabular-nums",
                  placement === "top"
                    ? "hidden rounded-full bg-accent px-1.5 py-0.5 text-chip leading-none text-ink xl:inline-flex"
                    : "sr-only",
                )}
              >
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export { NavPills };
export type { NavPillsProps, NavPlacement };
