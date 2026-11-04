import * as React from "react";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

type PageSizeSelectProps = {
  value: number;
  onValueChange: (value: number) => void;
};

function PageSizeSelect({ onValueChange, value }: PageSizeSelectProps) {
  return (
    <label className="inline-flex items-center gap-2 text-label text-ink-2">
      Rows per page
      <select
        aria-label="Rows per page"
        className="h-9 rounded-full border border-line bg-surface px-3 text-label font-medium text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => onValueChange(Number(event.target.value))}
        value={value}
      >
        {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export { PAGE_SIZE_OPTIONS, PageSizeSelect };
export type { PageSizeSelectProps };
