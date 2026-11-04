import * as React from "react";
import { cn } from "../ui/utils";

type FilterValue = string | readonly string[];

type FilterChipOption = {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
  hideWhenZero?: boolean;
};

type FilterChipsProps = {
  options: readonly FilterChipOption[];
  value: FilterValue;
  onValueChange: (value: string | string[]) => void;
  multiple?: boolean;
  label?: string;
  className?: string;
};

function toggleFilterValue(current: FilterValue, next: string, multiple: boolean) {
  if (!multiple) return next;
  const values = Array.isArray(current) ? [...current] : current ? [current] : [];
  return values.includes(next) ? values.filter((value) => value !== next) : [...values, next];
}

function FilterChips({ className, label = "Filters", multiple, onValueChange, options, value }: FilterChipsProps) {
  const isMultiple = multiple ?? Array.isArray(value);
  const selected = (option: string) => (Array.isArray(value) ? value.includes(option) : value === option);
  return (
    <div
      aria-label={label}
      className={cn("flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none]", className)}
      data-slot="filter-chips"
      role="group"
    >
      {options.filter((option) => !(option.hideWhenZero && option.count === 0)).map((option) => {
        const active = selected(option.value);
        return (
          <button
            aria-pressed={active}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-chip font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
              active
                ? "border-ink bg-ink text-surface"
                : "border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
            disabled={option.disabled}
            key={option.value}
            onClick={() => onValueChange(toggleFilterValue(value, option.value, isMultiple))}
            type="button"
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-chip", active ? "bg-accent text-ink" : "bg-surface-2 text-ink-2")}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { FilterChips, toggleFilterValue };
export type { FilterChipOption, FilterChipsProps, FilterValue };
