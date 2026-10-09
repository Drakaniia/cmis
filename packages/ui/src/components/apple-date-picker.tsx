"use client";

import { Calendar } from "@cmis/ui/components/calendar";
import {
  Popover,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTrigger,
} from "@cmis/ui/components/popover";
import { isIsoDate, todayIso } from "@cmis/ui/lib/date";
import { cn } from "@cmis/ui/lib/utils";
import { CalendarDays } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

/** `20260916` typed without separators still commits as `2026-09-16`. */
const COMPACT_DATE_PATTERN = /^\d{8}$/;

const INPUT_CLASS =
  "h-full w-full min-w-0 rounded-md border border-input bg-background pr-7 pl-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

const FOOTER_BUTTON_CLASS =
  "press-feedback rounded-md px-2 py-1 font-medium text-xs hover:bg-accent";

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
 * A date field with a full calendar popover. Clicking anywhere on the field
 * opens the picker; the field stays free-text so an ISO date can be typed.
 */
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
  const today = todayIso();

  useEffect(() => {
    setText(value);
  }, [value]);

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      if (COMPACT_DATE_PATTERN.test(raw)) {
        const compact = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
        if (isIsoDate(compact)) {
          setText(compact);
          onChange(compact);
          setOpen(false);
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
        // A complete date typed by hand dismisses the calendar.
        setOpen(false);
      }
    },
    [onChange]
  );

  // Never leave unparseable text behind — fall back to the committed value.
  const handleBlur = useCallback(() => setText(value), [value]);

  const handleOpenCalendar = useCallback(() => setOpen(true), []);

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
        {/* The field itself is the trigger, so a click anywhere opens the
            picker instead of only the small calendar affordance. */}
        <PopoverTrigger
          disabled={disabled}
          id={id}
          nativeButton={false}
          render={
            <input
              aria-label={ariaLabel}
              className={INPUT_CLASS}
              disabled={disabled}
              inputMode="numeric"
              onBlur={handleBlur}
              onChange={handleTextChange}
              placeholder={placeholder}
              type="text"
              value={text}
            />
          }
        />
        <button
          aria-label="Open calendar"
          className="press-feedback absolute right-0.5 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          disabled={disabled}
          onClick={handleOpenCalendar}
          type="button"
        >
          <CalendarDays aria-hidden className="size-3.5" />
        </button>
      </div>
      <PopoverPortal>
        <PopoverPositioner align="start" sideOffset={4}>
          <PopoverPopup className="surface-frosted w-64">
            <Calendar
              max={max}
              min={min}
              onSelect={handleSelectDay}
              value={value}
            />

            <div className="mt-2 flex items-center justify-between border-border/40 border-t pt-2">
              <button
                className={cn(FOOTER_BUTTON_CLASS, "text-primary")}
                onClick={handleSelectToday}
                type="button"
              >
                Today
              </button>
              <button
                className={cn(FOOTER_BUTTON_CLASS, "text-muted-foreground")}
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
