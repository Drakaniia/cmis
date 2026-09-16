import {
  addDaysIso,
  fromIsoDate,
  isIsoDate,
  isoDayOfMonth,
  monthGrid,
  shiftMonth,
  todayIso,
  toIsoDate,
} from "@cmis/ui/lib/date";
import { describe, expect, it } from "vitest";

describe("iso date helpers", () => {
  it("round-trips a local date without a UTC shift", () => {
    const date = new Date(2026, 0, 1, 0, 30);
    expect(toIsoDate(date)).toBe("2026-01-01");
    expect(fromIsoDate("2026-01-01")?.getDate()).toBe(1);
  });

  it("rejects malformed and impossible dates", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("not a date")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(fromIsoDate("13/45/2026")).toBeNull();
  });

  it("adds days across month and year boundaries", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-09-15", 90)).toBe("2026-12-14");
    expect(addDaysIso("nonsense", 1)).toBe("");
  });

  it("shifts months and labels them", () => {
    const september = new Date(2026, 8, 15);
    expect(shiftMonth(september, 1).getMonth()).toBe(9);
    expect(shiftMonth(september, -1).getMonth()).toBe(7);
    expect(shiftMonth(new Date(2026, 11, 15), 1).getFullYear()).toBe(2027);
  });

  it("builds a Sunday-first 42-cell grid padded with blanks", () => {
    const cells = monthGrid(new Date(2026, 8, 15));
    expect(cells).toHaveLength(42);
    // 2026-09-01 is a Tuesday → two leading padding cells.
    expect(cells[0]?.iso).toBeNull();
    expect(cells[1]?.iso).toBeNull();
    expect(cells[2]?.iso).toBe("2026-09-01");
    expect(cells).toContainEqual({ iso: "2026-09-30", key: "2026-09-30" });
    // 2 leading blanks + 30 days + 10 trailing blanks = 42 cells.
    expect(cells.filter((cell) => cell.iso === null)).toHaveLength(12);
  });

  it("exposes the day number for a cell and today as ISO", () => {
    expect(isoDayOfMonth("2026-09-06")).toBe(6);
    expect(isIsoDate(todayIso())).toBe(true);
  });
});
