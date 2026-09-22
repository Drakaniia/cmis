import { Button } from "@cmis/ui/components/button";
import { cn } from "@cmis/ui/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Printer,
} from "lucide-react";
import { useCallback } from "react";

import { CategoryPicker } from "@/features/inventory/components/category-picker";

/**
 * The Stock Report's sticky bar: a month stepper, the shared category picker,
 * Print, and Export. The three toolbar actions the old page carried are gone
 * (F1, D28); the document leaves through the system print dialog (Phase 1) and a
 * native PDF (Phase 2), while Export writes the importable inventory workbook
 * (spec stock-report-export E8).
 *
 * §12 Heavy translucent material — content scrolls under it. Every control
 * carries `press-feedback` (§1).
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
      <div className="flex items-center rounded-md border border-input bg-background">
        <button
          aria-label="Previous month"
          className="press-feedback flex size-7 items-center justify-center rounded-l-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={onStepBack}
          type="button"
        >
          <ChevronLeft aria-hidden className="size-3.5" />
        </button>
        <span
          aria-live="polite"
          className="min-w-[130px] px-1 text-center font-medium text-xs tabular-nums"
        >
          {monthLabel}
        </span>
        <button
          aria-label="Next month"
          className="press-feedback flex size-7 items-center justify-center rounded-r-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
          disabled={isCurrentMonth}
          onClick={onStepForward}
          type="button"
        >
          <ChevronRight aria-hidden className="size-3.5" />
        </button>
      </div>
      {isCurrentMonth ? null : (
        <button
          className="press-feedback rounded-md px-2 py-1 font-medium text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
          onClick={onCurrentMonth}
          type="button"
        >
          Current month
        </button>
      )}
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
        /* §12 Heavy translucent material — structural layer */
        "border-border/50 border-b",
        "bg-background/60 backdrop-blur-[16px] backdrop-saturate-[180%]",
        "supports-[backdrop-filter]:bg-background/50"
      )}
      style={
        {
          WebkitBackdropFilter: "blur(16px) saturate(180%)",
        } as React.CSSProperties
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
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
          {/* The shared picker: the report filters by the same list the forms
              write to, and one can be added or renamed from here. */}
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
            className="press-feedback"
            disabled={!canExport}
            onClick={handleExport}
            size="sm"
            variant="outline"
          >
            <Download aria-hidden className="size-3.5" />
            Export
          </Button>
          <Button
            className="press-feedback"
            disabled={!canPrint}
            onClick={handlePrint}
            size="sm"
            variant="outline"
          >
            <Printer aria-hidden className="size-3.5" />
            Print
          </Button>
          <Button
            className="press-feedback"
            disabled={!canSavePdf || isSavingPdf}
            onClick={handleSavePdf}
            size="sm"
            variant="outline"
          >
            <FileDown aria-hidden className="size-3.5" />
            {isSavingPdf ? "Saving…" : "Save as PDF"}
          </Button>
        </div>
      </div>
    </div>
  );
}
