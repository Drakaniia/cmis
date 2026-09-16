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
      "DELETE FROM dispensing_events",
      "DELETE FROM requests",
      "DELETE FROM trash_records",
      "DELETE FROM inventory_items",
      "VACUUM",
    ]);

    await wipeAllData({ resetSettings: false });

    expect(mockExec).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM dispensing_events"
    );
    expect(mockExec).toHaveBeenNthCalledWith(2, "DELETE FROM requests");
    expect(mockExec).toHaveBeenNthCalledWith(3, "DELETE FROM trash_records");
    expect(mockExec).toHaveBeenNthCalledWith(4, "DELETE FROM inventory_items");
    expect(mockExec).toHaveBeenNthCalledWith(5, "VACUUM");
  });

  it("keeps the audit log and writes exactly one entry explaining the wipe", async () => {
    const { WIPE_STATEMENTS, wipeAllData } = await import("./db");

    expect(WIPE_STATEMENTS).not.toContain("DELETE FROM audit_log");

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
