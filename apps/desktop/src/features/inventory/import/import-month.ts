/**
 * Which dispensing month does an import belong to?
 *
 * The template carries no answer: the workbook is 41 columns of header plus
 * medications, and the daily grid is headed "1"…"31" — nothing in the sheet
 * says which month those days belong to. The one place the month is written
 * down is the file name ("AUGUST 2026 inventory - august r - TEMPLATE
 * FORMAT.xlsx", "AUGUST 2026 inventory - july.csv"), so that is what we read.
 *
 * A file name can name more than one month — the clinic's exports lead with the
 * clinic-wide month and qualify it with the grid's month — so the *last* month
 * name wins. The year is taken from the token nearest to that month, and when
 * the name has no year at all the current year is assumed and flagged.
 */

const FULL_MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/** Full names and their three-letter abbreviations, e.g. "august" and "aug". */
const MONTH_ALTERNATION = FULL_MONTHS.flatMap((month) => [
  month,
  month.slice(0, 3),
]).join("|");

const MONTH_NAME = new RegExp(`\\b(${MONTH_ALTERNATION})\\b`, "gi");
/** Only ever read through `matchAll`, which iterates a clone — `lastIndex` stays 0. */
const YEAR = /\b(20\d{2})\b/g;
/** `2026-08`, `2026_8`, `2026 08` */
const YEAR_MONTH = /\b(20\d{2})[-_.\s](\d{1,2})\b/;
/** `08-2026`, `8/2026` */
const MONTH_YEAR = /\b(\d{1,2})[-_.\s](20\d{2})\b/;

export interface ImportMonth {
  /** True when the file name named no month, so the current month was used. */
  fallback: boolean;
  /** `YYYY-MM` the daily grid is recorded under. */
  month: string;
  /** True when the file name named a month but no year. */
  yearAssumed: boolean;
}

function toMonth(year: number, month: number): ImportMonth {
  return {
    fallback: false,
    month: `${year}-${String(month).padStart(2, "0")}`,
    yearAssumed: false,
  };
}

function monthNumberOf(word: string): number | null {
  const lower = word.toLowerCase();
  const index = FULL_MONTHS.findIndex((month) => month.startsWith(lower));
  return index === -1 ? null : index + 1;
}

function currentMonth(now: Date): ImportMonth {
  return {
    fallback: true,
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    yearAssumed: false,
  };
}

/** The year closest to `index` in `text`, so a stray year elsewhere doesn't win. */
function nearestYear(text: string, index: number): number | null {
  let best: { distance: number; year: number } | null = null;
  for (const match of text.matchAll(YEAR)) {
    const distance = Math.abs((match.index ?? 0) - index);
    if (!best || distance < best.distance) {
      best = { distance, year: Number(match[1]) };
    }
  }
  return best ? best.year : null;
}

/**
 * Reads `YYYY-MM` out of a file name, falling back to the current month.
 * Pass `now` in tests to pin the fallback.
 */
export function deriveImportMonth(
  fileName: string,
  now: Date = new Date()
): ImportMonth {
  const names = [...fileName.matchAll(MONTH_NAME)];
  const last = names.at(-1);

  if (last) {
    const month = monthNumberOf(last[1]);
    if (month !== null) {
      const year = nearestYear(fileName, last.index ?? 0);
      if (year !== null) {
        return toMonth(year, month);
      }
      const assumed = toMonth(now.getFullYear(), month);
      return { ...assumed, yearAssumed: true };
    }
  }

  const yearMonth = fileName.match(YEAR_MONTH);
  if (yearMonth) {
    const month = Number(yearMonth[2]);
    if (month >= 1 && month <= 12) {
      return toMonth(Number(yearMonth[1]), month);
    }
  }

  const monthYear = fileName.match(MONTH_YEAR);
  if (monthYear) {
    const month = Number(monthYear[1]);
    if (month >= 1 && month <= 12) {
      return toMonth(Number(monthYear[2]), month);
    }
  }

  return currentMonth(now);
}

/** Human-readable provenance for the preview, e.g. "from the file name". */
export function describeImportMonth(month: ImportMonth): string {
  if (month.fallback) {
    return "no month in the file name — using the current month";
  }
  if (month.yearAssumed) {
    return "from the file name, year assumed";
  }
  return "from the file name";
}
