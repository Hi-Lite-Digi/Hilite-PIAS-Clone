import * as React from "react";
import { cn } from "../ui/utils";

type Status = "running" | "live" | "paused" | "draft" | "done" | "error" | "failed" | "queued";
type CanonicalStatus = Exclude<Status, "live" | "failed">;

const statusLabels: Record<CanonicalStatus, string> = {
  running: "Running",
  paused: "Paused",
  draft: "Draft",
  done: "Done",
  error: "Error",
  queued: "Queued",
};

const statusClasses: Record<CanonicalStatus, { dot: string; pill: string; pillDot?: string }> = {
  running: { dot: "bg-accent", pill: "bg-accent text-ink", pillDot: "bg-ink" },
  paused: { dot: "bg-ink-3", pill: "bg-surface-2 text-ink-2" },
  draft: { dot: "bg-ink-3", pill: "border border-line bg-surface-2 text-ink-2" },
  done: { dot: "bg-mint", pill: "bg-mint text-ink", pillDot: "bg-ink/60" },
  error: { dot: "bg-danger", pill: "bg-danger/10 text-danger" },
  queued: { dot: "bg-cyan", pill: "bg-cyan text-ink", pillDot: "bg-ink/60" },
};

function normalizeStatus(status: Status): CanonicalStatus {
  if (status === "live") return "running";
  if (status === "failed") return "error";
  return status;
}

type StatusProps = {
  status: Status;
  label?: string;
  className?: string;
};

function StatusDot({ className, label, status }: StatusProps) {
  const canonical = normalizeStatus(status);
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn("inline-block size-2.5 shrink-0 rounded-full", statusClasses[canonical].dot, className)}
      data-status={canonical}
      data-slot="status-dot"
      role={label ? "img" : undefined}
    />
  );
}

function StatusPill({ className, label, status }: StatusProps) {
  const canonical = normalizeStatus(status);
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-1 text-chip font-medium",
        statusClasses[canonical].pill,
        className,
      )}
      data-status={canonical}
      data-slot="status-pill"
    >
      <StatusDot status={canonical} className={cn("size-1.5", statusClasses[canonical].pillDot)} />
      {label ?? statusLabels[canonical]}
    </span>
  );
}

export { StatusDot, StatusPill, normalizeStatus };
export type { CanonicalStatus, Status, StatusProps };
