import * as React from "react";

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
  const bufferRef = React.useRef<string>("");
  const startRef = React.useRef<number>(0);
  const timerRef = React.useRef<number | null>(null);
  const onScanRef = React.useRef(onScan);
  React.useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    function isTextField(el: Element | null): boolean {
      if (!el) {
        return false;
      }
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        return true;
      }
      if ((el as HTMLElement).isContentEditable) {
        return true;
      }
      return false;
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore modifiers, nav keys, etc.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      // If focused inside a text field, let that field handle typing;
      // wedge still works when collapsed by checking rapid burst globally,
      // but we don't hijack focused inputs — spec says global listener with burst detection.
      // We treat focused inputs as normal typing, not scans.
      const active = document.activeElement;
      const inField = isTextField(active);
      // Special keys
      if (e.key.length !== 1) {
        if (e.key === "Enter") {
          // wedge scanners often send Enter at end
          const elapsed = Date.now() - startRef.current;
          const buf = bufferRef.current;
          if (buf.length >= 8 && elapsed < 100) {
            e.preventDefault();
            onScanRef.current(buf);
          }
          bufferRef.current = "";
          startRef.current = 0;
          if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        }
        return;
      }

      const now = Date.now();
      if (!startRef.current || bufferRef.current.length === 0) {
        startRef.current = now;
        bufferRef.current = e.key;
      } else {
        bufferRef.current += e.key;
      }

      // If typing in a field, don't trigger scan there — allow normal input
      // But still detect burst for highlight? Spec says global even when collapsed.
      // We only auto-trigger if NOT in a focused field to avoid double handling.
      const elapsed = now - startRef.current;

      if (bufferRef.current.length >= 8 && elapsed < 100 && !inField) {
        // Looks like scan — trigger
        const code = bufferRef.current;
        bufferRef.current = "";
        startRef.current = 0;
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        onScanRef.current(code);
        return;
      }

      // Reset buffer after 100ms of idle
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        // If buffer grew large but elapsed was >=100ms, it was typing not scan
        bufferRef.current = "";
        startRef.current = 0;
        timerRef.current = null;
      }, 120);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [enabled]);
}
