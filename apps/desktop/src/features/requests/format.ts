/**
 * CMIS-UI-05 — pure display formatting for request cards, detail modal and
 * filter chips. Kept free of React so the 60s ticker only re-renders text.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Card caption: "just now" · "45m ago" · "2h ago" · "3d ago" · "Sep 12" */
export function relativeTimeLabel(iso: string, now: number): string {
  const delta = now - new Date(iso).getTime();
  if (delta < 45_000) {
    return "just now";
  }
  if (delta < HOUR_MS) {
    return `${Math.max(1, Math.floor(delta / MINUTE_MS))}m ago`;
  }
  if (delta < DAY_MS) {
    return `${Math.floor(delta / HOUR_MS)}h ago`;
  }
  if (delta < 7 * DAY_MS) {
    return `${Math.floor(delta / DAY_MS)}d ago`;
  }
  return new Date(iso).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
  });
}

/** Detail modal: "Sep 12, 2026 at 2:15 PM" */
export function absoluteDateTimeLabel(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} at ${time}`;
}

/** History timeline: "Sep 12, 2:15 PM" */
export function compactDateTimeLabel(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day}, ${time}`;
}

/** Local start of the day containing `now`, as a timestamp. */
export function startOfDay(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Inclusive bound for a `yyyy-mm-dd` date input value. */
export function endOfDayTimestamp(isoDate: string): number {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function startOfDayTimestamp(isoDate: string): number {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
