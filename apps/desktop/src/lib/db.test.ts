import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExec = vi.fn().mockResolvedValue({ rowsAffected: 0 });

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      exec: mockExec,
      execute: mockExec,
    }),
  },
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: vi.fn().mockImplementation(() => ({
    save: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("wipeAllData", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockExec.mockClear();
    localStorage.clear();
    const { resetDbForTesting } = await import("./db");
    resetDbForTesting();
  });

  it("executes DELETE in FK-safe order then VACUUM", async () => {
    const { WIPE_STATEMENTS, wipeAllData } = await import("./db");

    expect(WIPE_STATEMENTS).toEqual([
      "DELETE FROM dispensing_records",
      "DELETE FROM request_notes",
      "DELETE FROM request_history",
      "DELETE FROM dispensing_events",
      "DELETE FROM requests",
      "DELETE FROM inventory_batches",
      "DELETE FROM trash_records",
      "DELETE FROM audit_log",
      "DELETE FROM inventory_items",
      "VACUUM",
    ]);

    await wipeAllData({ resetSettings: false });

    expect(mockExec).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM dispensing_records"
    );
    expect(mockExec).toHaveBeenNthCalledWith(2, "DELETE FROM request_notes");
    expect(mockExec).toHaveBeenNthCalledWith(3, "DELETE FROM request_history");
    expect(mockExec).toHaveBeenNthCalledWith(
      4,
      "DELETE FROM dispensing_events"
    );
    expect(mockExec).toHaveBeenNthCalledWith(5, "DELETE FROM requests");
    expect(mockExec).toHaveBeenNthCalledWith(
      6,
      "DELETE FROM inventory_batches"
    );
    expect(mockExec).toHaveBeenNthCalledWith(7, "DELETE FROM trash_records");
    expect(mockExec).toHaveBeenNthCalledWith(8, "DELETE FROM audit_log");
    expect(mockExec).toHaveBeenNthCalledWith(9, "DELETE FROM inventory_items");
    expect(mockExec).toHaveBeenNthCalledWith(10, "VACUUM");
  });

  it("clears the audit log then writes exactly one wipe entry so analytics goes empty", async () => {
    const { WIPE_STATEMENTS, wipeAllData } = await import("./db");

    expect(WIPE_STATEMENTS).toContain("DELETE FROM audit_log");
    expect(WIPE_STATEMENTS).toContain("DELETE FROM inventory_batches");
    expect(WIPE_STATEMENTS).toContain("DELETE FROM dispensing_records");

    await wipeAllData({ resetSettings: false });

    const auditInserts = mockExec.mock.calls.filter((call) =>
      String(call[0]).includes("INSERT INTO audit_log")
    );
    expect(auditInserts).toHaveLength(1);
    const params = auditInserts[0][1] as unknown[];
    // action index 2, detail index 5 — a `settings` entry naming the wipe.
    expect(params[2]).toBe("settings");
    expect(String(params[5])).toContain("Wiped all data");
  });
});
