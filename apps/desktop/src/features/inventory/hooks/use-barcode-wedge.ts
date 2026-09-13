import { useEffect, useRef } from "react";

/** Barcode burst = 8+ chars within 100ms → treat as a scan. */
const SCAN_MIN_LENGTH = 8;
const SCAN_MAX_GAP_MS = 100;
/** Idle window after which a stalled burst is discarded. */
const RESET_IDLE_MS = 120;

function isTextField(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  const tag = element.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }
  return (element as HTMLElement).isContentEditable;
}

/**
 * Global keyboard wedge listener.
 * Barcode burst = 8+ chars in <100ms → treat as scan.
 * Works even when BarcodeInput is collapsed (spec §3).
 * Ignores typing inside inputs/textareas.
 */
export function useBarcodeWedge(
  onScan: (code: string) => void,
  opts: { enabled?: boolean } = {}
) {
  const enabled = opts.enabled ?? true;
  const bufferRef = useRef<string>("");
  const startRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const clearResetTimer = () => {
      // `clearTimeout(undefined)` is a no-op, so no null guard is needed.
      window.clearTimeout(timerRef.current ?? undefined);
      timerRef.current = null;
    };

    const resetBuffer = () => {
      bufferRef.current = "";
      startRef.current = 0;
      clearResetTimer();
    };

    // Wedge scanners usually terminate the burst with Enter.
    const handleSpecialKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        return;
      }
      const elapsed = Date.now() - startRef.current;
      const burst = bufferRef.current;
      if (burst.length >= SCAN_MIN_LENGTH && elapsed < SCAN_MAX_GAP_MS) {
        event.preventDefault();
        onScanRef.current(burst);
      }
      resetBuffer();
    };

    const scheduleIdleReset = () => {
      clearResetTimer();
      timerRef.current = window.setTimeout(() => {
        // Buffer grew but the burst stalled: typing, not a scan.
        bufferRef.current = "";
        startRef.current = 0;
        timerRef.current = null;
      }, RESET_IDLE_MS);
    };

    const handlePrintableKey = (event: KeyboardEvent, inField: boolean) => {
      const now = Date.now();
      // startRef is only ever zeroed together with the buffer, so an empty
      // buffer is the single source of truth for "a new burst starts here".
      if (bufferRef.current.length === 0) {
        startRef.current = now;
        bufferRef.current = event.key;
      } else {
        bufferRef.current += event.key;
      }

      const elapsed = now - startRef.current;
      if (
        bufferRef.current.length >= SCAN_MIN_LENGTH &&
        elapsed < SCAN_MAX_GAP_MS &&
        !inField
      ) {
        // Looks like a scan — trigger without hijacking the focused field.
        const code = bufferRef.current;
        resetBuffer();
        onScanRef.current(code);
        return;
      }

      scheduleIdleReset();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore modifiers, nav keys, etc.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      // Focused text fields keep normal typing; the burst check below still
      // runs so the wedge works when BarcodeInput is collapsed (spec §3).
      const inField = isTextField(document.activeElement);
      if (event.key.length !== 1) {
        handleSpecialKey(event);
        return;
      }
      handlePrintableKey(event, inField);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearResetTimer();
    };
  }, [enabled]);
}
