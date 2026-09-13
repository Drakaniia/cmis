import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@cmis/ui/components/empty";
import { Skeleton } from "@cmis/ui/components/skeleton";
import { cn } from "@cmis/ui/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type * as React from "react";
import { toast } from "sonner";

import { materializeEnter } from "@/lib/motion";

import { auditTimestamp } from "../../format";
import type { DispensingRow } from "../types";
import { DispensingRowDetail } from "./dispensing-row-detail";

type SortKey =
  | "dispensedAt"
  | "medicine"
  | "batch"
  | "qty"
  | "requestor"
  | "staff";
type SortDir = "asc" | "desc";

const GRID =
  "grid-cols-[minmax(140px,1.1fr)_minmax(160px,1.5fr)_minmax(100px,1fr)_minmax(50px,0.5fr)_minmax(140px,1.3fr)_minmax(110px,1fr)_minmax(80px,0.8fr)]";

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
export function DispensingTable({
  expandedId,
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
  function handleRowClick(event: React.MouseEvent<HTMLDivElement>, id: string) {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input")) {
      return;
    }
    onToggleExpand(id);
  }

  function handleCopyBatch(batch: string) {
    navigator.clipboard.writeText(batch).then(() => {
      toast.success(`Copied ${batch}`);
    });
  }

  function sortedIcon(key: SortKey) {
    if (sortKey !== key) {
      return (
        <ArrowUpDown aria-hidden className="size-3 text-muted-foreground" />
      );
    }
    return sortDir === "asc" ? (
      <ArrowUp aria-hidden className="size-3 text-foreground" />
    ) : (
      <ArrowDown aria-hidden className="size-3 text-foreground" />
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div
          className={cn(
            "sticky top-0 z-[1] grid shrink-0 items-center gap-2 border-border/50 border-b bg-muted/60 px-3 py-1.5",
            GRID
          )}
          role="row"
        >
          {[
            "Date",
            "Medicine",
            "Batch",
            "Qty",
            "Requestor",
            "Staff",
            "Request",
          ].map((label) => (
            <Skeleton
              className="h-3.5 w-full max-w-[80px] rounded"
              key={label}
            />
          ))}
        </div>
        <div className="flex-1 space-y-1 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              className="w-full rounded-md"
              key={i}
              style={{ height: 48 }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    const hasFilters = totalUnfiltered > 0;
    return (
      <Empty className="border border-dashed bg-muted/20">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Copy />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters
              ? "No records match filters"
              : "No dispensing records yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "No records match these filters."
              : "Claims from the Request Queue will appear here."}
          </EmptyDescription>
          {hasFilters && onClearFilters ? (
            <button
              className="mt-2 text-caption text-primary hover:underline"
              onClick={onClearFilters}
              type="button"
            >
              Clear filters
            </button>
          ) : null}
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          "sticky top-0 z-[1] grid items-center gap-2 border-border/50 border-b bg-muted/70 px-3 py-1.5 font-medium text-caption text-muted-foreground backdrop-blur-[6px]",
          GRID
        )}
        role="row"
      >
        <button
          aria-sort={
            sortKey === "dispensedAt"
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
          className="flex items-center gap-1 text-left hover:text-foreground"
          onClick={() => onSort("dispensedAt")}
          type="button"
        >
          Date
          {sortedIcon("dispensedAt")}
        </button>
        <button
          aria-sort={
            sortKey === "medicine"
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
          className="flex items-center gap-1 text-left hover:text-foreground"
          onClick={() => onSort("medicine")}
          type="button"
        >
          Medicine
          {sortedIcon("medicine")}
        </button>
        <button
          aria-sort={
            sortKey === "batch"
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
          className="flex items-center gap-1 text-left hover:text-foreground"
          onClick={() => onSort("batch")}
          type="button"
        >
          Batch
          {sortedIcon("batch")}
        </button>
        <button
          aria-sort={
            sortKey === "qty"
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
          className="flex items-center gap-1 text-right hover:text-foreground"
          onClick={() => onSort("qty")}
          type="button"
        >
          Qty
          {sortedIcon("qty")}
        </button>
        <button
          aria-sort={
            sortKey === "requestor"
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
          className="flex items-center gap-1 text-left hover:text-foreground"
          onClick={() => onSort("requestor")}
          type="button"
        >
          Requestor
          {sortedIcon("requestor")}
        </button>
        <button
          aria-sort={
            sortKey === "staff"
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
          className="flex items-center gap-1 text-left hover:text-foreground"
          onClick={() => onSort("staff")}
          type="button"
        >
          Staff
          {sortedIcon("staff")}
        </button>
        <span className="text-left">Request</span>
      </div>

      {/* Rows */}
      {rows.map((row) => {
        const expanded = expandedId === row.id;
        const isDenied = row.status === "denied";
        return (
          <div className="border-border/50 border-b" key={row.id}>
            <div
              aria-expanded={expanded}
              className={cn(
                "grid cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                GRID,
                expanded && "bg-muted/40",
                isDenied && "bg-destructive/5 hover:bg-destructive/8"
              )}
              onClick={(event) => handleRowClick(event, row.id)}
              role="row"
            >
              {/* Date */}
              <span
                className="whitespace-nowrap font-mono text-caption"
                role="cell"
              >
                {auditTimestamp(row.dispensedAt)}
              </span>

              {/* Medicine + SKU caption */}
              <span className="min-w-0" role="cell">
                <span
                  className={cn(
                    "block truncate font-medium",
                    isDenied && "text-destructive/80"
                  )}
                >
                  {row.medicine}
                </span>
                <span className="block text-caption text-muted-foreground">
                  {row.medicineSku}
                  {isDenied ? (
                    <span className="ml-1.5 rounded-full bg-destructive/12 px-1.5 py-0.5 text-[10px] text-destructive">
                      Denied
                    </span>
                  ) : null}
                </span>
              </span>

              {/* Batch — copy on click */}
              <span className="min-w-0" role="cell">
                <button
                  className="group/batch inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-caption hover:bg-muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCopyBatch(row.batch);
                  }}
                  title="Click to copy"
                  type="button"
                >
                  {row.batch}
                  <Copy
                    aria-hidden
                    className="size-3 opacity-0 transition-opacity group-hover/batch:opacity-100"
                  />
                </button>
              </span>

              {/* Qty — right-aligned */}
              <span className="text-right tabular-nums" role="cell">
                {row.qty}
              </span>

              {/* Requestor + ID */}
              <span className="min-w-0" role="cell">
                <span className="block truncate">{row.requestor}</span>
                <span className="block text-caption text-muted-foreground">
                  {row.requestorId}
                </span>
              </span>

              {/* Staff */}
              <span
                className="truncate text-caption text-muted-foreground"
                role="cell"
              >
                {row.staff}
              </span>

              {/* Request Link */}
              <span className="min-w-0" role="cell">
                {row.requestLink ? (
                  <button
                    className="press-feedback truncate font-medium text-primary text-xs hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequest(row.requestLink as string);
                    }}
                    type="button"
                  >
                    {row.requestLink} →
                  </button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
            </div>

            {/* Expanded detail — CMIS materializeEnter for consistency with sheets/modals */}
            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.div
                  animate={materializeEnter.animate}
                  exit={materializeEnter.exit}
                  initial={materializeEnter.initial}
                  transition={{ bounce: 0, duration: 0.2, type: "spring" }}
                >
                  <DispensingRowDetail onRequest={onRequest} row={row} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export type { SortDir, SortKey };
