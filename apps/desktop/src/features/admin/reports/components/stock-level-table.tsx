"use client";

import { Input } from "@cmis/ui/components/input";
import { cn } from "@cmis/ui/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  PackageSearch,
  Search,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
    return (
      <ArrowUpDown aria-hidden className="size-3 text-muted-foreground/50" />
    );
  }
  return dir === "asc" ? (
    <ArrowUp aria-hidden className="size-3 text-foreground" />
  ) : (
    <ArrowDown aria-hidden className="size-3 text-foreground" />
  );
}

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
    "whitespace-nowrap border-border/50 border-b px-2.5 py-2 font-semibold text-[11px] uppercase tracking-[0.04em]",
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
          "inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground",
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
        "whitespace-nowrap border-border/50 border-b px-2.5 py-2 text-left font-semibold text-[11px] uppercase tracking-[0.04em]",
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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[11px] leading-none tracking-[0.01em]",
        config.badgeClass,
        "shadow-xs"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          status === "out-of-stock"
            ? "bg-red-500"
            : status === "low-stock"
              ? "bg-amber-500"
              : "bg-emerald-500"
        )}
      />
      {config.label}
    </span>
  );
}

function ExpiryCell({ row }: { row: StockLevelRow }) {
  if (row.expiryStatus === null) {
    return (
      <span className="text-muted-foreground text-xs">{row.expiryLabel}</span>
    );
  }
  const config = EXPIRY_STATUS_CONFIG[row.expiryStatus];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-[11px] shadow-xs",
        config.badgeClass
      )}
    >
      {row.expiryLabel}
    </span>
  );
}

function ReportRow({ row }: { row: StockLevelRow }) {
  return (
    <tr className="group/row transition-colors hover:bg-muted/40">
      <td className="px-2.5 py-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-[13px] leading-tight tracking-[-0.01em]">
            {row.name}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground leading-tight tracking-[0.01em]">
            {row.sku}
          </div>
        </div>
      </td>
      <td className="px-2.5 py-2 text-muted-foreground text-xs">
        {row.formStrength}
      </td>
      <td className="px-2.5 py-2 text-right font-medium text-[13px] tabular-nums tracking-[-0.01em]">
        {row.onHand}
      </td>
      <td className="px-2.5 py-2 text-muted-foreground text-xs">
        {row.packHint}
      </td>
      <td className="px-2.5 py-2 text-right text-muted-foreground text-xs tabular-nums">
        {row.threshold}
      </td>
      <td className="px-2.5 py-2">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-2.5 py-2">
        <ExpiryCell row={row} />
      </td>
      <td className="px-2.5 py-2 text-right text-xs tabular-nums">
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-border/50 border-t bg-muted/30 px-3 py-2 text-[11px] backdrop-blur-sm">
      <span className="font-semibold text-foreground tracking-[-0.01em]">
        {title}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-1 rounded-full bg-foreground/20" />
        <span className="text-muted-foreground tabular-nums">
          {subtotal.medicines}{" "}
          {subtotal.medicines === 1 ? "medicine" : "medicines"}
        </span>
      </span>
      <span className="text-muted-foreground tabular-nums">
        {subtotal.unitsOnHand} units
      </span>
      <span className="tabular-nums">
        <span className="text-amber-600 dark:text-amber-400">
          {subtotal.low} low
        </span>
        <span className="mx-1 text-border">·</span>
        <span className="text-red-600 dark:text-red-400">
          {subtotal.out} out
        </span>
      </span>
      <span className="ml-auto text-muted-foreground">
        Nearest expiry{" "}
        <span className="font-medium text-foreground">
          {subtotal.nearestExpiry}
        </span>
      </span>
    </div>
  );
}

function CategoryGroupSection({
  activeSortDir,
  activeSortKey,
  group,
  index,
  onSort,
  searchActive,
}: {
  activeSortDir: StockLevelSortDir;
  activeSortKey: StockLevelSortKey;
  group: CategoryGroup;
  index: number;
  onSort: (key: StockLevelSortKey) => void;
  searchActive: boolean;
}) {
  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_3px_oklch(0_0_0/0.05),0_4px_12px_oklch(0_0_0/0.03)]"
      data-report-group
      initial={{ opacity: 0, y: 10 }}
      layout
      transition={{
        damping: 30,
        delay: Math.min(index * 0.03, 0.18),
        stiffness: 350,
        type: "spring",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-border/60 border-b bg-muted/40 px-3 py-2.5 backdrop-blur-sm">
        <h3 className="font-semibold text-[13px] tracking-[-0.01em]">
          {group.label}
        </h3>
        <span className="inline-flex items-center rounded-full border border-border/50 bg-card px-2 py-0.5 font-medium text-[11px] text-muted-foreground tabular-nums shadow-xs">
          {group.subtotal.medicines}{" "}
          {group.subtotal.medicines === 1 ? "medicine" : "medicines"}
        </span>
        {searchActive ? (
          <motion.span
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-[11px] text-amber-700 tabular-nums dark:text-amber-300"
            initial={{ opacity: 0, scale: 0.9 }}
            transition={{ damping: 28, stiffness: 400, type: "spring" }}
          >
            {group.rows.length} matching
          </motion.span>
        ) : null}
        <span className="ml-auto hidden text-[11px] text-muted-foreground tabular-nums sm:inline">
          {group.subtotal.unitsOnHand} units · {group.subtotal.low} low ·{" "}
          {group.subtotal.out} out
        </span>
      </div>
      <div className="max-h-[420px] overflow-auto overscroll-contain print:max-h-none print:overflow-visible">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-[1] print:static">
            <tr className="bg-muted/80 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em] backdrop-blur-[8px]">
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
          <tbody className="divide-y divide-border/50">
            {group.rows.map((row) => (
              <ReportRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <SubtotalStrip subtotal={group.subtotal} title={group.label} />
    </motion.section>
  );
}

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

  const handleClear = useCallback(() => onSearchChange(""), [onSearchChange]);

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
      <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center backdrop-blur-sm">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <PackageSearch aria-hidden className="size-5" />
        </div>
        <p className="mt-3 font-medium text-[13px] tracking-[-0.01em]">
          No medicines match {filterLabel}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground leading-relaxed">
          Try a different category or clear the search to see the full
          catalogue.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {/* Search toolbar — §1 instant response, §12 material */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground/60"
          />
          <Input
            aria-label="Search medicines"
            className="h-8 w-[260px] rounded-full border-border/60 bg-card pr-8 pl-8 text-[13px] shadow-xs placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:bg-card"
            onChange={handleSearch}
            placeholder="Search medicine, SKU or category"
            type="search"
            value={search}
          />
          <AnimatePresence>
            {search.length > 0 ? (
              <motion.button
                animate={{ opacity: 1, scale: 1 }}
                aria-label="Clear search"
                className="press-feedback absolute right-1 flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                exit={{ opacity: 0, scale: 0.8 }}
                initial={{ opacity: 0, scale: 0.8 }}
                onClick={handleClear}
                transition={{ damping: 28, stiffness: 400, type: "spring" }}
                type="button"
              >
                <X aria-hidden className="size-3" />
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
        <motion.div
          animate={{ opacity: 1 }}
          className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card px-3 py-1.5 text-[11px] shadow-xs"
          key={`${visible.length}-${rows.length}`}
          transition={{ duration: 0.2 }}
        >
          <span className="font-medium text-foreground tabular-nums">
            {visible.length}
          </span>
          <span className="text-muted-foreground">of {rows.length}</span>
          {searchActive ? (
            <span className="rounded-full bg-foreground px-1.5 py-0.5 font-medium text-[10px] text-background tracking-[0.02em]">
              filtered
            </span>
          ) : null}
        </motion.div>
      </div>

      <AnimatePresence mode="popLayout">
        {visible.length === 0 ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center"
            exit={{ opacity: 0, scale: 0.98 }}
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ damping: 28, stiffness: 350, type: "spring" }}
          >
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Search aria-hidden className="size-5" />
            </div>
            <p className="mt-3 font-medium text-sm tracking-[-0.01em]">
              No medicines match “{query}”
            </p>
            <p className="mt-1 text-muted-foreground text-sm">
              Try a broader search or switch categories.
            </p>
            <button
              className="press-feedback mt-3 rounded-full border border-border bg-card px-3 py-1.5 font-medium text-xs shadow-xs hover:bg-accent"
              onClick={handleClear}
              type="button"
            >
              Clear search
            </button>
          </motion.div>
        ) : (
          <motion.div
            animate={{ opacity: 1 }}
            className="space-y-3"
            initial={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {groups.map((group, idx) => (
              <CategoryGroupSection
                activeSortDir={sort.dir}
                activeSortKey={sort.key}
                group={group}
                index={idx}
                key={group.label}
                onSort={toggleSort}
                searchActive={searchActive}
              />
            ))}
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-2xl border bg-foreground text-background shadow-[0_4px_16px_oklch(0_0_0/0.12)] dark:bg-card dark:text-card-foreground dark:shadow-[0_4px_16px_oklch(0_0_0/0.25)]"
              initial={{ opacity: 0, y: 8 }}
              layout
              transition={{ damping: 28, stiffness: 320, type: "spring" }}
            >
              <SubtotalStrip
                subtotal={grandTotal}
                title={`Grand total · ${grandTotal.categories} ${
                  grandTotal.categories === 1 ? "category" : "categories"
                }`}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
