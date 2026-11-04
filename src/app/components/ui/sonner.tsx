"use client";

import { Toaster as Sonner, ToasterProps } from "sonner";
import { X } from "lucide-react";

const toastIcons = {
  close: <X aria-hidden="true" className="size-4" strokeWidth={1.75} />,
};

const toastClassNames = {
  toast: "!rounded-control !border-line !bg-surface !text-ink !shadow-shell",
  description: "!text-ink-2",
  actionButton: "!h-[38px] !rounded-full !bg-ink !px-5 !text-body !font-medium !text-surface",
  cancelButton: "!h-[38px] !rounded-full !bg-surface-2 !px-5 !text-body !font-medium !text-ink-2",
  closeButton:
    "!size-11 !rounded-full !border-line !bg-surface !text-ink-2 hover:!bg-surface-2 hover:!text-ink md:!size-9",
};

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={toastIcons}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: toastClassNames,
      }}
      {...props}
    />
  );
};

export { Toaster, toastClassNames, toastIcons };
