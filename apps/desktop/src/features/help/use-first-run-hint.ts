"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export const HELP_HINT_STORAGE_KEY = "cmis-help-hint-shown";
export const HELP_HINT_TOAST_ID = "cmis-help-hint";

const HINT_DELAY_MS = 4000;
const HINT_DURATION_MS = 8000;
const HINT_MESSAGE =
  "Need help? Use the ? button in the header to view docs or report an issue.";

/** Once-per-session guard for when localStorage is unavailable (private mode). */
let shownThisSession = false;

function hasBeenShown(): boolean {
  if (shownThisSession) {
    return true;
  }
  try {
    return window.localStorage.getItem(HELP_HINT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function markShown() {
  shownThisSession = true;
  try {
    window.localStorage.setItem(HELP_HINT_STORAGE_KEY, "true");
  } catch {
    // storage unavailable — the module flag already covers this session
  }
}

/**
 * Show the Help hint once per install, a few seconds after the shell settles.
 *
 * Never repeats: persisted in `localStorage`, degrading to a module-level flag
 * when storage throws (private mode / quota). `enabled: false` (used while the
 * reader is on `/docs`) postpones the hint instead of consuming it.
 */
export function useFirstRunHint(
  options: { delayMs?: number; enabled?: boolean } = {}
) {
  const { delayMs = HINT_DELAY_MS, enabled = true } = options;
  useEffect(() => {
    if (!enabled || hasBeenShown()) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (hasBeenShown()) {
        return;
      }
      markShown();
      toast.info(HINT_MESSAGE, {
        duration: HINT_DURATION_MS,
        id: HELP_HINT_TOAST_ID,
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, enabled]);
}
