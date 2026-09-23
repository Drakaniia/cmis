import { Button } from "@cmis/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@cmis/ui/components/empty";
import { Skeleton } from "@cmis/ui/components/skeleton";
import { cn } from "@cmis/ui/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, type MouseEvent, useCallback } from "react";
import { toast } from "sonner";

import { materializeEnter } from "@/lib/motion";

import { auditTimestamp } from "../../format";
import type { DispensingRow } from "../types";
import {
  DISPENSING_SOURCE_DETAIL,
  DISPENSING_SOURCE_LABELS,
  hasBatch,
  NO_BATCH_LABEL,
} from "../types";
import { DispensingRowDetail } from "./dispensing-row-detail";

export type SortKey =
  | "dispensedAt"
  | "medicine"
  | "batch"
  | "qty"
  | "requestor"
  | "staff";
export type SortDir = "asc" | "desc";

const GRID =
  "grid-cols-[minmax(140px,1.1fr)_minmax(160px,1.5fr)_minmax(100px,1fr)_minmax(50px,0.5fr)_minmax(140px,1.3fr)_minmax(110px,1fr)_minmax(80px,0.8fr)]";

const SORT_COLUMNS: { align: "left" | "right"; key: SortKey; label: string }[] =
  [
    { align: "left", key: "dispensedAt", label: "Date" },
    { align: "left", key: "medicine", label: "Medicine" },
    { align: "left", key: "batch", label: "Batch" },
    { align: "right", key: "qty", label: "Qty" },
    { align: "left", key: "requestor", label: "Requestor" },
    { align: "left", key: "staff", label: "Staff" },
  ];

const SKELETON_COLUMNS = [
  "date",
  "medicine",
  "batch",
  "qty",
  "requestor",
  "staff",
  "request",
];

const COLUMN_COUNT = 7;

const SKELETON_ROWS = [
  "row-1",
  "row-2",
  "row-3",
  "row-4",
  "row-5",
  "row-6",
  "row-7",
  "row-8",
];

function ariaSortFor(
  activeKey: SortKey,
  dir: SortDir,
  key: SortKey
): "ascending" | "descending" | "none" {
  if (activeKey !== key) {
    return "none";
  }
  return dir === "asc" ? "ascending" : "descending";
}

function sortIcon(activeKey: SortKey, dir: SortDir, key: SortKey) {
  if (activeKey !== key) {
    return <ArrowUpDown aria-hidden className="size-3 text-muted-foreground" />;
  }
  return dir === "asc" ? (
    <ArrowUp aria-hidden className="size-3 text-foreground" />
  ) : (
    <ArrowDown aria-hidden className="size-3 text-foreground" />
  );
}

function SortHeaderButton({
  activeKey,
  align,
  columnKey,
  dir,
  label,
  onSort,
}: {
  activeKey: SortKey;
  align: "left" | "right";
  columnKey: SortKey;
  dir: SortDir;
  label: string;
  onSort: (key: SortKey) => void;
}) {
  const handleSort = useCallback(() => onSort(columnKey), [columnKey, onSort]);
  return (
    <button
      className={cn(
        "flex items-center gap-1 hover:text-foreground",
        align === "right" ? "justify-end text-right" : "text-left"
      )}
      onClick={handleSort}
      type="button"
    >
      {label}
      {sortIcon(activeKey, dir, columnKey)}
    </button>
  );
}

function DispensingTableRow({
  expanded,
  row,
  onRequest,
  onToggleExpand,
}: {
  expanded: boolean;
  row: DispensingRow;
  onRequest: (requestRef: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const { requestLink } = row;
  const isDenied = row.status === "denied";

  const handleRowClick = useCallback(
    (event: MouseEvent<HTMLTableRowElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input")) {
        return;
      }
      onToggleExpand(row.id);
    },
    [onToggleExpand, row.id]
  );

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggleExpand(row.id);
      }
    },
    [onToggleExpand, row.id]
  );

  const handleCopyBatch = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      navigator.clipboard.writeText(row.batch).then(() => {
        toast.success(`Copied ${row.batch}`);
      });
    },
    [row.batch]
  );

  const handleRequest = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onRequest(row.requestLink as string);
    },
    [onRequest, row.requestLink]
  );

  return (
    <>
      <tr
        aria-expanded={expanded}
        className={cn(
          "group/row grid cursor-pointer items-center gap-2 border-border/40 border-b px-3 py-2.5 text-sm transition-all duration-150 hover:bg-card hover:shadow-[inset_0_1px_0_oklch(1_0_0/0.4)]",
          GRID,
          expanded && "bg-card shadow-[inset_0_1px_0_oklch(1_0_0/0.5)]",
          isDenied && "bg-destructive/[0.04] hover:bg-destructive/[0.06]"
        )}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
        tabIndex={0}
      >
        <td className="whitespace-nowrap font-mono text-[11px] tracking-[0.02em] text-muted-foreground tabular-nums">
          {auditTimestamp(row.dispensedAt)}
        </td>

        <td className="min-w-0">
          <span
            className={cn(
              "block truncate font-semibold text-[13px] tracking-[-0.01em] text-foreground",
              isDenied && "text-destructive/80"
            )}
          >
            {row.medicine}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground tabular-nums">
              {row.medicineSku}
            </span>
            {isDenied ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium tracking-[0.02em] text-destructive">
                <span className="size-1 rounded-full bg-destructive" />
                Denied
              </span>
            ) : null}
            {row.source === "quick-deduct" ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium tracking-[0.02em] text-amber-700 dark:text-amber-300"
                title={DISPENSING_SOURCE_DETAIL["quick-deduct"]}
              >
                <span className="size-1 rounded-full bg-amber-500" />
                {DISPENSING_SOURCE_LABELS["quick-deduct"]}
              </span>
            ) : null}
          </span>
        </td>

        <td className="min-w-0">
          {hasBatch(row) ? (
            <button
              className="group/batch inline-flex items-center gap-1 rounded-full border border-border/60 bg-card px-2 py-1 font-mono text-[11px] tracking-[0.02em] shadow-sm hover:bg-accent hover:text-foreground tabular-nums"
              onClick={handleCopyBatch}
              title="Click to copy"
              type="button"
            >
              {row.batch}
              <Copy
                aria-hidden
                className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover/batch:opacity-100"
              />
            </button>
          ) : (
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] tracking-[0.01em] text-muted-foreground italic">
              {NO_BATCH_LABEL}
            </span>
          )}
        </td>

        <td className="text-right">
          <span className="inline-flex min-w-[36px] justify-center rounded-full bg-foreground px-2 py-1 font-semibold text-[11px] tracking-[0.02em] text-background tabular-nums">
            {row.qty}
          </span>
        </td>

        <td className="min-w-0">
          <span className="block truncate font-medium text-[12px] tracking-[-0.01em] text-foreground">
            {row.requestor}
          </span>
          <span className="block font-mono text-[11px] tracking-[0.02em] text-muted-foreground tabular-nums">
            {row.requestorId}
          </span>
        </td>

        <td className="truncate text-[12px] tracking-[0.01em] text-muted-foreground">
          {row.staff}
        </td>

        <td className="min-w-0">
          {requestLink ? (
            <button
              className="press-feedback inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 font-medium text-[11px] tracking-[0.01em] text-primary hover:bg-primary hover:text-primary-foreground"
              onClick={handleRequest}
              type="button"
            >
              {requestLink} →
            </button>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      </tr>

      {/* Expanded detail — CMIS materializeEnter for consistency with sheets/modals */}
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.tr
            animate={materializeEnter.animate}
            className="border-border/50 border-b"
            exit={materializeEnter.exit}
            initial={materializeEnter.initial}
            transition={{ bounce: 0, duration: 0.2, type: "spring" }}
          >
            <td className="p-0" colSpan={COLUMN_COUNT}>
              <DispensingRowDetail onRequest={onRequest} row={row} />
            </td>
          </motion.tr>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/**
 * CMIS-UI-06 §2 — 7-column dispensing table.
 *
 * Date (fixed 140), Medicine (flex 1.5 + SKU caption), Batch (110 mono copy),
 * Qty (60 right-aligned), Requestor (150 + ID caption), Staff (120),
 * Request Link (90 clickable).
 *
 * Denied rows get a destructive muted tint. Sortable by Date (default desc),
 * secondary sort by Medicine asc on ties.
 */
/**
 * An empty table has three quite different meanings, so it never says "no
 * records" when the truth is "could not read" — that is the same silence the
 * request persistence bug hid behind.
 */
function emptyStateText(
  hasFilters: boolean,
  hasError: boolean
): { description: string; title: string } {
  if (hasFilters) {
    return {
      description: "No records match these filters.",
      title: "No records match filters",
    };
  }
  if (hasError) {
    return {
      description:
        "The dispensing records could not be read from the database on this build.",
      title: "Dispensing log unavailable",
    };
  }
  return {
    description:
      "Hand-overs from the Request Queue — and quick deductions — appear here.",
    title: "No dispensing records yet",
  };
}

export function DispensingTable({
  expandedId,
  hasError = false,
  loading = false,
  onToggleExpand,
  onRequest,
  rows,
  sortDir,
  sortKey,
  onSort,
  totalUnfiltered,
  onClearFilters,
}: {
  expandedId: string | null;
  /** The read failed; say so rather than showing an empty log. */
  hasError?: boolean;
  loading?: boolean;
  onSort: (key: SortKey) => void;
  onToggleExpand: (id: string) => void;
  onRequest: (requestRef: string) => void;
  rows: DispensingRow[];
  sortDir: SortDir;
  sortKey: SortKey;
  totalUnfiltered: number;
  onClearFilters?: () => void;
}) {
  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/40 bg-card/40">
        <div
          className={cn(
            "sticky top-0 z-[1] grid shrink-0 items-center gap-2 border-border/40 border-b bg-card/80 px-3 py-2 backdrop-blur-[12px]",
            GRID
          )}
        >
          {SKELETON_COLUMNS.map((column) => (
            <Skeleton className="h-3.5 w-full max-w-[80px] rounded-full" key={column} />
          ))}
        </div>
        <div className="flex-1 space-y-2 p-3">
          {SKELETON_ROWS.map((row) => (
            <Skeleton className="w-full rounded-xl" key={row} style={{ height: 56 }} />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    const empty = emptyStateText(totalUnfiltered > 0, hasError);
    return (
      <div className="flex h-full min-h-[420px] w-full items-center justify-center p-6">
        <Empty className="w-full max-w-md border border-dashed bg-muted/20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Copy />
            </EmptyMedia>
            <EmptyTitle>{empty.title}</EmptyTitle>
            <EmptyDescription>{empty.description}</EmptyDescription>
          </EmptyHeader>
          {totalUnfiltered > 0 && onClearFilters ? (
            <EmptyContent>
              <Button
                className="press-feedback"
                onClick={onClearFilters}
                size="sm"
                variant="outline"
              >
                Clear filters
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/40 bg-card/40 shadow-sm backdrop-blur-sm">
      <table className="block w-full border-collapse">
        <thead className="block">
          <tr
            className={cn(
              "sticky top-0 z-[1] grid items-center gap-2 border-border/40 border-b bg-card/80 px-3 py-2 font-medium text-[11px] tracking-[0.04em] text-muted-foreground uppercase backdrop-blur-[12px] backdrop-saturate-[160%]",
              GRID
            )}
          >
            {SORT_COLUMNS.map((column) => (
              <th
                aria-sort={ariaSortFor(sortKey, sortDir, column.key)}
                className={cn(
                  "font-medium",
                  column.align === "right" ? "text-right" : "text-left"
                )}
                key={column.key}
                scope="col"
              >
                <SortHeaderButton
                  activeKey={sortKey}
                  align={column.align}
                  columnKey={column.key}
                  dir={sortDir}
                  label={column.label}
                  onSort={onSort}
                />
              </th>
            ))}
            <th className="text-left font-medium" scope="col">
              Request
            </th>
          </tr>
        </thead>
        <tbody className="block">
          {rows.map((row) => (
            <DispensingTableRow
              expanded={expandedId === row.id}
              key={row.id}
              onRequest={onRequest}
              onToggleExpand={onToggleExpand}
              row={row}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
