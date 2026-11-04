import * as React from "react";
import { cn } from "../ui/utils";

type PageHeaderProps = React.ComponentPropsWithoutRef<"header"> & {
  title: React.ReactNode;
  meta?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
};

function PageHeader({ actions, className, meta, subtitle, title, ...props }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)} data-slot="page-header" {...props}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-page-title font-medium tracking-[-0.01em] text-ink">{title}</h1>
          {meta && <span className="text-label text-ink-2">{meta}</span>}
        </div>
        {subtitle && <p className="mt-1.5 max-w-2xl text-body text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  );
}

export { PageHeader };
export type { PageHeaderProps };
