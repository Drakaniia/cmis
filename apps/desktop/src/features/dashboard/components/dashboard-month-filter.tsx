/**
 * Dashboard month filter — Apple Design §1 §4 §12 §14
 *
 * Compact pill + frosted popover. Only the Dispensing Velocity card
 * is month-scoped (per user choice); URL ?month= drives the query.
 *
 * §1  Response: highlight on pointer-down via `press-feedback`.
 * §4  Springs: sheetSpring/densitySpring, interruptible from presentation value.
 * §12 Material: surface-frosted popover (78% card + blur 16px/saturate 180%).
 * §14 Reduced motion/transparency/contrast honored via CSS + useReducedMotion.
 */

import {
  Popover,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
} from "@cmis/ui/components/popover";
import { cn } from "@cmis/ui/lib/utils";
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import {
  coerceMonthKey,
  isMonthKey,
  monthKey,
  monthLabelForKey,
} from "@/lib/month";
import { densitySpring, sheetSpring } from "@/lib/motion";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function yearOf(key: string): number {
  const y = Number(key.split("-")[0]);
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

function keyFor(year: number, monthIndex1: number): string {
  return `${year}-${String(monthIndex1).padStart(2, "0")}`;
}

export interface DashboardMonthFilterProps {
  onChange: (monthKey: string) => void;
  value: string;
}

export function DashboardMonthFilter({
  onChange,
  value,
}: DashboardMonthFilterProps) {
  const safeValue = isMonthKey(value) ? value : coerceMonthKey(value);
  const current = monthKey();
  const isCustom = safeValue !== current;
  const [open, setOpen] = useState(false);
  const [visibleYear, setVisibleYear] = useState(() => yearOf(safeValue));
  const reduceMotion = useReducedMotion();

  const handlePrevYear = useCallback(() => setVisibleYear((y) => y - 1), []);
  const handleNextYear = useCallback(() => setVisibleYear((y) => y + 1), []);

  // Re-anchor year when popover opens on a different month
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setVisibleYear(yearOf(safeValue));
      }
      setOpen(nextOpen);
    },
    [safeValue]
  );

  const handleSelect = useCallback(
    (key: string) => {
      onChange(key);
      setOpen(false);
    },
    [onChange]
  );

  const handleReset = useCallback(() => {
    onChange(current);
    setOpen(false);
  }, [current, onChange]);

  const monthGridKeys = useMemo(
    () => MONTHS.map((_, i) => keyFor(visibleYear, i + 1)),
    [visibleYear]
  );

  const label = monthLabelForKey(safeValue);

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      {/* Pill trigger — §1 press-feedback on pointer-down, §12 subtle border */}
      <PopoverTrigger
        aria-label={`Month filter, currently ${label}. Press to choose month.`}
        className={cn(
          "press-feedback inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-medium text-xs",
          "bg-card/70 backdrop-blur-md",
          isCustom
            ? "border-primary/30 bg-primary/10 text-foreground"
            : "border-border/50 bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        )}
        type="button"
      >
        <CalendarRange aria-hidden className="size-3.5" />
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{safeValue}</span>
        {isCustom ? (
          <button
            aria-label="Reset to current month"
            className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full bg-primary/20 hover:bg-primary/30"
            onClick={(e) => {
              e.stopPropagation();
              handleReset();
            }}
            type="button"
          >
            <X aria-hidden className="size-3" />
          </button>
        ) : null}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </PopoverTrigger>

      <PopoverPortal>
        <PopoverPositioner align="end" sideOffset={8}>
          <PopoverPopup className="surface-frosted w-[280px] overflow-hidden border-border/40 p-0 shadow-xl">
            {/* Header — year stepper, §7 spatial consistency (anchor) */}
            <div className="flex items-center justify-between border-border/30 border-b px-2 py-2">
              <button
                aria-label="Previous year"
                className="press-feedback flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={handlePrevYear}
                type="button"
              >
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <motion.span
                animate={{ opacity: 1, y: 0 }}
                aria-live="polite"
                className="font-semibold text-sm tracking-tight"
                initial={reduceMotion ? undefined : { opacity: 0, y: 4 }}
                key={visibleYear}
                transition={densitySpring}
              >
                {visibleYear}
              </motion.span>
              <button
                aria-label="Next year"
                className="press-feedback flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                disabled={visibleYear >= yearOf(current) + 1}
                onClick={handleNextYear}
                type="button"
              >
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>

            {/* Month grid — 3×4, §4 spring stagger, §3 interruptible */}
            <motion.div
              animate={{ opacity: 1 }}
              className="grid grid-cols-3 gap-1.5 p-3"
              initial={reduceMotion ? undefined : { opacity: 0 }}
              transition={sheetSpring}
            >
              {monthGridKeys.map((key, idx) => {
                const isSelected = key === safeValue;
                const isFuture = key > current;
                const isCurrentMonth = key === current;
                let variantClass = "";
                if (isSelected) {
                  variantClass = "bg-primary text-primary-foreground shadow-sm";
                } else if (isFuture) {
                  variantClass =
                    "cursor-not-allowed bg-muted/30 text-muted-foreground/40";
                } else {
                  variantClass =
                    "border border-border/30 bg-card/60 hover:bg-accent hover:text-accent-foreground";
                }
                return (
                  <motion.button
                    animate={{ opacity: 1, scale: 1 }}
                    aria-label={monthLabelForKey(key)}
                    aria-pressed={isSelected}
                    className={cn(
                      "relative rounded-lg px-2 py-2.5 font-medium text-xs transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      variantClass,
                      isCurrentMonth && !isSelected && "ring-1 ring-primary/40"
                    )}
                    disabled={isFuture}
                    initial={
                      reduceMotion ? undefined : { opacity: 0, scale: 0.96 }
                    }
                    key={key}
                    onClick={() => handleSelect(key)}
                    transition={{
                      ...densitySpring,
                      delay: reduceMotion ? 0 : idx * 0.015,
                    }}
                    type="button"
                    whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                  >
                    {MONTHS[idx]}
                    {/* Subtle year hint for selected */}
                    <span className="sr-only">{visibleYear}</span>
                  </motion.button>
                );
              })}
            </motion.div>

            {/* Quick jump footer — §12 soft edge, not hard divider */}
            <div className="flex items-center justify-between border-border/30 border-t bg-muted/20 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                {isCustom
                  ? `Showing ${monthLabelForKey(safeValue)}`
                  : "Current month"}
              </span>
              <div className="flex gap-1.5">
                <button
                  className={cn(
                    "press-feedback rounded-full border px-3 py-1 font-medium text-xs",
                    isCustom
                      ? "border-border bg-background hover:bg-accent"
                      : "cursor-default border-transparent bg-muted text-muted-foreground"
                  )}
                  disabled={!isCustom}
                  onClick={handleReset}
                  type="button"
                >
                  This month
                </button>
              </div>
            </div>

            {/* Rolling 12 quick list — collapsed hint */}
            <div className="px-3 pb-3">
              <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                Tip: use ←→ to change year. Future months are disabled.
              </p>
            </div>
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </Popover>
  );
}

/** Convenience: shim to bind Route search param shape. */
export function dashboardMonthFromSearch(
  search: Record<string, unknown>
): string {
  const raw = (search as { month?: unknown }).month;
  if (typeof raw === "string" && isMonthKey(raw)) {
    return raw;
  }
  return monthKey();
}

export function dashboardMonthSearch(month: string): Record<string, unknown> {
  const cur = monthKey();
  if (month === cur || !isMonthKey(month)) {
    return {};
  }
  return { month };
}
