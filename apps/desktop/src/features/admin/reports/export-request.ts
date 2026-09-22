/**
 * A tiny hand-off for File → Export Stock Report.
 *
 * The menu lives in the app shell and cannot reach the report page's state
 * directly, and the page may or may not be mounted when the item is chosen. The
 * menu records a request here; the page consumes it on mount (a fresh
 * navigation) or the instant it is recorded (already open).
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

export function requestStockReportExport(): void {
  pending = true;
  for (const listener of listeners) {
    listener();
  }
}

/** Returns `true` once per recorded request, so two consumers cannot both fire. */
export function consumeStockReportExportRequest(): boolean {
  const requested = pending;
  pending = false;
  return requested;
}

export function subscribeStockReportExport(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
