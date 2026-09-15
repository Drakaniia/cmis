import { describe, expect, it } from "vitest";
import { deriveImportMonth, describeImportMonth } from "./import-month";

/** Pins the fallback so "this month" is deterministic in tests. */
const NOW = new Date(2026, 8, 15); // 2026-09-15

describe("deriveImportMonth", () => {
  it("reads the month and year off the clinic's real export name", () => {
    expect(
      deriveImportMonth(
        "AUGUST 2026 inventory - august r - TEMPLATE FORMAT .xlsx",
        NOW
      )
    ).toEqual({ fallback: false, month: "2026-08", yearAssumed: false });

    expect(
      deriveImportMonth("AUGUST 2026 inventory - august r.csv", NOW)
    ).toEqual({ fallback: false, month: "2026-08", yearAssumed: false });
  });

  it("takes the month the grid qualifies, not the title month", () => {
    // The clinic's exports lead with the clinic month and end with the grid's.
    expect(deriveImportMonth("AUGUST 2026 inventory - july.csv", NOW)).toEqual({
      fallback: false,
      month: "2026-07",
      yearAssumed: false,
    });
  });

  it("accepts numeric and abbreviated spellings", () => {
    expect(deriveImportMonth("inventory 2026-08.xlsx", NOW).month).toBe(
      "2026-08"
    );
    expect(deriveImportMonth("stock 08-2026.csv", NOW).month).toBe("2026-08");
    expect(deriveImportMonth("inventory Aug 2026.xlsx", NOW).month).toBe(
      "2026-08"
    );
    expect(deriveImportMonth("may inventory 2026.xlsx", NOW).month).toBe(
      "2026-05"
    );
  });

  it("assumes the current year when the name has a month but no year", () => {
    expect(deriveImportMonth("september inventory.xlsx", NOW)).toEqual({
      fallback: false,
      month: "2026-09",
      yearAssumed: true,
    });
  });

  it("falls back to the current month and says so", () => {
    expect(deriveImportMonth("inventory.xlsx", NOW)).toEqual({
      fallback: true,
      month: "2026-09",
      yearAssumed: false,
    });
    expect(deriveImportMonth("backup-2026.db", NOW).fallback).toBe(true);
  });

  it("does not read a month out of an unrelated word", () => {
    // "marketing" opens with the "mar" abbreviation but is not March.
    expect(deriveImportMonth("marketing report.xlsx", NOW).fallback).toBe(true);
  });
});

describe("describeImportMonth", () => {
  it("reports where the month came from", () => {
    expect(
      describeImportMonth(deriveImportMonth("AUGUST 2026 inventory.xlsx", NOW))
    ).toBe("from the file name");
    expect(
      describeImportMonth(deriveImportMonth("august inventory.xlsx", NOW))
    ).toBe("from the file name, year assumed");
    expect(describeImportMonth(deriveImportMonth("inventory.xlsx", NOW))).toBe(
      "no month in the file name — using the current month"
    );
  });
});
