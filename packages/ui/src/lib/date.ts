/**
 * Calendar helpers for the Apple date picker.
 *
 * Every value here is a local-time `YYYY-MM-DD` string — the same shape the app
 * stores for batch expiry — so parsing never shifts a day across timezones the
 * way `Date#toISOString()` (UTC) does.
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_WEEK = 7;

/** Six rows so the grid height never jumps between months. */
const GRID_CELLS = 42;

/** A grid slot: `iso` is the day, or `null` for out-of-month padding. */
export interface CalendarCell {
  iso: string | null;
  key: string;
}

export const WEEKDAY_LABELS = [
  "Su",
  "Mo",
  "Tu",
  "We",
  "Th",
  "Fr",
  "Sa",
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** `2026-09-16` from a Date, read in local time. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Parses `YYYY-MM-DD`, rejecting impossible dates like `2026-02-31`. */
export function fromIsoDate(value: string): Date | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function isIsoDate(value: string): boolean {
  return fromIsoDate(value) !== null;
}

export function addDaysIso(value: string, days: number): string {
  const base = fromIsoDate(value);
  if (!base) {
    return "";
  }
  base.setDate(base.getDate() + days);
  return toIsoDate(base);
}

/** First day of the month `months` away from `date`. */
export function shiftMonth(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function monthLabel(date: Date): string {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

/**
 * Day cells for the month containing `date`, Sunday-first. `iso` is `null` for
 * padding days outside the month.
 */
export function monthGrid(date: Date): CalendarCell[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const leadingBlanks = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let index = 0; index < GRID_CELLS; index += 1) {
    const day = index - leadingBlanks + 1;
    const inMonth = day >= 1 && day <= daysInMonth;
    const iso = inMonth ? `${year}-${pad2(month + 1)}-${pad2(day)}` : null;
    cells.push({ iso, key: iso ?? `pad-${year}-${month}-${index}` });
  }
  return cells;
}

/** `16` for `2026-09-16` — the number shown on a calendar cell. */
export function isoDayOfMonth(value: string): number {
  return Number(value.slice(-2));
}

export { DAYS_IN_WEEK };
