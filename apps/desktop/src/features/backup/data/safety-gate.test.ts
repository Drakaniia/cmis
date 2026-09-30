import { describe, expect, it, vi } from "vitest";
import { runWithSafetyBackup } from "./safety-gate";

describe("runWithSafetyBackup", () => {
  it("runs the action and writes a backup first", async () => {
    const order: string[] = [];
    const backup = vi.fn(() => {
      order.push("backup");
      return Promise.resolve();
    });
    const action = vi.fn(() => {
      order.push("action");
      return Promise.resolve();
    });

    await runWithSafetyBackup({ action, backup, isDesktop: true });

    expect(order).toEqual(["backup", "action"]);
  });

  it("refuses the action when the backup fails", async () => {
    // The whole point: destroying data that has just been proven
    // unrecoverable is worse than refusing the action.
    const backup = vi.fn().mockRejectedValue(new Error("disk is full"));
    const action = vi.fn();

    const result = await runWithSafetyBackup({
      action,
      backup,
      isDesktop: true,
    });

    expect(result.ok).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(result.error).toMatch(/disk is full/);
  });

  it("skips the backup outside the desktop runtime", async () => {
    // Browser preview and tests have no filesystem; the layer is inert rather
    // than blocking every action.
    const backup = vi.fn();
    const action = vi.fn();

    const result = await runWithSafetyBackup({
      action,
      backup,
      isDesktop: false,
    });

    expect(backup).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("propagates an action failure without reporting the gate as the cause", async () => {
    const action = vi
      .fn()
      .mockRejectedValue(new Error("foreign key violation"));

    const result = await runWithSafetyBackup({
      action,
      backup: vi.fn(),
      isDesktop: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/foreign key violation/);
  });
});
