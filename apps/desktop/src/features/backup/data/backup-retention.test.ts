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
});
