import { useSyncExternalStore } from "react";

/**
 * App identity — the one GLOBAL settings value (Settings > General).
 *
 * Every other setting lives in `useSettings` local state, but the app name
 * brands chrome rendered far from the settings page (sidebar, splash, about
 * modal, menubar, document.title). A module-level external store gives those
 * surfaces live updates with no provider wiring and no reload: they
 * `useAppName()` and re-render the moment Settings saves.
 *
 * Persistence is localStorage first (sync, works in browser preview) with
 * opportunistic Tauri Store backup in the same `cmis.dat` file the density
 * preference uses. Empty input falls back to DEFAULT_APP_NAME.
 */

export const DEFAULT_APP_NAME = "CMIS";
export const APP_NAME_STORAGE_KEY = "cmis:app-name";
const APP_NAME_MAX_LENGTH = 60;

function readStoredAppName(): string {
  try {
    const raw = localStorage.getItem(APP_NAME_STORAGE_KEY);
    const name = (raw ?? "").trim().slice(0, APP_NAME_MAX_LENGTH);
    if (name) {
      return name;
    }
  } catch {
    // SSR / test without storage — fall through to default
  }
  return DEFAULT_APP_NAME;
}

async function persistAppName(name: string): Promise<void> {
  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    const store = await Store.load("cmis.dat");
    await store.set(APP_NAME_STORAGE_KEY, name);
    await store.save();
    return;
  } catch {
    // browser preview — localStorage (written synchronously below) is enough
  }
  try {
    localStorage.setItem(APP_NAME_STORAGE_KEY, name);
  } catch {
    // private mode / quota — in-memory value still applies this session
  }
}

let currentAppName: string = readStoredAppName();
const appNameListeners = new Set<() => void>();

function subscribeAppName(listener: () => void): () => void {
  appNameListeners.add(listener);
  return () => {
    appNameListeners.delete(listener);
  };
}

export function getAppName(): string {
  return currentAppName || DEFAULT_APP_NAME;
}

/** Trims, falls back to DEFAULT_APP_NAME on empty, notifies subscribers. */
export function setAppName(next: string): string {
  const name = next.trim().slice(0, APP_NAME_MAX_LENGTH) || DEFAULT_APP_NAME;
  if (name === currentAppName) {
    return currentAppName;
  }
  currentAppName = name;
  try {
    localStorage.setItem(APP_NAME_STORAGE_KEY, name);
  } catch {
    // ignore — persistAppName degrades the same way
  }
  persistAppName(name).catch(() => undefined);
  for (const listener of appNameListeners) {
    listener();
  }
  return currentAppName;
}

/** Live app name — re-renders the caller the moment Settings saves. */
export function useAppName(): string {
  return useSyncExternalStore(subscribeAppName, getAppName, getAppName);
}

export function __resetAppNameForTests(): void {
  currentAppName = DEFAULT_APP_NAME;
  appNameListeners.clear();
  try {
    localStorage.removeItem(APP_NAME_STORAGE_KEY);
  } catch {
    // ignore
  }
}
