import { describe, expect, it } from "vitest";

import { detectOs, detectPlatform } from "./platform-info";

const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 WebView2/1.0";
const MACOS_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const LINUX_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";

describe("detectOs", () => {
  it("recognises Windows", () => {
    expect(detectOs(WINDOWS_UA)).toBe("windows");
  });

  it("recognises macOS", () => {
    expect(detectOs(MACOS_UA)).toBe("macos");
  });

  it("recognises Linux", () => {
    expect(detectOs(LINUX_UA)).toBe("linux");
  });

  it("returns unknown for an unrecognised agent", () => {
    expect(detectOs("Some Crawler/1.0")).toBe("unknown");
  });
});

describe("detectPlatform", () => {
  it("labels the browser dev preview as web", () => {
    expect(detectPlatform({ isTauri: false, userAgent: MACOS_UA })).toBe(
      "Web (Vite dev)"
    );
  });

  it("labels a Tauri webview by operating system", () => {
    expect(detectPlatform({ isTauri: true, userAgent: WINDOWS_UA })).toBe(
      "Desktop — Windows"
    );
    expect(detectPlatform({ isTauri: true, userAgent: MACOS_UA })).toBe(
      "Desktop — macOS"
    );
    expect(detectPlatform({ isTauri: true, userAgent: LINUX_UA })).toBe(
      "Desktop — Linux"
    );
  });

  it("does not guess when Tauri's user-agent is unrecognised", () => {
    expect(detectPlatform({ isTauri: true, userAgent: "tauri" })).toBeNull();
  });
});
