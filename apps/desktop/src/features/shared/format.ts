/**
 * Timestamp arithmetic the Admin and Requests formatters both need.
 *
 * These are not display concerns — they are the inclusive bounds a
 * `<input type="date">` range maps onto, so they live apart from the
 * screen-specific wording that renders them.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export function startOfDayTimestamp(isoDate: string): number {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfDayTimestamp(isoDate: string): number {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}
