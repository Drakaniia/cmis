/**
 * CMIS-UI-00 §3.1 — UI density preference.
 *
 * "comfortable" is the default (more whitespace, sparklines visible).
 * "compact" compresses rows for data-heavy screens. The preference
 * persists across restarts via the Tauri store plugin; outside the
 * desktop shell it stays in-memory (the same opportunistic pattern
 * used by features/requests/persistence.ts).
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type Density = "compact" | "comfortable";

interface DensityContextValue {
  density: Density;
  setDensity: (density: Density) => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

const STORAGE_KEY = "cmis:density";
const DEFAULT_DENSITY: Density = "comfortable";

function readStoredDensity(): Density {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "compact" || value === "comfortable") {
      return value;
    }
  } catch {
    // SSR / test — ignore
  }
  return DEFAULT_DENSITY;
}

/**
 * Opportunistic Tauri store persistence — degrades to localStorage when the
 * desktop shell is absent. Mirrors the pattern in persistence.ts.
 */
async function persistDensity(value: Density): Promise<void> {
  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    const store = await Store.load("cmis.dat");
    await store.set(STORAGE_KEY, value);
    await store.save();
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }
}

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>(readStoredDensity);

  const setDensity = useCallback((nextDensity: Density) => {
    setDensityState(nextDensity);
    persistDensity(nextDensity);
  }, []);

  const value = useMemo(() => ({ density, setDensity }), [density, setDensity]);

  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  );
}

/**
 * Returns the current density preference and a setter.
 * Must be used inside a <DensityProvider>.
 */
export function useDensity(): DensityContextValue {
  const context = useContext(DensityContext);
  if (!context) {
    // Graceful fallback for pages rendered outside the provider (tests, SSR).
    return {
      density: DEFAULT_DENSITY,
      setDensity: () => {
        /* noop */
      },
    };
  }
  return context;
}
