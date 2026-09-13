/**
 * CMIS-UI-09 — pure display formatting shared by the Admin screens.
 * Kept React-free so hooks can derive labels without re-render churn.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Relative time with an absolute tooltip companion (§1.3 Last Login). */
export function relativeTime(iso: string, now: number = Date.now()): string {
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
  if (delta < 30 * DAY_MS) {
    return `${Math.floor(delta / DAY_MS)}d ago`;
  }
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function absoluteDateTime(iso: string): string {
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
  return `${day}, ${time}`;
}

/** Audit log timestamp — seconds matter for compliance (§3.2). */
export function auditTimestamp(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    second: "2-digit",
  });
  return `${day}, ${time}`;
}

/** `2026-09-12` — value shape used by `<input type="date">`. */
export function toDateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

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
