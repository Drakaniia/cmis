/**
 * Dashboard month filter — Apple Design §1 §4 §12 §14
 *
 * Compact pill + frosted popover. Only the Dispensing Velocity card
 * is month-scoped (per user choice); URL ?month= drives the query.
 *
 * The popover hosts the shared full calendar: the operator drills day → month
 * → year and any chosen day selects its month. Future dates stay disabled.
 *
 * §1  Response: highlight on pointer-down via `press-feedback`.
 * §12 Material: surface-frosted popover (78% card + blur 16px/saturate 180%).
 * §14 Reduced motion/transparency/contrast honored via CSS.
 */

import { Calendar } from "@cmis/ui/components/calendar";
import {
  Popover,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
} from "@cmis/ui/components/popover";
import { monthKeyFromIso, todayIso } from "@cmis/ui/lib/date";
import { cn } from "@cmis/ui/lib/utils";
import { CalendarRange, ChevronDown, X } from "lucide-react";
import type { MouseEvent } from "react";
import { useCallback, useState } from "react";
import {
  coerceMonthKey,
  isMonthKey,
  monthKey,
  monthLabelForKey,
} from "@/lib/month";

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

  const handleSelect = useCallback(
    (iso: string) => {
      onChange(monthKeyFromIso(iso));
      setOpen(false);
    },
    [onChange]
  );

  const handleReset = useCallback(() => {
    onChange(current);
    setOpen(false);
  }, [current, onChange]);

  const handleResetClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      handleReset();
    },
    [handleReset]
  );

  const label = monthLabelForKey(safeValue);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      {/* Pill trigger — §1 press-feedback on pointer-down, §12 subtle border */}
      <PopoverTrigger
        aria-label={`Month filter, currently ${label}. Press to choose a month.`}
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
            onClick={handleResetClick}
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
          <PopoverPopup className="surface-frosted w-[280px] overflow-hidden border-border/40 p-3 shadow-xl">
            {/* Full calendar — day → month → year drill-down */}
            <Calendar
              className="w-full"
              max={todayIso()}
              onSelect={handleSelect}
              value={`${safeValue}-01`}
            />

            {/* Quick jump footer — §12 soft edge, not hard divider */}
            <div className="mt-2 flex items-center justify-between border-border/30 border-t bg-muted/20 px-1 pt-2">
              <span className="text-[11px] text-muted-foreground">
                {isCustom
                  ? `Showing ${monthLabelForKey(safeValue)}`
                  : "Current month"}
              </span>
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
