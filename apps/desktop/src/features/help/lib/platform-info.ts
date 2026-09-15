/**
 * Platform detection for bug reports.
 *
 * The option strings are kept byte-identical to the `platform` dropdown in
 * `.github/ISSUE_TEMPLATE/bug_report.yml` — GitHub only pre-selects a dropdown
 * entry when the query-param value matches the option text exactly.
 *
 * Pure functions with an injectable context so the behaviour is unit-testable
 * without a DOM.
 */

export const PLATFORM_OPTIONS = [
  "Web (Vite dev)",
  "Desktop — Windows",
  "Desktop — macOS",
  "Desktop — Linux",
  "Mobile viewport",
] as const;

export type PlatformOption = (typeof PLATFORM_OPTIONS)[number];

export type DesktopOs = "windows" | "macos" | "linux" | "unknown";

const DESKTOP_LABELS: Record<Exclude<DesktopOs, "unknown">, PlatformOption> = {
  linux: "Desktop — Linux",
  macos: "Desktop — macOS",
  windows: "Desktop — Windows",
};

export interface PlatformContext {
  /** True inside a Tauri webview, false in a plain browser (Vite dev). */
  isTauri: boolean;
  /** `navigator.userAgent` (or a mock in tests). */
  userAgent: string;
}

/** Best-effort OS identification from a user-agent string. */
export function detectOs(userAgent: string): DesktopOs {
  const ua = userAgent.toLowerCase();
  if (ua.includes("windows")) {
    return "windows";
  }
  if (ua.includes("mac os x") || ua.includes("macintosh")) {
    return "macos";
  }
  if (ua.includes("linux") || ua.includes("x11")) {
    return "linux";
  }
  return "unknown";
}

/**
 * The platform option to pre-select in the Report Issue dialog.
 *
 * Returns `null` when nothing can be inferred (Tauri webview with an
 * unrecognised user-agent) so the caller keeps its neutral default instead of
 * guessing wrong.
 */
export function detectPlatform(
  ctx: Partial<PlatformContext> = {}
): PlatformOption | null {
  const resolved: PlatformContext = {
    isTauri: ctx.isTauri ?? readPlatformContext().isTauri,
    userAgent: ctx.userAgent ?? readPlatformContext().userAgent,
  };

  if (!resolved.isTauri) {
    return "Web (Vite dev)";
  }

  const os = detectOs(resolved.userAgent);
  return os === "unknown" ? null : DESKTOP_LABELS[os];
}

/** Read the live browser context; safe to call during SSR/tests. */
export function readPlatformContext(): PlatformContext {
  if (typeof window === "undefined") {
    return { isTauri: false, userAgent: "" };
  }
  const w = window as unknown as Record<string, unknown>;
  return {
    isTauri: "__TAURI_INTERNALS__" in w || "__TAURI__" in w,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
  };
}
