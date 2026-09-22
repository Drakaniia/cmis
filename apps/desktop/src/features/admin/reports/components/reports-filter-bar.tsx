import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Printer,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";

import { CategoryPicker } from "@/features/inventory/components/category-picker";

/**
 * Apple §12 Heavy translucent material — the Reports page's sticky chrome.
 * Content scrolls under it; bright top edge catches light; rubber-banded
 * scroll fades soft edges instead of hard dividers. Every control carries
 * §1 press-feedback (pointer-down, 100ms scale 0.97) and springs on change
 * (§4 critically damped, §3 interruptible from presentation value).
 */
function MonthStepper({
  isCurrentMonth,
  monthLabel,
  onCurrentMonth,
  onStepBack,
  onStepForward,
}: {
  isCurrentMonth: boolean;
  monthLabel: string;
  onCurrentMonth: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-1 hidden font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-[0.06em] sm:inline">
        Month
      </span>
      {/* Pill segmented control — §12 heavier material nested in chrome, §1 instant feedback */}
      <div className="flex items-center rounded-full border border-border/60 bg-card/70 shadow-xs backdrop-blur-sm">
        <button
          aria-label="Previous month"
          className="press-feedback flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.96]"
          onClick={onStepBack}
          type="button"
        >
          <ChevronLeft aria-hidden className="size-3.5" />
        </button>
        {/* §8 hint in direction: month label cross-fades toward new value, not hard swap */}
        <span
          aria-live="polite"
          className="relative grid min-w-[132px] place-items-center overflow-hidden px-1 text-center"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate={{ opacity: 1, x: 0 }}
              className="col-start-1 row-start-1 font-medium text-[13px] tabular-nums tracking-[-0.01em]"
              exit={{ opacity: 0, x: -8 }}
              initial={{ opacity: 0, x: 8 }}
              key={monthLabel}
              transition={{
                damping: 30,
                stiffness: 400,
                type: "spring",
              }}
            >
              {monthLabel}
            </motion.span>
          </AnimatePresence>
        </span>
        <button
          aria-label="Next month"
          className="press-feedback flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30"
          disabled={isCurrentMonth}
          onClick={onStepForward}
          type="button"
        >
          <ChevronRight aria-hidden className="size-3.5" />
        </button>
      </div>
      <AnimatePresence>
        {isCurrentMonth ? null : (
          <motion.button
            animate={{ opacity: 1, scale: 1, x: 0 }}
            className="press-feedback rounded-full border border-border/50 bg-card px-2.5 py-1 font-medium text-muted-foreground text-xs shadow-xs hover:bg-accent hover:text-accent-foreground"
            exit={{ opacity: 0, scale: 0.96, x: -6 }}
            initial={{ opacity: 0, scale: 0.96, x: -6 }}
            onClick={onCurrentMonth}
            transition={{ damping: 28, stiffness: 380, type: "spring" }}
            type="button"
          >
            Current month
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ReportsFilterBar({
  canExport,
  canPrint,
  canSavePdf,
  category,
  isCurrentMonth,
  isSavingPdf,
  monthLabel,
  onCategoryChange,
  onCurrentMonth,
  onExport,
  onPrint,
  onSavePdf,
  onStepBack,
  onStepForward,
}: {
  canExport: boolean;
  canPrint: boolean;
  canSavePdf: boolean;
  category: string;
  isCurrentMonth: boolean;
  isSavingPdf: boolean;
  monthLabel: string;
  onCategoryChange: (category: string) => void;
  onCurrentMonth: () => void;
  onExport: () => void;
  onPrint: () => void;
  onSavePdf: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
}) {
  const handlePrint = useCallback(() => onPrint(), [onPrint]);
  const handleExport = useCallback(() => onExport(), [onExport]);
  const handleSavePdf = useCallback(() => onSavePdf(), [onSavePdf]);

  return (
    <div
      className={cn(
        "sticky top-0 z-10 print:hidden",
        /* §12 Heavy translucent material — structural layer over page-canvas */
        "border-border/50 border-b",
        "bg-background/60 backdrop-blur-[20px] backdrop-saturate-[180%]",
        "supports-[backdrop-filter]:bg-background/50",
        /* §12 bright top edge = light catching the material */
        "shadow-[inset_0_1px_0_0_oklch(1_0_0/0.35),0_1px_3px_oklch(0_0_0/0.04)]",
        "dark:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06),0_1px_3px_oklch(0_0_0/0.18)]"
      )}
      style={
        {
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        } as React.CSSProperties
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <MonthStepper
          isCurrentMonth={isCurrentMonth}
          monthLabel={monthLabel}
          onCurrentMonth={onCurrentMonth}
          onStepBack={onStepBack}
          onStepForward={onStepForward}
        />

        <div aria-hidden className="hidden h-5 w-px bg-border/60 sm:block" />

        <div className="flex items-center gap-1.5">
          <span className="hidden font-semibold text-[11px] text-muted-foreground/70 uppercase tracking-[0.06em] sm:inline">
            Category
          </span>
          <CategoryPicker
            allLabel="All categories"
            aria-label="Filter by category"
            onChange={onCategoryChange}
            placeholder="Category"
            value={category}
            variant="filter"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            className="press-feedback rounded-full shadow-xs"
            disabled={!canExport}
            onClick={handleExport}
            size="sm"
            variant="outline"
          >
            <Download aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">Export</span>
            <span className="sm:hidden">XLSX</span>
          </Button>
          <Button
            className="press-feedback rounded-full shadow-xs"
            disabled={!canPrint}
            onClick={handlePrint}
            size="sm"
            variant="outline"
          >
            <Printer aria-hidden className="size-3.5" />
            Print
          </Button>
          <Button
            className="press-feedback rounded-full shadow-sm"
            disabled={!canSavePdf || isSavingPdf}
            onClick={handleSavePdf}
            size="sm"
            variant="default"
          >
            <FileDown aria-hidden className="size-3.5" />
            {isSavingPdf ? "Saving…" : "Save PDF"}
          </Button>
        </div>
      </div>

      {/* §12 Scroll edge fade — soft blur mask where content meets floating chrome */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent"
      />
    </div>
  );
}
