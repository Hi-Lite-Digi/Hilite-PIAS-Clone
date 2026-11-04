import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "./button";

type ConfirmDialogProps = React.ComponentPropsWithoutRef<typeof AlertDialog> & {
  title: React.ReactNode;
  description: React.ReactNode;
  trigger?: React.ReactElement;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "destructive";
  pending?: boolean;
  onConfirm: () => void;
};

function ConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  description,
  onConfirm,
  pending = false,
  title,
  trigger,
  variant = "primary",
  ...props
}: ConfirmDialogProps) {
  return (
    <AlertDialog {...props}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent className="gap-5 rounded-card border-line bg-surface p-5 shadow-shell sm:max-w-md md:p-6">
        <AlertDialogHeader className="gap-2 text-left">
          <AlertDialogTitle className="text-section-title font-medium text-ink">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-body leading-6 text-ink-2">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:justify-end">
          <AlertDialogCancel asChild>
            <Button variant="secondary">{cancelLabel}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button loading={pending} onClick={onConfirm} variant={variant}>
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDialog };
export type { ConfirmDialogProps };
