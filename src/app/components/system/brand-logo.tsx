import { cn } from "../ui/utils";

function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap text-[2rem] font-semibold leading-none tracking-[-0.05em] text-ink", className)}>
      Hilite
    </span>
  );
}

export { BrandLogo };
