import * as React from "react";
import { loadRequests, saveRequest, seedRequests } from "../persistence";
import type { RequestItem } from "../types";

/**
 * CMIS-UI-05 §8 — hydrates the board from SQLite once, then writes every
 * changed request through. Outside the desktop shell nothing loads and nothing
 * writes, so the in-memory board behaves exactly as before.
 */
export function useRequestPersistence(seed: RequestItem[]) {
  const [hydrated, setHydrated] = React.useState<RequestItem[] | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadRequests();
      if (cancelled) {
        return;
      }
      if (stored && stored.length > 0) {
        setHydrated(stored);
      } else if (stored) {
        // First run in the desktop shell — make the mock the starting state so
        // the very first restart already feels continuous.
        await seedRequests(seed);
      }
      if (!cancelled) {
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seed]);

  const persist = React.useCallback((item: RequestItem) => {
    void saveRequest(item);
  }, []);

  return { hydrated, persist, ready } as const;
}
