import { cn } from "@cmis/ui/lib/utils";
import type { CSSProperties } from "react";

import { frozenOffset, SHEET_COLUMNS } from "../../../creation/paste";

/** Frozen cells stay put while the right zone scrolls; the offset is the width sum. */
export function cellClass(index: number, tone: string): string {
  const column = SHEET_COLUMNS[index];
  return cn("min-w-0", column?.frozen && `sticky z-[1] ${tone}`);
}

export function frozenStyle(index: number): CSSProperties | undefined {
  return SHEET_COLUMNS[index]?.frozen
    ? { left: frozenOffset(index) }
    : undefined;
}
