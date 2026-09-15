import { afterEach, describe, expect, it, vi } from "vitest";

import { isTauriRuntime, openExternal } from "./open-external";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

const TAURI_MARKER = "__TAURI_INTERNALS__";

function markAsTauri() {
  Object.defineProperty(window, TAURI_MARKER, {
    configurable: true,
    value: {},
    writable: true,
  });
}

function unmarkTauri() {
  Reflect.deleteProperty(window, TAURI_MARKER);
}

afterEach(async () => {
  unmarkTauri();
  vi.restoreAllMocks();
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  vi.mocked(openUrl).mockReset();
});

describe("isTauriRuntime", () => {
  it("is false in a plain browser", () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it("detects the internal Tauri marker injected by packed builds", () => {
    markAsTauri();
    expect(isTauriRuntime()).toBe(true);
  });
});

describe("openExternal", () => {
  const url = "https://github.com/Drakaniia/cmis/issues/new";

  it("uses the opener plugin inside Tauri", async () => {
    markAsTauri();
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    vi.mocked(openUrl).mockResolvedValue(undefined);

    const openSpy = vi.spyOn(window, "open");

    await expect(openExternal(url)).resolves.toBe(true);
    expect(openUrl).toHaveBeenCalledWith(url);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("reports failure when the opener plugin throws", async () => {
    markAsTauri();
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    vi.mocked(openUrl).mockRejectedValue(new Error("no handler"));

    await expect(openExternal(url)).resolves.toBe(false);
  });

  it("falls back to window.open in the browser and reports success", async () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({} as unknown as Window);

    await expect(openExternal(url)).resolves.toBe(true);
    expect(openSpy).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
  });

  it("reports failure when the popup is blocked", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    await expect(openExternal(url)).resolves.toBe(false);
  });
});
