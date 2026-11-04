import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../ui/utils";

type EmptyStateProps = React.ComponentPropsWithoutRef<"div"> & {
  icon: LucideIcon;
  message: React.ReactNode;
  action?: React.ReactNode;
};

function EmptyState({ action, className, icon: Icon, message, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn("flex min-h-48 flex-col items-center justify-center rounded-card bg-surface-2 px-5 py-8 text-center", className)}
      data-slot="empty-state"
      {...props}
    >
      <span className="mb-3 inline-flex size-11 items-center justify-center rounded-full bg-surface text-ink-2">
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </span>
      <p className="text-body text-ink-2">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
