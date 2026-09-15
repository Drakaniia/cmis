import { useCallback, useEffect, useState } from "react";
import { loadRequests, saveRequest } from "../persistence";
import type { RequestItem } from "../types";

/**
 * CMIS-UI-05 §8 — hydrates the board from SQLite once, then writes every
 * changed request through. Outside the desktop shell nothing loads and nothing
 * writes, so the in-memory board behaves exactly as before.
 */
export function useRequestPersistence(_seed: RequestItem[]) {
  const [hydrated, setHydrated] = useState<RequestItem[] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const stored = await loadRequests();
      if (cancelled) {
        return;
      }
      if (stored && stored.length > 0) {
        setHydrated(stored);
      } else if (stored) {
        // Empty DB — no seed, board stays empty per spec §8 (no mock fallback)
        setHydrated([]);
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

  const persist = useCallback((item: RequestItem) => {
    saveRequest(item);
  }, []);

  return { hydrated, persist, ready } as const;
}
