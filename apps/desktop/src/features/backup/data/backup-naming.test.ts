import { describe, expect, it } from "vitest";
import {
  autoBackupName,
  backupKindOf,
  deviceTagOf,
  isAutoBackupName,
  isListableBackupName,
  localDateKey,
  manualBackupName,
  resolveCollision,
} from "./backup-naming";

describe("backup-naming", () => {
  it("keys the local calendar date, not UTC", () => {
    expect(localDateKey(new Date(2026, 8, 22, 0, 30))).toBe("2026-09-22");
  });

  it("names one automatic copy per day", () => {
    expect(autoBackupName("2026-09-22")).toBe("cmis-auto-2026-09-22.db");
  });

  it("names the day's automatic copy after the device that wrote it", () => {
    expect(autoBackupName("2026-09-22", "deped-4f2a")).toBe(
      "cmis-auto-2026-09-22-deped-4f2a.db"
    );
    // No tag means the older, unattributed name — never a shared one.
    expect(autoBackupName("2026-09-22", "")).toBe("cmis-auto-2026-09-22.db");
  });

  it("reads the device tag back out of a name", () => {
    expect(deviceTagOf("cmis-auto-2026-09-22-deped-4f2a.db")).toBe(
      "deped-4f2a"
    );
    expect(deviceTagOf("cmis-auto-2026-09-22.db")).toBeNull();
    expect(deviceTagOf("cmis-manual-2026-09-22-0914.db")).toBeNull();
    expect(deviceTagOf("notes.db")).toBeNull();
  });

  it("classifies a device-tagged copy as an ordinary automatic copy", () => {
    expect(backupKindOf("cmis-auto-2026-09-22-deped-4f2a.db")).toBe("auto");
    expect(isAutoBackupName("cmis-auto-2026-09-22-deped-4f2a.db")).toBe(true);
    // Its staging file is still invisible, and never listed or counted.
    expect(
      isListableBackupName("cmis-auto-2026-09-22-deped-4f2a.db.1-2-0.partial")
    ).toBe(false);
  });

  it("names manual copies to the minute", () => {
    expect(manualBackupName(new Date(2026, 8, 22, 9, 14))).toBe(
      "cmis-manual-2026-09-22-0914.db"
    );
  });

  it("suffixes collisions before .db and never overwrites", () => {
    expect(
      resolveCollision(
        ["cmis-manual-2026-09-22-0914.db"],
        "cmis-manual-2026-09-22-0914.db"
      )
    ).toBe("cmis-manual-2026-09-22-0914-2.db");
  });

  it("classifies only the app's own patterns", () => {
    expect(backupKindOf("cmis-auto-2026-09-22.db")).toBe("auto");
    expect(backupKindOf("cmis-manual-2026-09-22-0914.db")).toBe("manual");
    expect(backupKindOf("notes.db")).toBe("other");
    expect(isAutoBackupName("cmis-manual-2026-09-22-0914.db")).toBe(false);
    expect(isListableBackupName("cmis-auto-2026-09-22.db.partial")).toBe(false);
  });
});
