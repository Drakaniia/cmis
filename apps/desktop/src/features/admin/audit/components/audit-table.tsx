import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { cn } from "@cmis/ui/lib/utils";
import { ChevronRight, MoreHorizontal, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, type MouseEvent, useCallback } from "react";

import { auditTimestamp } from "../../format";
import type { AuditRow } from "../types";
import { auditCategoryOf } from "../types";
import { AuditRowDetail } from "./audit-row-detail";

const GRID = "grid-cols-[1.1fr_0.9fr_0.9fr_2fr_0.9fr_auto]";
const COLUMN_COUNT = 6;
const HEADER_CLASS =
  "sticky top-0 z-[1] grid items-center gap-2 border-border/50 border-b bg-card/95 px-3 py-1.5 font-medium text-caption text-muted-foreground backdrop-blur-[6px]";
const ROW_CLASS =
  "border-border/50 border-b grid items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/50";

/**
 * CMIS-UI-09 §3.2 — audit sweep is scanning, not tasking: rows expand inline
 * (no modal, no scrim) so the reviewer keeps their place in the list.
 *
 * Real table elements carry the semantics; the CSS Grid template on each row
 * drives the column widths (Chromium keeps the table roles when the display
 * of a row is overridden, which is the engine Tauri renders in).
 */
interface AuditTableRowProps {
  expanded: boolean;
  onCorrect: (row: AuditRow) => void;
  onRequest: (requestRef: string) => void;
  onToggleExpand: (id: string) => void;
  onViewCorrection: (correctionId: string) => void;
  row: AuditRow;
}

function AuditTableRow({
  expanded,
  row,
  onCorrect,
  onRequest,
  onToggleExpand,
  onViewCorrection,
}: AuditTableRowProps) {
  const category = auditCategoryOf(row.action);

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

  const handleToggleMenu = useCallback(
    () => onToggleExpand(row.id),
    [onToggleExpand, row.id]
  );
  const handleCorrectMenu = useCallback(() => onCorrect(row), [onCorrect, row]);

  return (
    <>
      <tr
        aria-expanded={expanded}
        className={cn(
          ROW_CLASS,
          GRID,
          "cursor-pointer",
          expanded && "bg-muted/40"
        )}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
        tabIndex={0}
      >
        <td className="flex items-center gap-1.5 whitespace-nowrap font-mono text-caption">
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90"
            )}
          />
          {auditTimestamp(row.at)}
        </td>
        <td className="truncate text-caption">{row.user}</td>
        <td className="min-w-0">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-caption",
              category.badgeClass
            )}
          >
            {category.label}
          </span>
        </td>
        <td className="truncate text-caption">
          {row.detail}
          {row.corrected ? (
            <span className="ml-1.5 text-[10px] text-primary">• amended</span>
          ) : null}
        </td>
        <td className="truncate text-caption text-muted-foreground">
          {row.branch}
        </td>
        <td className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  aria-label={`Actions for ${row.id}`}
                  className="press-feedback rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  type="button"
                />
              }
            >
              <MoreHorizontal aria-hidden className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[190px]">
              <DropdownMenuItem onClick={handleToggleMenu}>
                <ChevronRight aria-hidden className="size-3.5" />
                {expanded ? "Collapse diff" : "Expand diff"}
              </DropdownMenuItem>
              {row.action === "correction" ? null : (
                <DropdownMenuItem onClick={handleCorrectMenu}>
                  <Wrench aria-hidden className="size-3.5" />
                  Create correction
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.tr
            animate={{ opacity: 1 }}
            className="border-border/50 border-b"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <td className="p-0" colSpan={COLUMN_COUNT}>
              <AuditRowDetail
                onCorrect={onCorrect}
                onRequest={onRequest}
                onViewCorrection={onViewCorrection}
                row={row}
              />
            </td>
          </motion.tr>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function AuditTable({
  rows,
  expandedId,
  onToggleExpand,
  onCorrect,
  onRequest,
  onViewCorrection,
}: {
  expandedId: string | null;
  onCorrect: (row: AuditRow) => void;
  onRequest: (requestRef: string) => void;
  onToggleExpand: (id: string) => void;
  onViewCorrection: (correctionId: string) => void;
  rows: AuditRow[];
}) {
  return (
    <div className="overflow-hidden">
      <table className="block w-full border-collapse">
        <thead className="block">
          <tr className={cn(HEADER_CLASS, GRID)}>
            <th className="text-left" scope="col">
              Timestamp
            </th>
            <th className="text-left" scope="col">
              User
            </th>
            <th className="text-left" scope="col">
              Action
            </th>
            <th className="text-left" scope="col">
              Details
            </th>
            <th className="text-left" scope="col">
              Branch
            </th>
            <th className="w-6" scope="col">
              <span className="sr-only">Row actions</span>
            </th>
          </tr>
        </thead>{" "}
        <tbody className="block">
          {rows.map((row) => (
            <AuditTableRow
              expanded={expandedId === row.id}
              key={row.id}
              onCorrect={onCorrect}
              onRequest={onRequest}
              onToggleExpand={onToggleExpand}
              onViewCorrection={onViewCorrection}
              row={row}
            />
          ))}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-caption text-muted-foreground">
          No audit entries match these filters.
        </p>
      ) : null}
    </div>
  );
}
