import { describe, expect, it } from "vitest";
import { shouldRunDailyBackup } from "./backup-policy";

describe("backup-policy", () => {
  it("skips when disabled, done today, or no database; runs on a new day", () => {
    expect(
      shouldRunDailyBackup({
        enabled: false,
        hasDatabase: true,
        lastBackupDate: "",
        today: "2026-09-22",
      }).run
    ).toBe(false);
    expect(
      shouldRunDailyBackup({
        enabled: true,
        hasDatabase: true,
        lastBackupDate: "2026-09-22",
        today: "2026-09-22",
      }).run
    ).toBe(false);
    expect(
      shouldRunDailyBackup({
        enabled: true,
        hasDatabase: false,
        lastBackupDate: "",
        today: "2026-09-22",
      }).run
    ).toBe(false);
    expect(
      shouldRunDailyBackup({
        enabled: true,
        hasDatabase: true,
        lastBackupDate: "2026-09-21",
        today: "2026-09-22",
      }).run
    ).toBe(true);
  });
});
