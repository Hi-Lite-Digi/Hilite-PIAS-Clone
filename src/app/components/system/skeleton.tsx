import * as React from "react";
import { Skeleton as UiSkeleton } from "../ui/skeleton";
import { cn } from "../ui/utils";

type SkeletonProps = React.ComponentPropsWithoutRef<"div"> & {
  rows?: number;
  label?: string;
  variant?: "table" | "list" | "cards";
};

const rowClasses = {
  table: "h-11",
  list: "h-14",
  cards: "h-28",
} as const;

function Skeleton({ className, label = "Loading", rows = 4, variant = "list", ...props }: SkeletonProps) {
  return (
    <div
      aria-label={label}
      className={cn("space-y-3", className)}
      data-slot="skeleton-rows"
      role="status"
      {...props}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: Math.max(1, rows) }, (_, index) => (
        <UiSkeleton
          aria-hidden="true"
          className={cn("rounded-control bg-surface-2", rowClasses[variant])}
          data-slot="skeleton-row"
          key={index}
        />
      ))}
    </div>
  );
}

export { Skeleton };
export type { SkeletonProps };
