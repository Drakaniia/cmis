import * as React from "react";

const STORAGE_KEY = "panel-ratio";
const DEFAULT_RATIO = 0.45; // 45% list, 55% detail within 40-60 bounds
const MIN_RATIO = 0.25;
const MAX_RATIO = 0.75;
const CLAMP_MIN = 0.4;
const CLAMP_MAX = 0.6;

function readRatio(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) {
      const n = Number(v);
      if (!Number.isNaN(n) && n >= MIN_RATIO && n <= MAX_RATIO) {
        return n;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_RATIO;
}

async function writeRatio(value: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
  try {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const store = new LazyStore("cmis.dat");
    await store.set(STORAGE_KEY, value);
    await store.save();
  } catch {
    // tauri not available in web
  }
}

export function usePanelRatio() {
  const [ratio, setRatioState] = React.useState<number>(() => readRatio());
  const [collapsed, setCollapsed] = React.useState(false);
  const prevRatioRef = React.useRef(ratio);

  const setRatio = React.useCallback(
    (next: number) => {
      const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, next));
      setRatioState(clamped);
      if (!collapsed) {
        prevRatioRef.current = clamped;
      }
      void writeRatio(clamped);
    },
    [collapsed]
  );

  const toggleCollapse = React.useCallback(() => {
    if (collapsed) {
      const restore = prevRatioRef.current;
      const clamped = Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, restore));
      setRatioState(clamped);
      setCollapsed(false);
      void writeRatio(clamped);
    } else {
      prevRatioRef.current = ratio;
      setRatioState(1); // list 100%
      setCollapsed(true);
    }
  }, [collapsed, ratio]);

  // Effective ratio clamped to 40-60 for display unless collapsed
  const displayRatio = collapsed
    ? 1
    : Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, ratio));

  return { collapsed, displayRatio, ratio, setRatio, toggleCollapse } as const;
}
