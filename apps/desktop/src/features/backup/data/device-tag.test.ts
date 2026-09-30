import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>();

vi.mock("@/lib/tauri", () => ({
  invoke: (...a: [string, unknown?]) => invoke(...a),
}));
vi.mock("@/lib/open-external", () => ({ isTauriRuntime: () => true }));

import { __resetDeviceTagForTests, loadDeviceTag } from "./device-tag";

describe("device-tag", () => {
  beforeEach(() => {
    invoke.mockReset();
    __resetDeviceTagForTests();
  });

  it("asks Rust once and reuses the answer", async () => {
    invoke.mockResolvedValue("deped-4f2a");

    expect(await loadDeviceTag()).toBe("deped-4f2a");
    expect(await loadDeviceTag()).toBe("deped-4f2a");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("backup_device_tag");
  });

  it("does not cache a failure, so the next run asks again", async () => {
    invoke.mockRejectedValueOnce(new Error("app data is read-only"));

    // An untagged name is a name, not a lost backup.
    expect(await loadDeviceTag()).toBe("");
    invoke.mockResolvedValue("deped-4f2a");
    expect(await loadDeviceTag()).toBe("deped-4f2a");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight request instead of minting two tags", async () => {
    invoke.mockResolvedValue("desk-11ab");

    const [first, second] = await Promise.all([
      loadDeviceTag(),
      loadDeviceTag(),
    ]);
    expect([first, second]).toEqual(["desk-11ab", "desk-11ab"]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
