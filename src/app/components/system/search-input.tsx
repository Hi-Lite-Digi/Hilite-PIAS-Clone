import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "../ui/utils";

type SearchInputProps = Omit<React.ComponentPropsWithoutRef<"input">, "onChange" | "type" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
};

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, onValueChange, value, ...props },
  ref,
) {
  return (
    <div className="relative min-w-0" data-slot="search-input">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-3"
        strokeWidth={1.75}
      />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          "h-11 w-full rounded-control border border-transparent bg-surface-2 py-2 pl-11 pr-11 text-body text-ink outline-none placeholder:text-ink-3 focus:border-line focus:ring-3 focus:ring-ring/40",
          className,
        )}
        {...props}
      />
      {value && (
        <button
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 outline-none hover:bg-surface hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => onValueChange("")}
          type="button"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
});

export { SearchInput };
export type { SearchInputProps };
