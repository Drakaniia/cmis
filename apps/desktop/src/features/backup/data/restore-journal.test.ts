import { describe, expect, it } from "vitest";
import {
  parseRestoreJournal,
  restoreAuditDetail,
  serializeRestoreJournal,
} from "./restore-journal";

const JOURNAL = {
  appVersion: "1.5.0",
  at: "2026-09-22T09:14:00.000Z",
  operator: "Ama",
  sourceFile: "/docs/CMIS Backups/cmis-auto-2026-09-22.db",
  sourceName: "cmis-auto-2026-09-22.db",
};

describe("restore-journal", () => {
  it("round-trips through JSON", () => {
    const parsed = parseRestoreJournal(
      JSON.parse(serializeRestoreJournal(JOURNAL))
    );
    expect(parsed).toEqual(JOURNAL);
  });

  it("refuses malformed input without throwing", () => {
    expect(parseRestoreJournal(null)).toBeNull();
    expect(parseRestoreJournal("not json")).toBeNull();
    expect(parseRestoreJournal({})).toBeNull();
    expect(parseRestoreJournal({ ...JOURNAL, sourceName: "  " })).toBeNull();
    expect(parseRestoreJournal({ ...JOURNAL, at: 42 })).toBeNull();
  });

  it("names the source file in the surviving audit entry", () => {
    expect(restoreAuditDetail(JOURNAL)).toBe(
      "Restored database from cmis-auto-2026-09-22.db"
    );
  });
});
