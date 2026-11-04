import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { cn } from "../ui/utils";

type DrawerProps = React.ComponentPropsWithoutRef<typeof Sheet> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  trigger?: React.ReactElement;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

function Drawer({ children, className, description, footer, title, trigger, ...props }: DrawerProps) {
  return (
    <Sheet {...props}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        className={cn("w-full gap-0 border-line bg-surface p-0 sm:max-w-none md:max-w-[30rem]", className)}
        side="right"
      >
        <SheetHeader className="border-b border-line px-4 py-5 pr-14 text-left md:px-6">
          <SheetTitle className="text-section-title font-medium text-ink">{title}</SheetTitle>
          {description && <SheetDescription className="text-label text-ink-2">{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">{children}</div>
        {footer && <SheetFooter className="border-t border-line bg-surface px-4 py-4 md:px-6">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

export { Drawer };
export type { DrawerProps };
