import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cmis/ui/components/dropdown-menu";
import { cn } from "@cmis/ui/lib/utils";
import { ChevronRight, MoreHorizontal, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type * as React from "react";

import { auditTimestamp } from "../../format";
import type { AuditRow } from "../types";
import { auditCategoryOf } from "../types";
import { AuditRowDetail } from "./audit-row-detail";

const GRID = "grid-cols-[1.1fr_0.9fr_0.9fr_2fr_0.9fr_auto]";

/**
 * CMIS-UI-09 §3.2 — audit sweep is scanning, not tasking: rows expand inline
 * (no modal, no scrim) so the reviewer keeps their place in the list.
 */
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
  function handleRowClick(event: React.MouseEvent<HTMLDivElement>, id: string) {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input")) {
      return;
    }
    onToggleExpand(id);
  }

  return (
    <div className="overflow-hidden">
      <div
        className={cn(
          "sticky top-0 z-[1] grid items-center gap-2 border-border/50 border-b bg-muted/70 px-3 py-1.5 font-medium text-caption text-muted-foreground backdrop-blur-[6px]",
          GRID
        )}
        role="row"
      >
        <span role="columnheader">Timestamp</span>
        <span role="columnheader">User</span>
        <span role="columnheader">Action</span>
        <span role="columnheader">Details</span>
        <span role="columnheader">Branch</span>
        <span aria-hidden className="w-6" />
      </div>

      {rows.map((row) => {
        const category = auditCategoryOf(row.action);
        const expanded = expandedId === row.id;
        return (
          <div className="border-border/50 border-b" key={row.id}>
            <div
              aria-expanded={expanded}
              className={cn(
                "grid cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                GRID,
                expanded && "bg-muted/40"
              )}
              onClick={(event) => handleRowClick(event, row.id)}
              role="row"
            >
              <span
                className="flex items-center gap-1.5 whitespace-nowrap font-mono text-caption"
                role="cell"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    expanded && "rotate-90"
                  )}
                />
                {auditTimestamp(row.at)}
              </span>
              <span className="truncate text-caption" role="cell">
                {row.user}
              </span>
              <span className="min-w-0" role="cell">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-caption",
                    category.badgeClass
                  )}
                >
                  {category.label}
                </span>
              </span>
              <span className="truncate text-caption" role="cell">
                {row.detail}
                {row.corrected ? (
                  <span className="ml-1.5 text-[10px] text-primary">
                    • amended
                  </span>
                ) : null}
              </span>
              <span
                className="truncate text-caption text-muted-foreground"
                role="cell"
              >
                {row.branch}
              </span>
              <span className="flex justify-end" role="cell">
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
                    <DropdownMenuItem onClick={() => onToggleExpand(row.id)}>
                      <ChevronRight aria-hidden className="size-3.5" />
                      {expanded ? "Collapse diff" : "Expand diff"}
                    </DropdownMenuItem>
                    {row.action === "correction" ? null : (
                      <DropdownMenuItem onClick={() => onCorrect(row)}>
                        <Wrench aria-hidden className="size-3.5" />
                        Create correction
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>

            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.div
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <AuditRowDetail
                    onCorrect={onCorrect}
                    onRequest={onRequest}
                    onViewCorrection={onViewCorrection}
                    row={row}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}

      {rows.length === 0 ? (
        <p className="p-8 text-center text-caption text-muted-foreground">
          No audit entries match these filters.
        </p>
      ) : null}
    </div>
  );
}
