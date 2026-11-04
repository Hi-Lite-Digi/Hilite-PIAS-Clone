import { cn } from "../ui/utils";
import { WORKSPACES, type WorkspaceId } from "../../navigation";

type WorkspaceSwitcherProps = {
  activeWorkspace: WorkspaceId;
  onWorkspaceChange: (workspace: WorkspaceId) => void;
  className?: string;
};

function shouldChangeWorkspace(activeWorkspace: WorkspaceId, nextWorkspace: WorkspaceId) {
  return activeWorkspace !== nextWorkspace;
}

function WorkspaceSwitcher({ activeWorkspace, className, onWorkspaceChange }: WorkspaceSwitcherProps) {
  return (
    <div
      aria-label="Workspace"
      className={cn("inline-flex shrink-0 items-center rounded-full bg-surface-2 p-1", className)}
      data-slot="workspace-switcher"
      role="group"
    >
      {(Object.keys(WORKSPACES) as WorkspaceId[]).map((workspaceId) => {
        const selected = activeWorkspace === workspaceId;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "min-h-11 rounded-full px-2 text-chip font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9 md:px-3.5",
              selected ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface hover:text-ink",
            )}
            data-slot="workspace-option"
            data-state={selected ? "active" : "inactive"}
            key={workspaceId}
            onClick={() => {
              if (shouldChangeWorkspace(activeWorkspace, workspaceId)) onWorkspaceChange(workspaceId);
            }}
            type="button"
          >
            {WORKSPACES[workspaceId].label}
          </button>
        );
      })}
    </div>
  );
}

export { WorkspaceSwitcher, shouldChangeWorkspace };
export type { WorkspaceSwitcherProps };
