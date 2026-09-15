/**
 * External link handling for the desktop shell.
 *
 * `window.open()` is unreliable inside a packaged Tauri v2 webview (there is no
 * shell capability behind it), so every outbound link goes through
 * `tauri-plugin-opener`. In browser dev the plugin does not exist and
 * `window.open(..., "noopener,noreferrer")` is the correct fallback.
 *
 * This module never throws: it reports success as a boolean and lets the caller
 * decide how loud to be about a failure (the Report Issue dialog toasts).
 */

/**
 * True when running inside a Tauri webview.
 *
 * `tauri.conf.json` leaves `app.withGlobalTauri` at its default (`false`), so
 * `window.__TAURI__` is *not* injected in packaged builds — only
 * `window.__TAURI_INTERNALS__` is. We accept either marker so the helper takes
 * the plugin path in a real build and the `window.open` path in a browser.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

export async function openExternal(href: string): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  if (isTauriRuntime()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(href);
      return true;
    } catch {
      // plugin missing, no registered handler, or the OS refused the URL
      return false;
    }
  }

  try {
    return Boolean(window.open(href, "_blank", "noopener,noreferrer"));
  } catch {
    return false;
  }
}
