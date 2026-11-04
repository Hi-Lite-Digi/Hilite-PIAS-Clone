import * as React from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "../ui/utils";

type SampleDataPillProps = React.ComponentPropsWithoutRef<"span"> & {
  show?: boolean;
  label?: string;
  icon?: LucideIcon;
};

function SampleDataPill({ className, icon: Icon = Sparkles, label = "Sample data", show = true, ...props }: SampleDataPillProps) {
  if (!show) return null;
  return (
    <span
      className={cn("inline-flex min-h-6 items-center gap-1.5 rounded-full bg-lavender px-2.5 py-1 text-chip font-medium text-ink-2", className)}
      data-slot="sample-data-pill"
      {...props}
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      {label}
    </span>
  );
}

export { SampleDataPill };
export type { SampleDataPillProps };
