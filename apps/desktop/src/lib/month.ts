/**
 * The month the app is running in.
 *
 * The dashboard and Reports used to hardcode `"2026-08"` while the rest of the
 * app works in real time, so a live install charted a month that had already
 * passed. Deriving it here keeps the two screens on the same window as the data
 * being written (`dispensing_events.month`, `requests.submitted_at`).
 */

/** `2026-09` for the given date (defaults to now) — the app's month key format. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The `1st … last` day count of a `YYYY-MM` key. */
export function daysInMonth(month: string): number {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!(year && monthIndex)) {
    return 0;
  }
  return new Date(year, monthIndex, 0).getDate();
}

/**
 * How many days of `month` are worth charting: the whole month once it is past,
 * today's date while it is current, and none of it while it is still ahead.
 *
 * Without the clamp a trend line runs to the 30th on the 18th, drawing a flat
 * tail of days that have not happened.
 */
export function daysElapsed(month: string, now: Date = new Date()): number {
  const current = monthKey(now);
  if (month === current) {
    return Math.min(daysInMonth(month), now.getDate());
  }
  return month > current ? 0 : daysInMonth(month);
}

/**
 * Half-open `[start, end)` ISO bounds for a `YYYY-MM` key, compared against the
 * ISO timestamps the app stores. Lexicographic comparison is chronological for
 * ISO-8601 strings, which is what the SQL callers rely on.
 */
export function monthRange(month: string): { end: string; start: string } {
  const [year, monthIndex] = month.split("-").map(Number);
  return {
    end: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    start: new Date(Date.UTC(year, monthIndex - 1, 1)).toISOString(),
  };
}

/** `true` if `value` is a valid `YYYY-MM` key. */
export function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && daysInMonth(value) > 0;
}

/** Human label for a `YYYY-MM` key — e.g. `2026-09` → `September 2026`. */
export function monthLabelForKey(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!(year && monthIndex)) {
    return month;
  }
  return new Date(year, monthIndex - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Short label — e.g. `Sep 2026`. */
export function monthShortLabel(key: string): string {
  const [year, monthIndex] = key.split("-").map(Number);
  if (!(year && monthIndex)) {
    return key;
  }
  return new Date(year, monthIndex - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/** Shift a `YYYY-MM` key by `delta` months. */
export function shiftMonthKey(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!(year && monthIndex)) {
    return monthKey();
  }
  const date = new Date(year, monthIndex - 1 + delta, 1);
  return monthKey(date);
}

/** Rolling list of last `count` months ending at `anchor` inclusive, newest first. */
export function rollingMonths(count = 12, anchor: Date = new Date()): string[] {
  const end = monthKey(anchor);
  const out: string[] = [end];
  let cursor = end;
  for (let i = 1; i < count; i += 1) {
    cursor = shiftMonthKey(cursor, -1);
    out.push(cursor);
  }
  return out;
}

/** Clamp an incoming `?month=` to a valid key, falling back to current month. */
export function coerceMonthKey(value: unknown): string {
  if (typeof value === "string" && isMonthKey(value)) {
    return value;
  }
  return monthKey();
}
