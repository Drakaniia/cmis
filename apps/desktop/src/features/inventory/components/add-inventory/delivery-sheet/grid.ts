import { cn } from "@cmis/ui/lib/utils";
import type { CSSProperties } from "react";

import { frozenOffset, SHEET_COLUMNS } from "../../../creation/paste";
import { GRID_GAP } from "./constants";

/** Frozen cells stay put while the right zone scrolls; the offset is the width sum. */
export function cellClass(index: number, tone: string): string {
  const column = SHEET_COLUMNS[index];
  return cn(
    "min-w-0",
    column?.frozen && `sticky z-[1] ${tone} shadow-[1px_0_0_var(--border)]`
  );
}

export function frozenStyle(index: number): CSSProperties | undefined {
  if (!SHEET_COLUMNS[index]?.frozen) {
    return undefined;
  }
  // The grid's gap separates tracks, so each sticky offset picks it up too.
  return { left: frozenOffset(index) + index * GRID_GAP };
}
