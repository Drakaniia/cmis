import { describe, expect, it } from "vitest";
import { selectPruneVictims } from "./backup-retention";

describe("backup-retention", () => {
  const names = (n: number) =>
    Array.from(
      { length: n },
      (_, i) => `cmis-auto-2026-09-${String(i + 1).padStart(2, "0")}.db`
    );

  it("keeps the newest N automatic copies by name order", () => {
    expect(
      selectPruneVictims(
        [...names(12), "notes.db"],
        10,
        "cmis-auto-2026-09-12.db"
      )
    ).toEqual(["cmis-auto-2026-09-01.db", "cmis-auto-2026-09-02.db"]);
  });

  it("never touches manual or foreign files and never the just-written file", () => {
    const files = [
      "cmis-manual-2026-09-01-0914.db",
      "notes.db",
      "cmis-auto-2026-09-01.db",
    ];
    expect(selectPruneVictims(files, 1, "cmis-auto-2026-09-01.db")).toEqual([]);
  });

  // A shared `<Documents>/CMIS Backups`: two machines write the day's copy
  // under names carrying their own device tag.
  const sharedNames = [
    "cmis-auto-2026-09-28-deped-4f2a.db",
    "cmis-auto-2026-09-29-deped-4f2a.db",
    "cmis-auto-2026-09-30-deped-4f2a.db",
    "cmis-auto-2026-09-27-desk-11ab.db",
    "cmis-auto-2026-09-28-desk-11ab.db",
    "cmis-auto-2026-09-26.db",
  ];

  it("counts retention per device, not per folder", () => {
    const victims = selectPruneVictims(
      sharedNames,
      1,
      "cmis-auto-2026-09-30-deped-4f2a.db"
    );
    // One survivor per device — two beyond the machine's own newest go, one
    // beyond the other machine's newest goes, and the untagged copy is a third
    // group of its own, so it survives too.
    expect([...victims].sort()).toEqual(
      [
        "cmis-auto-2026-09-27-desk-11ab.db",
        "cmis-auto-2026-09-28-deped-4f2a.db",
        "cmis-auto-2026-09-29-deped-4f2a.db",
      ].sort()
    );
  });

  it("never empties another device's history to make room", () => {
    const files = [
      "cmis-auto-2026-09-30-deped-4f2a.db",
      "cmis-auto-2026-09-29-deped-4f2a.db",
      "cmis-auto-2026-09-28-desk-11ab.db",
    ];
    expect(selectPruneVictims(files, 1, files[0])).toEqual([
      "cmis-auto-2026-09-29-deped-4f2a.db",
    ]);
  });
});
