import * as React from "react";
import { cn } from "../ui/utils";

type CardProps = Omit<React.ComponentPropsWithoutRef<"section">, "title"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
};

function Card({ action, children, className, description, footer, title, ...props }: CardProps) {
  return (
    <section
      className={cn("rounded-card border border-line bg-surface p-4 md:p-6", className)}
      data-slot="system-card"
      {...props}
    >
      {(title || description || action) && (
        <div className="mb-5 flex items-start gap-4">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-card-title font-medium text-ink">{title}</h2>}
            {description && <p className="mt-1 text-label text-ink-2">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div data-slot="card-content">{children}</div>
      {footer && <div className="mt-5 border-t border-line pt-4">{footer}</div>}
    </section>
  );
}

type StatCardProps = Omit<CardProps, "title" | "description" | "action"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  trend?: React.ReactNode;
  chart?: React.ReactNode;
};

function StatCard({ chart, className, label, trend, value, ...props }: StatCardProps) {
  return (
    <Card className={cn("min-h-36", className)} {...props}>
      <div className="flex h-full items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-label text-ink-2">{label}</p>
          <p className="mt-3 text-display font-normal tracking-[-0.01em] text-ink tabular-nums">{value}</p>
          {trend && <div className="mt-2 text-chip font-medium text-ink-2">{trend}</div>}
        </div>
        {chart && <div className="min-w-0 shrink-0 self-end">{chart}</div>}
      </div>
    </Card>
  );
}

export { Card, StatCard };
export type { CardProps, StatCardProps };
