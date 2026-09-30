import { describe, expect, it, vi } from "vitest";
import { runHealthAction, syncCardCopy } from "./health-actions";

/** A database handle that records the SQL it was asked to run. */
function fakeDb() {
  const execute = vi.fn().mockResolvedValue({ rowsAffected: 0 });
  const select = vi.fn().mockResolvedValue([]);
  return { db: { execute, select } as never, execute, select };
}

describe("health actions run real work", () => {
  it("runs a real integrity check instead of only patching the card", async () => {
    // The action used to report "Integrity check passed" without asking
    // SQLite anything, so a genuinely corrupt database reported healthy.
    const { db, select } = fakeDb();
    select.mockResolvedValue([{ integrity_check: "ok" }]);

    const result = await runHealthAction({
      actionId: "integrity",
      db,
    });

    expect(select).toHaveBeenCalledWith("PRAGMA integrity_check");
    expect(result?.ok).toBe(true);
  });

  it("reports failure when the integrity check does not return ok", async () => {
    const { db, select } = fakeDb();
    select.mockResolvedValue([{ integrity_check: "*** in database main ***" }]);

    const result = await runHealthAction({ actionId: "integrity", db });

    expect(result?.ok).toBe(false);
    expect(result?.message).toMatch(/failed/i);
  });

  it("runs a real VACUUM instead of only patching the card", async () => {
    const { db, execute } = fakeDb();

    const result = await runHealthAction({ actionId: "vacuum", db });

    expect(execute).toHaveBeenCalledWith("VACUUM");
    expect(result?.ok).toBe(true);
  });

  it("surfaces a failing VACUUM rather than claiming success", async () => {
    const { db, execute } = fakeDb();
    execute.mockRejectedValue(new Error("database is locked"));

    const result = await runHealthAction({ actionId: "vacuum", db });

    expect(result?.ok).toBe(false);
    // The real reason must reach the operator, not a generic "failed".
    expect(result?.description).toMatch(/database is locked/);
  });

  it("has no sync action, because there is no queue to retry", async () => {
    // "Retry sync" cleared an always-empty array and reported success.
    const { db, execute, select } = fakeDb();
    const result = await runHealthAction({ actionId: "retry-sync", db });
    expect(result).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
});

describe("sync card copy", () => {
  it("does not claim changes are queued when nothing is queued", () => {
    // The page used to read "Offline — changes are queuing locally" over an
    // array that was hardcoded empty, and offered a Retry button that ran no
    // code. Both are gone; the card now states the real storage model.
    expect(syncCardCopy.caption).not.toMatch(/queuing|queued|pending/i);
    expect(syncCardCopy.caption).toMatch(/straight to the database/i);
  });
});
