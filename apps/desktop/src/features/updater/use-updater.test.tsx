import { Toaster } from "@cmis/ui/components/sonner";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetIdleTrackingForTests, IDLE_THRESHOLD_MS } from "./idle-gate";

const CURRENT_VERSION = "1.7.0";
const NEXT_VERSION = "1.8.0";

const download = vi.fn<(cb?: (e: unknown) => void) => Promise<void>>();
const install = vi.fn<() => Promise<void>>();
const relaunch = vi.fn<() => Promise<void>>();
const check = vi.fn<() => Promise<unknown>>();
const invoke = vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>();

/** An update whose `download` emits the plugin's full event sequence. */
function downloadingUpdate() {
  return {
    body: "Adds a thing.",
    date: "2026-02-01T00:00:00Z",
    download: (onEvent?: (e: unknown) => void) => {
      download(onEvent);
      onEvent?.({ data: { contentLength: 100 }, event: "Started" });
      onEvent?.({ data: { chunkLength: 100 }, event: "Progress" });
      onEvent?.({ event: "Finished" });
      return Promise.resolve();
    },
    install,
    version: NEXT_VERSION,
  };
}

const settings = {
  autoCheckOnStartup: false,
  autoDownload: true,
  lastCheckedAt: null,
};

vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => check() }));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => relaunch(),
}));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => Promise.resolve(CURRENT_VERSION),
}));
vi.mock("@/lib/tauri", () => ({
  invoke: (...a: [string, unknown?]) => invoke(...a),
}));
vi.mock("@/lib/open-external", () => ({ isTauriRuntime: () => true }));
vi.mock("@/features/backup/data/write-safety-backup", () => ({
  writeSafetyBackupFile: () => invoke("create_backup", { destPath: "x" }),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    get() {
      return Promise.resolve(settings);
    }
    set() {
      return Promise.resolve();
    }
    save() {
      return Promise.resolve();
    }
  },
}));

interface UpdaterApi {
  checkNow: (o?: { silent?: boolean }) => Promise<void>;
  dismiss: () => void;
  downloadNow: () => Promise<void>;
  status: string;
}

interface MountedUpdater {
  checkNow: (o?: { silent?: boolean }) => Promise<void>;
  dismiss: () => void;
  downloadNow: () => Promise<void>;
  status: () => string;
}

const holder: { current: UpdaterApi | null } = { current: null };

async function mount(): Promise<MountedUpdater> {
  vi.resetModules();
  const mod = await import("./use-updater");
  // The browser-preview branch wins whenever `import.meta.env.DEV` is set, and
  // vitest always sets it. These tests mock the Tauri plugin instead.
  mod.__setDevGuardForTests(false);
  const { UpdaterProvider, useUpdaterOptional } = mod;
  function Probe() {
    holder.current = useUpdaterOptional() as UpdaterApi;
    return null;
  }
  render(
    <>
      <UpdaterProvider>
        <Probe />
      </UpdaterProvider>
      <Toaster position="bottom-right" />
    </>
  );
  // Read through the holder: the context value is a fresh object every render,
  // so anything captured here would report the state from mount time.
  const read = (): UpdaterApi => {
    const value = holder.current;
    if (!value) {
      throw new Error("the probe never mounted");
    }
    return value;
  };
  return {
    checkNow: (o) => read().checkNow(o),
    dismiss: () => read().dismiss(),
    downloadNow: () => read().downloadNow(),
    status: () => read().status,
  };
}

/** Check, then download — the path a user takes from the "Download now" toast. */
async function reachReady(u: MountedUpdater) {
  check.mockResolvedValue(downloadingUpdate());
  await act(async () => {
    await u.checkNow();
  });
  await act(async () => {
    await u.downloadNow();
  });
}

const restartButton = () =>
  screen.findByRole("button", { name: /restart now/i });
const currentButton = () =>
  screen.getByRole("button", { name: /use current version/i });

beforeEach(() => {
  vi.clearAllMocks();
  __resetIdleTrackingForTests();
  settings.autoCheckOnStartup = false;
  settings.autoDownload = true;
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "backup_default_dir") {
      return Promise.resolve("C:/backups");
    }
    if (cmd === "list_backups") {
      return Promise.resolve([]);
    }
    if (cmd === "create_backup") {
      return Promise.resolve({
        kind: "manual",
        mtime: 0,
        name: "cmis-manual-x.db",
        path: "C:/backups/cmis-manual-x.db",
        size: 1,
      });
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  __resetIdleTrackingForTests();
});

describe("useUpdater", () => {
  it("downloads the update but never installs it", async () => {
    const u = await mount();
    await reachReady(u);

    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(u.status()).toBe("ready");
    // The whole point: nothing runs the installer without being asked.
    expect(install).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("offers Restart Now and Use Current Version", async () => {
    const u = await mount();
    await reachReady(u);

    expect(await restartButton()).toBeInTheDocument();
    expect(currentButton()).toBeInTheDocument();
  });

  it("installs only when Restart Now is chosen", async () => {
    const user = userEvent.setup();
    const u = await mount();
    await reachReady(u);

    await user.click(await restartButton());

    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
  });

  it("writes a safety backup before installing", async () => {
    const user = userEvent.setup();
    const u = await mount();
    await reachReady(u);

    await user.click(await restartButton());

    await waitFor(() => expect(install).toHaveBeenCalled());
    expect(invoke.mock.calls.some(([cmd]) => cmd === "create_backup")).toBe(
      true
    );
  });

  it("refuses to install when the safety backup fails", async () => {
    const user = userEvent.setup();
    invoke.mockImplementation((cmd: string) =>
      cmd === "create_backup"
        ? Promise.reject(new Error("disk is full"))
        : Promise.resolve(null)
    );
    const u = await mount();
    await reachReady(u);

    await user.click(await restartButton());

    expect(install).not.toHaveBeenCalled();
    expect(u.status()).toBe("ready");
  });

  it("keeps the current version and drops the staged update on Use Current Version", async () => {
    const user = userEvent.setup();
    const u = await mount();
    await reachReady(u);

    await user.click(currentButton());

    await waitFor(() => expect(u.status()).toBe("idle"));
    expect(install).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /restart now/i })
      ).not.toBeInTheDocument()
    );
  });

  it("lets the Windows installer do the relaunching", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    );
    const u = await mount();
    await reachReady(u);

    await user.click(await restartButton());

    await waitFor(() => expect(install).toHaveBeenCalled());
    // `install` exits the process on Windows; relaunching as well would race it.
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("relaunches after installing on macOS", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    );
    const u = await mount();
    await reachReady(u);

    await user.click(await restartButton());

    await waitFor(() => expect(relaunch).toHaveBeenCalledTimes(1));
  });
});

describe("automatic updates and activity", () => {
  it("holds the automatic download while the app is in use", async () => {
    vi.useFakeTimers();
    try {
      const u = await mount();
      check.mockResolvedValue(downloadingUpdate());
      await act(async () => {
        await u.checkNow({ silent: true });
      });

      // Well past the point a naive startup check would have grabbed it.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(IDLE_THRESHOLD_MS - 1);
      });
      expect(download).not.toHaveBeenCalled();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(download).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("downloads automatically once the app has been idle for five minutes", async () => {
    vi.useFakeTimers();
    try {
      const u = await mount();
      check.mockResolvedValue(downloadingUpdate());
      await act(async () => {
        await u.checkNow({ silent: true });
      });
      expect(download).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(IDLE_THRESHOLD_MS);
      });
      expect(download).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never installs on its own, however long the app sits idle", async () => {
    vi.useFakeTimers();
    try {
      const u = await mount();
      check.mockResolvedValue(downloadingUpdate());
      await act(async () => {
        await u.checkNow({ silent: true });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(IDLE_THRESHOLD_MS * 4);
      });
      expect(download).toHaveBeenCalled();
      expect(install).not.toHaveBeenCalled();
      expect(relaunch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a manual download alone — asking is not idling", async () => {
    const u = await mount();
    check.mockResolvedValue(downloadingUpdate());
    await act(async () => {
      await u.checkNow();
    });
    await act(async () => {
      await u.downloadNow();
    });
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("does not auto-download when the preference is off", async () => {
    vi.useFakeTimers();
    settings.autoDownload = false;
    try {
      const u = await mount();
      check.mockResolvedValue(downloadingUpdate());
      await act(async () => {
        await u.checkNow({ silent: true });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(IDLE_THRESHOLD_MS * 2);
      });
      expect(download).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
