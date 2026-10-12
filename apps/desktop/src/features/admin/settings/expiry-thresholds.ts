import { useSyncExternalStore } from "react";

import {
  DEFAULT_ORANGE_DAYS,
  DEFAULT_RED_DAYS,
} from "@/features/inventory/domain/expiry";

/**
 * Orange/red expiry alert thresholds — the one expiry setting read far from
 * the settings page (dashboard alerts band, expiry list classification).
 *
 * Module-level external store, same pattern as `lib/app-name.ts`: readers
 * `useExpiryThresholds()` re-render the moment Settings saves, with no
 * provider wiring. Persistence is localStorage first (sync, works in browser
 * preview) with opportunistic Tauri Store backup in `cmis.dat`.
 *
 * Migration: alert settings used to be a single `expiryWindowDays` radio
 * (30/60/90). A stored value without orange/red inherits orange from that
 * window and red from the default.
 */

export interface ExpiryThresholds {
  orangeDays: number;
  redDays: number;
}

const STORAGE_KEY = "cmis:expiry-thresholds";
const MAX_DAYS = 365;

function clampDays(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(MAX_DAYS, Math.max(1, Math.floor(value)));
}

/** Tolerates the legacy `{ expiryWindowDays }` shape and red >= orange. */
export function coerceExpiryThresholds(raw: unknown): ExpiryThresholds {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const legacyWindow =
    typeof record.expiryWindowDays === "number" &&
    Number.isFinite(record.expiryWindowDays)
      ? Math.floor(record.expiryWindowDays)
      : null;
  let orange = clampDays(
    record.orangeDays ?? legacyWindow,
    DEFAULT_ORANGE_DAYS
  );
  let red = clampDays(record.redDays, DEFAULT_RED_DAYS);
  if (red >= orange) {
    orange = Math.min(MAX_DAYS, red + 1);
  }
  if (red >= orange) {
    red = orange - 1;
  }
  return { orangeDays: orange, redDays: red };
}

function readStoredThresholds(): ExpiryThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return coerceExpiryThresholds(JSON.parse(raw));
    }
  } catch {
    // SSR / test without storage, or corrupt JSON — fall through to default
  }
  return { orangeDays: DEFAULT_ORANGE_DAYS, redDays: DEFAULT_RED_DAYS };
}

async function persistThresholds(next: ExpiryThresholds): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota — in-memory value still applies this session
  }
  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    const store = await Store.load("cmis.dat");
    await store.set(STORAGE_KEY, next);
    await store.save();
  } catch {
    // browser preview — localStorage above is enough
  }
}

let current: ExpiryThresholds = readStoredThresholds();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ExpiryThresholds {
  return current;
}

export function getExpiryThresholds(): ExpiryThresholds {
  return current;
}

/** Patches + persists, notifies subscribers. Returns the stored value. */
export function setExpiryThresholds(
  patch: Partial<ExpiryThresholds>
): ExpiryThresholds {
  const next: ExpiryThresholds = {
    orangeDays:
      patch.orangeDays === undefined
        ? current.orangeDays
        : clampDays(patch.orangeDays, current.orangeDays),
    redDays:
      patch.redDays === undefined
        ? current.redDays
        : clampDays(patch.redDays, current.redDays),
  };
  if (
    next.orangeDays === current.orangeDays &&
    next.redDays === current.redDays
  ) {
    return current;
  }
  current = next;
  persistThresholds(next).catch(() => undefined);
  for (const listener of listeners) {
    listener();
  }
  return current;
}

/** Live thresholds — re-renders the caller the moment Settings saves. */
export function useExpiryThresholds(): ExpiryThresholds {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function __resetExpiryThresholdsForTests(): void {
  current = { orangeDays: DEFAULT_ORANGE_DAYS, redDays: DEFAULT_RED_DAYS };
  listeners.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
