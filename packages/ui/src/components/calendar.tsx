"use client";

import {
  fromIsoDate,
  isoDayOfMonth,
  MONTH_LABELS,
  monthFirstDayIso,
  monthGrid,
  monthKeyFromIso,
  monthKeysOfYear,
  monthLabel,
  monthLastDayIso,
  shiftMonth,
  shiftYear,
  todayIso,
  WEEKDAY_LABELS,
  yearGrid,
  yearGridStart,
} from "@cmis/ui/lib/date";
import { cn } from "@cmis/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const CELL_CLASS =
  "press-feedback flex size-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors";

const DISABLED_CLASS = "pointer-events-none text-muted-foreground/30";

type CalendarView = "day" | "month" | "year";

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
        CELL_CLASS,
        "hover:bg-accent",
        selected && "bg-primary text-primary-foreground hover:bg-primary",
        !selected && iso === today && "ring-1 ring-primary/60",
        outOfRange && DISABLED_CLASS
      )}
      disabled={outOfRange}
      onClick={handleClick}
      type="button"
    >
      {isoDayOfMonth(iso)}
    </button>
  );
}

/** A month or year tile in the drill-down views. */
function GridCell({
  ariaLabel,
  label,
  onSelect,
  selected,
  disabled,
}: {
  ariaLabel: string;
  label: string;
  onSelect: () => void;
  selected: boolean;
  disabled: boolean;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={selected}
      className={cn(
        CELL_CLASS,
        "w-full hover:bg-accent",
        selected && "bg-primary text-primary-foreground hover:bg-primary",
        disabled && DISABLED_CLASS
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      {label}
    </button>
  );
}

/** A month tile that binds its own index, so the grid never creates
 * an arrow function per cell during render (lint/performance/noJsxPropsBind). */
function MonthCell({
  disabled,
  index,
  onSelectMonth,
  selected,
  year,
}: {
  disabled: boolean;
  index: number;
  onSelectMonth: (index: number) => void;
  selected: boolean;
  year: number;
}) {
  const handleClick = useCallback(
    () => onSelectMonth(index),
    [index, onSelectMonth]
  );

  return (
    <GridCell
      ariaLabel={monthLabel(new Date(year, index, 1))}
      disabled={disabled}
      label={MONTH_LABELS[index] ?? ""}
      onSelect={handleClick}
      selected={selected}
    />
  );
}

/** A year tile that binds its own value, same reason as MonthCell. */
function YearCell({
  candidate,
  disabled,
  onSelectYear,
  selected,
}: {
  candidate: number;
  disabled: boolean;
  onSelectYear: (next: number) => void;
  selected: boolean;
}) {
  const handleClick = useCallback(
    () => onSelectYear(candidate),
    [candidate, onSelectYear]
  );

  return (
    <GridCell
      ariaLabel={String(candidate)}
      disabled={disabled}
      label={String(candidate)}
      onSelect={handleClick}
      selected={selected}
    />
  );
}

function headerLabelFor(
  view: CalendarView,
  cursor: Date,
  year: number,
  decadeStart: number
): string {
  if (view === "day") {
    return monthLabel(cursor);
  }
  if (view === "month") {
    return String(year);
  }
  return `${decadeStart} – ${decadeStart + 11}`;
}

function prevLabelFor(view: CalendarView): string {
  if (view === "day") {
    return "Previous month";
  }
  if (view === "month") {
    return "Previous year";
  }
  return "Previous 12 years";
}

function nextLabelFor(view: CalendarView): string {
  if (view === "day") {
    return "Next month";
  }
  if (view === "month") {
    return "Next year";
  }
  return "Next 12 years";
}

export interface CalendarProps {
  className?: string;
  /** Inclusive `YYYY-MM-DD` upper bound; later days/months/years are disabled. */
  max?: string;
  /** Inclusive `YYYY-MM-DD` lower bound; earlier days/months/years are disabled. */
  min?: string;
  /** Fires with the chosen day as `YYYY-MM-DD`. */
  onSelect: (iso: string) => void;
  /** `YYYY-MM-DD`, or `null` when nothing is selected. */
  value: string | null;
}

/**
 * Apple-styled calendar with three drill-down views: day → month → year. The
 * header label steps up a view, a month or year tile steps back down, and
 * `min`/`max` disable anything outside the range at every level.
 */
export function Calendar({
  value,
  onSelect,
  min,
  max,
  className,
}: CalendarProps) {
  const today = todayIso();
  const [view, setView] = useState<CalendarView>("day");
  const [cursor, setCursor] = useState<Date>(
    () => fromIsoDate(value ?? "") ?? new Date()
  );

  const year = cursor.getFullYear();

  const dayCells = useMemo(() => monthGrid(cursor), [cursor]);
  const months = useMemo(() => monthKeysOfYear(year), [year]);
  const years = useMemo(() => yearGrid(year), [year]);

  // Re-anchor on a committed value change (e.g. the field is typed into while
  // the calendar is open) without fighting in-calendar navigation.
  useEffect(() => {
    const next = value ? fromIsoDate(value) : null;
    if (next) {
      setCursor(next);
    }
  }, [value]);

  const isDayOutOfRange = useCallback(
    (iso: string) =>
      (min !== undefined && iso < min) || (max !== undefined && iso > max),
    [max, min]
  );

  const isMonthOutOfRange = useCallback(
    (key: string) => {
      const [keyYear, keyMonth] = key.split("-").map(Number);
      if (keyYear === undefined || keyMonth === undefined) {
        return true;
      }
      return (
        (min !== undefined && monthLastDayIso(keyYear, keyMonth - 1) < min) ||
        (max !== undefined && monthFirstDayIso(keyYear, keyMonth - 1) > max)
      );
    },
    [max, min]
  );

  const isYearOutOfRange = useCallback(
    (candidate: number) =>
      (min !== undefined && `${candidate}-12-31` < min) ||
      (max !== undefined && `${candidate}-01-01` > max),
    [max, min]
  );

  const step = useCallback(
    (delta: number) => {
      setCursor((current) => {
        if (view === "day") {
          return shiftMonth(current, delta);
        }
        if (view === "month") {
          return shiftYear(current, delta);
        }
        return shiftYear(current, delta * 12);
      });
    },
    [view]
  );

  const handlePrev = useCallback(() => step(-1), [step]);
  const handleNext = useCallback(() => step(1), [step]);

  const handleDrillUp = useCallback(() => {
    setView((current) => (current === "day" ? "month" : "year"));
  }, []);

  const handleSelectMonth = useCallback((index: number) => {
    setCursor((current) => new Date(current.getFullYear(), index, 1));
    setView("day");
  }, []);

  const handleSelectYear = useCallback((next: number) => {
    setCursor((current) => new Date(next, current.getMonth(), 1));
    setView("month");
  }, []);

  const decadeStart = yearGridStart(year);
  const headerLabel = headerLabelFor(view, cursor, year, decadeStart);

  const prevLabel = prevLabelFor(view);
  const nextLabel = nextLabelFor(view);

  const selectedMonth = value ? monthKeyFromIso(value) : "";
  const selectedYear = value ? Number(value.slice(0, 4)) : Number.NaN;

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          aria-label={prevLabel}
          className={CELL_CLASS}
          onClick={handlePrev}
          type="button"
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        {view === "year" ? (
          <span
            aria-live="polite"
            className="font-medium text-foreground text-xs tabular-nums"
          >
            {headerLabel}
          </span>
        ) : (
          <button
            aria-label={view === "day" ? "Choose month" : "Choose year"}
            className="press-feedback rounded-md px-2 py-0.5 font-medium text-foreground text-xs tabular-nums hover:bg-accent"
            onClick={handleDrillUp}
            type="button"
          >
            {headerLabel}
          </button>
        )}
        <button
          aria-label={nextLabel}
          className={CELL_CLASS}
          onClick={handleNext}
          type="button"
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>

      {view === "day" ? (
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
          {dayCells.map((cell) =>
            cell.iso === null ? (
              <span aria-hidden className="size-8" key={cell.key} />
            ) : (
              <DayCell
                iso={cell.iso}
                key={cell.key}
                onSelect={onSelect}
                outOfRange={isDayOutOfRange(cell.iso)}
                selected={cell.iso === value}
                today={today}
              />
            )
          )}
        </div>
      ) : null}

      {view === "month" ? (
        <div className="grid grid-cols-3 gap-1">
          {months.map((key, index) => (
            <MonthCell
              disabled={isMonthOutOfRange(key)}
              index={index}
              key={key}
              onSelectMonth={handleSelectMonth}
              selected={key === selectedMonth}
              year={year}
            />
          ))}
        </div>
      ) : null}

      {view === "year" ? (
        <div className="grid grid-cols-3 gap-1">
          {years.map((candidate) => (
            <YearCell
              candidate={candidate}
              disabled={isYearOutOfRange(candidate)}
              key={candidate}
              onSelectYear={handleSelectYear}
              selected={candidate === selectedYear}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
