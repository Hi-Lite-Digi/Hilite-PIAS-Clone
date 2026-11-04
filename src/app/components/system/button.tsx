import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "../ui/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-body font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-surface hover:bg-ink/88",
        secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
        ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
        destructive: "bg-danger text-surface hover:bg-danger/88",
      },
      size: {
        sm: "h-9 px-4 text-chip",
        default: "h-[38px] px-5",
        lg: "h-11 px-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { asChild = false, children, className, disabled, loading = false, size, variant, ...props },
  ref,
) {
  if (asChild) {
    return (
      <Slot
        ref={ref}
        className={cn(buttonVariants({ size, variant }), className, (disabled || loading) && "pointer-events-none opacity-45")}
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        data-slot="system-button"
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ size, variant }), className)}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      data-slot="system-button"
      {...props}
    >
      {loading && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.75} />}
      {children}
    </button>
  );
});

type IconButtonProps = Omit<React.ComponentPropsWithoutRef<"button">, "children"> & {
  icon: LucideIcon;
  label: string;
  tooltip?: string;
  variant?: "default" | "primary" | "ghost" | "destructive";
};

const iconButtonVariants = {
  default: "bg-surface-2 text-ink-2 hover:bg-ink hover:text-surface",
  primary: "bg-ink text-surface hover:bg-ink/88",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
  destructive: "bg-danger/10 text-danger hover:bg-danger hover:text-surface",
} as const;

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, icon: Icon, label, tooltip, type = "button", variant = "default", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={tooltip ?? label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 md:size-9",
        iconButtonVariants[variant],
        className,
      )}
      data-slot="icon-button"
      {...props}
    >
      <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
});

export { Button, IconButton, buttonVariants };
export type { ButtonProps, IconButtonProps };
