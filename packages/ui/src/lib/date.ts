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

/** Short month names, January first — the month-view cell labels. */
export const MONTH_LABELS = [
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

const MONTHS_IN_YEAR = 12;
const YEARS_IN_GRID = 12;

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

/** Shift `date` by whole `years`, keeping the day of month. */
export function shiftYear(date: Date, years: number): Date {
  const shifted = new Date(date.getTime());
  shifted.setFullYear(shifted.getFullYear() + years);
  return shifted;
}

/** `2026-09` for a Date, read in local time. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** `2026-09` from an ISO date `2026-09-16`. */
export function monthKeyFromIso(value: string): string {
  return value.slice(0, 7);
}

/** `2026-09-01` — the first day of the given zero-based month. */
export function monthFirstDayIso(year: number, monthIndex: number): string {
  return `${year}-${pad2(monthIndex + 1)}-01`;
}

/** `2026-09-30` — the last calendar day of the given zero-based month. */
export function monthLastDayIso(year: number, monthIndex: number): string {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return `${year}-${pad2(monthIndex + 1)}-${pad2(last)}`;
}

/** `["2026-01", …, "2026-12"]` for the given year. */
export function monthKeysOfYear(year: number): string[] {
  return Array.from(
    { length: MONTHS_IN_YEAR },
    (_, index) => `${year}-${pad2(index + 1)}`
  );
}

/** The first year of the 12-year grid containing `year`. */
export function yearGridStart(year: number): number {
  return Math.floor(year / YEARS_IN_GRID) * YEARS_IN_GRID;
}

/** The 12 years shown in the year view, oldest first. */
export function yearGrid(year: number): number[] {
  const start = yearGridStart(year);
  return Array.from({ length: YEARS_IN_GRID }, (_, index) => start + index);
}

export { DAYS_IN_WEEK, MONTHS_IN_YEAR, YEARS_IN_GRID };
