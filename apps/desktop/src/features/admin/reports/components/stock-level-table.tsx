"use client";

import { Input } from "@cmis/ui/components/input";
import { cn } from "@cmis/ui/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useMemo,
} from "react";

import { EXPIRY_STATUS_CONFIG } from "@/features/inventory/domain/expiry";
import { LOW_STOCK_STATUS_CONFIG } from "@/features/inventory/domain/low-stock";
import { filterStockLevelRows } from "../stock-level-rows";
import { buildGrandTotal, groupByCategory } from "../stock-report-groups";
import type {
  CategoryGroup,
  GroupSubtotal,
  StockLevelRow,
  StockLevelSort,
  StockLevelSortDir,
  StockLevelSortKey,
} from "../types";

interface SortableColumn {
  key: StockLevelSortKey;
  label: string;
  numeric?: boolean;
}

interface PlainColumn {
  key: null;
  label: string;
  numeric?: boolean;
}

type Column = PlainColumn | SortableColumn;

const COLUMNS: Column[] = [
  { key: "name", label: "Medicine" },
  { key: null, label: "Form & strength" },
  { key: "onHand", label: "On hand", numeric: true },
  { key: null, label: "Pack hint" },
  { key: "threshold", label: "Threshold", numeric: true },
  { key: "status", label: "Status" },
  { key: null, label: "Nearest expiry" },
  { key: null, label: "Batches", numeric: true },
];

function ariaSortFor(
  active: StockLevelSortKey,
  column: StockLevelSortKey,
  dir: StockLevelSortDir
): "ascending" | "descending" | "none" {
  if (active !== column) {
    return "none";
  }
  return dir === "asc" ? "ascending" : "descending";
}

function sortIcon(
  active: StockLevelSortKey,
  dir: StockLevelSortDir,
  column: StockLevelSortKey
): ReactElement {
  if (active !== column) {
    return <ArrowUpDown aria-hidden className="size-3 text-muted-foreground" />;
  }
  return dir === "asc" ? (
    <ArrowUp aria-hidden className="size-3 text-foreground" />
  ) : (
    <ArrowDown aria-hidden className="size-3 text-foreground" />
  );
}

/**
 * One sortable header. Its own component so the click handler is a stable
 * `useCallback` rather than a fresh arrow per render (`noJsxPropsBind`).
 */
function SortHeader({
  active,
  column,
  dir,
  onSort,
}: {
  active: StockLevelSortKey;
  column: SortableColumn;
  dir: StockLevelSortDir;
  onSort: (key: StockLevelSortKey) => void;
}) {
  const handleClick = useCallback(
    () => onSort(column.key),
    [column.key, onSort]
  );
  const className = cn(
    "whitespace-nowrap border-border/50 border-b px-2.5 py-1.5 font-semibold",
    column.numeric ? "text-right" : "text-left"
  );
  return (
    <th
      aria-sort={ariaSortFor(active, column.key, dir)}
      className={className}
      scope="col"
    >
      <button
        className={cn(
          "flex items-center gap-1 hover:text-foreground",
          column.numeric && "ml-auto"
        )}
        onClick={handleClick}
        type="button"
      >
        {column.label}
        {sortIcon(active, dir, column.key)}
      </button>
    </th>
  );
}

function PlainHeader({ column }: { column: PlainColumn }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-border/50 border-b px-2.5 py-1.5 text-left font-semibold",
        column.numeric && "text-right"
      )}
      scope="col"
    >
      {column.label}
    </th>
  );
}

function StatusBadge({ status }: { status: StockLevelRow["status"] }) {
  const config = LOW_STOCK_STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-medium text-[10px]",
        config.badgeClass
      )}
    >
      {config.label}
    </span>
  );
}

function ExpiryCell({ row }: { row: StockLevelRow }) {
  if (row.expiryStatus === null) {
    return <span className="text-muted-foreground">{row.expiryLabel}</span>;
  }
  const config = EXPIRY_STATUS_CONFIG[row.expiryStatus];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-[10px]",
        config.badgeClass
      )}
    >
      {row.expiryLabel}
    </span>
  );
}

function ReportRow({ row }: { row: StockLevelRow }) {
  return (
    <tr className="transition-colors hover:bg-muted/40">
      <td className="px-2.5 py-1.5">
        <div className="min-w-0">
          <div className="truncate font-medium text-xs leading-tight">
            {row.name}
          </div>
          <div className="text-[11px] text-muted-foreground leading-tight">
            {row.sku}
          </div>
        </div>
      </td>
      <td className="px-2.5 py-1.5 text-muted-foreground text-xs">
        {row.formStrength}
      </td>
      <td className="px-2.5 py-1.5 text-right text-xs tabular-nums">
        {row.onHand}
      </td>
      <td className="px-2.5 py-1.5 text-muted-foreground text-xs">
        {row.packHint}
      </td>
      <td className="px-2.5 py-1.5 text-right text-xs tabular-nums">
        {row.threshold}
      </td>
      <td className="px-2.5 py-1.5">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-2.5 py-1.5">
        <ExpiryCell row={row} />
      </td>
      <td className="px-2.5 py-1.5 text-right text-xs tabular-nums">
        {row.batches}
      </td>
    </tr>
  );
}

function SubtotalStrip({
  subtotal,
  title,
}: {
  subtotal: GroupSubtotal;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-border/50 border-t bg-muted/30 px-2.5 py-1.5 text-[11px]">
      <span className="font-semibold text-foreground">{title}</span>
      <span className="text-muted-foreground">
        {subtotal.medicines}{" "}
        {subtotal.medicines === 1 ? "medicine" : "medicines"}
      </span>
      <span className="text-muted-foreground tabular-nums">
        {subtotal.unitsOnHand} units
      </span>
      <span className="text-muted-foreground tabular-nums">
        {subtotal.low} low
      </span>
      <span className="text-muted-foreground tabular-nums">
        {subtotal.out} out
      </span>
      <span className="text-muted-foreground">
        Nearest expiry {subtotal.nearestExpiry}
      </span>
    </div>
  );
}

function CategoryGroupSection({
  activeSortDir,
  activeSortKey,
  group,
  onSort,
  searchActive,
}: {
  activeSortDir: StockLevelSortDir;
  activeSortKey: StockLevelSortKey;
  group: CategoryGroup;
  onSort: (key: StockLevelSortKey) => void;
  searchActive: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-md border" data-report-group>
      <div className="flex flex-wrap items-baseline gap-x-2 border-border/60 border-b bg-muted/40 px-2.5 py-2">
        <h3 className="font-semibold text-xs tracking-[-0.01em]">
          {group.label}
        </h3>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {group.subtotal.medicines}{" "}
          {group.subtotal.medicines === 1 ? "medicine" : "medicines"}
        </span>
        {searchActive ? (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            · {group.rows.length} matching
          </span>
        ) : null}
      </div>
      <div className="max-h-[420px] overflow-auto print:max-h-none print:overflow-visible">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-[1] print:static">
            <tr className="bg-muted/80 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em] backdrop-blur-[6px]">
              {COLUMNS.map((column) =>
                column.key === null ? (
                  <PlainHeader column={column} key={column.label} />
                ) : (
                  <SortHeader
                    active={activeSortKey}
                    column={column}
                    dir={activeSortDir}
                    key={column.label}
                    onSort={onSort}
                  />
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {group.rows.map((row) => (
              <ReportRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <SubtotalStrip subtotal={group.subtotal} title={group.label} />
    </section>
  );
}

/**
 * The Stock Report's body (F5): every medicine grouped by category, each group
 * with a subtotal strip, closed by a grand total that mirrors the summary block
 * so a printed page reconciles with itself.
 *
 * Search and sort are **owned by the page**, not this component: the Export
 * button has to honour exactly what the reader was looking at, so the state sits
 * where the exporter can reach it (spec stock-report-export E7/E-F2). Search runs
 * **before** grouping, so a query can empty a group; sorting applies **within**
 * each group while group order stays alphabetical (D11).
 */
export function StockLevelTable({
  category,
  onSearchChange,
  onSortChange,
  rows,
  search,
  sort,
}: {
  category: string;
  onSearchChange: (search: string) => void;
  onSortChange: (key: StockLevelSortKey) => void;
  rows: StockLevelRow[];
  search: string;
  sort: StockLevelSort;
}) {
  const handleSearch = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSearchChange(event.target.value),
    [onSearchChange]
  );

  const toggleSort = useCallback(
    (key: StockLevelSortKey) => onSortChange(key),
    [onSortChange]
  );

  const visible = useMemo(
    () => filterStockLevelRows(rows, search),
    [rows, search]
  );

  const groups = useMemo(() => groupByCategory(visible, sort), [visible, sort]);

  const grandTotal = useMemo(() => buildGrandTotal(groups), [groups]);

  const query = search.trim();
  const searchActive = query !== "";

  if (rows.length === 0) {
    const filterLabel = category === "All" ? "the current filter" : category;
    return (
      <p className="rounded-[var(--radius-field)] border border-dashed bg-muted/30 px-4 py-10 text-center text-muted-foreground text-sm">
        No medicines match {filterLabel}.
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Input
          aria-label="Search medicines"
          className="h-8 w-[220px]"
          onChange={handleSearch}
          placeholder="Search medicine, SKU or category"
          type="search"
          value={search}
        />
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {visible.length} of {rows.length}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[var(--radius-field)] border border-dashed bg-muted/30 px-4 py-10 text-center text-muted-foreground text-sm">
          No medicines match “{query}”.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <CategoryGroupSection
              activeSortDir={sort.dir}
              activeSortKey={sort.key}
              group={group}
              key={group.label}
              onSort={toggleSort}
              searchActive={searchActive}
            />
          ))}
          <SubtotalStrip
            subtotal={grandTotal}
            title={`Grand total · ${grandTotal.categories} ${
              grandTotal.categories === 1 ? "category" : "categories"
            }`}
          />
        </div>
      )}
    </div>
  );
}
