"use client";

import {
  Popover,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
} from "@cmis/ui/components/popover";
import {
  fromIsoDate,
  isIsoDate,
  isoDayOfMonth,
  monthGrid,
  monthLabel,
  shiftMonth,
  todayIso,
  WEEKDAY_LABELS,
} from "@cmis/ui/lib/date";
import { cn } from "@cmis/ui/lib/utils";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

/** `20260916` typed without separators still commits as `2026-09-16`. */
const COMPACT_DATE_PATTERN = /^\d{8}$/;

const DAY_CLASS =
  "press-feedback flex size-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors";

export interface AppleDatePickerProps {
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** Inclusive `YYYY-MM-DD` bound; earlier days render disabled. */
  max?: string;
  min?: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  /** `YYYY-MM-DD`, or `""` for empty. */
  value: string;
}

/**
 * One day in the month grid. Its own component so the click handler binds an
 * `iso` with a stable reference instead of a fresh arrow per cell.
 */
function DayCell({
  iso,
  onSelect,
  outOfRange,
  selected,
  today,
}: {
  iso: string;
  onSelect: (iso: string) => void;
  outOfRange: boolean;
  selected: boolean;
  today: string;
}) {
  const handleClick = useCallback(() => onSelect(iso), [iso, onSelect]);

  return (
    <button
      aria-current={selected ? "date" : undefined}
      aria-label={iso}
      className={cn(
        DAY_CLASS,
        "hover:bg-accent",
        selected && "bg-primary text-primary-foreground hover:bg-primary",
        !selected && iso === today && "ring-1 ring-primary/60",
        outOfRange && "pointer-events-none text-muted-foreground/30"
      )}
      disabled={outOfRange}
      onClick={handleClick}
      type="button"
    >
      {isoDayOfMonth(iso)}
    </button>
  );
}

export function AppleDatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "YYYY-MM-DD",
  disabled = false,
  id,
  className,
  "aria-label": ariaLabel,
}: AppleDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState(
    () => fromIsoDate(value) ?? new Date()
  );
  const today = todayIso();

  useEffect(() => {
    setText(value);
  }, [value]);

  // Re-anchor the calendar on the selected month each time it opens.
  useEffect(() => {
    if (open) {
      setVisibleMonth((current) =>
        isIsoDate(value) ? (fromIsoDate(value) ?? current) : new Date()
      );
    }
  }, [open, value]);

  const cells = useMemo(() => monthGrid(visibleMonth), [visibleMonth]);

  const isOutOfRange = useCallback(
    (iso: string): boolean =>
      (min !== undefined && iso < min) || (max !== undefined && iso > max),
    [max, min]
  );

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      if (COMPACT_DATE_PATTERN.test(raw)) {
        const compact = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
        if (isIsoDate(compact)) {
          setText(compact);
          onChange(compact);
          return;
        }
      }
      setText(raw);
      if (raw === "") {
        onChange("");
        return;
      }
      if (isIsoDate(raw)) {
        onChange(raw);
      }
    },
    [onChange]
  );

  // Never leave unparseable text behind — fall back to the committed value.
  const handleBlur = useCallback(() => setText(value), [value]);

  const handlePrevMonth = useCallback(
    () => setVisibleMonth((current) => shiftMonth(current, -1)),
    []
  );
  const handleNextMonth = useCallback(
    () => setVisibleMonth((current) => shiftMonth(current, 1)),
    []
  );

  const handleSelectDay = useCallback(
    (iso: string) => {
      onChange(iso);
      setOpen(false);
    },
    [onChange]
  );

  const handleSelectToday = useCallback(
    () => handleSelectDay(today),
    [handleSelectDay, today]
  );

  const handleClear = useCallback(() => {
    onChange("");
    setOpen(false);
  }, [onChange]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <div className={cn("relative flex items-center", className)}>
        <input
          aria-label={ariaLabel}
          className="h-full w-full min-w-0 rounded-md border border-input bg-background pr-7 pl-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          id={id}
          inputMode="numeric"
          onBlur={handleBlur}
          onChange={handleTextChange}
          placeholder={placeholder}
          type="text"
          value={text}
        />
        <PopoverTrigger
          aria-label="Choose date"
          className="press-feedback absolute right-0.5 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          disabled={disabled}
          type="button"
        >
          <CalendarDays aria-hidden className="size-3.5" />
        </PopoverTrigger>
      </div>
      <PopoverPortal>
        <PopoverPositioner align="start" sideOffset={4}>
          <PopoverPopup className="surface-frosted w-64">
            <div className="mb-2 flex items-center justify-between gap-1">
              <button
                aria-label="Previous month"
                className={DAY_CLASS}
                onClick={handlePrevMonth}
                type="button"
              >
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <div
                aria-live="polite"
                className="font-medium text-foreground text-xs"
              >
                {monthLabel(visibleMonth)}
              </div>
              <button
                aria-label="Next month"
                className={DAY_CLASS}
                onClick={handleNextMonth}
                type="button"
              >
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAY_LABELS.map((label) => (
                <span
                  aria-hidden
                  className="flex size-8 items-center justify-center text-[10px] text-muted-foreground"
                  key={label}
                >
                  {label}
                </span>
              ))}
              {cells.map((cell) =>
                cell.iso === null ? (
                  <span aria-hidden className="size-8" key={cell.key} />
                ) : (
                  <DayCell
                    iso={cell.iso}
                    key={cell.key}
                    onSelect={handleSelectDay}
                    outOfRange={isOutOfRange(cell.iso)}
                    selected={cell.iso === value}
                    today={today}
                  />
                )
              )}
            </div>

            <div className="mt-2 flex items-center justify-between border-border/40 border-t pt-2">
              <button
                className="press-feedback rounded-md px-2 py-1 font-medium text-primary text-xs hover:bg-accent"
                onClick={handleSelectToday}
                type="button"
              >
                Today
              </button>
              <button
                className="press-feedback rounded-md px-2 py-1 font-medium text-muted-foreground text-xs hover:bg-accent"
                onClick={handleClear}
                type="button"
              >
                Clear
              </button>
            </div>
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </Popover>
  );
}
