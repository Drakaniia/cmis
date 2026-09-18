import { useCallback, useEffect, useState } from "react";
import {
  loadRequests,
  REQUESTS_CHANGED_EVENT,
  saveRequest,
} from "../persistence";
import type { RequestItem } from "../types";

/**
 * CMIS-UI-05 §8 — hydrates the board from SQLite once, then writes every
 * changed request through. Outside the desktop shell nothing loads and nothing
 * writes, so the in-memory board behaves exactly as before.
 *
 * It also re-reads on `REQUESTS_CHANGED_EVENT`: a request created from another
 * screen (Ctrl+N is global) or handed over through the dispense service writes
 * straight to SQLite, and the board would otherwise not learn about it until the
 * next mount. `replaceAll` still refuses to overwrite edits the user has made,
 * so a live drag is never clobbered.
 */
export function useRequestPersistence(_seed: RequestItem[]) {
  const [hydrated, setHydrated] = useState<RequestItem[] | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const stored = await loadRequests();
    if (stored) {
      setHydrated(stored);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const stored = await loadRequests();
      if (cancelled) {
        return;
      }
      if (stored) {
        // Empty DB — no seed, board stays empty per spec §8 (no mock fallback)
        setHydrated(stored);
      }
      if (!cancelled) {
        setReady(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onChanged = () => {
      reload();
    };
    window.addEventListener(REQUESTS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(REQUESTS_CHANGED_EVENT, onChanged);
    };
  }, [reload]);

  const persist = useCallback((item: RequestItem) => {
    saveRequest(item).catch((error) => {
      console.error("[persistence] persist failed", error);
    });
  }, []);

  return { hydrated, persist, ready, reload } as const;
}
