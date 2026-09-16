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
      "DELETE FROM request_queue",
      "DELETE FROM inventory_items",
      "VACUUM",
    ]);

    await wipeAllData({ resetSettings: false });

    expect(mockExec).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM dispensing_events"
    );
    expect(mockExec).toHaveBeenNthCalledWith(2, "DELETE FROM request_queue");
    expect(mockExec).toHaveBeenNthCalledWith(3, "DELETE FROM inventory_items");
    expect(mockExec).toHaveBeenNthCalledWith(4, "VACUUM");
  });
});
