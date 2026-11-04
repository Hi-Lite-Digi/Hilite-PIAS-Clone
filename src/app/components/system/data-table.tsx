import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../ui/utils";
import { Skeleton } from "./skeleton";

type SortDirection = "ascending" | "descending";

type DataTableColumn<Row> = {
  key: string;
  header: React.ReactNode;
  cell: (row: Row) => React.ReactNode;
  sortValue?: (row: Row) => string | number | Date | null | undefined;
  mobileLabel?: React.ReactNode;
  hideOnMobile?: boolean;
  className?: string;
};

type SortState = {
  key: string;
  direction: SortDirection;
};

type DataTableProps<Row> = {
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  rowKey: (row: Row) => React.Key;
  onRowClick?: (row: Row) => void;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  initialSort?: SortState | null;
  loading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
};

const INTERACTIVE_ROW_TARGETS =
  "a, button, input, select, textarea, summary, [role='button'], [role='link'], [contenteditable='true'], [data-row-click-ignore]";

function shouldActivateRowFromTarget(target: EventTarget | null, currentTarget: EventTarget | null) {
  if (!target || target === currentTarget) return true;
  const closest = (target as { closest?: (selector: string) => unknown }).closest;
  if (typeof closest !== "function") return true;
  return closest.call(target, INTERACTIVE_ROW_TARGETS) == null;
}

function compareValues(left: string | number | Date | null | undefined, right: string | number | Date | null | undefined) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;
  if (typeof leftValue === "number" && typeof rightValue === "number") return leftValue - rightValue;
  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
}

function sortRows<Row>(
  rows: readonly Row[],
  column: DataTableColumn<Row> | undefined,
  direction: SortDirection,
) {
  if (!column?.sortValue) return [...rows];
  const multiplier = direction === "ascending" ? 1 : -1;
  return [...rows].sort((left, right) => multiplier * compareValues(column.sortValue!(left), column.sortValue!(right)));
}

function DataTable<Row>({
  className,
  columns,
  emptyState,
  initialSort = null,
  loading = false,
  onRowClick,
  onSortChange,
  rowKey,
  rows,
  sort,
}: DataTableProps<Row>) {
  const [internalSort, setInternalSort] = React.useState<SortState | null>(initialSort);
  const activeSort = sort === undefined ? internalSort : sort;
  const activeColumn = columns.find((column) => column.key === activeSort?.key);
  const visibleRows = React.useMemo(
    () => (activeSort ? sortRows(rows, activeColumn, activeSort.direction) : [...rows]),
    [activeColumn, activeSort, rows],
  );

  const changeSort = (column: DataTableColumn<Row>) => {
    if (!column.sortValue) return;
    const nextSort: SortState = {
      key: column.key,
      direction: activeSort?.key === column.key && activeSort.direction === "ascending" ? "descending" : "ascending",
    };
    if (sort === undefined) setInternalSort(nextSort);
    onSortChange?.(nextSort);
  };

  const activateRow = (event: React.KeyboardEvent, row: Row) => {
    if (
      !onRowClick ||
      (event.key !== "Enter" && event.key !== " ") ||
      !shouldActivateRowFromTarget(event.target, event.currentTarget)
    ) return;
    event.preventDefault();
    onRowClick(row);
  };

  const clickRow = (event: React.MouseEvent, row: Row) => {
    if (!onRowClick || !shouldActivateRowFromTarget(event.target, event.currentTarget)) return;
    onRowClick(row);
  };

  if (loading) return <Skeleton rows={5} variant="table" label="Loading table" />;
  if (visibleRows.length === 0) return <>{emptyState ?? null}</>;

  return (
    <div className={cn("min-w-0", className)} data-slot="data-table">
      <div className="hidden w-full overflow-x-auto md:block" data-slot="data-table-desktop">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-body">
          <thead>
            <tr>
              {columns.map((column) => {
                const ariaSort = activeSort?.key === column.key ? activeSort.direction : undefined;
                return (
                  <th
                    aria-sort={ariaSort}
                    className={cn("border-b border-line px-4 py-3 text-label font-semibold text-ink-2", column.className)}
                    key={column.key}
                    scope="col"
                  >
                    {column.sortValue ? (
                      <button
                        className="inline-flex min-h-9 items-center gap-1 rounded-full outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
                        onClick={() => changeSort(column)}
                        type="button"
                      >
                        {column.header}
                        {ariaSort === "ascending" && <ChevronUp aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                        {ariaSort === "descending" && <ChevronDown aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                className={cn(
                  "outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  onRowClick && "cursor-pointer",
                )}
                key={rowKey(row)}
                onClick={onRowClick ? (event) => clickRow(event, row) : undefined}
                onKeyDown={onRowClick ? (event) => activateRow(event, row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => (
                  <td className={cn("border-b border-line px-4 py-3 text-ink", column.className)} key={column.key}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden" data-slot="data-table-mobile">
        {visibleRows.map((row) => (
          <div
            className={cn(
              "min-h-11 rounded-control border border-line bg-surface p-4 outline-none",
              onRowClick && "cursor-pointer active:bg-surface-2",
            )}
            key={rowKey(row)}
            onClick={onRowClick ? (event) => clickRow(event, row) : undefined}
            onKeyDown={onRowClick ? (event) => activateRow(event, row) : undefined}
            role={onRowClick ? "button" : undefined}
            tabIndex={onRowClick ? 0 : undefined}
          >
            <dl className="space-y-3">
              {columns.filter((column) => !column.hideOnMobile).map((column) => (
                <div className="grid grid-cols-[minmax(88px,0.7fr)_minmax(0,1fr)] gap-3" key={column.key}>
                  <dt className="text-label text-ink-2">{column.mobileLabel ?? column.header}</dt>
                  <dd className="min-w-0 text-body text-ink">{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

export { DataTable, shouldActivateRowFromTarget, sortRows };
export type { DataTableColumn, DataTableProps, SortDirection, SortState };
